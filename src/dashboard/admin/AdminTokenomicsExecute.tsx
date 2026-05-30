import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, type Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useCallback, useMemo, useRef, useState } from "react";
import { convex } from "@/lib/convex";
import { getDtourSessionToken } from "@/lib/session";
import {
  type Cfg,
  type Holder,
  type Payout,
  assertCollectOnlyTx,
  buildDistributePlan,
  buildSplitTx,
  buildTransferTx,
  bytesToBase64,
  chunk,
  computeSplit,
  fetchCollectTx,
  lamportsToSol,
  mintEpoch,
  serializeUnsignedBase64,
  solscanTx,
  TRANSFERS_PER_BATCH,
  transfersPerBatch,
} from "@/lib/tokenomics-exec";
import { Button, Icon, Panel, SectionHeading } from "@/ui";

const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
const trunc = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
const fmt = (n: number, d = 6) =>
  n.toLocaleString(undefined, { maximumFractionDigits: d });

type Snap = {
  holders: Holder[];
  holderCount: number;
  creatorBalanceSol: number;
  supply: number;
  decimals: number;
};

type StepState = {
  status: "idle" | "running" | "done" | "error";
  message?: string;
  signature?: string;
};

type LedgerRow = {
  owner: string;
  lamports: string;
  status: string;
  signature?: string;
  lastValidBlockHeight?: number;
};

const PRIORITY_FEE_SOL = 0.000001;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX = 30; // ~60s per tx

/** web3.js stores raw signature bytes; the txid is the base58 of the first sig. */
function bs58encode(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

/**
 * Point-in-time ledger read for the imperative distribute flow. The reactive
 * useQuery drives the UI; the flow needs a snapshot of the frozen rows to decide
 * what's left to pay. Uses the shared singleton Convex client (same backend as
 * the ConvexProvider) — no second client.
 */
async function fetchLedger(token: string, epoch: string): Promise<LedgerRow[]> {
  return (await convex.query(anyApi.tokenomics.ledgerForEpoch, {
    token,
    epoch,
  })) as LedgerRow[];
}

const StepBadge = ({ s }: { s: StepState }) => {
  const map: Record<StepState["status"], string> = {
    idle: "border-white/15 bg-white/5 text-white/50",
    running: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    done: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    error: "border-red-400/30 bg-red-400/10 text-red-200",
  };
  const label =
    s.status === "idle"
      ? "Pending"
      : s.status === "running"
        ? "Running…"
        : s.status === "done"
          ? "Done"
          : "Error";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${map[s.status]}`}>
      {label}
    </span>
  );
};

export function AdminTokenomicsExecute({ cfg, snap }: { cfg: Cfg; snap: Snap | null }) {
  const token = getDtourSessionToken();
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();

  // Convex actions / mutations.
  const rpcPrep = useAction(anyApi.tokenomics.rpcPrep);
  const simulateTx = useAction(anyApi.tokenomics.simulateTx);
  const relayTx = useAction(anyApi.tokenomics.relayTx);
  const txStatuses = useAction(anyApi.tokenomics.txStatuses);
  const reconcileEpoch = useAction(anyApi.tokenomics.reconcileEpoch);
  const cancelStalePlanned = useMutation(anyApi.tokenomics.cancelStalePlanned);
  const ledgerWritePlan = useMutation(anyApi.tokenomics.ledgerWritePlan);
  const ledgerMarkAttempt = useMutation(anyApi.tokenomics.ledgerMarkAttempt);
  const ledgerMarkResult = useMutation(anyApi.tokenomics.ledgerMarkResult);

  const connectedKey = publicKey?.toBase58();
  const isCreator = connectedKey === cfg.wallets.creator;

  // Step state.
  const [collect, setCollect] = useState<StepState>({ status: "idle" });
  const [split, setSplit] = useState<StepState>({ status: "idle" });
  const [distribute, setDistribute] = useState<StepState>({ status: "idle" });
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // collected SOL this run = post-collect balance − pre-collect balance.
  const preCollectLamportsRef = useRef<number | null>(null);
  const [collectedSol, setCollectedSol] = useState<number | null>(null);

  // Active distribution epoch (minted once at confirm; persisted in state/ref).
  const [epoch, setEpoch] = useState<string | null>(null);
  const epochRef = useRef<string | null>(null);
  // SYNCHRONOUS re-entrancy guard: `busy` is React state (async), so two
  // same-tick clicks (e.g. a double-tap on Resume) both pass the `disabled={busy}`
  // check before re-render and would relay two tx sets for the same owners. This
  // ref flips before any await, so the second call returns immediately.
  const inFlightRef = useRef(false);
  // Which collectedSol basis has already been split — blocks a re-split of the
  // SAME collection (the 4×-split footgun). Cleared on each fresh Collect.
  const splitBasisRef = useRef<number | null>(null);

  // Resume picker.
  const incompleteEpochs = useQuery(
    anyApi.tokenomics.incompleteEpochs,
    token ? { token } : "skip",
  ) as Array<{ epoch: string; total: number; paid: number; pending: number }> | undefined;

  // Reactive ledger for the active epoch (progress UI).
  const ledger = useQuery(
    anyApi.tokenomics.ledgerForEpoch,
    token && epoch ? { token, epoch } : "skip",
  ) as LedgerRow[] | undefined;

  // ── plan preview (eligible → pro-rata → dust) from snapshot + collected ─────
  const plan = useMemo(() => {
    if (!snap) return null;
    // Basis: SOL collected this run if known, else the dry-run estimate
    // (creator balance − reserve) so the admin can preview before collecting.
    const splitSol =
      collectedSol != null
        ? Math.max(0, collectedSol - cfg.creatorReserveSol)
        : Math.max(0, snap.creatorBalanceSol - cfg.creatorReserveSol);
    const splitLamports = BigInt(Math.round(splitSol * 1e9));
    const holdersPool = (splitLamports * BigInt(cfg.splitBps.holders)) / 10000n;
    const d = buildDistributePlan(snap.holders, cfg, holdersPool);
    return { splitSol, holdersPool, ...d };
  }, [snap, cfg, collectedSol]);

  const totalSol = plan ? lamportsToSol(plan.totalLamports) : 0;
  const overCap = totalSol > cfg.perRunCapSol;

  const fail = useCallback((stepSetter: (s: StepState) => void, e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    stepSetter({ status: "error", message });
    setErr(message);
  }, []);

  // Simulate (sigVerify:false) then abort on failure.
  const simulateOrThrow = useCallback(
    async (txBase64: string, label: string) => {
      const r = (await simulateTx({ token, txBase64 })) as {
        ok: boolean;
        err: unknown;
        logs: string[] | null;
      };
      if (!r.ok) {
        throw new Error(
          `${label} simulation failed: ${JSON.stringify(r.err)}${
            r.logs ? `\n${r.logs.slice(-3).join("\n")}` : ""
          }`,
        );
      }
    },
    [simulateTx, token],
  );

  // Poll a single signature until landed / failed / timeout.
  const pollLanded = useCallback(
    async (signature: string): Promise<"landed" | "absent" | "unknown"> => {
      for (let i = 0; i < POLL_MAX; i++) {
        const [st] = (await txStatuses({ token, signatures: [signature] })) as Array<{
          status: "landed" | "absent" | "unknown";
        }>;
        if (st?.status === "landed") return "landed";
        if (st?.status === "absent") return "absent";
        await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
      }
      return "unknown";
    },
    [txStatuses, token],
  );

  // ── STEP 1: collect ─────────────────────────────────────────────────────────
  const runCollect = useCallback(async () => {
    if (!signTransaction || !publicKey) return;
    if (inFlightRef.current) return; // re-entrancy guard (shared across steps)
    inFlightRef.current = true;
    setBusy(true);
    setErr(null);
    setCollect({ status: "running", message: "Reading creator balance…" });
    try {
      // Capture pre-collect balance for the "collected this run" basis.
      const prep = (await rpcPrep({ token })) as { creatorBalanceLamports: number };
      preCollectLamportsRef.current = prep.creatorBalanceLamports;

      setCollect({ status: "running", message: "Requesting collectCreatorFee tx…" });
      const vtx = await fetchCollectTx(cfg.wallets.creator, PRIORITY_FEE_SOL);
      // Drain protection: refuse a tx that isn't fee-paid by the creator or that
      // moves SOL OUT of the creator.
      assertCollectOnlyTx(vtx, cfg.wallets.creator);

      // Simulate the unsigned versioned tx (its .serialize() works unsigned).
      setCollect({ status: "running", message: "Simulating…" });
      await simulateOrThrow(bytesToBase64(vtx.serialize()), "Collect");

      setCollect({ status: "running", message: "Awaiting wallet signature…" });
      const signed = await signTransaction(vtx);
      setCollect({ status: "running", message: "Relaying…" });
      const { signature } = (await relayTx({
        token,
        txBase64: bytesToBase64(signed.serialize()),
      })) as { signature: string };

      setCollect({ status: "running", message: "Confirming…", signature });
      const landed = await pollLanded(signature);
      if (landed === "absent") throw new Error("Collect tx failed on-chain.");

      // Re-read balance → collected = after − before.
      const after = (await rpcPrep({ token })) as { creatorBalanceLamports: number };
      const collectedLamports = Math.max(
        0,
        after.creatorBalanceLamports - (preCollectLamportsRef.current ?? 0),
      );
      setCollectedSol(collectedLamports / 1e9);
      // Fresh collection → re-arm the downstream steps for this new basis.
      splitBasisRef.current = null;
      setSplit({ status: "idle" });
      setDistribute({ status: "idle" });
      setCollect({
        status: "done",
        message: `Collected ~${fmt(collectedLamports / 1e9)} SOL`,
        signature,
      });
    } catch (e) {
      fail(setCollect, e);
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }, [
    signTransaction,
    publicKey,
    rpcPrep,
    token,
    cfg.wallets.creator,
    simulateOrThrow,
    relayTx,
    pollLanded,
    fail,
  ]);

  // ── STEP 2: split ───────────────────────────────────────────────────────────
  const runSplit = useCallback(async () => {
    if (!signTransaction) return;
    if (inFlightRef.current) return; // re-entrancy guard (shared across steps)
    // Block re-splitting the SAME collection — splitting once per Collect is the
    // invariant; re-runs over-fund the pools (the observed 4×-split). A new
    // Collect clears splitBasisRef, re-enabling the split.
    if (collectedSol != null && splitBasisRef.current === collectedSol) {
      setErr(
        "This collection was already split. Run Collect again before splitting once more.",
      );
      return;
    }
    inFlightRef.current = true;
    setBusy(true);
    setErr(null);
    setSplit({ status: "running", message: "Building split tx…" });
    try {
      const basisSol =
        collectedSol != null
          ? Math.max(0, collectedSol - cfg.creatorReserveSol)
          : 0;
      if (basisSol <= 0) {
        throw new Error(
          "Nothing to split. Run Collect first (split basis = SOL collected this run − reserve).",
        );
      }
      const splitLamports = BigInt(Math.round(basisSol * 1e9));
      const slices = computeSplit(splitLamports, cfg);

      const prep = (await rpcPrep({ token })) as {
        blockhash: string;
        lastValidBlockHeight: number;
      };
      const tx = buildSplitTx(cfg, slices, prep.blockhash);

      setSplit({ status: "running", message: "Simulating…" });
      await simulateOrThrow(serializeUnsignedBase64(tx), "Split");

      setSplit({ status: "running", message: "Awaiting wallet signature…" });
      const signed = await signTransaction(tx);
      setSplit({ status: "running", message: "Relaying…" });
      const { signature } = (await relayTx({
        token,
        txBase64: bytesToBase64(signed.serialize()),
      })) as { signature: string };

      setSplit({ status: "running", message: "Confirming…", signature });
      const landed = await pollLanded(signature);
      if (landed === "absent") throw new Error("Split tx failed on-chain.");
      // Mark THIS collection's basis as split so it can't be re-split.
      splitBasisRef.current = collectedSol;
      setSplit({
        status: "done",
        message:
          `builder ${fmt(lamportsToSol(slices.builderL))} · ` +
          `treasury ${fmt(lamportsToSol(slices.treasuryL))} · ` +
          `buyback ${fmt(lamportsToSol(slices.buybackL))} SOL`,
        signature,
      });
    } catch (e) {
      fail(setSplit, e);
    } finally {
      setBusy(false);
      inFlightRef.current = false;
    }
  }, [
    signTransaction,
    collectedSol,
    cfg,
    rpcPrep,
    token,
    simulateOrThrow,
    relayTx,
    pollLanded,
    fail,
  ]);

  // ── STEP 3: distribute (batched, idempotent, resumable) ─────────────────────
  // `resumeEpoch` lets the resume picker re-enter a prior epoch's exact rows.
  const runDistribute = useCallback(
    async (resumeEpoch?: string) => {
      // Resume reads frozen amounts from the ledger and needs neither snap nor
      // plan — only a FRESH run does (checked inside the else branch below). On a
      // page reload snap/plan are null until a manual snapshot, so requiring them
      // here would silently no-op a cross-session Resume click.
      if (!token || !signAllTransactions || !publicKey) return;
      if (inFlightRef.current) return; // re-entrancy guard (see ref decl)
      inFlightRef.current = true;
      setErr(null);
      setDistribute({ status: "running", message: "Preparing…" });
      setBusy(true);
      try {
        const creator = new PublicKey(cfg.wallets.creator);

        // 1. Determine the epoch: resume an existing one or mint a fresh one and
        //    freeze the plan. Frozen rows are the source of truth for amounts.
        let activeEpoch: string;
        if (resumeEpoch) {
          activeEpoch = resumeEpoch;
        } else {
          // A FRESH epoch freezes per-owner amounts from the basis, so the basis
          // MUST be the SOL collected this run (collect → split → distribute),
          // not the full creator balance. Cross-session continuation goes through
          // the resume picker (amounts come from the frozen ledger instead).
          if (!snap || !plan) {
            throw new Error(
              "Run 'Refresh snapshot' first to build a fresh distribution plan.",
            );
          }
          if (collectedSol == null) {
            throw new Error(
              "Run Collect first — a fresh distribution must base its amounts on the SOL collected this run. Use Resume to continue a prior run.",
            );
          }
          if (overCap) {
            throw new Error(
              `Total ${fmt(totalSol)} SOL exceeds the per-run cap of ${cfg.perRunCapSol} SOL. Aborting.`,
            );
          }
          if (plan.kept.length === 0) throw new Error("No eligible payouts after dust floor.");
          activeEpoch = mintEpoch(DTOUR_MINT);
          // Cancel any abandoned all-"planned" epoch (frozen but never relayed)
          // BEFORE freezing this run, so it can't be Resumed into a double-pay.
          await cancelStalePlanned({ token, exceptEpoch: activeEpoch });
          await ledgerWritePlan({
            token,
            epoch: activeEpoch,
            rows: plan.kept.map((p: Payout) => ({
              owner: p.owner,
              lamports: p.lamports.toString(),
            })),
          });
          // CONSUME THE BASIS: the collected SOL is now frozen into this epoch.
          // Nulling collectedSol immediately disables the (fresh) Distribute
          // button, so a second click can't mint a NEW epoch and re-pay everyone.
          // Any continuation of THIS run goes through the Resume picker, which
          // reads the frozen ledger and never double-pays. Safe to null mid-run:
          // nothing below this point reads collectedSol.
          setCollectedSol(null);
        }
        epochRef.current = activeEpoch;
        setEpoch(activeEpoch);

        // 2. Reconcile any prior "attempted" rows on-chain BEFORE relaying.
        setDistribute({ status: "running", message: "Reconciling prior attempts…" });
        await reconcileEpoch({ token, epoch: activeEpoch });

        // 3. Read the frozen ledger; pay rows NOT in {paid, attempted}.
        const rows = await fetchLedger(token, activeEpoch);
        const toPay = rows.filter(
          (r) =>
            r.status !== "paid" &&
            r.status !== "attempted" &&
            r.status !== "cancelled",
        );
        const unresolved = rows.filter((r) => r.status === "attempted");
        if (toPay.length === 0) {
          setDistribute({
            status: "done",
            message:
              unresolved.length > 0
                ? `Nothing to pay; ${unresolved.length} attempt(s) still unresolved — re-run later.`
                : "All payouts already paid.",
          });
          return;
        }

        // 4. Batch into ~15 transfers/tx, build + simulate each with a fresh
        //    blockhash, then ONE signAllTransactions for the whole run.
        const batches = chunk(toPay, transfersPerBatch(cfg.memo));
        const built: Array<{
          tx: Transaction;
          owners: string[];
          blockhash: string;
          lastValidBlockHeight: number;
        }> = [];
        for (let i = 0; i < batches.length; i++) {
          setDistribute({
            status: "running",
            message: `Building + simulating batch ${i + 1}/${batches.length}…`,
          });
          const prep = (await rpcPrep({ token })) as {
            blockhash: string;
            lastValidBlockHeight: number;
          };
          const transfers = batches[i].map((r) => ({
            to: r.owner,
            lamports: BigInt(r.lamports),
          }));
          const tx = buildTransferTx(creator, transfers, prep.blockhash, cfg.memo);
          await simulateOrThrow(serializeUnsignedBase64(tx), `Batch ${i + 1}`);
          built.push({
            tx,
            owners: batches[i].map((r) => r.owner),
            blockhash: prep.blockhash,
            lastValidBlockHeight: prep.lastValidBlockHeight,
          });
        }

        setDistribute({
          status: "running",
          message: `Awaiting one wallet signature for ${built.length} batch(es)…`,
        });
        const signedTxs = await signAllTransactions(built.map((b) => b.tx));

        // 5. For each batch IN ORDER: write attempted (AWAITED) BEFORE relay,
        //    then relay, then confirm → paid / failed / stop-on-unknown.
        let paidBatches = 0;
        for (let i = 0; i < signedTxs.length; i++) {
          const b = built[i];
          const signed = signedTxs[i];
          const sigBytes = signed.signatures[0]?.signature;
          if (!sigBytes) throw new Error(`Batch ${i + 1} is missing its signature.`);
          const signature = bs58encode(sigBytes);

          await ledgerMarkAttempt({
            token,
            epoch: activeEpoch,
            owners: b.owners,
            signature,
            recentBlockhash: b.blockhash,
            lastValidBlockHeight: b.lastValidBlockHeight,
          });

          setDistribute({
            status: "running",
            message: `Relaying batch ${i + 1}/${signedTxs.length}…`,
            signature,
          });
          await relayTx({ token, txBase64: bytesToBase64(signed.serialize()) });

          const landed = await pollLanded(signature);
          if (landed === "landed") {
            await ledgerMarkResult({
              token,
              epoch: activeEpoch,
              owners: b.owners,
              status: "paid",
            });
            paidBatches++;
          } else if (landed === "absent") {
            await ledgerMarkResult({
              token,
              epoch: activeEpoch,
              owners: b.owners,
              status: "failed",
            });
          } else {
            // unknown — never resend blindly. Leave "attempted", stop the run.
            setDistribute({
              status: "error",
              message:
                `Batch ${i + 1} did not confirm in time and may still land. ` +
                `Left as "attempted" — re-run (resume) this epoch later to reconcile.`,
              signature,
            });
            return;
          }
        }

        setDistribute({
          status: "done",
          message: `Paid ${paidBatches}/${built.length} batch(es).`,
        });
      } catch (e) {
        fail(setDistribute, e);
      } finally {
        setBusy(false);
        inFlightRef.current = false;
      }
    },
    [
      signAllTransactions,
      publicKey,
      snap,
      plan,
      cfg,
      overCap,
      totalSol,
      collectedSol,
      cancelStalePlanned,
      ledgerWritePlan,
      token,
      reconcileEpoch,
      rpcPrep,
      simulateOrThrow,
      relayTx,
      ledgerMarkAttempt,
      ledgerMarkResult,
      pollLanded,
      fail,
    ],
  );

  // Ledger-driven progress counters.
  const progress = useMemo(() => {
    if (!ledger) return null;
    const paid = ledger.filter((r) => r.status === "paid").length;
    const attempted = ledger.filter((r) => r.status === "attempted").length;
    const failed = ledger.filter((r) => r.status === "failed").length;
    return { total: ledger.length, paid, attempted, failed };
  }, [ledger]);

  if (!token) return null;

  return (
    <Panel className="fade-up p-6" style={{ animationDelay: "180ms" }}>
      <SectionHeading
        title="Execute (sign in wallet)"
        description="Semi-auto: connect the CREATOR wallet, sign in the browser. Collect → split → distribute. RPC + relay run server-side; no key ever leaves your wallet."
      />

      {/* Wallet connect + identity assert */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="[&_.wallet-adapter-button]:!rounded-full [&_.wallet-adapter-button]:!bg-white/10">
          <WalletMultiButton />
        </div>
        {connected &&
          (isCreator ? (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              ✓ Creator wallet connected
            </span>
          ) : (
            <span className="rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs text-red-200">
              Connected wallet is NOT the creator ({trunc(cfg.wallets.creator)}). Execute disabled.
            </span>
          ))}
      </div>

      {!connected && (
        <p className="mt-3 text-xs text-white/40">
          Connect the creator wallet ({trunc(cfg.wallets.creator)}) to enable execution.
        </p>
      )}

      {/* Steppers — only usable by the creator wallet */}
      <div className="mt-5 space-y-3">
        {/* Step 1: collect */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                <span className="text-white/40">1.</span> Collect creator fees
                <StepBadge s={collect} />
              </div>
              <p className="mt-1 text-xs text-white/45">
                PumpPortal collectCreatorFee → drain-checked → simulated → signed → relayed.
              </p>
              {collect.message && (
                <p className="mt-1 text-xs text-white/60">{collect.message}</p>
              )}
              {collect.signature && (
                <a
                  href={solscanTx(collect.signature)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-purple-300 hover:underline"
                >
                  {trunc(collect.signature)} <Icon.ArrowUpRight size={12} />
                </a>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={runCollect}
              disabled={!isCreator || busy || collect.status === "running"}
            >
              Collect
            </Button>
          </div>
        </div>

        {/* Step 2: split */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                <span className="text-white/40">2.</span> Split fees
                <StepBadge s={split} />
              </div>
              <p className="mt-1 text-xs text-white/45">
                creator → builder / treasury(+dust) / buyback by bps. Holders slice stays in
                creator for step 3. Basis = SOL collected this run − reserve
                {collectedSol != null ? ` (~${fmt(collectedSol)} SOL collected).` : "."}
              </p>
              {split.message && <p className="mt-1 text-xs text-white/60">{split.message}</p>}
              {split.signature && (
                <a
                  href={solscanTx(split.signature)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-purple-300 hover:underline"
                >
                  {trunc(split.signature)} <Icon.ArrowUpRight size={12} />
                </a>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={runSplit}
              disabled={
                !isCreator ||
                busy ||
                split.status === "running" ||
                // Disabled once this collection is split — a fresh Collect re-arms it.
                split.status === "done" ||
                collectedSol == null
              }
            >
              Split
            </Button>
          </div>
        </div>

        {/* Step 3: distribute */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                <span className="text-white/40">3.</span> Distribute to holders
                <StepBadge s={distribute} />
              </div>
              <p className="mt-1 text-xs text-white/45">
                Pro-rata over the holders slice, batched ~{TRANSFERS_PER_BATCH}/tx, idempotent
                (ledger), resumable. Excludes the 4 pools + your exclude list.
              </p>
              {plan && (
                <p className="mt-1 text-xs text-white/60">
                  {plan.kept.length} payouts · {fmt(totalSol)} SOL
                  {overCap && (
                    <span className="text-red-300"> · OVER CAP ({cfg.perRunCapSol} SOL)</span>
                  )}
                </p>
              )}
              {collectedSol == null && distribute.status === "idle" && (
                <p className="mt-1 text-[11px] text-amber-200/70">
                  Run Collect first to freeze a new run, or use Resume below for a prior run.
                </p>
              )}
              {collectedSol == null && distribute.status === "done" && (
                <p className="mt-1 text-[11px] text-emerald-200/70">
                  Run complete — this run's collected SOL is spent. Collect again to
                  start a new distribution.
                </p>
              )}
              {distribute.message && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-white/60">
                  {distribute.message}
                </p>
              )}
              {progress && (
                <p className="mt-1 text-xs text-emerald-200/80">
                  paid {progress.paid}/{progress.total}
                  {progress.attempted > 0 && ` · attempted ${progress.attempted}`}
                  {progress.failed > 0 && ` · failed ${progress.failed}`}
                </p>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={
                !isCreator ||
                busy ||
                distribute.status === "running" ||
                !plan ||
                plan.kept.length === 0 ||
                // A FRESH distribution freezes per-owner amounts from the basis,
                // so the basis must be the SOL collected this run (not the full
                // creator balance). Resume a prior epoch via the picker below to
                // continue across sessions (amounts come from the frozen ledger).
                collectedSol == null
              }
            >
              Distribute
            </Button>
          </div>
        </div>
      </div>

      {/* Resume incomplete runs */}
      {incompleteEpochs && incompleteEpochs.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-4">
          <p className="text-xs font-medium text-amber-200">Resume incomplete runs</p>
          <p className="mt-1 text-xs text-white/50">
            Re-enter a prior epoch's frozen rows — reconciles attempts, skips paid, retries
            failed. NEVER double-pays.
          </p>
          <div className="mt-2 space-y-1.5">
            {incompleteEpochs.map((e) => (
              <div key={e.epoch} className="flex items-center justify-between gap-3 text-xs">
                <span className="font-mono text-white/60">{e.epoch.split(":").pop()}</span>
                <span className="text-white/45">
                  {e.paid}/{e.total} paid · {e.pending} pending
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEpoch(e.epoch);
                    epochRef.current = e.epoch;
                    void runDistribute(e.epoch);
                  }}
                  disabled={!isCreator || busy}
                >
                  Resume
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <p className="mt-4 whitespace-pre-wrap text-sm text-red-400/90">{err}</p>}

      {/* Confirm modal */}
      {confirmOpen && plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6">
            <h3 className="text-lg font-semibold text-white">Confirm distribution</h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-white/50">Total to distribute</dt>
                <dd className="text-white/90">{fmt(totalSol)} SOL</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/50">Recipients</dt>
                <dd className="text-white/90">{plan.kept.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/50">Batches (~{TRANSFERS_PER_BATCH}/tx)</dt>
                <dd className="text-white/90">
                  {Math.ceil(plan.kept.length / TRANSFERS_PER_BATCH)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/50">Per-run cap</dt>
                <dd className={overCap ? "text-red-300" : "text-white/90"}>
                  {cfg.perRunCapSol} SOL
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/50">Creator wallet</dt>
                <dd className="font-mono text-white/90">{trunc(cfg.wallets.creator)}</dd>
              </div>
            </dl>
            {overCap && (
              <p className="mt-3 text-xs text-red-300">
                Total exceeds the per-run cap — distribution is blocked. Raise the cap or
                distribute less.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={overCap}
                onClick={() => {
                  setConfirmOpen(false);
                  void runDistribute();
                }}
              >
                Confirm & sign
              </Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}


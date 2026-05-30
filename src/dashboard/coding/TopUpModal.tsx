import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { buildTopUpTx } from "@/lib/credits-topup";
import { Button, Icon } from "@/ui";

type Info = { treasury: string; mint: string; priceUsd: number };

/** Buy USD credits with $DTOUR: build a Token-2022 transfer to the credits
 *  treasury, the wallet signs + broadcasts, then convex verifies on-chain and
 *  grants credits at the live rate. */
export function TopUpModal({
  token,
  onClose,
  onCredited,
}: {
  token: string;
  onClose: () => void;
  onCredited: () => void;
}) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const topUpInfo = useAction(anyApi.credits.topUpInfo);
  const topUpVerify = useAction(anyApi.credits.topUpVerify);
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as
    | { pubkey: string }
    | null
    | undefined;

  const [info, setInfo] = useState<Info | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void topUpInfo({})
      .then((i) => setInfo(i as Info))
      .catch(() => setErr("Couldn't load the live rate."));
  }, [topUpInfo]);

  const amt = Number(amount);
  const usd = info && amt > 0 ? amt * info.priceUsd : 0;
  const walletMatches =
    !me || !publicKey || publicKey.toBase58() === me.pubkey;

  async function pay() {
    if (!info || !publicKey || !sendTransaction || !(amt > 0)) return;
    setErr(null);
    setBusy(true);
    try {
      setStatus("Building transfer…");
      const tx = await buildTopUpTx({
        connection,
        payer: publicKey,
        treasury: new PublicKey(info.treasury),
        mint: new PublicKey(info.mint),
        amountUi: amt,
      });
      setStatus("Approve in your wallet…");
      const sig = await sendTransaction(tx, connection);
      setStatus("Confirming on-chain…");
      await connection.confirmTransaction(sig, "confirmed");
      setStatus("Crediting your balance…");
      const res = (await topUpVerify({ token, signature: sig })) as {
        ok: boolean;
        reason?: string;
        creditedUsd?: number;
      };
      if (!res.ok) throw new Error(res.reason || "verification failed");
      setStatus(`✓ Credited $${(res.creditedUsd ?? 0).toFixed(2)}.`);
      onCredited();
      window.setTimeout(onClose, 1300);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Top-up failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d12] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Icon.Coins size={16} /> Top up credits with $DTOUR
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 transition hover:text-white/80"
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-xs text-white/50">
          Pay $DTOUR now; it converts to USD credits at the current rate
          {info ? ` ($${info.priceUsd.toFixed(6)}/DTOUR)` : ""}. Credits never lose
          value to token swings — the conversion is locked at top-up.
        </p>

        {!publicKey ? (
          <div className="mt-5">
            <p className="mb-2 text-xs text-white/60">Connect the wallet that holds your $DTOUR:</p>
            <WalletMultiButton />
          </div>
        ) : (
          <>
            {!walletMatches && (
              <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
                Connected wallet differs from your login wallet. Credits go to your
                login wallet — connect that one, or the credit will be rejected.
              </p>
            )}
            <label className="mt-4 block text-xs uppercase tracking-widest text-white/50">
              Amount ($DTOUR)
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 100000"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white tabular-nums placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-white/40">You'll receive</span>
              <span className="tabular-nums text-white/80">
                {info ? `≈ $${usd.toFixed(2)} credits` : "…"}
              </span>
            </div>

            <Button
              className="mt-5 w-full justify-center"
              onClick={pay}
              disabled={busy || !info || !(amt > 0) || !(info?.priceUsd > 0)}
            >
              {busy ? status || "Working…" : `Pay ${amt > 0 ? amt.toLocaleString() : ""} $DTOUR`}
            </Button>
            {status && !err && <p className="mt-3 text-xs text-emerald-200/80">{status}</p>}
          </>
        )}
        {err && <p className="mt-3 whitespace-pre-wrap text-xs text-red-400/90">{err}</p>}
        {info && !(info.priceUsd > 0) && (
          <p className="mt-3 text-xs text-amber-200/80">
            Live $DTOUR price is unavailable right now — try again shortly.
          </p>
        )}
      </div>
    </div>
  );
}

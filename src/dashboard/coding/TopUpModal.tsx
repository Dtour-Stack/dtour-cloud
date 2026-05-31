import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { buildTopUpTx } from "@/lib/credits-topup";
import { buildUsdcTopUpTx } from "@/lib/credits-topup-usdc";
import { Button, Icon } from "@/ui";

type Info = {
  treasury: string;
  mint: string;
  dtourMint: string;
  usdcMint: string;
  priceUsd: number;
};
type Asset = "DTOUR" | "USDC";

/** Buy USD credits with $DTOUR or USDC: build a transfer to the credits
 *  treasury, the wallet signs + broadcasts, then convex verifies on-chain and
 *  grants credits ($DTOUR at the live rate, USDC 1:1). */
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
  const usdcTopUpVerify = useAction(anyApi.credits.usdcTopUpVerify);
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as
    | { pubkey: string }
    | null
    | undefined;

  const [info, setInfo] = useState<Info | null>(null);
  const [asset, setAsset] = useState<Asset>("DTOUR");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void topUpInfo({})
      .then((i) => setInfo(i as Info))
      .catch(() => setErr("Couldn't load the live rate."));
  }, [topUpInfo]);

  const isUsdc = asset === "USDC";
  const amt = Number(amount);
  // USDC credits 1:1; $DTOUR converts at the live rate.
  const usd = isUsdc ? (amt > 0 ? amt : 0) : info && amt > 0 ? amt * info.priceUsd : 0;
  const walletMatches =
    !me || !publicKey || publicKey.toBase58() === me.pubkey;
  // Only the $DTOUR path depends on the price feed; USDC stays usable if it's down.
  const priceReady = isUsdc || (info ? info.priceUsd > 0 : false);

  async function pay() {
    if (!info || !publicKey || !sendTransaction || !(amt > 0)) return;
    setErr(null);
    setBusy(true);
    try {
      setStatus("Building transfer…");
      const tx = isUsdc
        ? await buildUsdcTopUpTx({
            connection,
            payer: publicKey,
            treasury: new PublicKey(info.treasury),
            mint: new PublicKey(info.usdcMint),
            amountUi: amt,
          })
        : await buildTopUpTx({
            connection,
            payer: publicKey,
            treasury: new PublicKey(info.treasury),
            mint: new PublicKey(info.dtourMint),
            amountUi: amt,
          });
      setStatus("Approve in your wallet…");
      const sig = await sendTransaction(tx, connection);
      setStatus("Confirming on-chain…");
      await connection.confirmTransaction(sig, "confirmed");
      setStatus("Crediting your balance…");
      const verify = isUsdc ? usdcTopUpVerify : topUpVerify;
      const res = (await verify({ token, signature: sig })) as {
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
            <Icon.Coins size={16} /> Top up credits
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 transition hover:text-white/80"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["DTOUR", "USDC"] as Asset[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAsset(a);
                setAmount("");
                setErr(null);
                setStatus(null);
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                asset === a
                  ? "border-purple-400/50 bg-purple-400/10 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white/80"
              }`}
            >
              {a === "DTOUR" ? "$DTOUR" : "USDC"}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-white/50">
          {isUsdc
            ? "1 USDC = $1.00 credit. Credits are stored in USD, so what you pay is what you get."
            : `Pay $DTOUR now; it converts to USD credits at the current rate${
                info ? ` ($${info.priceUsd.toFixed(6)}/DTOUR)` : ""
              }. Credits never lose value to token swings — the conversion is locked at top-up.`}
        </p>

        {!publicKey ? (
          <div className="mt-5">
            <p className="mb-2 text-xs text-white/60">
              Connect the wallet that holds your {isUsdc ? "USDC" : "$DTOUR"}:
            </p>
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
              Amount ({isUsdc ? "USDC" : "$DTOUR"})
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={isUsdc ? "e.g. 10" : "e.g. 100000"}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white tabular-nums placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-white/40">You'll receive</span>
              <span className="tabular-nums text-white/80">
                {isUsdc || info ? `≈ $${usd.toFixed(2)} credits` : "…"}
              </span>
            </div>

            <Button
              className="mt-5 w-full justify-center"
              onClick={pay}
              disabled={busy || !info || !(amt > 0) || !priceReady}
            >
              {busy
                ? status || "Working…"
                : `Pay ${amt > 0 ? amt.toLocaleString() : ""} ${isUsdc ? "USDC" : "$DTOUR"}`}
            </Button>
            {status && !err && <p className="mt-3 text-xs text-emerald-200/80">{status}</p>}
          </>
        )}
        {err && <p className="mt-3 whitespace-pre-wrap text-xs text-red-400/90">{err}</p>}
        {!isUsdc && info && !(info.priceUsd > 0) && (
          <p className="mt-3 text-xs text-amber-200/80">
            Live $DTOUR price is unavailable right now — try again shortly, or pay with USDC.
          </p>
        )}
      </div>
    </div>
  );
}

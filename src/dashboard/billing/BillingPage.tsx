import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { TopUpModal } from "@/dashboard/coding/TopUpModal";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Icon } from "@/ui";

type Credits = { balanceUsd: number; holder: boolean } | null | undefined;
type Pricing = { example: { nonHolderPerHourUsd: number; holderPerHourUsd: number } } | undefined;

export function BillingHome() {
  const token = getDtourSessionToken();
  const credits = useQuery(anyApi.coding.myCredits, token ? { token } : "skip") as Credits;
  const pricing = useQuery(anyApi.coding.pricing, {}) as Pricing;
  const [topUp, setTopUp] = useState(false);
  const rate =
    pricing && credits
      ? credits.holder
        ? pricing.example.holderPerHourUsd
        : pricing.example.nonHolderPerHourUsd
      : null;

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Billing</h1>
          <p className="mt-1 text-sm text-white/50">
            USD credits power paid features (coding sandboxes). Top up with $DTOUR at the live rate —
            volatility risk is taken once, never mid-session.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="text-xs uppercase tracking-widest text-white/45">Credit balance</div>
          <div className="mt-1 flex items-end justify-between">
            <div className="text-3xl font-semibold tabular-nums text-white">
              ${(credits?.balanceUsd ?? 0).toFixed(2)}
            </div>
            <Button onClick={() => setTopUp(true)}>
              <Icon.Plus size={14} /> Top up with $DTOUR
            </Button>
          </div>
          <div className="mt-3 text-xs text-white/45">
            {credits?.holder ? "Holder rate" : "Standard rate"}
            {rate != null ? ` · ~$${rate.toFixed(2)}/sandbox-hr` : ""}
            {credits?.holder ? " · 20% holder discount applied" : ""}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="text-sm font-medium text-white">How charges work</div>
          <ul className="mt-2 space-y-1.5 text-xs text-white/55">
            <li>• Coding sandboxes are metered per second at E2B's real cost × markup.</li>
            <li>• Holders of ≥0.5% $DTOUR get 20% off coding sandboxes, applied automatically.</li>
            <li>• A small minimum charge per session covers overhead.</li>
            <li>• Chat and image generation are metered at the gateway's real cost × markup (holder discount applies).</li>
            <li>• Prefer the “Free — rate-limited” model for zero-cost inference (no credits used, daily cap).</li>
          </ul>
        </div>
      </div>
      {topUp && token && (
        <TopUpModal token={token} onClose={() => setTopUp(false)} onCredited={() => {}} />
      )}
    </>
  );
}

export default function BillingPage() {
  return <Navigate to="/profile/billing" replace />;
}

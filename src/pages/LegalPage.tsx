import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const SECTIONS: Record<string, { title: string; content: ReactNode }[]> = {
  terms: [
    {
      title: "1. Service Description",
      content: (
        <p>
          Detour Cloud ("we", "us", "our") provides a white-label cloud
          dashboard that resells ElizaOS Cloud infrastructure at a flat 20%
          markup over ElizaCloud's base pricing. The platform lets you build,
          deploy, and run autonomous agents powered by the elizaOS framework.
          All agent execution, gateways, and container infrastructure are
          provisioned by ElizaCloud; we provide the dashboard, session
          management, and billing integration.
        </p>
      ),
    },
    {
      title: "2. Accounts & Authentication",
      content: (
        <div className="space-y-2">
          <p>
            You may create an account using a WebAuthn passkey (Face ID,
            Touch ID, device PIN) or a Solana wallet via SIWS (Sign In With
            Solana). Passkey accounts are assigned a platform identifier; wallet
            accounts use your Solana public key. You are responsible for
            maintaining the security of your authentication method. We are not
            liable for any loss or damage from unauthorized access.
          </p>
          <p>
            One person may maintain one account. Accounts are non-transferable.
            You must provide accurate information and keep it updated.
          </p>
        </div>
      ),
    },
    {
      title: "3. $DTOUR Token & Tier Status",
      content: (
        <div className="space-y-2">
          <p>
            $DTOUR (mint address published on our token page) is a Solana SPL
            token that conveys holder-status tier benefits within Detour Cloud.
            Holding $DTOUR does not constitute an investment, equity, or debt
            interest in Detour Cloud or any affiliated entity. Token utility is
            limited to platform tier features as described on our token page and
            may change at any time.
          </p>
          <p>
            Tier thresholds (currently 1M for Scout, 5M for Operator) are
            read from on-chain balance at sign-in. We do not custody your
            tokens. We are not responsible for any loss of tokens, including
            but not limited to transfer errors, smart contract vulnerabilities,
            or network attacks.
          </p>
        </div>
      ),
    },
    {
      title: "4. Free Tier & Usage Limits",
      content: (
        <p>
          Free-tier accounts receive capped monthly compute credits. Usage
          beyond the free cap requires purchasing credits or connecting a wallet
          with sufficient $DTOUR for holder-rate access. We reserve the right to
          adjust free-tier limits, credit pricing, and rate structures with 14
          days' notice.
        </p>
      ),
    },
    {
      title: "5. Acceptable Use",
      content: (
        <div className="space-y-2">
          <p>You agree not to:</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text-muted)]">
            <li>Use the platform for any illegal activity</li>
            <li>Attempt to bypass rate limits, authentication, or billing</li>
            <li>Deploy agents that violate applicable laws</li>
            <li>Scrape, crawl, or otherwise extract data without authorization</li>
            <li>Interfere with the operation of the platform</li>
          </ul>
        </div>
      ),
    },
    {
      title: "6. Billing & Payments",
      content: (
        <div className="space-y-2">
          <p>
            Paid services are billed through our credit system. Credits are
            purchased via connected wallet and are non-refundable unless
            required by applicable law. We use a 20% markup over ElizaCloud's
            base infrastructure pricing. Pricing is subject to change with 14
            days' notice. Unused credits do not expire, but accounts inactive
            for 12 months may forfeit their credit balance.
          </p>
        </div>
      ),
    },
    {
      title: "7. Third-Party Services",
      content: (
        <p>
          Agent execution infrastructure is provided by ElizaCloud. Coding
          sandboxes are powered by E2B. Solana RPC is served by third-party
          providers. Each service operates under its own terms; we are not
          responsible for their availability or behavior.
        </p>
      ),
    },
    {
      title: "8. Limitation of Liability",
      content: (
        <p>
          To the maximum extent permitted by law, Detour Cloud shall not be
          liable for any indirect, incidental, special, consequential, or
          punitive damages arising from your use of the platform. Our total
          liability for any claim is limited to the amount you paid us in the
          12 months preceding the claim.
        </p>
      ),
    },
    {
      title: "9. Termination",
      content: (
        <p>
          We may suspend or terminate your account at any time for violation of
          these terms, extended inactivity, or at our discretion with 30 days'
          notice (except where immediate action is required to prevent harm).
          Upon termination, your right to access the platform ends immediately.
        </p>
      ),
    },
    {
      title: "10. Changes to Terms",
      content: (
        <p>
          We may update these terms at any time. Material changes will be
          posted on this page and, for active accounts, notified via the
          platform inbox at least 14 days in advance. Continued use after
          changes take effect constitutes acceptance.
        </p>
      ),
    },
    {
      title: "11. Governing Law",
      content: (
        <p>
          These terms are governed by the laws of the State of Delaware,
          United States. Any disputes shall be resolved in the courts of
          Delaware.
        </p>
      ),
    },
    {
      title: "12. Contact",
      content: (
        <p>
          Questions? Reach us at{" "}
          <a href="mailto:support@detour.ninja" className="text-purple-300 hover:text-purple-200 underline">
            support@detour.ninja
          </a>
          .
        </p>
      ),
    },
  ],
  privacy: [
    {
      title: "1. Information We Collect",
      content: (
        <div className="space-y-2">
          <p>We collect information you provide directly:</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text-muted)]">
            <li>Email address (for account recovery and updates)</li>
            <li>Username (displayed publicly within the platform)</li>
            <li>Solana wallet address (for $DTOUR verification, optional)</li>
            <li>WebAuthn credential public keys (passkey authentication)</li>
          </ul>
          <p className="mt-3">
            We also collect usage data: page views, feature interactions, agent
            deployment events, and error reports. This data is anonymized where
            possible.
          </p>
        </div>
      ),
    },
    {
      title: "2. How We Use Your Information",
      content: (
        <div className="space-y-2">
          <p>We use your information to:</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text-muted)]">
            <li>Operate and maintain the platform</li>
            <li>Authenticate your identity</li>
            <li>Process billing and determine tier access</li>
            <li>Send service announcements</li>
            <li>Improve our products</li>
            <li>Comply with legal obligations</li>
          </ul>
        </div>
      ),
    },
    {
      title: "3. Data Storage & Security",
      content: (
        <div className="space-y-2">
          <p>
            Your data is stored on self-hosted Convex infrastructure (PostgreSQL
            + document store) running on DigitalOcean droplets in Ashburn,
            Virginia, United States. We use industry-standard encryption in transit (TLS) and at
            rest. Passkey credentials are stored as public keys only — we never
            receive or store your biometric data.
          </p>
          <p>
            We retain your data for the duration of your account plus 90 days
            after termination, after which it is permanently deleted. Aggregated,
            anonymized analytics may be retained indefinitely.
          </p>
        </div>
      ),
    },
    {
      title: "4. Data Sharing",
      content: (
        <div className="space-y-2">
          <p>We do not sell your personal data. We share data only with:</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text-muted)]">
            <li>ElizaCloud (agent execution infrastructure — necessary for service operation)</li>
            <li>E2B (coding sandbox provider)</li>
            <li>DigitalOcean (hosting infrastructure)</li>
            <li>Law enforcement when required by applicable law</li>
          </ul>
        </div>
      ),
    },
    {
      title: "5. Cookies & Local Storage",
      content: (
        <p>
          We use localStorage (not cookies) to store your session token and
          affiliate referral code. No third-party tracking cookies are used. You
          can clear this data at any time from your browser settings — doing so
          will sign you out.
        </p>
      ),
    },
    {
      title: "6. Your Rights",
      content: (
        <div className="space-y-2">
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text-muted)]">
            <li>Access the personal data we hold about you</li>
            <li>Request correction or deletion</li>
            <li>Object to or restrict processing</li>
            <li>Data portability</li>
            <li>Withdraw consent (where processing is based on consent)</li>
          </ul>
          <p className="mt-3">
            To exercise these rights, email{" "}
            <a href="mailto:support@detour.ninja" className="text-purple-300 hover:text-purple-200 underline">
              support@detour.ninja
            </a>
            . We will respond within 30 days.
          </p>
        </div>
      ),
    },
    {
      title: "7. Changes to This Policy",
      content: (
        <p>
          We may update this privacy policy. Material changes will be posted
          here and, for active accounts, communicated via the platform inbox.
        </p>
      ),
    },
    {
      title: "8. Contact",
      content: (
        <p>
          Data controller: Detour Cloud. Reach us at{" "}
          <a href="mailto:support@detour.ninja" className="text-purple-300 hover:text-purple-200 underline">
            support@detour.ninja
          </a>
          .
        </p>
      ),
    },
  ],
};

export default function LegalPage() {
  const loc = useLocation();
  const page = loc.pathname === "/terms-of-service" ? "terms" : "privacy";
  const sections = SECTIONS[page];
  const title = page === "terms" ? "Terms of Service" : "Privacy Policy";
  const subtitle =
    page === "terms"
      ? "Last updated: June 7, 2026"
      : "Last updated: June 7, 2026";

  return (
    <div className="public-page min-h-screen bg-black text-[var(--text)]">
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 30%, rgba(168,85,247,0.08) 0%, transparent 50%),
            linear-gradient(180deg, #0a0a0a 0%, #000000 100%)
          `,
        }}
      />
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="flex items-center gap-3">
          <img src="/brand/dtour/logo.svg" alt="Dtour" className="logo-cloud h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight">Detour Cloud</span>
        </Link>
        <Link
          to="/"
          className="rounded-full border border-[var(--border-bold)] bg-[var(--btn-glass-bg)] px-4 py-1.5 text-xs font-medium backdrop-blur-sm transition hover:bg-[var(--btn-glass-bg)]"
        >
          Back
        </Link>
      </nav>

      <main className="relative z-10 mx-auto max-w-3xl px-6 py-10 md:py-16">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {page === "terms"
            ? "These terms govern your use of Detour Cloud. By signing in, you agree to them."
            : "How we collect, use, and protect your data when you use Detour Cloud."}
        </p>

        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-base font-semibold text-[var(--text)]">{s.title}</h2>
              <div className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                {s.content}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-[var(--border)] pt-6 text-center">
          <p className="text-xs text-[var(--text-faint)]">
            Questions?{" "}
            <a href="mailto:support@detour.ninja" className="text-purple-300 hover:text-purple-200 underline">
              support@detour.ninja
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

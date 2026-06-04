/**
 * Detour Cloud — Branding + config.
 *
 * $DTOUR tracks cloud holder status; supported billing paths can apply holder
 * rates for wallets with >= 0.5% of supply.
 */

import type { BrandingConfig } from "@elizaos/shared/config/branding";

export const DTOUR_APP_DISPLAY_NAME = "Detour";

export const DTOUR_BRANDING: BrandingConfig = {
  appName: DTOUR_APP_DISPLAY_NAME,
  orgName: "Dtour-Stack",
  repoName: "swoosh",
  docsUrl: "https://docs.detour.ninja",
  appUrl: "https://detour.ninja",
  bugReportUrl:
    "https://github.com/Dtour-Stack/swoosh/issues/new?template=bug_report.yml",
  hashtag: "#DtourAgent",
  fileExtension: ".dtour-agent",
  packageScope: "dtour",
  cloudOnly: true,
};

// ── Token ────────────────────────────────────────────────────────────────────

export const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
export const DTOUR_TOTAL_SUPPLY = 1_000_000_000;

// ── Pricing ──────────────────────────────────────────────────────────────────

/** 20% markup on all ElizaOS Cloud billing */
export const DTOUR_MARKUP = 1.2;

// ── Affiliate ────────────────────────────────────────────────────────────────

export const DTOUR_AFFILIATE_CODE = "AFF-0GOWANBA";

// ── Holder discount ──────────────────────────────────────────────────────────

/** Hold >= 0.5% of supply → holder rate on supported billing paths. */
export const DTOUR_DISCOUNT_THRESHOLD = 0.005; // fraction of total supply
export const DTOUR_HOLDER_DISCOUNT = 0.2; // 20% off

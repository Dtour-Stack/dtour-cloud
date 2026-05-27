/**
 * Dtour Cloud — Branding + config.
 *
 * 20% markup on ElizaOS Cloud billing. Token is for staking,
 * burns, builder rewards — not free access.
 */

import type { BrandingConfig } from "@elizaos/shared/config/branding";

export const DTOUR_APP_DISPLAY_NAME = "Dtour";

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

// ── Fee split (on-chain) ─────────────────────────────────────────────────────

export const DTOUR_FEE_SPLIT = {
  vault: 4000,    // 40% to stakers
  burn: 2500,     // 25% buyback & burn
  builder: 1500,  // 15% GitHub contributors
  creator: 1000,  // 10% skill/workflow authors
  treasury: 1000, // 10% development
} as const;

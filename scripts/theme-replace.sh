#!/usr/bin/env bash
# Replace hardcoded white/black color classes with theme CSS variables
set -euo pipefail

FILES=(
  src/pages/dtour-token-page.tsx
  src/pages/dtour-landing-page.tsx
  src/pages/login/dtour-login-page.tsx
  src/pages/LegalPage.tsx
  src/pages/NinjaPage.tsx
  src/dashboard/AppShell.tsx
  src/dashboard/InboxPanel.tsx
  src/dashboard/home/DashboardHome.tsx
  src/dashboard/agents/AgentsHome.tsx
  src/dashboard/agents/ChatSidebar.tsx
  src/dashboard/apps/AppsPage.tsx
)

# Test that all files exist
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "MISSING: $f"
    exit 1
  fi
done
echo "All files found. Proceeding with replacements..."

# ========================================================
# ORDER MATTERS: more specific patterns FIRST
# ========================================================

# ─── Text shades ───
for f in "${FILES[@]}"; do
  # text-white/60 → text-[var(--text-dim)]
  sed -i '' 's/text-white\/60/text-[var(--text-dim)]/g' "$f"
  # text-white/55 → text-[var(--text-dim)]
  sed -i '' 's/text-white\/55/text-[var(--text-dim)]/g' "$f"
  # text-white/50 → text-[var(--text-muted)]
  sed -i '' 's/text-white\/50/text-[var(--text-muted)]/g' "$f"
  # text-white/45 → text-[var(--text-muted)]
  sed -i '' 's/text-white\/45/text-[var(--text-muted)]/g' "$f"
  # text-white/40 → text-[var(--text-muted)]
  sed -i '' 's/text-white\/40/text-[var(--text-muted)]/g' "$f"
  # text-white/35 → text-[var(--text-faint)]
  sed -i '' 's/text-white\/35/text-[var(--text-faint)]/g' "$f"
  # text-white/30 → text-[var(--text-faint)]
  sed -i '' 's/text-white\/30/text-[var(--text-faint)]/g' "$f"
  # text-white/25 → text-[var(--text-faint)]
  sed -i '' 's/text-white\/25/text-[var(--text-faint)]/g' "$f"
  # text-white/20 → text-[var(--text-faint)]
  sed -i '' 's/text-white\/20/text-[var(--text-faint)]/g' "$f"
  # text-white/15 → text-[var(--text-faint)]
  sed -i '' 's/text-white\/15/text-[var(--text-faint)]/g' "$f"
  # text-white/10 → text-[var(--text-faint)]
  sed -i '' 's/text-white\/10/text-[var(--text-faint)]/g' "$f"
  # text-white/85 → text-[var(--text)]
  sed -i '' 's/text-white\/85/text-[var(--text)]/g' "$f"
  # text-white/80 → text-[var(--text)]
  sed -i '' 's/text-white\/80/text-[var(--text)]/g' "$f"
  # text-white/75 → text-[var(--text)]
  sed -i '' 's/text-white\/75/text-[var(--text)]/g' "$f"
  # text-white/70 → text-[var(--text-dim)]
  sed -i '' 's/text-white\/70/text-[var(--text-dim)]/g' "$f"
  # text-white/65 → text-[var(--text-dim)]
  sed -i '' 's/text-white\/65/text-[var(--text-dim)]/g' "$f"
  # plain text-white (no opacity suffix) — must be LAST
  sed -i '' 's/text-white\([^\/]\)/text-[var(--text)]\1/g' "$f"
  # handle text-white at end of string / followed by space/quote/brace/end
  sed -i '' 's/text-white"/text-[var(--text)]"/g' "$f"
  # text-black → text-[var(--text)]
  sed -i '' 's/text-black/text-[var(--text)]/g' "$f"
done

# ─── Background shades ───
for f in "${FILES[@]}"; do
  # bg-black/80 → bg-[var(--bg-overlay)]
  sed -i '' 's/bg-black\/80/bg-[var(--bg-overlay)]/g' "$f"
  # bg-black/50 → bg-[var(--bg-overlay)]
  sed -i '' 's/bg-black\/50/bg-[var(--bg-overlay)]/g' "$f"
  # bg-black/40 → bg-[var(--bg-alt)]
  sed -i '' 's/bg-black\/40/bg-[var(--bg-alt)]/g' "$f"
  # bg-black/35 → keep for video overlay
  # bg-black/30 → bg-[var(--bg-glass)]
  sed -i '' 's/bg-black\/30/bg-[var(--bg-glass)]/g' "$f"
  # bg-[#0a0a0a] → bg-[var(--bg)]
  sed -i '' 's/bg-\[#0a0a0a\]/bg-[var(--bg)]/g' "$f"
  # bg-[#111] → bg-[var(--bg-elevated)]
  sed -i '' 's/bg-\[#111\]/bg-[var(--bg-elevated)]/g' "$f"
  # bg-[#0d0d0d] → bg-[var(--bg-elevated)]
  sed -i '' 's/bg-\[#0d0d0d\]/bg-[var(--bg-elevated)]/g' "$f"
  # bg-white/5 → bg-[var(--btn-glass-bg)]
  sed -i '' 's/bg-white\/5 /bg-[var(--btn-glass-bg)] /g' "$f"
  sed -i '' 's/bg-white\/5"/bg-[var(--btn-glass-bg)]"/g' "$f"
  # bg-white/10 → bg-[var(--btn-glass-bg)]
  sed -i '' 's/bg-white\/10 /bg-[var(--btn-glass-bg)] /g' "$f"
  sed -i '' 's/bg-white\/10"/bg-[var(--btn-glass-bg)]"/g' "$f"
  # bg-white/15 → bg-[var(--btn-glass-bg)]
  sed -i '' 's/bg-white\/15 /bg-[var(--btn-glass-bg)] /g' "$f"
  sed -i '' 's/bg-white\/15"/bg-[var(--btn-glass-bg)]"/g' "$f"
  # bg-white/20 → bg-[var(--btn-glass-bg)]
  sed -i '' 's/bg-white\/20 /bg-[var(--btn-glass-bg)] /g' "$f"
  sed -i '' 's/bg-white\/20"/bg-[var(--btn-glass-bg)]"/g' "$f"
  # bg-white/25 → bg-[var(--btn-glass-bg)]
  sed -i '' 's/bg-white\/25 /bg-[var(--btn-glass-bg)] /g' "$f"
  sed -i '' 's/bg-white\/25"/bg-[var(--btn-glass-bg)]"/g' "$f"
  # bg-white/[0.02] → bg-[var(--bg-elevated)]
  sed -i '' 's/bg-white\/\[0\.02\]/bg-[var(--bg-elevated)]/g' "$f"
  # bg-white/[0.025] → bg-[var(--bg-elevated)]
  sed -i '' 's/bg-white\/\[0\.025\]/bg-[var(--bg-elevated)]/g' "$f"
  # bg-white/[0.03] → bg-[var(--bg-elevated)]
  sed -i '' 's/bg-white\/\[0\.03\]/bg-[var(--bg-elevated)]/g' "$f"
  # bg-white/[0.04] → bg-[var(--bg-elevated)]
  sed -i '' 's/bg-white\/\[0\.04\]/bg-[var(--bg-elevated)]/g' "$f"
  # bg-white/[0.035] → bg-[var(--bg-elevated)]
  sed -i '' 's/bg-white\/\[0\.035\]/bg-[var(--bg-elevated)]/g' "$f"
  # bg-white/[0.045] → bg-[var(--bg-elevated)]
  sed -i '' 's/bg-white\/\[0\.045\]/bg-[var(--bg-elevated)]/g' "$f"
done

# ─── Border shades ───
for f in "${FILES[@]}"; do
  # border-white/25 → border-[var(--border-bold)]
  sed -i '' 's/border-white\/25/border-[var(--border-bold)]/g' "$f"
  # border-white/20 → border-[var(--border-bold)]
  sed -i '' 's/border-white\/20/border-[var(--border-bold)]/g' "$f"
  # border-white/15 → border-[var(--border)]
  sed -i '' 's/border-white\/15/border-[var(--border)]/g' "$f"
  # border-white/12 → border-[var(--border)]
  sed -i '' 's/border-white\/12/border-[var(--border)]/g' "$f"
  # border-white/10 → border-[var(--border)]
  sed -i '' 's/border-white\/10/border-[var(--border)]/g' "$f"
  # border-white/[0.08] → border-[var(--border)]
  sed -i '' 's/border-white\/\[0\.08\]/border-[var(--border)]/g' "$f"
  # border-white/[0.07] → border-[var(--border)]
  sed -i '' 's/border-white\/\[0\.07\]/border-[var(--border)]/g' "$f"
  # border-white/[0.06] → border-[var(--border)]
  sed -i '' 's/border-white\/\[0\.06\]/border-[var(--border)]/g' "$f"
  # hover:border-white/20 → hover:border-[var(--border-bold)]
  sed -i '' 's/hover:border-white\/20/hover:border-[var(--border-bold)]/g' "$f"
done

# ─── Hover effects ───
for f in "${FILES[@]}"; do
  # hover:bg-white/10 → hover:bg-[var(--btn-glass-bg)]
  sed -i '' 's/hover:bg-white\/10/hover:bg-[var(--btn-glass-bg)]/g' "$f"
  # hover:bg-white/5 → hover:bg-[var(--btn-glass-bg)]
  sed -i '' 's/hover:bg-white\/5 /hover:bg-[var(--btn-glass-bg)] /g' "$f"
  sed -i '' 's/hover:bg-white\/5"/hover:bg-[var(--btn-glass-bg)]"/g' "$f"
  # hover:bg-white/[0.04] → hover:bg-[var(--bg-elevated)]
  sed -i '' 's/hover:bg-white\/\[0\.04\]/hover:bg-[var(--bg-elevated)]/g' "$f"
  # hover:bg-white/[0.045] → hover:bg-[var(--bg-elevated)]
  sed -i '' 's/hover:bg-white\/\[0\.045\]/hover:bg-[var(--bg-elevated)]/g' "$f"
  # hover:bg-white/[0.035] → hover:bg-[var(--bg-elevated)]
  sed -i '' 's/hover:bg-white\/\[0\.035\]/hover:bg-[var(--bg-elevated)]/g' "$f"
  # hover:shadow-white/10 → hover:shadow-[var(--shadow)]
  sed -i '' 's/hover:shadow-white\/10/hover:shadow-[var(--shadow)]/g' "$f"
done

echo "Done. Verify with: grep -n 'text-white\|bg-white\|text-black\|bg-black\/\|border-white\/' src/pages/*.tsx src/pages/login/*.tsx src/dashboard/**/*.tsx"

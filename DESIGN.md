# DESIGN.md — Detour Cloud

> Design system for AI agents and humans. Agents: treat the **Design Tokens**
> block as the single source of truth — never invent colors, radii, or
> spacing outside it. Humans: the **Philosophy** and **Components** sections
> explain the *why* and give copy-paste recipes.
>
> Stack: React + Tailwind v4 + Vite. Tokens below map to the classes already
> in `src/` (landing, login gate, onboarding, dashboard shell). Match them.

---

## Design Tokens

```yaml
color:
  # Surfaces — near-black canvas, layered by elevation (darker = deeper)
  bg.canvas:      "#0A0A0A"   # app background
  bg.raised:      "#0D0D0D"   # panels, drawers, cards on canvas
  bg.sunken:      "#000000"   # hero / video backdrop / deepest layer
  glass.fill:     "rgba(0,0,0,0.40)"   # glass panels (pair with blur.md)
  glass.fillSoft: "rgba(0,0,0,0.30)"   # grid tiles, subtle glass

  # Hairline borders — the primary way structure is expressed
  border.subtle:  "rgba(255,255,255,0.08)"
  border.default: "rgba(255,255,255,0.12)"
  border.strong:  "rgba(255,255,255,0.20)"

  # Text — a strict 4-step white opacity ramp (no mid greys)
  text.primary:   "#FFFFFF"
  text.secondary: "rgba(255,255,255,0.60)"
  text.tertiary:  "rgba(255,255,255,0.40)"
  text.muted:     "rgba(255,255,255,0.30)"

  # Accent — Detour violet→indigo→blue. Reserved for ONE emphasis moment.
  accent.violet:  "#A855F7"   # primary accent / focus
  accent.indigo:  "#6366F1"
  accent.blue:    "#3B82F6"
  accent.glow:    "rgba(168,85,247,0.35)"
  gradient.brand: "linear-gradient(90deg, #C084FC 0%, #818CF8 50%, #60A5FA 100%)"
  gradient.mesh:  >-
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(168,85,247,0.15) 0%, transparent 50%),
    radial-gradient(ellipse 60% 80% at 80% 70%, rgba(59,130,246,0.12) 0%, transparent 50%),
    radial-gradient(ellipse 50% 50% at 50% 50%, rgba(236,72,153,0.08) 0%, transparent 50%)

  # Actions
  action.primary.bg:   "#FFFFFF"   # primary button fill
  action.primary.text: "#000000"
  action.secondary.bg: "rgba(255,255,255,0.05)"

  # Semantic states (tinted, low-saturation on dark)
  success: "#6EE7B7"   # emerald-300 — "holding $DTOUR", confirmations
  warning: "#FDE68A"   # amber-200  — "no $DTOUR", soft alerts
  danger:  "#F87171"   # red-400    — errors

  # Partner attribution — ElizaOS brand blue. NEVER use for Detour UI.
  partner.elizaos: "#0057FF"

typography:
  fontFamily: "'Inter', system-ui, sans-serif"
  weights: [300, 400, 500, 600, 700, 800]
  scale:                       # size / weight / line-height / tracking
    display:  { size: "clamp(2.75rem, 6vw, 6rem)", weight: 700, leading: 1.08, tracking: "-0.02em" }
    h1:       { size: "1.5rem",  weight: 600, leading: 1.2,  tracking: "-0.01em" }
    h2:       { size: "1.5rem",  weight: 700, leading: 1.2 }
    h3:       { size: "0.875rem", weight: 600, leading: 1.4 }
    body:     { size: "1rem",    weight: 400, leading: 1.6 }
    bodySm:   { size: "0.8125rem", weight: 400, leading: 1.6 }   # 13px
    caption:  { size: "0.6875rem", weight: 500, leading: 1.4, tracking: "0.12em", transform: "uppercase" }  # 11px labels

space:
  base: 4            # px — Tailwind scale (4·n)
  page-x: [24, 48]   # px-6 / md:px-12
  card-pad: [24, 32] # p-6 / p-8
  stack: [12, 16, 20, 24]

radius:
  pill: 9999    # buttons, chips, badges (signature shape)
  card: 16      # rounded-2xl — panels, feature tiles
  panel: 12     # rounded-xl — inputs, callouts
  sm: 8         # rounded-lg
  icon: 6       # rounded-md — icon buttons

shadow:
  panel: "0 25px 50px -12px rgba(0,0,0,0.7)"        # shadow-2xl (drawers/cards)
  hero-text: "0 2px 16px rgba(0,0,0,0.6)"           # display over imagery
  accent-glow: "drop-shadow(0 2px 8px rgba(139,92,246,0.35))"  # on gradient text
  hover: "0 10px 30px -10px rgba(255,255,255,0.10)" # primary button hover
  blur.md: 12   # backdrop-blur px for glass

motion:
  duration: { micro: 150, base: 200 }   # ms
  easing: "cubic-bezier(0.4, 0, 0.2, 1)" # ease-in-out (Tailwind default)
  transition-props: [background-color, color, transform, opacity, box-shadow]
  offcanvas: "transform 200ms"           # right panel slide

z:
  base: 0
  header: 20
  scrim: 30
  drawer: 40
  toast: 50
```

---

## Color — usage

| Token | Value | Use it for |
|---|---|---|
| `bg.canvas` | `#0A0A0A` | The app background. Default everywhere. |
| `bg.raised` | `#0D0D0D` | Drawers, dashboard panels, cards sitting on canvas. |
| `bg.sunken` | `#000000` | Hero/video backdrop, login deepest layer. |
| `border.default` | `white/12` | Default hairline between regions (nav, header, cards). |
| `text.secondary` | `white/60` | Supporting copy, nav labels, metadata. |
| `accent.violet` | `#A855F7` | Focus rings, the one accent moment, links on hover. |
| `gradient.brand` | violet→indigo→blue | **One** word/element per view (e.g. hero "Everywhere."). Not backgrounds. |
| `success/warning/danger` | tints | Token-gate states, form validation only. |
| `partner.elizaos` | `#0057FF` | The "Powered by ElizaOS" face mark **only**. |

**Rule:** UI is monochrome dark + hairlines. Color is *information*, not decoration. If everything is purple, nothing is.

---

## Typography
- **Inter**, loaded 300–800. Display uses tight tracking (`-0.02em`); labels use `caption` (11px, uppercase, `0.12em`, `white/50`).
- Hierarchy comes from **weight + opacity**, not size jumps. Body is `white` → support is `white/60` → meta is `white/40`.
- Display text over imagery gets `shadow.hero-text`; the single gradient accent word gets `shadow.accent-glow`.

## Spacing & layout
- 4px base (Tailwind scale). Page gutters `px-6 md:px-12`; cards `p-6`/`p-8`; vertical rhythm in 12/16/20/24.
- **Grid panels:** `grid gap-px` inside a `rounded-2xl border border-white/10 overflow-hidden` wrapper — the 1px gap becomes hairline dividers between tiles (see landing "What You Can Build").
- Generous whitespace; let the dark canvas breathe. Content max-widths: prose `max-w-md`, sections `max-w-4xl/5xl`.

## Radius & elevation
- **Pills** (`rounded-full`) are the signature: all buttons, chips, badges.
- Cards/panels `rounded-2xl`; inputs/callouts `rounded-xl`; icon buttons `rounded-md`.
- Elevation = **glass + border + blur**, not heavy shadows. Drawers/cards: `bg-black/40 backdrop-blur-md border border-white/10` (+ `shadow-2xl` only for the off-canvas drawer).

## Motion
- Default `transition ... duration-200`; micro-interactions 150ms. Ease-in-out.
- Off-canvas panel: `translate-x-full` ↔ `translate-x-0` over 200ms with a `bg-black/40 backdrop-blur` scrim.
- Hover: subtle `bg-white/10` lift on ghost controls; `shadow.hover` on the primary white pill. No bounce, no large scale.
- Respect `prefers-reduced-motion`: drop transforms, keep opacity.

---

## Components (recipes)

**Primary button** — white pill, the single strongest action per view:
```
rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:shadow-xl hover:shadow-white/10
```
**Secondary button** — glass pill:
```
rounded-full border border-white/25 bg-white/5 px-7 py-3 text-sm font-semibold backdrop-blur-sm transition hover:bg-white/10
```
**Ghost / icon button:**
```
rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white
```
**Glass panel / card:**
```
border border-white/10 bg-black/80 p-8 backdrop-blur-xl   (modals/auth cards)
bg-black/30 p-6 backdrop-blur-md hover:bg-black/40          (grid tiles)
```
**Input:**
```
w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white
placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none
```
**Label:** `text-xs uppercase tracking-widest text-white/50`
**Badge / state chip:** `rounded-full` + semantic tint, e.g. success `border-emerald-400/20 bg-emerald-400/5 text-emerald-300`; warning `border-amber-400/20 bg-amber-400/5 text-amber-200/90`.
**App shell:** collapsible left nav (`border-r border-white/10 bg-black/40`, `w-60`↔`w-16`, 200ms), top header `h-14 border-b border-white/10`, right off-canvas drawer (`w-80`, `z-40`, scrim `z-30`). See `src/dashboard/dtour-dashboard-page.tsx`.

---

## Brand & voice
- **Product:** Detour Cloud · token **$DTOUR** · domain **detour.ninja**. White-label of ElizaOS Cloud.
- **Mark:** purple cloud logo (`/brand/dtour/logo.svg`); mascot is the ninja-squirrel (`ninja-squirrel.png`) — used sparingly, with `drop-shadow` violet glow.
- **Tagline energy:** *"Taking the scenic route to great software."* Confident, a little playful, never corporate.
- **Voice:** terse, technical, lowercase-friendly in UI microcopy. Say what it does. No marketing fluff, no exclamation spam.
- **Attribution:** always credit "Powered by ElizaOS + ElizaCloud" with the **ElizaOS blue** face mark (`#0057FF`) — never restyled into Detour purple.

## Philosophy — the vibe
Restrained, dark, premium **glass**. The canvas is near-black; structure is drawn with **hairline white borders** and **backdrop blur**, not boxes and shadows. The Detour **violet→indigo→blue** gradient is a scalpel: exactly one emphasis moment per view (a hero word, a focus ring, an active state). The strongest action is a **white pill**; everything else recedes into the monochrome dark so the user's content and the one accent moment carry the eye. It should feel like a quiet, capable workstation — "the scenic route," confident but never loud.

## Accessibility
- Body text `white` and `white/60` clear AA on the dark canvas; never go below `white/40` for anything readable (that ramp is for decoration/meta only).
- Visible focus: `focus:border-purple-400/50` on inputs; ensure focus-visible rings on all interactive controls (`outline` or `ring` in `accent.violet`).
- Icon-only buttons require `aria-label` (the shell toggles do). Off-canvas: scrim is a real focusable close target.
- Honor `prefers-reduced-motion`.

## Do / Don't
- ✅ Hairline borders + blur for separation. ❌ Drop shadows on flat cards.
- ✅ One gradient moment per screen. ❌ Gradient backgrounds or multiple gradient texts.
- ✅ White pill = the primary action. ❌ Purple-filled primary buttons.
- ✅ Hierarchy via weight + white-opacity. ❌ Mid-grey hex text (`#888` etc.).
- ✅ `rounded-full` buttons/chips, `rounded-2xl` cards. ❌ Mixed/sharp ad-hoc radii.
- ✅ ElizaOS blue only for attribution. ❌ ElizaOS blue anywhere in Detour UI.

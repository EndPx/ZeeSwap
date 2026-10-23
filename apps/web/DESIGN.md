# ZeeSwap web design system

## 0. Research log

The product's approved design in `plan.md` is the visual authority: message left,
transaction panel right, cream/charcoal/persimmon, simplified raccoon. Uniswap and
PancakeSwap are usability comparators, not a request to copy their brand or screen.
The `web-frontend-suite` Tier 1/router, layout, interaction, design architecture,
perfection and designpowers review references were consulted. Its advertised
`minimalist-skill.md` and `revolut.md` are absent from this installation; the
available `minimalist-ui` reference supplies editorial spacing and restrained
surfaces, adapted to the explicitly approved orange and rounded finance controls.
UI/UX Pro Max search `fintech editorial warm` returned a minimal layout and clear
pricing guidance. Its unrelated purple/gold palette is superseded by ZeeSwap's
locked palette. StyleGallery's split-screen/cluster grammar informs composition;
the document owns scrolling. The beui button source/reference informs explicit
idle/loading/error feedback and press motion, implemented with CSS. Parent supplied
an original ImageGen raccoon asset, inspected at `public/brand/zee-mascot.png`.
No third-party product screenshots, logos or invented market/evidence metrics ship.

## 1. Intent and content hierarchy

A warm, assured swap interface with precise transaction hierarchy. The memorable
object is Zee holding an orange ring below an editorial headline. The usable swap
card is the dominant interactive surface. Header navigates Swap, Activity and How
it works; hero states the exact approved tagline; card enables amount, direction,
real receiver/refund entry and quote review; footer communicates testnet context.
Help exposes custody and public EVM details without overloading the hero.

## 2. Color

CSS token values: canvas `#f8f7f3`, surface `#ffffff`, surface-soft `#f1f0eb`,
surface-hover `#e9e7df`, ink `#242521`, muted `#6c6e65`, faint `#a0a198`,
line `#e5e5dc`, orange `#ed6b35`, orange-dark `#bd481d`, orange-pale `#fff0e7`,
success `#396445`, success-soft `#edf4eb`, warning `#8b6228`, warning-soft
`#fbf2df`, danger `#a93e36`, danger-soft `#fff0ed`, Base-blue `#1758e8`.
Orange marks the brand and review CTA. Status always includes text/icon, not color
alone. Body contrast target is 4.5:1; decorative orange need not encode text.

## 3. Typography

Locally bundled Manrope variable for the UI, weight 400–800, and Instrument Serif
italic for one headline emphasis. System monospace only for privately displayed
receiver/memo strings. Scale: 12 caption, 13 metadata, 14 small, 16 body, 18 lead,
22 card title, 30 amount, 40 mobile hero, 60 desktop hero, 72 large desktop hero.
Hero line-height 1.05, tracking -0.055em; body 1.6; controls 1.4. Tabular numerals
on amounts. Amounts never pass through floating-point arithmetic.

## 4. Spacing and layout

Base 4px scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96. Maximum page width
1240px with fluid 20–56px gutters. Header 88px. Main uses a spacious asymmetric
two-column split, roughly 1.1fr/1fr, card maximum 480px. At 900px, hero and card
stack; at 600px the decorative hero image moves below compact headline/copy and
the card remains full width. No fixed-height content pane or body scroll trap.
Dialog owns bounded interior scrolling while open; native modal owns focus.
Unbroken addresses wrap inside min-width:0 containers.

## 5. Primitives and states

- Button: primary charcoal/orange, quiet and icon variants; min 44px touch target;
  visible focus, hover tint, pressed transform, disabled explanation, busy spinner.
- Token chip: circular original protocol text mark + network label + chevron;
  opens an accessible native dialog with both supported test assets.
- Amount panel: visible label, decimal text input, testnet label and network;
  output always says indicative fixture when not a bound API quote.
- Dialog: title, close button, native focus containment, Escape, return focus;
  backdrop dismiss only if no request is in flight.
- Field: visible label, helper and inline error. Recipient/refund order follows
  direction. No transparent Zcash fallback or address inference.
- Notice: icon + concise title/body + optional retry; offline, warning, failure.
- Route rail: network icons, directional connector and exact source/destination.
- Order status: server status, source confirmations, independent destination state,
  immutable amounts, copy controls and server-issued funding instructions only.
- Funding QR: local lazy-loaded ZIP 321 encoder, 240px black/white functional QR
  with four-module quiet zone; exact testnet amount, shielded receiver and encoded
  canonical memo only. Private order capabilities never enter the payment URI.
- Activity row: private session order, API state, amount and reopen action. Empty
  state invites a first quote; no invented transaction rows.
- Primitive harness at `/design` exercises button/notice/input states for visual QA.

## 6. Motion and interaction

Micro duration 140ms, panel duration 240ms, page entry 500ms; easing
`cubic-bezier(.2,.8,.2,1)`. Only opacity/transform animate. Button press scale .98;
modal entry translates 8px; connected chip fades in; status changes are announced
politely. Zee entrance translates 12px once, with no endless decorative bouncing.
Reduced motion removes entrance/transform animation; loading remains readable.
No simulated transaction progress, rolling balances, confetti or timer-driven
success. Polling follows server truth and stops in hidden tabs/terminal states.

## 7. Depth and surfaces

Matte cream canvas, white swap surface, soft inset amount panels and a custom very
diffuse card shadow `0 16px 64px rgba(36,37,33,.055)`, with a 1px warm border.
Large card radius 28px, inner amount panel 18px, buttons 14px, fields 12px, chips
24px. Dialog uses same surfaces and 32% charcoal backdrop. No glass, large gradient
hero, dashboard metric cards or blanket feature grid. The original lit character
provides dimensionality; a fine orbit line gives its ring spatial context.

## 8. Accessibility and explicit delivery boundaries

Full keyboard operation; native dialog focus/Escape; 44px targets; labels and
error associations; skip link; `aria-live` for connection and request outcomes;
mobile 375px, tablet 768px and desktop QA; reduced motion. No analytics, browser
seed import or capability in URLs/logs. Orders live in memory by default; explicit
private-session recovery export is user initiated and warned. Runtime dev tools
are gated behind Vite DEV and an opt-out environment flag; excluded from production.

This frontend connects to the existing local API, not a newly deployed relayer.
API `/health` establishes connectivity only. Reverse quote creation currently
returns `BASE_ESCROW_NOT_READY`; show it without substituting an EOA deposit.
Pricing is the API's fixture model; offline preview is labelled, never accepted.
Actual order creation requires a reachable API and valid server checks. Wallet
connection checks EIP-1193/Base Sepolia but never signs or sends. UI tests use
synthetic API fixtures and do not establish wallet funding or cross-chain readiness.

Review debt: the main application component coordinates multiple modal branches
and currently has high control-flow complexity. Splitting presentational modal
content is a future maintainability improvement, not a relaxation of the tested
request sequencing or immutable-term guards. A native dialog's backdrop click
handler is flagged by React Doctor as a noninteractive handler; native Escape,
focus containment, and the labelled 44px close button provide keyboard equivalents.
No lint rule is suppressed. Real-browser screenshots and interaction checks are
captured on the production build at 375px, 835px and 1440px.

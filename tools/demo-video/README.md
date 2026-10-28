# ZeeSwap product film

Editable 80-second Remotion product film. Read `DESIGN.md`, `STORYBOARD.md` and
`AUDIO.md` for intent and evidence limits. `timeline.json` drives the master,
scene preview durations and export bounds. No live product calls occur.

Use Node 24 and the exact dependency versions in `package.json`. The current
workspace reuses a local dependency-runtime junction created by Root; it copies
no other project's film source or media. For a standalone checkout, install the
pinned package with `npm ci` in this directory. The dependency lock matches the
reused runtime; only its root project name was changed. Score generation was
verified with Python 3.12 and NumPy 2.5.3 (`pip install -r requirements.txt`).

```powershell
npm run typecheck
npm test
python scripts/make_score.py --output public/audio/score.wav --timeline timeline.json
npm run studio

# Still from an absolute master frame.
npm run render -- --mode still --frame 1080

# Representative 8 s: amount focus → cursor review → changed review state.
npm run render -- --mode preview --start 840 --frames 240 --concurrency 1

# A single scene uses local frame numbers; previews have no independent audio.
npm run render -- --mode still --composition Scene-noir --frame 300

# Full master with original instrumental and SFX.
npm run render -- --mode full --concurrency 1
```

Optional render flags: `--output` (relative to this directory or absolute),
`--composition` (Master or Scene-hook/boundary/brand/route/noir/mechanism/closing),
`--frame` for stills, `--start`/`--frames` for previews, `--concurrency` (default 1).
The renderer rejects invalid frame ranges. Generated media is under `out/` and
`public/audio/`; keep both outside Git. Each scene composition derives duration
from the same timeline and uses local frames. Master preserves the score at
its original absolute frame position when rendering bounded previews.

Required original assets:

- `public/brand/mark.svg` and `public/brand/zee-mascot.webp`
- `public/fonts/manrope-latin-variable.woff2`
- `public/fonts/instrument-serif-latin-italic.woff2`
- `public/audio/score.wav` generated locally (no narration)

`test/timeline.test.mjs` verifies gap-free timing/beat coverage, duration cap,
bounded motion poses, frame determinism of primitives and fixed click geometry.
Typechecking verifies Remotion 4.0.537/React 19.2 APIs. Root records rendered
duration, full decode, actual sampled frames and listening/playback limitations
separately. A passing source test is not proof of a completed live swap.

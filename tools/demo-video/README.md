# ZeeSwap product film

Editable Remotion product film, 2,402 frames / 80.066667 seconds with a 110-second revision cap. Read `DESIGN.md`, `STORYBOARD.md` and
`AUDIO.md` for intent and evidence limits. `timeline.json` drives the master,
scene preview durations and export bounds. No live product calls occur.

Use Node 24 and the exact dependency versions in `package.json`. The current
workspace reuses a local dependency-runtime junction created by Root; it copies
no other project's film source or media. For a standalone checkout, install the
pinned package with `npm ci` in this directory. The dependency lock matches the
reused runtime; only its root project name was changed. The audio revision requires original ElevenLabs exports; see `AUDIO.md`.

```powershell
npm run typecheck
npm test
npm run studio

# Still from an absolute master frame.
npm run render -- --mode still --frame 1080

# Representative 8 s: amount focus → cursor review → changed review state.
npm run render -- --mode preview --start 840 --frames 240 --concurrency 1

# A single scene uses local frame numbers; previews have no independent audio.
npm run render -- --mode still --composition Scene-noir --frame 300

# Full master after original ElevenLabs audio passes preflight.
npm run render -- --mode full --concurrency 1
```

Optional render flags: `--output` (relative to this directory or absolute),
`--composition` (Master or Scene-hook/boundary/brand/route/noir/mechanism/closing),
`--frame` for stills, `--start`/`--frames` for previews, `--concurrency` (default 1).
The renderer rejects invalid frame ranges. Generated media is under `out/` and
`public/audio/`; keep both outside Git. Each scene composition derives duration
from the same timeline and uses local frames. Master preserves every original track at its manifest frame position in bounded previews.
Video render requires a working ffprobe (or `FFPROBE_PATH`) and valid originals.
Eight original ElevenLabs files are imported locally and verified; revised video
render and media QA are separate checks. No local score fallback is loaded.

The latest delivery is `out/zeeswap-original-logos.mp4`: 80.100 seconds,
1080p/30 fps, with Audiobooks narration using Albary / Eleven v4 and instrumental
ElevenLabs Music v2.5. The mechanism uses original Zeer and Envio assets, with
sources and usage terms in `public/brand/README.md`. The logo correction retains
the finished audio byte-for-byte. Root rendered `out/zeeswap-elevenlabs-raw.mp4`, then applied
two-pass FFmpeg loudness normalization to the mixed audio while copying the
video stream. Default Remotion rendering produces the unnormalized mix; repeat
the measurement and finishing pass when rebuilding a delivery. See
`PROVENANCE.md` for measured final levels, checksum, decode/frame checks and
the unperformed listening review. Original paragraph exports and music remain
unchanged by this final-master processing.

Required original assets:

- `public/brand/mark.svg` and `public/brand/zee-mascot.webp`
- `public/fonts/manrope-latin-variable.woff2`
- `public/fonts/instrument-serif-latin-italic.woff2`
- Original ElevenLabs paragraphs, music and any SFX described in `AUDIO.md`

`test/timeline.test.mjs` verifies gap-free timing/beat coverage, duration cap,
bounded motion poses, frame determinism of primitives and fixed click geometry.
Typechecking verifies Remotion 4.0.537/React 19.2 APIs. Root records rendered
duration, full decode, actual sampled frames and listening/playback limitations
separately. A passing source test is not proof of a completed live swap.

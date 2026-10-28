# ZeeSwap film provenance and verification

## ElevenLabs revision status

The earlier instrumental delivery and its measurements below are historical.
The revised sources now use seven original ElevenLabs Audiobooks paragraphs,
single narrator Albary / Eleven v4, plus **ZeeSwap Flow**, original ElevenLabs
Music v2.5. The operator verified these selections in the ElevenLabs UI. No
separate SFX are used; no synthetic score or synthetic effects are loaded.

All eight imported files were independently hashed and probed from disk by the
render preflight. Their SHA-256 hashes, measured durations, source names and
placements are recorded in `timeline.json`; `AUDIO.md` provides the readable
mapping. The original Paragraphs ZIP SHA-256 is
`b628da84c4d5a4137aa230cda1965013689987cfed102419380d73bd880d145d`.
Independent ZIP inspection confirmed all seven imported paragraph copies match
their original ZIP entries byte for byte. Originals and ZIP remain ignored.

The revised composition is 2,402 frames / 80.066667 seconds at 30 fps. Scene
starts are 0, 210, 480, 720, 1170, 1500 and 1980. Every paragraph starts nine
frames after its scene and fits complete with at least nine tail frames. The
80.039167-second original music fits complete in 2,402 frames. Speech is not
split, clipped, accelerated, stretched or faded. Narration gain is 1; music
gain is 0.06 with a 45-frame intro fade and 90-frame outro fade, derived from
frame position. There is no postmix normalization in the source pipeline.
Any later encoded-mix processing must be recorded with its measured outcome.

Source verification performed for this revision:

- Typecheck passed with the existing pinned Remotion/React dependencies.
- Eight source tests passed, covering original-file validation, hash/duration
  mismatch, speech overflow, provenance, paragraph coverage, music requirement,
  path bounds, timeline/beat coverage, deterministic motion and click geometry.
- The actual-file audio preflight passed all eight originals using ffprobe.
- The skill timeline auditor passed 2,402 frames under the 110-second cap with
  no warnings. The auditor's scene-audio view was derived in memory from the
  authoritative `timeline.audio`; no second tracked timing authority was added.
  Its local report is ignored at `out/elevenlabs-originals/timeline-audit.json`.

The operator observed 1,200 credits for the one music variant. The initial
balance was 6,512 credits; after narration and music, the Audiobooks UI showed
4,430 remaining. No credits or subscription were purchased. This film work
creates no live quote, order, payment or settlement.

## Encoded ElevenLabs delivery — 29 October 2026

Root rendered the revised composition once with concurrency 1, using a headless
browser without desktop input. The raw export is
`out/zeeswap-elevenlabs-raw.mp4`. Its mix measured -25.77 LUFS integrated and
-10.47 dBTP. Root then applied FFmpeg's two-pass `loudnorm` to the mixed audio,
targeting -16 LUFS, -1.5 dBTP and LRA 11. The H.264 video stream was copied;
only the mixed audio was re-encoded to AAC at 192 kb/s and 48 kHz. All eight
original imported MP3 files remain byte-identical to their source exports.

| Final artifact | Measured result |
| --- | --- |
| `out/zeeswap-elevenlabs-final.mp4` | 80.100 s, 1920 x 1080, 30 fps, H.264/AAC, 7,157,610 bytes |
| Final integrated loudness | -16.04 LUFS |
| Final true peak | -1.50 dBTP |
| Full FFmpeg decode | PASS, audio and video present |

Final SHA-256:
`eaaee1cac63acd1f5457a9e46e545f688b4998f659303a00a92208ab3660f759`.
The 80.100-second encoded container includes AAC padding; the visual composition
remains 2,402 frames / 80.066667 seconds. Both are below the 110-second cap.

Root inspected twelve frames sampled from the final encoded film across its
whole visual arc. The original mascot, fixed-rate example, Noir illustration,
privacy boundary, source/destination distinction and closing disclosures fit.
Complete decode and numeric audio measurements passed. Full normal-speed human
playback and listening were not performed; these checks do not establish
pronunciation or subjective mix quality. The generated reports, contact sheet,
Audiobooks UI proof, original ZIP and media remain outside Git.

## Earlier instrumental delivery

Created 28 October 2026 for the requested hackathon motion demo. The final
landscape film is an English on-screen product walkthrough, with original
instrumental audio and sound effects, and no spoken narration.

## Delivered media

| Artifact | Measured result |
| --- | --- |
| `out/zeeswap-product-film.mp4` | 80.000 s, 1920×1080, 30 fps, H.264/AAC, 8,403,575 bytes |
| `out/zeeswap-preview.mp4` | 8.000 s, 1920×1080, 30 fps, H.264/AAC |
| `out/zeeswap-workflow-teaser.gif` | 8-second workflow excerpt, 960px wide, 12 fps, no audio |
| `out/zeeswap-poster.png` | Closing frame extracted from the final encoded master |

Final MP4 SHA-256:
`653195c57d6e8f2835bf85c2fc80ce039d69936cc36f66b7d00161a132b310f2`.

Large/generated media is deliberately ignored by Git. Editable source,
authoritative timing, original branding, font licenses and the score generator
are retained. The original mark and mascot are byte-identical to the web assets.
No source or media from the earlier Zeer film was reused; only its matching
dependency installation and dependency lock were reused. The lock's root
package name was adjusted for this project.

## Audio

The original score is 3,840,000 stereo PCM16 sample frames at 48 kHz, exactly
80.000 seconds. PCM peak is 0.779992, RMS is 0.162884 and both endpoint samples
are zero. Repeated generation, including explicitly reading the manifest cue
list, produced identical SHA-256:
`f04b20a457b49ba33cd1046ccb39b01ec35513d249c876343c19063028f4241d`.
The manifest owns scene, cue and placement timing. No voice service, paid
generation, downloaded music or external account was used.

Final encoded mix analysis measured -14.17 LUFS integrated and -2.19 dBTP
true peak. This was a measurement pass to a null output, not an applied remix
or a listening review.

## Checks performed

- Remotion packages 4.0.537, React 19.2.0, TypeScript 5.9.3; typecheck passed.
- Four tests passed for continuous bounds, deterministic motion, fixed click
  anchors and truthful illustration/state labels.
- The skill timeline auditor passed 2400 frames / 80 seconds under its
  90-second cap, with no timing warnings.
- Final MP4 was probed and completely decoded by FFmpeg 7.1; audio/video are
  present and measured duration, dimensions and frame rate match the manifest.
- Source stills were inspected across eight key beats. Sixteen sampled frames
  from the final encoded MP4 were also inspected across its whole visual arc.
  Original fonts, contained mascot, UI text, privacy labels and ending fit.
- Two independent PNG renders of master frame 1080 matched byte-for-byte:
  `78d83e574757f55fe9e874d128c43ca7a7246949d1518974f116a0af36e552e9`.
- The initial CSS absolute-font bundling failure was corrected with staticFile
  FontFace loading and render-delay handling. Final copy was rerendered into
  the master; standalone previews are not substituted for the final edit.

This review is sample-based, with complete technical decode. A full human
normal-speed playback and listening review has not been performed. Numeric
audio checks do not establish musical taste or listening quality.

## Product evidence boundary

The UI and wallet approval sequence are explicitly labelled illustrations with
a simulated wallet. The film makes no real quote, requests no wallet approval,
broadcasts no transaction and shows no completed cross-chain settlement. It
states that the prototype is custodial, Base transfers are public, the operator
can correlate both legs, and the tokens have no monetary value. It does not
assert mainnet readiness, atomicity, trustlessness or provider integration.

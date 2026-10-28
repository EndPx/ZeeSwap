# ZeeSwap film provenance and verification

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

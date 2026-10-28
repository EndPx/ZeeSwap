# ZeeSwap original instrumental score

`scripts/make_score.py` synthesizes the entire instrumental and every sound
effect locally from oscillators, envelopes and seeded noise. No recording,
sample library, reference soundtrack, downloaded music, voice, paid generation,
API or credentials are involved. This is original project audio created for the
ZeeSwap demo film. There is no voiced narration.

The score is exactly 80.000 seconds: 3,840,000 stereo sample frames at 48 kHz,
16-bit little-endian PCM WAV. Its 108 BPM pulse spans 144 beats. A warm
D-major/B-minor/G-major/A harmonic cycle supports sparse glass plucks, rounded
bass, quiet kick and lightly filtered noise percussion. Soft cue accents
support scene handoffs and meaningful actions. A two-second intro and
four-second outro fade leave the first and last sample at zero. Peak is
normalized to approximately 0.78 of full scale, leaving mix headroom.

Run with the repository's existing NumPy-capable Python, keeping the generated
WAV outside public Git:

```powershell
python tools/demo-video/scripts/make_score.py --timeline tools/demo-video/timeline.json --output tools/demo-video/public/audio/score.wav
```

The output audio directory must remain ignored by Git. The optional timeline
accepts `composition.fps: 30`, `composition.durationInFrames: 2400` (also
`durationFrames`, `totalFrames` or `duration`, at composition or root level), and root-level
`soundCues: [{"frame": 1320, "kind": "click"}]`.
When `soundCues` is present it replaces the default cue list. Valid kinds are
`scene`, `card`, `click`, `mechanism` and `close`. Film duration remains the
approved 80 seconds; an incompatible explicit frame count or fps fails.

Without explicit cues the approved timing is: scene accents at 8, 17, 25,
40, 52 and 67 seconds; card accents at 29, 34 and 48; wallet click at 44;
mechanism accents at 55, 59 and 63; closing accent at 70. No reference audio is
reused. The script prints the cue list, SHA-256, PCM peak, RMS and endpoint
samples. Repeated runs in the same Python/NumPy environment should yield the
same bytes; compare actual hashes when asserting reproducibility.

The full mix is float32 stereo (about 30.7 MB) and writes PCM in one-second
chunks. Individual synthesis voices are bounded to one chord plus release;
there is no external audio process or full-duration float64 intermediate.

Objective PCM measurements establish duration and headroom. They do not
establish listening quality or the level of the final AAC/MP4 mix. Record
actual generation, hash comparison, decoded-media checks and any listening
review in the film's verification evidence. Do not describe programmatic
checks as a listening review.

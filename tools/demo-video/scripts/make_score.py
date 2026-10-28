"""Synthesize ZeeSwap's original, deterministic 80-second instrumental score.

Requires NumPy only. Writes PCM16 stereo WAV and prints measured audit JSON.
No sample libraries, network access, voice, model calls, or external assets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import wave

import numpy as np

RATE = 48_000
SECONDS = 80
BPM = 108
BEAT = 60 / BPM
DEFAULT_CUES = [
    (8, "scene"), (17, "scene"), (25, "scene"),
    (29, "card"), (34, "card"), (40, "scene"),
    (44, "click"), (48, "card"), (52, "scene"),
    (55, "mechanism"), (59, "mechanism"), (63, "mechanism"),
    (67, "scene"), (70, "close"),
]


def hz(midi: int) -> float:
    return 440 * 2 ** ((midi - 69) / 12)


def tone(midi: int, duration: float, kind: str) -> np.ndarray:
    t = np.arange(round(duration * RATE), dtype=np.float32) / RATE
    phase = t * (2 * np.pi * hz(midi))
    if kind == "pad":
        signal = (np.sin(phase) + .20 * np.sin(phase * 2 + .2)
                  + .12 * np.sin(phase * 1.0018))
        env = np.minimum(t / .65, 1) * np.minimum((duration - t) / .9, 1)
    elif kind == "bass":
        signal = np.sin(phase) + .15 * np.sin(phase * 2)
        env = (1 - np.exp(-t * 70)) * np.exp(-t * 3.2)
        env *= np.minimum((duration - t) / .08, 1)
    else:
        # Non-integer, rapidly decaying overtone gives an original glass-mallet timbre.
        signal = (np.sin(phase) * np.exp(-t * 2.5)
                  + .24 * np.sin(phase * 2.004) * np.exp(-t * 7)
                  + .10 * np.sin(phase * 3.01) * np.exp(-t * 12))
        env = (1 - np.exp(-t * 550)) * np.minimum((duration - t) / .12, 1)
    return np.asarray(signal * np.maximum(env, 0), dtype=np.float32)


def add(mix: np.ndarray, signal: np.ndarray, at: float, gain: float,
        pan: float = 0, echo: bool = False) -> None:
    start = round(at * RATE)
    count = min(len(signal), len(mix) - start)
    if start < 0 or count <= 0:
        return
    # Constant-power stereo placement, no extra full-length buffers.
    angle = (pan + 1) * math.pi / 4
    mix[start:start + count, 0] += signal[:count] * (gain * math.cos(angle))
    mix[start:start + count, 1] += signal[:count] * (gain * math.sin(angle))
    if echo:
        add(mix, signal, at + BEAT * .75, gain * .20, -pan)
        add(mix, signal, at + BEAT * 1.5, gain * .07, pan)


def read_cues(path: Path | None) -> list[tuple[float, str]]:
    if path is None:
        return DEFAULT_CUES
    manifest = json.loads(path.read_text(encoding="utf-8-sig"))
    composition = manifest.get("composition", manifest)
    fps = composition.get("fps", 30)
    frames = composition.get("durationInFrames", composition.get(
        "durationFrames", composition.get("totalFrames", composition.get("duration", 2400))))
    if fps != 30 or frames != 2400:
        raise ValueError("This score requires the approved 2400-frame / 30 fps film")
    # Optional explicit soundCues is the film's authority when present.
    # Frame offsets avoid maintaining rounded seconds in separate render sources.
    explicit = manifest.get("soundCues")
    if explicit is None:
        return DEFAULT_CUES
    cues = [(float(item["frame"]) / fps, item["kind"]) for item in explicit]
    if any(not 0 <= at < SECONDS or kind not in
           {"scene", "card", "click", "mechanism", "close"}
           for at, kind in cues):
        raise ValueError("Invalid sound cue time or kind")
    return cues


def synthesize(cues: list[tuple[float, str]]) -> np.ndarray:
    rng = np.random.default_rng(20261028)
    mix = np.zeros((RATE * SECONDS, 2), dtype=np.float32)
    # Dmaj9, Bm9, Gmaj9, A6: calm harmonic motion, no borrowed melody.
    chords = [(50, [62, 66, 69, 73, 76]), (47, [59, 62, 66, 69, 73]),
              (43, [59, 62, 66, 69, 74]), (45, [61, 64, 66, 69, 73])]
    for section in range(9):
        at = section * 16 * BEAT
        root, notes = chords[section % len(chords)]
        for index, midi in enumerate(notes):
            add(mix, tone(midi - 12, 16 * BEAT + .85, "pad"), at,
                .021, (index - 2) * .26)
        # Air between plucks keeps the bed from sounding like a metronome.
        for step in [0, 3, 7, 10, 14, 19, 23, 27]:
            beat_index = section * 16 + step / 2
            at_note = beat_index * BEAT
            midi = notes[(step + section) % 5] + (12 if step in (7, 23) else 0)
            add(mix, tone(midi, 1.8, "pluck"), at_note, .048,
                -.36 if step % 2 else .36, echo=True)
        for beat in range(0, 16, 2):
            at_bass = (section * 16 + beat) * BEAT
            add(mix, tone(root - 12, .8, "bass"), at_bass, .095)
    for beat in range(4, 140):
        at = beat * BEAT
        t = np.arange(round(.19 * RATE), dtype=np.float32) / RATE
        if beat % 2 == 0:
            # A soft rounded kick; downward phase integral, no harsh transient.
            kick = np.sin(2 * np.pi * (44 * t + 2 * (1 - np.exp(-25 * t))))
            kick *= (1 - np.exp(-700 * t)) * np.exp(-30 * t)
            add(mix, kick, at, .052)
        if beat % 4 in (1, 3):
            noise = rng.uniform(-1, 1, len(t)).astype(np.float32)
            noise[1:] -= .85 * noise[:-1].copy()
            noise *= (1 - np.exp(-900 * t)) * np.exp(-75 * t)
            add(mix, noise, at + BEAT * .5, .011, .24 if beat % 4 == 1 else -.24)
    for index, (at, kind) in enumerate(cues):
        if kind == "click":
            t = np.arange(round(.045 * RATE), dtype=np.float32) / RATE
            click = (np.sin(t * 2 * np.pi * 840)
                     + .25 * np.sin(t * 2 * np.pi * 1360))
            click *= np.sin(np.pi * t / .045) ** 2 * np.exp(-t * 95)
            add(mix, click, at, .058)
        else:
            midi = {"scene": 74, "card": 78, "mechanism": 81, "close": 86}[kind]
            add(mix, tone(midi, 1.3, "pluck"), at, .050, (index % 3 - 1) * .2,
                echo=True)
            if kind in {"scene", "close"}:
                add(mix, tone(midi - 7, 1.4, "pluck"), at + .09, .025, -.2)
    # Intro/outro are applied in bounded slices; final digital sample is zero.
    intro = np.linspace(0, 1, RATE * 2, dtype=np.float32)
    outro = np.linspace(1, 0, RATE * 4, dtype=np.float32)
    mix[:len(intro)] *= (intro * intro)[:, None]
    mix[-len(outro):] *= (outro * outro)[:, None]
    peak = float(np.max(np.abs(mix)))
    if peak:
        mix *= .78 / peak
    return mix


def write_score(output: Path, cues: list[tuple[float, str]]) -> dict:
    mix = synthesize(cues)
    output.parent.mkdir(parents=True, exist_ok=True)
    square_sum = 0.0
    pcm_peak = 0
    with wave.open(str(output), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        for start in range(0, len(mix), RATE):
            chunk = np.rint(mix[start:start + RATE] * 32767).astype("<i2")
            pcm_peak = max(pcm_peak, int(np.max(np.abs(chunk))))
            square_sum += float(np.sum(np.square(chunk.astype(np.float64))))
            wav.writeframes(chunk.tobytes())
    digest = hashlib.sha256()
    with output.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    rms = math.sqrt(square_sum / mix.size) / 32767
    return {"output": str(output.resolve()), "durationSeconds": SECONDS,
            "frames": len(mix), "sampleRate": RATE, "channels": 2,
            "bitsPerSample": 16, "peak": pcm_peak / 32767,
            "rms": rms, "rmsDbfs": 20 * math.log10(rms),
            "firstSample": mix[0].tolist(), "lastSample": mix[-1].tolist(),
            "sha256": digest.hexdigest(), "bpm": BPM,
            "cues": [{"second": at, "kind": kind} for at, kind in cues]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeline", type=Path)
    args = parser.parse_args()
    print(json.dumps(write_score(args.output, read_cues(args.timeline)), indent=2))


if __name__ == "__main__":
    main()

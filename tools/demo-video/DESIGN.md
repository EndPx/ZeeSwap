# ZeeSwap product film

Audience: hackathon reviewers and privacy-minded users seeing ZeeSwap for the
first time. Intended takeaway: a two-way Zcash-testnet/Base-Sepolia swap journey
can start with shielded TAZ, with exact terms, separate wallet approval and
honest privacy and custody boundaries. English on-screen editorial film,
1920×1080 at 30 fps, 2,402 authored frames / 80.066667 seconds after fitting original narration,
under the authorized 110-second cap. Most of the middle edit demonstrates the product workflow and mechanism.

## Visual direction

Warm editorial finance cinema, using the actual cream `#f8f7f3`, charcoal
`#242521`, persimmon `#ed6b35`, Manrope variable and Instrument Serif italic.
Original assets are copied byte-for-byte from `apps/web/public/brand/mark.svg`
and `zee-mascot.webp`. The complete mascot stays contained and the logo keeps
its shape. Root supplies the existing local font files under `public/fonts/`.
No reference film footage, brand, music, screenshots or artwork is reused.

Typography reveals in phrases. A TAZ coin establishes route continuity; the
brand resolves into a large faithful swap card. Cursor and target share one
stage transform, click rings use their click-time coordinates, and the output
holds still for reading. The wallet sequence cuts from connection into a
separate exact funding review. Two observation packets converge on the worker;
the ending resolves the pair into the original brand and a held URL. Scene cuts
alternate deliberate motion and clean reading holds. There are no CSS timing
animations, runtime random values, moving balances or fake progress bars.

## Evidence and claim limits

`timeline.json` is the only scene timing authority. Source decisions are
`plan.md`, `apps/web/DESIGN.md`, `docs/evidence/noir-wallet-connection.md` and
`docs/evidence/fixed-rate-faucet-live.md`. The approved product tagline is
“Swap across chains. Keep your ZEC shielded.” The depicted pair is TAZ on Zcash
testnet and project-issued USDC test token on Base Sepolia. Fixed arithmetic is
1 TAZ = 100 USDC and zero testnet protocol fee. Example amounts are literal
decimal strings: 0.001 TAZ and 0.1 USDC; no floating point money calculation.

The film-native UI is an illustration, visibly labelled “UI illustration •
simulated wallet.” Noir is implemented and locally verified with synthetic
providers. `utest1…demo` is a visibly abbreviated synthetic placeholder, never
usable funding instructions. The film creates no quote/order, requests no
wallet approval, shows no signed/broadcast transaction and claims no completed
settlement. Source confirmation and destination delivery are distinct states.
Zeer is authorized shielded observation; Envio projects public Base events;
the worker/database owns settlement decisions. The mechanism is illustrative.

The backend remains paused and the funded two-way acceptance gate remains
open. Closing text discloses custodial operation, public Base activity and the
operator's ability to correlate both legs. No real address, private capability,
memo, raw receipt, key, order mapping, balance, timing benchmark, mainnet claim,
atomic/trustless claim or unimplemented integration appears in the film.

## Audio and exports

The revised film uses ElevenLabs for all audio. Narration is one Audiobooks
project, Albary, Eleven v4, with seven original paragraph exports. Music and
any SFX also come from ElevenLabs. Original files, hashes and measured lengths
validate before video render; all eight original files are imported. No local score
fallback is loaded. The timeline owns text, placement, duration and provenance.
See `AUDIO.md` for import and speech-fit requirements. Audio and large renders
stay ignored; preserve original exports unchanged. Music is ElevenLabs Music
v2.5, gain 0.06 with frame-derived fades; narration is gain 1, unchanged speed.
No separate SFX are used. Render, mix measurement and listening review remain
separate from source-file verification.

Master export: H.264/AAC MP4, yuv420p, 1920×1080, constant 30 fps, concurrency 1
on this laptop. No Docker, local database, VPS mutation or product change.
Deliver the master, a representative preview and sampled stills with editable
source, design, storyboard, timeline and audio provenance. Root performs actual
render/decode, visual QA and listening review and records performed limits in
the evidence document; source tests alone do not establish film quality.

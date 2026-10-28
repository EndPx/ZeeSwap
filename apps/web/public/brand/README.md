# Zee mascot asset

`zee-mascot.png` is an original transparent PNG generated with the built-in
ImageGen tool for ZeeSwap, copied locally into this repository on 23 October
2026. It is used as the decorative hero character; it is not a third-party logo
or a receipt/evidence screenshot.

Generation prompt:

> Create an original premium brand mascot illustration for ZeeSwap, a shielded
> Zcash cross-chain swap web application. A single charming but composed raccoon
> named Zee, clean simplified silhouette, charcoal dark gray fur, warm cream face
> and muzzle, recognizable dark eye mask, small alert ears, very large soft striped
> tail curling to one side. Small persimmon-orange scarf, one paw resting on a
> simple flat orange ring. Refined soft clay/3D illustration with matte tactile
> finish, subtle studio shading, restrained detail, sophisticated fintech
> collectible character rather than childish cartoon. Full body, three-quarter
> pose, front-facing confident curious expression, compact readable composition
> with ample clear margins. Transparent background with real alpha, no background
> objects, no scenery, no floor or cast shadow outside character, no text, no
> watermark, no interface. Palette charcoal #242522, cream #F4F0E6, persimmon
> #F27649. Intended as a 360px decorative hero asset next to a swap form.
> Do not imitate another product's mascot.

`zee-mascot.webp` is the browser delivery derivative: the full transparent image
resized to 768 × 768 and encoded as lossless WebP. Its 399,220 bytes replace the
1,597,790-byte PNG request; composition and artwork are unchanged. The PNG is kept
as the original source asset.

`mark.svg` is an original geometric raccoon mark written for this frontend.
Official local image assets now replace the old TAZ/USDC letter placeholders.
No remote asset requests or trackers are used.

## Wallet, asset and network artwork (29 October 2026)

These files are copied byte for byte from the official source or official ZIP
member. Colors, paths and proportions are unmodified. Images render with
`object-fit: contain`; wallet/asset names remain adjacent text. No AI artwork or
CSS letter facsimiles represent third-party brands.

| Local file | Official source | SHA-256 |
| --- | --- | --- |
| `metamask.svg` | [MetaMask official assets page](https://images.ctfassets.net/clixtyxoaeas/3kVr1oM3HHOI2TcaVGhzew/9914b11aa711809bac60c87e09ea74c8/fox.svg) | `2ecbecafb4068116dc3a813d80afe6e52e36b2807538414136a868b84d1732ec` |
| `noir.png` | [Noir official documentation icon](https://docs.zknoir.com/assets/icon128-tq96y-N1.png) | `4e2e811007e35d55b42bd1285346eb6f22643e7a082e386341584243b853eee0` |
| `zcash.png` | [Zcash official website icon](https://z.cash/wp-content/uploads/2023/06/cropped-z-favicon-512-192x192.png) | `581dce5003c41fb2e60f63ef057f6e35a093136198fe40502218dfa2350fcac2` |
| `base.svg` | [Base official brand pack: The Square/Base_square_blue.svg](https://www.base.org/base-brand.zip) | `b4f2b487011713f98481cc53c4ce095629b4876acbdbc2f0f3ad69a9688ba82e` |
| `usdc.svg` | [Circle official pressroom brand pack: Token Logo/USDC Token.svg](https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/Pressroom/brandkit/logo-downloads/usdc.zip) | `fe4f9d5f34ef4ebeb5d80e1f5ff63dcaf5a0d5495f4adf206e4c3011d1f5c57d` |

MetaMask source page: https://metamask.io/assets. Base source page:
https://www.base.org/brand. Circle source page: https://www.circle.com/pressroom.
Artwork remains owned by the respective brands; inclusion indicates the displayed
wallet/network/asset context and does not claim partnership or endorsement.

TAZ remains testnet ZEC. The displayed USDC is the existing ZeeSwap-issued Base
Sepolia test token, **not Circle-issued USDC**; the asset selector retains that
explicit distinction and the actual contract. The familiar USDC mark identifies
the product label, not issuer attestation. zeeTAZ is ZeeSwap's own bridged testnet
asset and uses the existing original `mark.svg` with a Base network badge; it is
not presented as an official Zcash-issued EVM asset. Generic, unrecognized EVM
providers retain the neutral wallet glyph rather than impersonating MetaMask.

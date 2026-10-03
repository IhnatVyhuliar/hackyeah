# Oracle fixtures

One directory per case with `metadata.json`, `complaint.json` and `expected.json` (in git).
Videos and photos live once in `_media/` (git-ignored, shared drive) and each case names the files it
uses in `expected.json` → `media`.

| Case | Packing | Unboxing | Listing photos | Expected | Tests |
|---|---|---|---|---|---|
| `ok` | `packing-clean.mp4` | `unboxing-clean.mp4` | clean front + back | `SELLER` | unfounded complaint |
| `stain` | `packing-clean.mp4` | `unboxing-stain.mp4` | clean front + back | `BUYER` | undisclosed damage (demo deal A) |
| `cut` | `packing-clean.mp4` | `unboxing-opened.mp4` | clean front + back | `SELLER` | unboxing starts from an opened box |
| `disclosed` | `packing-stain.mp4` | `unboxing-stain.mp4` | stain | `SELLER` | stain is on the defect list |
| `swap` | `packing-clean.mp4` | `unboxing-swap.mp4` | clean front + back | `SELLER` | a similar shirt lies on the table before opening |

## `_media/`

| File | Content | Notes |
|---|---|---|
| `photo-clean-front.jpg`, `photo-clean-back.jpg` | clean white T-shirt | generated |
| `photo-stain.jpg` | T-shirt with a coffee stain on the chest | generated |
| `packing-clean.mp4` | clean shirt packed, QR card, BLUE tape, label | generated, 10 s; QR card lies face up (should be folded) |
| `packing-stain.mp4` | stained shirt packed, folded card | generated, cut at 00:03 |
| `unboxing-clean.mp4` | sealed box opened, QR shown, clean shirt | generated, 10 s |
| `unboxing-opened.mp4` | starts from an opened box, stain, no QR card | generated |
| `unboxing-swap.mp4` | `unboxing-swap-raw.mp4` without the first 1.5 s | second shirt on the table from 00:00 |
| `unboxing-stain-with-cut.mp4` | sealed box, QR, stain | **unusable for `stain`**: jump cut to a close-up at ~6.8 s |
| `unboxing-stain.mp4` | **missing** — continuous unboxing with the stain, see `GENERATION.md` | |

## Run

```bash
pnpm fixture --all --runs 3          # from oracle/; exit code non-zero unless every run matches
pnpm fixture fixtures/stain          # single case
```

Prompts for generating media: `GENERATION.md`. The live demo uses real phone recordings from the app.

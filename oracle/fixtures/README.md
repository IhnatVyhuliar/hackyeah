# Oracle fixtures

One directory per case. Videos and photos are **not** in git (shared drive); JSON files are.

| Case | Recordings | Expected |
|---|---|---|
| `ok` | honest packing and unboxing, no damage, unfounded complaint | `SELLER` |
| `stain` | stain not on the defect list (demo deal A) | `BUYER` |
| `cut` | unboxing starts from an opened parcel or has a cut | `SELLER` |
| `disclosed` | stain is on the defect list in `metadata.json` | `SELLER` |
| `swap` | sealed box opened, but a similar shirt already lies on the table | `SELLER` |

Each directory needs: `metadata.json`, `photo-*.jpg` (optional), `packing.mp4`, `unboxing.mp4`,
`complaint.json`, `expected.json` (`verdict`, optional `tracking_number` visible on the label).

Run: `pnpm fixture fixtures/stain --runs 3` (from `oracle/`). Exit code is non-zero on any mismatch.
Edit `metadata.json` to describe the real item you recorded.

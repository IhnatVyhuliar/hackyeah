# Oracle

A narrow service that **reports facts, it does not decide about money**. Its key is `deal.arbiter`, and
the program lets it do exactly one thing: call `resolve_dispute(Seller | Buyer, report_hash)` on a deal in
`Disputed`, before `ORACLE_TIMEOUT`. If it stays silent, anyone can call `settle_expired` and the program
moves the deal to `ReturnRequested` on its own.

## Pipeline (`src/`)

| File | What it does |
|---|---|
| `watch.ts` | polls `Deal` accounts every ~5 s; disputes assigned to our key → `resolve.ts`; expired deals → `settle_expired` (convenience, anyone can do it; off with `CRANK=off`) |
| `evidence.ts` | downloads metadata, photos, both videos and the complaint; sha256 of the exact bytes vs on-chain hashes |
| `decide.ts` | `decideFromEvidence()`: missing or mismatched file → its author loses, no AI. `decide()`: the verdict from the report, exactly as in `CLAUDE.md` §5 |
| `gemini.ts` | Gemini Interactions API, videos via Files API, structured output; the model only fills report fields |
| `resolve.ts` | builds `report.json`, uploads it (immutable), sends `resolve_dispute(verdict, sha256(report.json))` |
| `chain.ts` | Anchor client; only `resolveDispute` and `settleExpired` exist here |
| `storage.ts` | server/ `/media` (files addressed by sha256) + report upload as the oracle account |
| `fixture.ts` | runs the model + `decide()` on local files, no chain |
| `../prompts/v2.md` | active versioned prompt (`PROMPT_VERSION` in `src/gemini.ts`); `v1.md` is kept unchanged, a change goes to a new `v3.md` |

The model never picks the winner. Anyone can download the report from `${API_URL}/media/<report_hash>` (the hex of the on-chain `report_hash`),
run sha256 on it and re-run `decide()` on its fields.

Notes:

- `CRANK=on|off` (default `on`). With `off` the oracle never calls `settle_expired`, only resolves disputes. The
  demo uses it so the buyer can press „Odbierz środki” on a staged `Paid` deal. The startup log shows the mode.
- Evidence is always fetched via `API_URL`, whatever origin was frozen on-chain in `metadata_uri` / photo URLs;
  integrity comes from the hashes.
- Each retry after a failed `resolve_dispute` re-runs the model and uploads a new `report.json`; only the one
  whose hash ends up on-chain counts. Run exactly one oracle.

## Run

```bash
cp .env.example .env          # fill GEMINI_API_KEY, API_URL, ORACLE_API_PASSWORD, RPC_URL
pnpm install
pnpm test                     # decide() + evidence table tests
pnpm fixture fixtures/stain --runs 3
pnpm dev                      # the loop (needs IDL in packages/shared and SOL on the oracle key)
```

The oracle keypair lives outside the repo (`ORACLE_KEYPAIR`, default `~/.config/unbox/oracle.json`).

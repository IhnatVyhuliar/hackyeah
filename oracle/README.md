# Oracle

A narrow service that **reports facts, it does not decide about money**. Its key is `deal.arbiter`, and
the program lets it do exactly one thing: call `resolve_dispute(Seller | Buyer, report_hash)` on a deal in
`Disputed`, before `ORACLE_TIMEOUT`. If it stays silent, anyone can call `settle_expired` and the program
moves the deal to `ReturnRequested` on its own.

## Pipeline (`src/`)

| File | What it does |
|---|---|
| `watch.ts` | polls `Deal` accounts every ~5 s; disputes assigned to our key → `resolve.ts`; expired deals → `settle_expired` (convenience, anyone can do it) |
| `evidence.ts` | downloads metadata, photos, both videos and the complaint; sha256 of the exact bytes vs on-chain hashes |
| `decide.ts` | `decideFromEvidence()`: missing or mismatched file → its author loses, no AI. `decide()`: the verdict from the report, exactly as in `CLAUDE.md` §5 |
| `gemini.ts` | Gemini Interactions API, videos via Files API, structured output; the model only fills report fields |
| `resolve.ts` | builds `report.json`, uploads it (immutable), sends `resolve_dispute(verdict, sha256(report.json))` |
| `chain.ts` | Anchor client; only `resolveDispute` and `settleExpired` exist here |
| `storage.ts` | Supabase Storage REST |
| `fixture.ts` | runs the model + `decide()` on local files, no chain |
| `../prompts/v1.md` | versioned prompt; changes go to a new `v2.md` |

The model never picks the winner. Anyone can download `deals/<deal>/report.json`, hash it and compare it with
`report_hash` on-chain, then re-run `decide()` on its fields.

## Run

```bash
cp .env.example .env          # fill GEMINI_API_KEY, SUPABASE_*, RPC_URL
pnpm install
pnpm test                     # decide() + evidence table tests
pnpm fixture fixtures/stain --runs 3
pnpm dev                      # the loop (needs IDL in packages/shared and SOL on the oracle key)
```

The oracle keypair lives outside the repo (`ORACLE_KEYPAIR`, default `~/.config/unbox/oracle.json`).

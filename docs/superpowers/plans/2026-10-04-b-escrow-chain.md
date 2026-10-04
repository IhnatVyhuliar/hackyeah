# Osoba B: płatności i łańcuch — plan wdrożenia

> **Dla agenta:** WYMAGANY SUB-SKILL: superpowers:subagent-driven-development (zalecany) albo superpowers:executing-plans. Kroki mają checkboxy (`- [ ]`).

**Cel:** pełna maszyna stanów `unbox_escrow` na devnecie, implementacja `Escrow` w aplikacji (portfel w telefonie podpisuje instrukcje programu), lustro serwera z reklamacją i werdyktem oraz wyrocznia czytająca dowody z `server/` `/media`.

**Architektura:** pieniądze i reguły żyją w programie (`CLAUDE.md` §2). Aplikacja zna tylko interfejs `Escrow` z `@unbox/shared`.
- Ty piszesz `SolanaEscrow` w `app/src/solana/`. Rdzeń (`escrow.ts`) nie importuje niczego z React Native, więc testujesz go w Node na Surfpoolu w `pnpm test:program`. Tylko `index.ts` dokłada `expo-secure-store` i config z env.
- Dowody leżą w `server/` `/media` adresowane sha256, więc hash z łańcucha jest jednocześnie adresem pliku.

**Stack:** Anchor 1.1.2 (Rust 1.95), Surfpool, `@anchor-lang/core` 1.1.2 + `@solana/web3.js` 1.99.0, `server/` (Rust, axum), `oracle/` (Node 24, `@google/genai`).

**Spec:** `CLAUDE.md` §2, §4 (maszyna stanów, uprawnienia, `settle_expired`, QR), §5 (wyrocznia), `server/README.md` (tryb solana), `docs/zadania/README.md` (wektory QR).

**Drugi plan (osoba A):** `docs/superpowers/plans/2026-10-04-a-app-server.md`. Nie edytujesz plików z jego listy.

## Global Constraints

- Tylko devnet. Nigdy nie commitujesz keypairów (`*.json` z kluczami, `oracle/keys/`) ani `.env`.
- Akcje stron wymagają `now < deadline`, a `settle_expired` wymaga `now >= deadline`. Arbiter może tylko `resolve_dispute` w `Disputed`, przed `ORACLE_TIMEOUT`, z werdyktem `Seller` albo `Buyer`.
- IDL v0 ma już ostateczne konta i argumenty. Zmieniasz tylko ciała handlerów, więc `pnpm sync-idl` nie powinien dać diffu. Jeśli da, commitujesz go od razu i mówisz osobie A.
- Deploy wyłącznie `pnpm deploy:devnet` (nigdy samo `anchor deploy`, bo po testach w `target/deploy` leży build z 5-sekundowymi terminami).
- Kod rdzenia `app/src/solana/` nie importuje `react-native`, `expo-*` ani niczego z `app/src/` spoza `solana/`.
- `EscrowError.message` zawsze po polsku, bez słów „transakcja on-chain”, „podpis”, „lamport”, „PDA”.
- Commituj małymi kawałkami. Przed pushem `git pull --rebase`. Nigdy force-push na `main`.
- **Toolchain:** na hoście nie ma Rusta, `cargo` ani `anchor`. Każde `cargo …`, `anchor …` i `pnpm test:program` uruchamiasz w kontenerze: `docker exec -w /work unbox-dev bash -lc '<komenda>'` (repo jest podmontowane w `/work`). Komendy samego Node (`pnpm --filter … test`, `node --import tsx --test …`, `typecheck`) uruchamiasz na hoście. `pnpm install`, `pnpm add` i `pnpm remove` tylko na hoście.

## Kolejność zadań

B0 → B1 → B2 → B3 → B4, potem:
- jeśli `app/package.json` jest na `main` (A1 osoby A wylądowało): B5 → B6 → B7 → B8;
- jeśli nie: B7 → B8, a B5 → B6 dopiero po A1.

B5 i B6 nie mogą utworzyć katalogu `app/` przed A1: `git mv Front-end/sellsor-rn app` osoby A przy istniejącym `app/` przeniósłby prototyp do `app/sellsor-rn`.

## Podział plików z osobą A

| Twoje (B) | Osoby A (nie edytujesz) |
|---|---|
| `programs/**`, `tests/**`, `cli/**`, `oracle/**` | `app/**` poza `app/src/solana/**` |
| `app/src/solana/**` (stub `index.ts` tworzy A w A1, potem jest Twój) | `server/src/**` poza `server/src/solana/**` |
| `server/src/solana/**` (+ nowy `server/src/solana/evidence.rs`), testy w `server/tests/solana.rs` | `packages/shared/src/{types,schemas,constants,helpers,dealMachine}.ts` |
| `packages/shared/src/escrow.ts`, `packages/shared/idl/**`, `CLAUDE.md` | `app/package.json` (zależności dla Ciebie dodaje A w A1) |
| wyjątek: jedna linia `allowed_mime` w `server/src/routes.rs` w B0 | |

**Zależności w aplikacji** (dodaje A w A1, ok. 02:30): `@solana/web3.js@1.99.0`, `@anchor-lang/core@1.1.2`, `buffer`, `react-native-get-random-values`, `expo-secure-store`, `@noble/hashes`. Potrzebujesz innej? Poproś A, nie edytuj `app/package.json`.

**Env aplikacji, z których korzystasz:** `EXPO_PUBLIC_RPC_URL`, `EXPO_PUBLIC_ORACLE_PUBKEY` (arbiter, któremu ufa kupujący).

**Punkty integracji z A:**
- **I1 (~11:00):** A5 + B6 → happy path na 2 telefonach na devnecie.
- **I2 (~15:00):** A7 + B7 + B8 → spór i zwrot na devnecie.

## Review Focus

1. **QR z innej paczki albo karta zwrotu w ścieżce wysyłki** → `EscrowError('QrMismatch')` przed wysłaniem czegokolwiek do sieci, bez opłaty. Test: B5 `qr.test.ts` + `escrow-client.test.ts` (saldo bez zmian).
2. **Zmieniony `metadata.json` albo obcy arbiter na koncie `Deal`** → `ListingMismatch` / `ArbiterMismatch` przed podpisem. Kupujący podpisuje `expected_listing_hash` policzony z bajtów, które sam pobrał. Test: B5 `escrow-client.test.ts`.
3. **Wygasły blockhash albo brak potwierdzenia na czas** → `EscrowError('Network')`; nie ponawiasz automatycznie. Ponowienie robi UI osoby A po odświeżeniu statusu, więc nie ma podwójnej akcji. Test: B5 `errors.test.ts`.
4. **Zegar telefonu wyprzedza sieć** → `networkNow()` czyta Clock sysvar; `DeadlineNotReached` mapuje się na zdanie o zegarze. Test: B5 `escrow-client.test.ts` (`networkNow` = `chainNow`) + `errors.test.ts`.
5. **Wyrocznia po `ORACLE_TIMEOUT`** → nie woła `resolve_dispute` (program by odrzucił), a crank woła `settle_expired` → `ReturnRequested`. Test: B2 (program odrzuca po terminie) + B8 `shouldResolve` w `oracle`.

---

### Task B0: kontrakt `Escrow` i JSON w `/media` (zaraz, do 02:15; A na to czeka w A3)

**Pliki:**
- Utwórz: `packages/shared/src/escrow.ts`.
- Zmień: `packages/shared/src/index.ts`, `packages/shared/src/shared.test.ts`, `server/src/routes.rs` (`allowed_mime`), `server/tests/media_persistence.rs`, `CLAUDE.md` (§6 Storage, §6 granice modułów, §8, §13), `docs/zadania/README.md` (wskaźnik na oba plany).

**Interfejsy:**
- Produkuje dla A i dla siebie: `Escrow`, `DealKey`, `PublishArgs`, `TxResult`, `QrCard`, `ComplaintInput`, `EscrowError`, `EscrowErrorCode`, `isEscrowError`.

- [ ] **Krok 1: test**

Dopisz w `packages/shared/src/shared.test.ts`:

```ts
import { EscrowError, isEscrowError } from './escrow';

describe('EscrowError', () => {
  it('niesie kod i polski komunikat, rozpoznawalny bez instanceof', () => {
    const e = new EscrowError('QrMismatch', 'Kod z karty nie pasuje');
    expect([e.code, e.message, e.name]).toEqual(['QrMismatch', 'Kod z karty nie pasuje', 'EscrowError']);
    expect(isEscrowError(e)).toBe(true);
    expect(isEscrowError({ name: 'EscrowError', code: 'Network', message: 'x' })).toBe(true);
    expect(isEscrowError(new Error('x'))).toBe(false);
  });
});
```

`pnpm --filter @unbox/shared test`. Oczekiwane: FAIL (brak modułu).

- [ ] **Krok 2: `packages/shared/src/escrow.ts`**

```ts
// The seam between the app and "the contract". Two implementations:
//   DemoEscrow  (app/src/escrow/demo.ts, person A): PAYMENTS=demo REST actions, offline fallback.
//   SolanaEscrow (app/src/solana/, person B): signs unbox_escrow instructions with the in-app wallet.
// Frozen: change only with both people agreeing, in a separate commit.
import type { ComplaintCategory, Hex32, Unix } from './types';

/** `id` = server listing/deal id; `deal` = Deal PDA (base58) from `onchain.deal`, null in demo mode. */
export interface DealKey { id: string; deal: string | null }

/** Exactly the JSON of POST /api/listings/{id}/publish (PAYMENTS=solana). */
export interface PublishArgs {
  listingId: string; deal: string; dealId: number; priceLamports: number;
  listingHash: Hex32; metadataUri: string; arbiter: string; programId: string;
}

export interface TxResult { signature: string | null; explorerUrl: string | null }

/** `payload` goes on the printed card (opaque to the UI); `commitment` goes to markShipped/markReturned. */
export interface QrCard { kind: 'ship' | 'return'; payload: string; commitment: Hex32 }

export interface ComplaintInput { category: ComplaintCategory; description: string }

export type EscrowErrorCode =
  | 'InvalidStatus' | 'Unauthorized' | 'DeadlinePassed' | 'DeadlineNotReached'
  | 'ListingMismatch' | 'ArbiterMismatch' | 'QrMismatch' | 'InsufficientFunds' | 'Network' | 'Rejected';

/** `message` is Polish and ready for the UI. */
export class EscrowError extends Error {
  constructor(readonly code: EscrowErrorCode, message: string) {
    super(message);
    this.name = 'EscrowError';
  }
}

export const isEscrowError = (e: unknown): e is EscrowError =>
  typeof e === 'object' && e !== null && (e as { name?: string }).name === 'EscrowError' && typeof (e as { code?: unknown }).code === 'string';

export interface Escrow {
  readonly mode: 'solana' | 'demo';
  /** Wallet address (base58); null in demo mode. */
  walletAddress(): Promise<string | null>;
  /** Unix seconds by the network clock (Clock sysvar); demo: the phone clock. */
  networkNow(): Promise<Unix>;
  requestTestSol(): Promise<TxResult>;
  /** Seller signs create_listing with the server's publish args; demo: no-op. */
  createListing(a: PublishArgs): Promise<TxResult>;
  cancelListing(k: DealKey): Promise<TxResult>;
  /** solana: checks sha256(metadata.json) and the trusted arbiter BEFORE signing. */
  purchase(k: DealKey): Promise<TxResult>;
  newQrCard(kind: 'ship' | 'return', k: DealKey): Promise<QrCard>;
  markShipped(k: DealKey, i: { qrCommitment: Hex32; packingVideoSha256: Hex32; trackingNumber: string }): Promise<TxResult>;
  acceptDelivery(k: DealKey, qrPayload: string): Promise<TxResult>;
  openDispute(k: DealKey, i: { qrPayload: string; unboxingVideoSha256: Hex32; complaint: ComplaintInput; complaintSha256: Hex32 }): Promise<TxResult>;
  markReturned(k: DealKey, i: { returnQrCommitment: Hex32; returnVideoSha256: Hex32; trackingNumber: string }): Promise<TxResult>;
  confirmReturn(k: DealKey, returnQrPayload: string): Promise<TxResult>;
  settleExpired(k: DealKey): Promise<TxResult>;
}
```

Dopisz `export * from './escrow';` w `index.ts`. Uruchom `pnpm --filter @unbox/shared test && pnpm --filter @unbox/shared typecheck`. Oczekiwane: PASS.

- [ ] **Krok 3: `application/json` w `/media`**

Test w `server/tests/media_persistence.rs`, w `media_upload_rules`, przed sekcją „błędy wejścia”:

```rust
    // complaint.json (app) and report.json (oracle) are stored like videos; their sha256 goes on-chain
    let doc = br#"{"v":1,"category":"damaged","description":"plama","created_at":1791050000}"#.to_vec();
    let (s, v) = ania.upload_bytes(doc.clone(), "application/json", "complaint.json").await;
    assert_eq!(s.as_u16(), 201, "{v}");
    let got = reqwest::get(format!("{}/media/{}", be.url, v["sha256"].as_str().unwrap())).await.unwrap();
    assert_eq!(got.headers()["content-type"], "application/json");
    assert_eq!(got.bytes().await.unwrap().to_vec(), doc);
```

`cargo test --manifest-path server/Cargo.toml --test media_persistence`. Oczekiwane: FAIL (`Niedozwolony typ pliku`). W `server/src/routes.rs`:

```rust
fn allowed_mime(m: &str) -> bool {
    matches!(
        m,
        "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "video/mp4" | "video/quicktime" | "application/json"
    )
}
```

Uruchom ponownie (PASS), potem cały `cargo test --manifest-path server/Cargo.toml` i `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings`.

- [ ] **Krok 4: dokumentacja**

`CLAUDE.md`:
- §6 „Storage” zastąp: „Pliki dowodowe (`metadata.json` z serwera, zdjęcia, `packing.mp4`, `unboxing.mp4`, `complaint.json`, `return-packing.mp4`, `report.json`) leżą w `server/` `/media`, adresowane sha256 (`POST /api/media` → `GET /media/<sha256>`). Hash z łańcucha jest adresem pliku. Supabase nie jest używany.”
- §6 „Granice modułów”: dopisz interfejs `Escrow` (`packages/shared/src/escrow.ts`), `DemoEscrow` (A) i `SolanaEscrow` (B), oraz to, że aplikacja żyje w `app/` z nawigacją prototypu.
- §8: notka „Od 04.10 01:30 integracja w dwie osoby, plany: `docs/superpowers/plans/2026-10-04-a-app-server.md` i `…-b-escrow-chain.md`”.
- §13: trzy wpisy z datą **2026-10-04**: storage w `server/` `/media`; szew `Escrow` z dwiema implementacjami; prototyp `Front-end/sellsor-rn` przeniesiony do `app/`, jedno konto na telefon.

W `docs/zadania/README.md` na górze: „Od 04.10 01:30 obowiązuje podział na dwie osoby: …” z linkami do obu planów.

- [ ] **Krok 5: commit i push** (A czeka na to w A3)

```bash
git add packages/shared/src server/src/routes.rs server/tests/media_persistence.rs CLAUDE.md docs/zadania/README.md docs/superpowers/plans
git commit -m "feat(shared): Escrow contract between the app and the chain; JSON evidence in server media"
git pull --rebase && git push
```

---

### Task B1: `open_dispute` (do 03:00)

**Pliki:**
- Zmień: `programs/unbox_escrow/src/instructions/open_dispute.rs`, `tests/helpers.ts` (+`openDispute`, `createDisputed`).
- Utwórz: `tests/dispute.test.ts`.

**Interfejsy:**
- Konsumuje: `createShipped()`, `funded()`, `waitPastDeadline()`, `anchorCode()`, `bytes32()`, `sha256()` z `tests/helpers.ts`.
- Produkuje:
  - `openDispute(s, who, secret)`;
  - `createDisputed() → Listed & { buyer, secret, videoHash, complaintHash }`.

- [ ] **Krok 1: helpery i testy**

Dopisz w `tests/helpers.ts`:

```ts
type Shipped = Awaited<ReturnType<typeof createShipped>>;

export const openDispute = (s: Shipped, who: Kp, secret: Uint8Array, videoHash = sha256(Buffer.from("unboxing.mp4")),
  complaintHash = sha256(Buffer.from("complaint.json"))) =>
  program.methods.openDispute(bytes32(secret), bytes32(videoHash), bytes32(complaintHash))
    .accountsPartial({ buyer: who.publicKey, deal: s.deal }).signers([who]).rpc();

export async function createDisputed() {
  const s = await createShipped();
  const videoHash = sha256(Buffer.from("unboxing.mp4"));
  const complaintHash = sha256(Buffer.from("complaint.json"));
  await openDispute(s, s.buyer, s.secret, videoHash, complaintHash);
  return { ...s, videoHash, complaintHash };
}
```

`tests/dispute.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anchorCode, bytes32, createDisputed, createShipped, funded, openDispute, program, statusOf, waitPastDeadline } from "./helpers";

describe("open_dispute", () => {
  it("stores both hashes and moves to Disputed; funds stay in escrow", async () => {
    const d = await createDisputed();
    const acc = await program.account.deal.fetch(d.deal);
    assert.equal(statusOf(acc), "disputed");
    assert.deepEqual(acc.unboxingVideoHash, bytes32(d.videoHash));
    assert.deepEqual(acc.complaintHash, bytes32(d.complaintHash));
  });

  it("needs the buyer, the right QR, non-empty hashes, and the Shipped deadline", async () => {
    const s = await createShipped();
    const stranger = await funded();
    await assert.rejects(openDispute(s, stranger, s.secret), anchorCode("Unauthorized"));
    await assert.rejects(openDispute(s, s.buyer, Buffer.alloc(32, 7)), anchorCode("QrMismatch"));
    await assert.rejects(openDispute(s, s.buyer, s.secret, Buffer.alloc(32)), anchorCode("EmptyHash"));
    await assert.rejects(openDispute(s, s.buyer, s.secret, undefined, Buffer.alloc(32)), anchorCode("EmptyHash"));
    await waitPastDeadline();
    await assert.rejects(openDispute(s, s.buyer, s.secret), anchorCode("DeadlinePassed"));
  });

  it("the QR is single-use: a disputed deal cannot be accepted or disputed again", async () => {
    const d = await createDisputed();
    await assert.rejects(openDispute(d, d.buyer, d.secret), anchorCode("InvalidStatus"));
    await assert.rejects(
      program.methods.acceptDelivery(bytes32(d.secret)).accountsPartial({ buyer: d.buyer.publicKey, deal: d.deal, seller: d.seller.publicKey })
        .signers([d.buyer]).rpc(),
      anchorCode("InvalidStatus"),
    );
  });
});
```

W dev containerze: `pnpm test:program`. Oczekiwane: FAIL `NotImplemented`.

- [ ] **Krok 2: handler**

`programs/unbox_escrow/src/instructions/open_dispute.rs`, sama funkcja i importy:

```rust
use crate::logic::{require_before_deadline, require_hash, ship_commitment};
use crate::state::{Deal, DealStatus};

pub fn handle_open_dispute(
    ctx: Context<OpenDispute>,
    qr_secret: [u8; 32],
    unboxing_video_hash: [u8; 32],
    complaint_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Shipped, UnboxError::InvalidStatus);
    require_before_deadline(deal, now)?;
    // Revealing the secret in the same tx as the decision makes the QR single-use.
    require!(ship_commitment(&key, &qr_secret) == deal.qr_commitment, UnboxError::QrMismatch);
    require_hash(&unboxing_video_hash)?;
    require_hash(&complaint_hash)?;
    let deal = &mut ctx.accounts.deal;
    deal.unboxing_video_hash = unboxing_video_hash;
    deal.complaint_hash = complaint_hash;
    deal.set_status(key, DealStatus::Disputed, now);
    Ok(())
}
```

- [ ] **Krok 3:** `pnpm test:program`. Oczekiwane: PASS (cały plik `dispute.test.ts` + stare testy).

- [ ] **Krok 4: commit**

```bash
git add programs tests
git commit -m "feat(program): open_dispute with single-use QR and evidence hashes"
```

---

### Task B2: `resolve_dispute` (do 03:45)

**Pliki:**
- Zmień: `programs/unbox_escrow/src/instructions/resolve_dispute.rs`, `tests/dispute.test.ts`, `tests/helpers.ts` (+`resolve`).

**Interfejsy:**
- Produkuje: `resolve(d, signer, verdict: "seller" | "buyer" | "none", reportHash?)`.

- [ ] **Krok 1: testy**

W `tests/helpers.ts`:

```ts
export const resolve = (d: { deal: Pk; seller: Kp }, signer: Kp, verdict: "seller" | "buyer" | "none",
  reportHash = sha256(Buffer.from("report.json"))) =>
  program.methods.resolveDispute({ [verdict]: {} } as any, bytes32(reportHash))
    .accountsPartial({ arbiter: signer.publicKey, deal: d.deal, seller: d.seller.publicKey }).signers([signer]).rpc();
```

Przenieś lokalne `settle` z `tests/unbox_escrow.test.ts` do `tests/helpers.ts` (i zaimportuj je tam z powrotem jako `settle`):

```ts
export type Party = { deal: Pk; seller: Kp; buyer: Kp };
export const settleExpired = (s: Party, caller: Kp) =>
  program.methods.settleExpired()
    .accountsPartial({ caller: caller.publicKey, deal: s.deal, seller: s.seller.publicKey, buyer: s.buyer.publicKey })
    .signers([caller]).rpc();
```

W `tests/unbox_escrow.test.ts`: `import { settleExpired as settle, type Party } from "./helpers"` zamiast lokalnych definicji. Stare testy muszą przejść bez innych zmian.

W `tests/dispute.test.ts` (import `resolve`, `settleExpired`, `connection`):

```ts
describe("resolve_dispute", () => {
  it("Seller pays the seller exactly the price and completes; the report hash is stored", async () => {
    const d = await createDisputed();
    const before = await connection.getBalance(d.seller.publicKey);
    await resolve(d, d.arbiter, "seller");
    const acc = await program.account.deal.fetch(d.deal);
    assert.deepEqual([statusOf(acc), Object.keys(acc.verdict)[0]], ["completed", "seller"]);
    assert.deepEqual(acc.reportHash, bytes32(sha256(Buffer.from("report.json"))));
    assert.equal(await connection.getBalance(d.seller.publicKey), before + d.price.toNumber());
  });

  it("Buyer asks for the return; funds stay in escrow", async () => {
    const d = await createDisputed();
    const before = await connection.getBalance(d.deal);
    await resolve(d, d.arbiter, "buyer");
    assert.equal(statusOf(await program.account.deal.fetch(d.deal)), "returnRequested");
    assert.equal(await connection.getBalance(d.deal), before);
  });

  it("only the deal's arbiter, only a real verdict, only once, only before ORACLE_TIMEOUT", async () => {
    const d = await createDisputed();
    await assert.rejects(resolve(d, await funded(), "buyer"), anchorCode("Unauthorized"));
    await assert.rejects(resolve(d, d.arbiter, "none"), anchorCode("InvalidVerdict"));
    await assert.rejects(resolve(d, d.arbiter, "seller", Buffer.alloc(32)), anchorCode("EmptyHash"));
    const late = await createDisputed();
    await waitPastDeadline();
    await assert.rejects(resolve(late, late.arbiter, "seller"), anchorCode("DeadlinePassed"));
    await settleExpired(late, await funded());                                       // silent oracle → neutral return
    assert.equal(statusOf(await program.account.deal.fetch(late.deal)), "returnRequested");
    assert.equal(Object.keys((await program.account.deal.fetch(late.deal)).verdict)[0], "none");
  });

  it("a resolved dispute cannot be resolved again", async () => {
    const d = await createDisputed();
    await resolve(d, d.arbiter, "buyer");
    await assert.rejects(resolve(d, d.arbiter, "seller"), anchorCode("InvalidStatus"));
  });
});
```

Arbiter w testach jest tylko `Keypair.generate()` bez SOL. Fee płaci provider, bo `.rpc()` z `signers([arbiter])` używa portfela providera jako płatnika (tak jak `buyer` w `unbox_escrow.test.ts`).

`pnpm test:program`. Oczekiwane: FAIL `NotImplemented`.

- [ ] **Krok 2: handler**

```rust
use crate::logic::{require_before_deadline, require_hash};
use crate::state::{Deal, DealStatus, Verdict};

pub fn handle_resolve_dispute(ctx: Context<ResolveDispute>, verdict: Verdict, report_hash: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Disputed, UnboxError::InvalidStatus);
    // After ORACLE_TIMEOUT the oracle is out; settle_expired takes the neutral path.
    require_before_deadline(deal, now)?;
    require!(verdict != Verdict::None, UnboxError::InvalidVerdict);
    require_hash(&report_hash)?;
    let to = if verdict == Verdict::Seller {
        let price = deal.price_lamports;
        ctx.accounts.deal.sub_lamports(price)?;
        ctx.accounts.seller.add_lamports(price)?;
        DealStatus::Completed
    } else {
        DealStatus::ReturnRequested
    };
    let deal = &mut ctx.accounts.deal;
    deal.verdict = verdict;
    deal.report_hash = report_hash;
    deal.set_status(key, to, now);
    Ok(())
}
```

- [ ] **Krok 3:** `pnpm test:program`. Oczekiwane: PASS.

- [ ] **Krok 4: commit**

```bash
git add programs tests
git commit -m "feat(program): resolve_dispute limited to the arbiter, Disputed and two verdicts"
```

---

### Task B3: `mark_returned` i `confirm_return` (do 04:30)

**Pliki:**
- Zmień: `programs/unbox_escrow/src/instructions/mark_returned.rs`, `programs/unbox_escrow/src/instructions/confirm_return.rs`, `tests/dispute.test.ts`, `tests/helpers.ts` (+`markReturned`, `confirmReturn`, `createReturning`).

- [ ] **Krok 1: helpery i testy**

```ts
export const returnCommitment = (deal: Pk, secret: Uint8Array) => sha256(Buffer.from("return"), deal.toBuffer(), secret);

export const markReturned = (d: { deal: Pk }, who: Kp, commitment: Uint8Array, video = sha256(Buffer.from("return.mp4")), tracking = "ZWROT-1") =>
  program.methods.markReturned(bytes32(commitment), bytes32(video), tracking)
    .accountsPartial({ buyer: who.publicKey, deal: d.deal }).signers([who]).rpc();

export const confirmReturn = (d: { deal: Pk; buyer: Kp }, who: Kp, secret: Uint8Array) =>
  program.methods.confirmReturn(bytes32(secret))
    .accountsPartial({ seller: who.publicKey, deal: d.deal, buyer: d.buyer.publicKey }).signers([who]).rpc();

export async function createReturning() {
  const d = await createDisputed();
  await resolve(d, d.arbiter, "buyer");
  const returnSecret = randomBytes(32);
  await markReturned(d, d.buyer, returnCommitment(d.deal, returnSecret));
  return { ...d, returnSecret };
}
```

Testy w `tests/dispute.test.ts`, `describe("return")`:
- `createReturning()` → status `returning`, `returnTrackingNumber === "ZWROT-1"`;
- `confirmReturn(r, r.seller, r.returnSecret)` → `refunded`, saldo kupującego + dokładnie `price`;
- **QR wysyłki zamiast zwrotu:** `confirmReturn(r, r.seller, r.secret)` → `QrMismatch`. Wysyłka ma ten sam `deal`, ale bez prefiksu `"return"`; to zabezpiecza Review Focus 1 po stronie programu;
- obca osoba (`funded()`) w `markReturned` i `confirmReturn` → `Unauthorized`;
- `markReturned` z pustym hashem → `EmptyHash`, z 33-znakowym numerem → `StringTooLong`, z pustym numerem → `EmptyText`;
- **terminy:**
  - `createDisputed` + `resolve buyer` + `waitPastDeadline` → `markReturned` = `DeadlinePassed`, `settleExpired` → `completed` (sprzedający dostaje cenę);
  - `createReturning` + `waitPastDeadline` → `confirmReturn` = `DeadlinePassed`, `settleExpired` → `refunded`.

`pnpm test:program`. Oczekiwane: FAIL `NotImplemented`.

- [ ] **Krok 2: handlery**

`mark_returned.rs`:

```rust
use crate::constants::{DEAL_SEED, MAX_TRACKING_LEN};
use crate::logic::{require_before_deadline, require_hash, require_text};
use crate::state::{Deal, DealStatus};

pub fn handle_mark_returned(
    ctx: Context<MarkReturned>,
    return_qr_commitment: [u8; 32],
    return_video_hash: [u8; 32],
    return_tracking_number: String,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::ReturnRequested, UnboxError::InvalidStatus);
    require_before_deadline(deal, now)?;
    require_hash(&return_qr_commitment)?;
    require_hash(&return_video_hash)?;
    require_text(&return_tracking_number, MAX_TRACKING_LEN)?;
    let key = ctx.accounts.deal.key();
    let deal = &mut ctx.accounts.deal;
    deal.return_qr_commitment = return_qr_commitment;
    deal.return_video_hash = return_video_hash;
    deal.return_tracking_number = return_tracking_number;
    deal.set_status(key, DealStatus::Returning, now);
    Ok(())
}
```

`confirm_return.rs`:

```rust
use crate::logic::{require_before_deadline, return_commitment};
use crate::state::{Deal, DealStatus};

pub fn handle_confirm_return(ctx: Context<ConfirmReturn>, return_qr_secret: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Returning, UnboxError::InvalidStatus);
    // Party actions only before the deadline; after it settle_expired refunds the buyer the same way.
    require_before_deadline(deal, now)?;
    require!(return_commitment(&key, &return_qr_secret) == deal.return_qr_commitment, UnboxError::QrMismatch);
    let price = deal.price_lamports;
    ctx.accounts.deal.sub_lamports(price)?;
    ctx.accounts.buyer.add_lamports(price)?;
    ctx.accounts.deal.set_status(key, DealStatus::Refunded, now);
    Ok(())
}
```

- [ ] **Krok 3:** `pnpm test:program`. Oczekiwane: PASS, a w programie nie ma już `NotImplemented` (`grep -rn NotImplemented programs/unbox_escrow/src/instructions` → pusto).

- [ ] **Krok 4: commit**

```bash
git add programs tests
git commit -m "feat(program): return path with mark_returned and confirm_return"
```

---

### Task B4: deploy na devnet + `cli` do zapasowego demo (do 05:00)

**Pliki:**
- Zmień (tylko gdy jest diff): `packages/shared/idl/*`.
- Zmień: `cli/src/main.rs`, `cli/src/qr.rs`.

- [ ] **Krok 1: deploy**

```bash
DEPLOY_URL=<RPC Helius devnet> pnpm deploy:devnet
pnpm sync-idl && git diff --stat packages/shared/idl     # oczekiwane: brak zmian
```

URL Helius zawiera klucz API. Dostajesz go tylko w zmiennej środowiskowej komendy i nigdy go nie wypisujesz w logach ani raportach, nie zapisujesz w plikach i nie commitujesz.

Gdy jest diff, commituj go od razu (`chore(idl): sync after dispute handlers`) i napisz osobie A.

- [ ] **Krok 2: `cli`: `dispute`, `return`, `confirm-return`, `resolve-test`**

Na wzór `Accept`/`Ship` w `cli/src/main.rs`:
- `Dispute { qr, video, complaint }`: hashuje oba pliki (`sha256(std::fs::read(..))`), nie wysyła ich; plik wysyła osobno `curl` na `/api/media`;
- `Return { listing, tracking, video }`: generuje sekret, wypisuje `UNBOX1R:<deal>:<secret>`;
- `ConfirmReturn { qr }`.

W `qr.rs`: `return_payload` + `parse_return` z testem na wektorze zwrotu z `docs/zadania/README.md`. Bez `resolve` (to robi wyrocznia).

- [ ] **Krok 3:** `cd cli && cargo test && cargo clippy -- -D warnings`. Na devnecie: `publish` → `buy` → `ship` → `dispute` przez `cargo run`, a sygnatury w Explorerze.

- [ ] **Krok 4: commit**

```bash
git add cli packages/shared/idl
git commit -m "feat(cli): dispute and return commands for the backup demo"
```

---

### Task B5: `SolanaEscrow`: rdzeń bez React Native (do 08:00)

**Pliki:**
- Utwórz: `app/src/solana/qr.ts`, `app/src/solana/errors.ts`, `app/src/solana/escrow.ts`, `app/src/solana/qr.test.ts`, `app/src/solana/errors.test.ts`, `tests/escrow-client.test.ts`.

**Interfejsy:**
- Konsumuje: `Escrow`, `EscrowError` (B0), IDL `packages/shared/idl/unbox_escrow.json` + typ `UnboxEscrow` z `packages/shared/idl/unbox_escrow.ts`.
- Produkuje:
  - `createEscrowCore(deps: { connection: Connection; keypair: Keypair; idl: Idl; trustedArbiter: PublicKey; fetchBytes: (url: string) => Promise<Uint8Array | null>; cluster?: string }): Escrow`;
  - `encodeQr`, `parseQr`, `shipCommitment`, `returnCommitment`, `toEscrowError(e)`.

**Warunek wejścia:** `git pull --rebase && test -f app/package.json`. Bez tego nie tworzysz niczego w `app/` (patrz „Kolejność zadań”).

- [ ] **Krok 0: spike na telefonie (gdy A1 jest na `main`)**

Tymczasowo w `app/src/solana/index.ts` (stub) dopisz na górze `import { Program } from '@anchor-lang/core';` i w `createSolanaEscrow()` `console.log(typeof Program)`. Uruchom `EXPO_PUBLIC_PAYMENTS=solana pnpm --filter app start`. Oczekiwane: `function` w logach Metro, bez czerwonego ekranu. Jeśli Hermes się wywraca:
- zamiast `Program` użyj `BorshInstructionCoder` + `BorshAccountsCoder` z `@anchor-lang/core` (albo samego dyskryminatora + borsh);
- `escrow.ts` buduje wtedy `TransactionInstruction` ręcznie;
- interfejs `Escrow` się nie zmienia.

Wynik zapisz w `docs/spiki.md`. Cofnij spike'owe zmiany w stubie.

- [ ] **Krok 1: QR — testy na wektorach**

`app/src/solana/qr.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicKey } from '@solana/web3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { encodeQr, parseQr, returnCommitment, shipCommitment } from './qr';

const deal = new PublicKey(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const secret = new Uint8Array(32).fill(0xab);

test('vectors from docs/zadania/README.md', () => {
  assert.equal(deal.toBase58(), '4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw');
  assert.equal(bytesToHex(shipCommitment(deal, secret)), '53c95ae0a78bfd76222068846946ee779ca3d184074836c3586cd0fa91ff7977');
  assert.equal(bytesToHex(returnCommitment(deal, secret)), '5e5f3dfadff170096733860b3fb82e2ce226c81a8103a67fc0bb850fff1b649d');
  assert.equal(encodeQr('ship', deal, secret), 'UNBOX1:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t');
  assert.equal(encodeQr('return', deal, secret), 'UNBOX1R:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t');
});

test('parse round-trips and rejects junk, demo-mode payloads and wrong lengths', () => {
  const p = parseQr(`  ${encodeQr('return', deal, secret)}\n`)!;
  assert.deepEqual([p.kind, p.deal.toBase58(), bytesToHex(p.secret)], ['return', deal.toBase58(), 'ab'.repeat(32)]);
  assert.equal(parseQr('UNBOX1:l-kurtka-levis:' + 'ab'.repeat(32)), null);   // demo format
  assert.equal(parseQr('https://example.com'), null);
  assert.equal(parseQr('UNBOX1:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:abc'), null);
});
```

`node --import tsx --test app/src/solana/qr.test.ts`. Oczekiwane: FAIL.

- [ ] **Krok 2: `qr.ts`**

```ts
// On-chain QR format (CLAUDE.md §4): UNBOX1[R]:<deal_base58>:<secret_base58>; 32 bytes in base58 = pubkey encoding.
import { PublicKey } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export type QrKind = 'ship' | 'return';
const PREFIX: Record<QrKind, string> = { ship: 'UNBOX1', return: 'UNBOX1R' };
const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const RE = new RegExp(`^(UNBOX1R?):(${B58}):(${B58})$`);

export const shipCommitment = (deal: PublicKey, secret: Uint8Array) => sha256(concatBytes(deal.toBytes(), secret));
export const returnCommitment = (deal: PublicKey, secret: Uint8Array) => sha256(concatBytes(utf8ToBytes('return'), deal.toBytes(), secret));
export const encodeQr = (kind: QrKind, deal: PublicKey, secret: Uint8Array) =>
  `${PREFIX[kind]}:${deal.toBase58()}:${new PublicKey(secret).toBase58()}`;

export function parseQr(payload: string): { kind: QrKind; deal: PublicKey; secret: Uint8Array } | null {
  const m = RE.exec(payload.trim());
  if (!m) return null;
  try {
    const secret = new PublicKey(m[3]).toBytes();
    return { kind: m[1] === 'UNBOX1R' ? 'return' : 'ship', deal: new PublicKey(m[2]), secret };
  } catch {
    return null;
  }
}
```

Test: PASS.

- [ ] **Krok 3: mapowanie błędów — testy (Review Focus 3 i 4)**

`app/src/solana/errors.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toEscrowError } from './errors';

const anchorErr = (code: string) => ({ error: { errorCode: { code, number: 6000 }, errorMessage: 'x' } });

test('program errors map to Escrow codes with Polish copy', () => {
  assert.equal(toEscrowError(anchorErr('QrMismatch')).code, 'QrMismatch');
  assert.equal(toEscrowError(anchorErr('ListingHashMismatch')).code, 'ListingMismatch');
  assert.equal(toEscrowError(anchorErr('SameParty')).code, 'Rejected');
  assert.match(toEscrowError(anchorErr('DeadlineNotReached')).message, /zegar|czas sieci/i);
});

test('missing funds, expired blockhash and dead network', () => {
  assert.equal(toEscrowError({ message: 'Simulation failed', logs: ['Transfer: insufficient lamports 10, need 60000000'] }).code, 'InsufficientFunds');
  assert.equal(toEscrowError({ message: 'Attempt to debit an account but found no record of a prior credit.' }).code, 'InsufficientFunds');
  assert.equal(toEscrowError({ name: 'TransactionExpiredBlockheightExceededError', message: 'expired' }).code, 'Network');
  assert.equal(toEscrowError(new TypeError('Network request failed')).code, 'Network');
});
```

- [ ] **Krok 4: `errors.ts`**

```ts
// Anchor / web3 errors → EscrowError with Polish copy (no "transaction", "signature", "lamport").
import { EscrowError, type EscrowErrorCode } from '@unbox/shared';

const PROGRAM: Record<string, [EscrowErrorCode, string]> = {
  InvalidStatus: ['InvalidStatus', 'Ktoś wykonał ruch w tej umowie chwilę wcześniej. Pokazujemy aktualny stan.'],
  Unauthorized: ['Unauthorized', 'Tę czynność może wykonać tylko druga strona umowy.'],
  DeadlinePassed: ['DeadlinePassed', 'Umowa przyjmuje tę czynność tylko przed terminem. Po terminie wykona regułę sama – środki nie przepadły.'],
  DeadlineNotReached: ['DeadlineNotReached', 'Zegar telefonu wyprzedza czas sieci o kilka sekund. Spróbuj za chwilę – nic nie zostało pobrane.'],
  ListingHashMismatch: ['ListingMismatch', 'Opis albo zdjęcia różnią się od zapisanych w umowie, więc umowa odrzuciła zakup. Środki nie zostały pobrane.'],
  ArbiterMismatch: ['ArbiterMismatch', 'Weryfikator w umowie jest inny niż ten, któremu ufa aplikacja. Środki nie zostały pobrane.'],
  QrMismatch: ['QrMismatch', 'Karta pochodzi z innej paczki. Umowa jest bez zmian – zeskanuj kartę z tej przesyłki.'],
  SameParty: ['Rejected', 'Nie możesz kupić własnego ogłoszenia.'],
};

export function toEscrowError(e: unknown): EscrowError {
  if (e instanceof EscrowError) return e;
  const x = e as { error?: { errorCode?: { code?: string } }; logs?: string[]; message?: string; name?: string };
  const code = x?.error?.errorCode?.code;
  if (code) {
    const [c, msg] = PROGRAM[code] ?? ['Rejected', `Umowa odrzuciła operację (${code}). Nic nie zostało pobrane.`];
    return new EscrowError(c, msg);
  }
  const text = `${x?.message ?? ''} ${(x?.logs ?? []).join(' ')}`;
  if (/insufficient lamports|no record of a prior credit|insufficient funds/i.test(text)) {
    return new EscrowError('InsufficientFunds', 'Za mało SOL na tę operację (cena i opłata sieci). Doładuj testowe SOL.');
  }
  if (/BlockheightExceeded|TransactionExpired|Blockhash not found|Network request failed|fetch failed|timed? ?out|ECONN/i.test(`${x?.name ?? ''} ${text}`)) {
    return new EscrowError('Network', 'Sieć nie potwierdziła operacji na czas. Odśwież stan umowy, zanim spróbujesz ponownie.');
  }
  return new EscrowError('Rejected', `Operacja nie powiodła się: ${x?.message ?? String(e)}`);
}
```

`node --import tsx --test app/src/solana/*.test.ts`. Oczekiwane: PASS.

- [ ] **Krok 5: test integracyjny klienta na Surfpoolu**

`tests/escrow-client.test.ts` (uruchamia się w `pnpm test:program`, bo pasuje do `tests/*.test.ts`):

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import * as anchor from "@anchor-lang/core";
import { isEscrowError } from "@unbox/shared";
import { createEscrowCore } from "../app/src/solana/escrow";
import { chainNow, connection, dealPda, funded, program, statusOf, waitPastDeadline } from "./helpers";

const idl = JSON.parse(readFileSync("target/idl/unbox_escrow.json", "utf8"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const files = new Map<string, Uint8Array>();
const fetchBytes = async (url: string) => files.get(url) ?? null;

async function market() {
  const [seller, buyer] = [await funded(), await funded()];
  const arbiter = anchor.web3.Keypair.generate();
  const mk = (kp: anchor.web3.Keypair, trusted = arbiter.publicKey) =>
    createEscrowCore({ connection, keypair: kp, idl, trustedArbiter: trusted, fetchBytes, cluster: "custom" });
  const dealId = Date.now() + Math.floor(Math.random() * 1000);
  const deal = dealPda(seller.publicKey, new anchor.BN(dealId));
  const metadata = Buffer.from(JSON.stringify({ v: 1, title: `Kurtka ${dealId}` }));
  const metadataUri = `mem://${deal}/metadata.json`;
  files.set(metadataUri, metadata);
  const args = { listingId: `l-${dealId}`, deal: deal.toBase58(), dealId, priceLamports: 60_000_000,
    listingHash: createHash("sha256").update(metadata).digest("hex"), metadataUri, arbiter: arbiter.publicKey.toBase58(),
    programId: program.programId.toBase58() };
  return { seller, buyer, arbiter, deal, args, metadataUri, s: mk(seller), b: mk(buyer), mk, key: { id: args.listingId, deal: deal.toBase58() } };
}
const code = (c: string) => (e: unknown) => isEscrowError(e) && e.code === c;

describe("SolanaEscrow against the program", () => {
  it("happy path through the Escrow interface; networkNow is the chain clock", async () => {
    const m = await market();
    assert.equal(await m.b.walletAddress(), m.buyer.publicKey.toBase58());
    assert.ok(Math.abs((await m.b.networkNow()) - (await chainNow())) <= 2);
    await m.s.createListing(m.args);
    const r = await m.b.purchase(m.key);
    assert.match(r.explorerUrl ?? "", /explorer\.solana\.com\/tx\//);
    const card = await m.s.newQrCard("ship", m.key);
    await m.s.markShipped(m.key, { qrCommitment: card.commitment, packingVideoSha256: hex(randomBytes(32)), trackingNumber: "INP1" });
    const before = await connection.getBalance(m.seller.publicKey);
    await m.b.acceptDelivery(m.key, card.payload);
    assert.equal(statusOf(await program.account.deal.fetch(m.deal)), "completed");
    assert.equal(await connection.getBalance(m.seller.publicKey), before + 60_000_000);
  });

  it("Review Focus 2: tampered metadata or a foreign arbiter stop the purchase before signing", async () => {
    const m = await market();
    await m.s.createListing(m.args);
    files.set(m.metadataUri, Buffer.from("{}"));
    const before = await connection.getBalance(m.buyer.publicKey);
    await assert.rejects(m.b.purchase(m.key), code("ListingMismatch"));
    const m2 = await market();
    await m2.s.createListing(m2.args);
    await assert.rejects(m2.mk(m2.buyer, anchor.web3.Keypair.generate().publicKey).purchase(m2.key), code("ArbiterMismatch"));
    assert.equal(await connection.getBalance(m.buyer.publicKey), before);
  });

  it("Review Focus 1: a card from another parcel or a return card is refused before anything is sent", async () => {
    const m = await market();
    await m.s.createListing(m.args);
    await m.b.purchase(m.key);
    const card = await m.s.newQrCard("ship", m.key);
    await m.s.markShipped(m.key, { qrCommitment: card.commitment, packingVideoSha256: hex(randomBytes(32)), trackingNumber: "INP1" });
    const other = await m.s.newQrCard("ship", m.key);           // same deal, different secret: not the packed card
    const ret = await m.s.newQrCard("return", m.key);
    const before = await connection.getBalance(m.buyer.publicKey);
    await assert.rejects(m.b.acceptDelivery(m.key, other.payload), code("QrMismatch"));
    await assert.rejects(m.b.acceptDelivery(m.key, ret.payload), code("QrMismatch"));
    await assert.rejects(m.b.acceptDelivery(m.key, "UNBOX1:l-kurtka:" + "ab".repeat(32)), code("QrMismatch"));
    assert.equal(await connection.getBalance(m.buyer.publicKey), before);   // no fee was paid
  });

  it("dispute → Buyer verdict → return → refund, and settle mapping", async () => {
    const m = await market();
    await m.s.createListing(m.args);
    await m.b.purchase(m.key);
    await assert.rejects(m.b.settleExpired(m.key), code("DeadlineNotReached"));
    const card = await m.s.newQrCard("ship", m.key);
    await m.s.markShipped(m.key, { qrCommitment: card.commitment, packingVideoSha256: hex(randomBytes(32)), trackingNumber: "INP1" });
    await m.b.openDispute(m.key, { qrPayload: card.payload, unboxingVideoSha256: hex(randomBytes(32)),
      complaint: { category: "damaged", description: "plama" }, complaintSha256: hex(randomBytes(32)) });
    await program.methods.resolveDispute({ buyer: {} } as any, Array.from(randomBytes(32)))
      .accountsPartial({ arbiter: m.arbiter.publicKey, deal: m.deal, seller: m.seller.publicKey }).signers([m.arbiter]).rpc();
    const ret = await m.b.newQrCard("return", m.key);
    await m.b.markReturned(m.key, { returnQrCommitment: ret.commitment, returnVideoSha256: hex(randomBytes(32)), trackingNumber: "ZWROT-1" });
    const before = await connection.getBalance(m.buyer.publicKey);
    await m.s.confirmReturn(m.key, ret.payload);
    assert.equal(statusOf(await program.account.deal.fetch(m.deal)), "refunded");
    assert.equal(await connection.getBalance(m.buyer.publicKey), before + 60_000_000);
  });

  it("anyone settles after the deadline through Escrow", async () => {
    const m = await market();
    await m.s.createListing(m.args);
    await m.b.purchase(m.key);
    await waitPastDeadline();
    await m.mk(await funded()).settleExpired(m.key);
    assert.equal(statusOf(await program.account.deal.fetch(m.deal)), "refunded");
  });
});
```

`pnpm test:program`. Oczekiwane: FAIL (brak `escrow.ts`).

- [ ] **Krok 6: `escrow.ts`**

```ts
// SolanaEscrow core: no React Native imports, so tests/escrow-client.test.ts runs it against Surfpool.
// Every check here is also enforced by the program; checks before signing only save the user a fee.
import { AnchorProvider, BN, Program, type Idl } from '@anchor-lang/core';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SYSVAR_CLOCK_PUBKEY, Transaction, VersionedTransaction } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { EscrowError, type DealKey, type Escrow, type TxResult } from '@unbox/shared';
import type { UnboxEscrow } from '../../../packages/shared/idl/unbox_escrow';
import { toEscrowError } from './errors';
import { encodeQr, parseQr, returnCommitment, shipCommitment, type QrKind } from './qr';

export interface EscrowDeps {
  connection: Connection;
  keypair: Keypair;
  idl: Idl;
  trustedArbiter: PublicKey;
  fetchBytes: (url: string) => Promise<Uint8Array | null>;
  cluster?: string;   // Explorer ?cluster=, default devnet
}

const b32 = (hex: string) => Array.from(hexToBytes(hex));
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);

export function createEscrowCore(d: EscrowDeps): Escrow {
  const me = d.keypair.publicKey;
  const sign = <T extends Transaction | VersionedTransaction>(tx: T): T => {
    if (tx instanceof VersionedTransaction) tx.sign([d.keypair]);
    else tx.partialSign(d.keypair);
    return tx;
  };
  const wallet = { publicKey: me, signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => sign(tx),
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs.map(sign) };
  const provider = new AnchorProvider(d.connection, wallet as never, { commitment: 'confirmed', preflightCommitment: 'confirmed' });
  const program = new Program<UnboxEscrow>(d.idl as UnboxEscrow, provider);
  const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${d.cluster ?? 'devnet'}`;

  async function run(send: () => Promise<string>): Promise<TxResult> {
    try {
      const sig = await send();
      return { signature: sig, explorerUrl: explorer(sig) };
    } catch (e) {
      throw toEscrowError(e);
    }
  }
  const dealOf = (k: DealKey) => {
    if (!k.deal) throw new EscrowError('Rejected', 'To ogłoszenie nie jest jeszcze zapisane w umowie.');
    return new PublicKey(k.deal);
  };
  const account = async (deal: PublicKey) => {
    try { return await program.account.deal.fetch(deal); } catch (e) { throw toEscrowError(e); }
  };
  function secretFor(kind: QrKind, deal: PublicKey, payload: string, commitment: number[]): number[] {
    const q = parseQr(payload);
    const expected = q && (kind === 'ship' ? shipCommitment(q.deal, q.secret) : returnCommitment(q.deal, q.secret));
    if (!q || q.kind !== kind || !q.deal.equals(deal) || !expected || !same(expected, commitment)) {
      throw new EscrowError('QrMismatch', kind === 'ship'
        ? 'Kod z karty nie pasuje do tej przesyłki. Umowa jest bez zmian – zeskanuj kartę z tej paczki.'
        : 'Kod nie pasuje do karty zwrotu tej umowy. Zeskanuj kartę zwrotu z odesłanej paczki.');
    }
    return Array.from(q.secret);
  }

  return {
    mode: 'solana',
    walletAddress: async () => me.toBase58(),
    async networkNow() {
      const info = await d.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, 'confirmed');
      if (!info) throw new EscrowError('Network', 'Nie udało się odczytać czasu sieci.');
      return Number(new DataView(info.data.buffer, info.data.byteOffset).getBigInt64(32, true));
    },
    async requestTestSol() {
      try {
        const sig = await d.connection.requestAirdrop(me, LAMPORTS_PER_SOL);
        await d.connection.confirmTransaction({ signature: sig, ...(await d.connection.getLatestBlockhash()) }, 'confirmed');
        return { signature: sig, explorerUrl: explorer(sig) };
      } catch {
        throw new EscrowError('Network', 'Kran testowych SOL nie odpowiada. Spróbuj za minutę albo poproś zespół o przelew.');
      }
    },
    async createListing(a) {
      const deal = new PublicKey(a.deal);
      const [pda] = PublicKey.findProgramAddressSync([Buffer.from('deal'), me.toBuffer(), new BN(a.dealId).toArrayLike(Buffer, 'le', 8)], program.programId);
      if (!pda.equals(deal)) throw new EscrowError('Rejected', 'Serwer podał adres umowy dla innego portfela.');
      if (!new PublicKey(a.arbiter).equals(d.trustedArbiter)) throw new EscrowError('ArbiterMismatch', 'Serwer podał innego weryfikatora niż ten, któremu ufa aplikacja.');
      const bytes = await d.fetchBytes(a.metadataUri);
      if (!bytes || bytesToHex(sha256(bytes)) !== a.listingHash) throw new EscrowError('ListingMismatch', 'Opis udostępniony przez serwer różni się od tego, który miał trafić do umowy.');
      return run(() => program.methods.createListing(new BN(a.dealId), new BN(a.priceLamports), b32(a.listingHash), a.metadataUri, d.trustedArbiter)
        .accountsPartial({ seller: me, deal }).rpc());
    },
    cancelListing: async (k) => run(() => program.methods.cancelListing().accountsPartial({ seller: me, deal: dealOf(k) }).rpc()),
    async purchase(k) {
      const deal = dealOf(k);
      const acc = await account(deal);
      if (!acc.arbiter.equals(d.trustedArbiter)) throw new EscrowError('ArbiterMismatch', 'Weryfikator w tej umowie jest inny niż ten, któremu ufa aplikacja. Zakup wstrzymany, nic nie zostało pobrane.');
      const bytes = await d.fetchBytes(acc.metadataUri);
      const seen = bytes ? sha256(bytes) : null;
      if (!seen || !same(seen, acc.listingHash)) throw new EscrowError('ListingMismatch', 'Opis ogłoszenia różni się od zapisanego w umowie. Zakup wstrzymany, nic nie zostało pobrane.');
      return run(() => program.methods.purchase(Array.from(seen), d.trustedArbiter).accountsPartial({ buyer: me, deal }).rpc());
    },
    async newQrCard(kind, k) {
      const deal = dealOf(k);
      const secret = crypto.getRandomValues(new Uint8Array(32));
      const c = kind === 'ship' ? shipCommitment(deal, secret) : returnCommitment(deal, secret);
      return { kind, payload: encodeQr(kind, deal, secret), commitment: bytesToHex(c) };
    },
    markShipped: async (k, i) => run(() => program.methods.markShipped(b32(i.qrCommitment), b32(i.packingVideoSha256), i.trackingNumber)
      .accountsPartial({ seller: me, deal: dealOf(k) }).rpc()),
    async acceptDelivery(k, payload) {
      const deal = dealOf(k);
      const acc = await account(deal);
      const secret = secretFor('ship', deal, payload, acc.qrCommitment);
      return run(() => program.methods.acceptDelivery(secret).accountsPartial({ buyer: me, deal, seller: acc.seller }).rpc());
    },
    async openDispute(k, i) {
      const deal = dealOf(k);
      const acc = await account(deal);
      const secret = secretFor('ship', deal, i.qrPayload, acc.qrCommitment);
      return run(() => program.methods.openDispute(secret, b32(i.unboxingVideoSha256), b32(i.complaintSha256))
        .accountsPartial({ buyer: me, deal }).rpc());
    },
    markReturned: async (k, i) => run(() => program.methods.markReturned(b32(i.returnQrCommitment), b32(i.returnVideoSha256), i.trackingNumber)
      .accountsPartial({ buyer: me, deal: dealOf(k) }).rpc()),
    async confirmReturn(k, payload) {
      const deal = dealOf(k);
      const acc = await account(deal);
      const secret = secretFor('return', deal, payload, acc.returnQrCommitment);
      return run(() => program.methods.confirmReturn(secret).accountsPartial({ seller: me, deal, buyer: acc.buyer }).rpc());
    },
    async settleExpired(k) {
      const deal = dealOf(k);
      const acc = await account(deal);
      return run(() => program.methods.settleExpired().accountsPartial({ caller: me, deal, seller: acc.seller, buyer: acc.buyer }).rpc());
    },
  };
}
```

Uwagi:
- W teście `cluster: "custom"` daje link `?cluster=custom`; asercja sprawdza tylko `/tx/`.
- `crypto.getRandomValues` jest w Node 24 i w RN po polyfillu z A1.
- `Buffer` w `createListing` zapewnia polyfill.
- `settleExpired` przed terminem: program rzuca `DeadlineNotReached` → `toEscrowError`.

`pnpm test:program`. Oczekiwane: PASS (wszystkie pliki). Jeśli `tests/escrow-client.test.ts` nie widzi `@unbox/shared` albo `@noble/hashes`, sprawdź `pnpm install` na hoście (root ma `@unbox/shared` w devDependencies).

- [ ] **Krok 7: commit**

```bash
git add app/src/solana tests/escrow-client.test.ts docs/spiki.md
git commit -m "feat(app): SolanaEscrow core with QR, error mapping and pre-sign checks, tested on Surfpool"
```

---

### Task B6: `SolanaEscrow` w aplikacji: portfel i config (do 10:00)

**Pliki:**
- Zmień: `app/src/solana/index.ts` (zastępuje stub z A1).
- Utwórz: `app/src/solana/wallet.ts`.

**Interfejsy:**
- Produkuje (dla `app/src/escrow/index.ts` osoby A):
  - `createSolanaEscrow(): Escrow` (synchroniczny, klucz ładuje się leniwie);
  - dodatkowo `importWalletJson(json: string)` dla menu deweloperskiego (opcjonalnie, A podpina na prośbę).

- [ ] **Krok 1: `wallet.ts`**

```ts
// The in-app wallet (CLAUDE.md §6): generated on first launch, kept in expo-secure-store, devnet only.
import * as SecureStore from 'expo-secure-store';
import { Keypair } from '@solana/web3.js';

const KEY = 'unbox.wallet.v1';

export async function loadKeypair(): Promise<Keypair> {
  const stored = await SecureStore.getItemAsync(KEY);
  if (stored) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored) as number[]));
  const kp = Keypair.generate();
  await SecureStore.setItemAsync(KEY, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

/** Dev menu: a demo wallet as a solana-keygen JSON array. Takes effect after an app restart. */
export async function importWalletJson(json: string): Promise<string> {
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json) as number[]));
  await SecureStore.setItemAsync(KEY, JSON.stringify(Array.from(kp.secretKey)));
  return kp.publicKey.toBase58();
}
```

- [ ] **Krok 2: `index.ts`**

```ts
import { Connection, PublicKey } from '@solana/web3.js';
import type { Idl } from '@anchor-lang/core';
import type { Escrow } from '@unbox/shared';
import idl from '../../../packages/shared/idl/unbox_escrow.json';
import { createEscrowCore } from './escrow';
import { loadKeypair } from './wallet';

export { importWalletJson } from './wallet';

const METHODS = ['walletAddress', 'networkNow', 'requestTestSol', 'createListing', 'cancelListing', 'purchase', 'newQrCard',
  'markShipped', 'acceptDelivery', 'openDispute', 'markReturned', 'confirmReturn', 'settleExpired'] as const;

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export function createSolanaEscrow(): Escrow {
  const arbiter = process.env.EXPO_PUBLIC_ORACLE_PUBKEY;
  const ready = (async () => {
    if (!arbiter) throw new Error('Brak EXPO_PUBLIC_ORACLE_PUBKEY w app/.env');
    const connection = new Connection(process.env.EXPO_PUBLIC_RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed');
    return createEscrowCore({ connection, keypair: await loadKeypair(), idl: idl as Idl, trustedArbiter: new PublicKey(arbiter), fetchBytes });
  })();
  const lazy = Object.fromEntries(METHODS.map((m) => [m, async (...args: unknown[]) => ((await ready)[m] as (...a: unknown[]) => unknown)(...args)]));
  return { mode: 'solana', ...lazy } as unknown as Escrow;
}
```

Jeśli Metro nie importuje JSON-a spoza `app/` (monorepo `watchFolders`), dopisz do root skryptu `sync-idl` kopię do `app/src/solana/idl.json` i importuj stamtąd.

- [ ] **Krok 3: telefon (devnet)**

`app/.env`: `EXPO_PUBLIC_PAYMENTS=solana`, `EXPO_PUBLIC_RPC_URL=<Helius devnet>`, `EXPO_PUBLIC_ORACLE_PUBKEY=<klucz wyroczni>`.
- Serwer w trybie solana: `ARBITER_PUBKEY=<ten sam> PUBLIC_BASE_URL=http://<IP LAN>:4000 DATA_DIR=server/data-devnet pnpm dev:server`.
- Po zalogowaniu (A4) adres portfela jest w Portfelu.
- Przelej 0,5 SOL z portfela zespołu (`solana transfer <adres> 0.5 --url devnet --allow-unfunded-recipient`).
- Ogłoszenie opublikowane przez `cli publish` kup z telefonu i sprawdź link w Explorerze.

Gdy ekrany A jeszcze nie są gotowe, wywołaj `createSolanaEscrow().purchase(...)` z tymczasowego przycisku w `DevSheet` na swojej gałęzi (nie commituj tego).

- [ ] **Krok 4: commit + wiadomość do A**

```bash
git add app/src/solana
git commit -m "feat(app): in-app wallet in secure-store and the real SolanaEscrow"
git pull --rebase && git push
```

Napisz osobie A: „B6 na `main`; I1 gdy masz A5”, z wartościami `EXPO_PUBLIC_ORACLE_PUBKEY` i `ARBITER_PUBKEY`.

---

### Task B7: lustro serwera: reklamacja i werdykt z `/media` (do 11:30)

**Pliki:**
- Utwórz: `server/src/solana/evidence.rs`.
- Zmień: `server/src/solana/mod.rs` (`pub mod evidence;`), `server/src/solana/indexer.rs` (`apply`), `server/tests/solana.rs`.

**Interfejsy:**
- Produkuje: `deal.complaint` i `deal.analysis` (`status: "done"`, `report` = pola modelu albo `null`, `reportHash`, `model`, `promptVersion`, `verdict`) w `GET /api/deals/{id}` w trybie solana. To ten sam kształt, który w trybie demo wypełnia mock AI, więc ekran werdyktu A działa bez zmian.

- [ ] **Krok 1: test integracyjny**

W `server/tests/solana.rs`:

```rust
#[tokio::test]
async fn dispute_complaint_and_oracle_report_are_mirrored_from_media() {
    let m = market("600000").await;
    let t = now();
    let complaint = br#"{"v":1,"category":"damaged","description":"Plama na rękawie","created_at":1791050000}"#.to_vec();
    let (_, c) = m.bartek.upload_bytes(complaint, "application/json", "complaint.json").await;
    let report = serde_json::to_vec(&json!({
        "v": 1, "deal": m.deal.to_string(), "verdict": "BUYER", "decided_by": "decide", "model": "gemini-x", "prompt_version": "v2",
        "buyer_recording": { "continuous": true, "starts_with_sealed_package": true, "qr_revealed_on_opening": true, "quality": "good", "notes": "" },
        "seller_recording": { "item_clearly_visible": true, "qr_card_packed": true, "package_sealed_and_labeled": true, "quality": "good", "notes": "" },
        "package_matches_shipping_recording": true, "item_matches_listing": true,
        "undisclosed_damage": { "present": true, "description": "plama", "timestamps": ["00:41"] }, "reasoning": "Plama poza listą wad."
    })).unwrap();
    let (_, r) = m.ania.upload_bytes(report, "application/json", "report.json").await;   // any account may upload
    let to32 = |v: &Value| -> [u8; 32] { hex::decode(v["sha256"].as_str().unwrap()).unwrap().try_into().unwrap() };

    let mut disputed = m.chain(ChainStatus::Disputed, t);
    disputed.complaint_hash = to32(&c);
    disputed.unboxing_video_hash = [7; 32];
    m.rpc.put_deal(&m.deal, &disputed);
    m.notify().await;
    let (_, d) = m.bartek.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!(d["complaint"]["description"], "Plama na rękawie");
    assert!(d["analysis"].is_null());

    let mut resolved = disputed.clone();
    resolved.status = ChainStatus::ReturnRequested;
    resolved.status_changed_at = t + 5;
    resolved.verdict = ChainVerdict::Buyer;
    resolved.report_hash = to32(&r);
    m.rpc.put_deal(&m.deal, &resolved);
    m.notify().await;
    let (_, d) = m.ania.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    let a = &d["analysis"];
    assert_eq!((a["status"].clone(), a["verdict"].clone(), a["model"].clone()), (json!("done"), json!("BUYER"), json!("gemini-x")));
    assert_eq!(a["reportHash"], r["sha256"]);
    assert_eq!(a["report"]["reasoning"], "Plama poza listą wad.");
}

#[tokio::test]
async fn verdict_without_a_readable_report_still_shows_the_verdict() {
    let m = market("600000").await;
    let mut resolved = m.chain(ChainStatus::Completed, now());
    resolved.verdict = ChainVerdict::Seller;
    resolved.report_hash = [9; 32];                     // file never uploaded (or decided by evidence elsewhere)
    m.rpc.put_deal(&m.deal, &resolved);
    m.notify().await;
    let (_, d) = m.ania.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!((d["analysis"]["verdict"].clone(), d["analysis"]["report"].clone()), (json!("SELLER"), Value::Null));
    assert_eq!(d["analysis"]["reportHash"], hex::encode([9u8; 32]));
}
```

Import `ChainVerdict` (`unbox_escrow::state::Verdict as ChainVerdict`) na górze pliku, obok `ChainStatus`. `cargo test --manifest-path server/Cargo.toml --test solana`. Oczekiwane: FAIL (`complaint` = null).

- [ ] **Krok 2: `server/src/solana/evidence.rs`**

```rust
//! Fills complaint and analysis of a mirrored deal from files in /media. The chain holds only hashes;
//! a file is used only when its bytes hash to the committed value, so the server adds nothing of its own.

use crate::model::*;
use sha2::{Digest, Sha256};
use std::path::Path;
use unbox_escrow::state::{Deal as ChainDeal, Verdict as ChainVerdict};

fn committed(dir: &Path, hash: &[u8; 32]) -> Option<Vec<u8>> {
    if *hash == [0u8; 32] {
        return None;
    }
    let bytes = std::fs::read(dir.join(hex::encode(hash))).ok()?;
    (Sha256::digest(&bytes).as_slice() == hash.as_slice()).then_some(bytes)
}

pub fn enrich(media_dir: &Path, deal: &mut Deal, chain: &ChainDeal, now: Unix) {
    if deal.complaint.is_none() {
        deal.complaint = committed(media_dir, &chain.complaint_hash).and_then(|b| serde_json::from_slice(&b).ok());
    }
    let verdict = match chain.verdict {
        ChainVerdict::None => return,
        ChainVerdict::Seller => Verdict::Seller,
        ChainVerdict::Buyer => Verdict::Buyer,
    };
    if deal.analysis.as_ref().is_some_and(|a| a.report.is_some()) {
        return;
    }
    let doc: Option<serde_json::Value> = committed(media_dir, &chain.report_hash).and_then(|b| serde_json::from_slice(&b).ok());
    let text = |k: &str| doc.as_ref().and_then(|v| v[k].as_str()).map(String::from);
    deal.analysis = Some(Analysis {
        status: AnalysisStatus::Done,
        attempts: 1,
        error: None,
        // Model fields are absent when the oracle decided from missing/mismatched files alone.
        report: doc.clone().and_then(|v| serde_json::from_value(v).ok()),
        report_hash: Some(hex::encode(chain.report_hash)),
        model: text("model"),
        prompt_version: text("prompt_version"),
        verdict: Some(verdict),
        updated_at: now,
    });
}
```

W `mod.rs` dopisz `pub mod evidence;`. W `indexer.rs` `apply` przed `db::tx` dodaj `let media_dir = state.cfg.media_dir();`, a wywołanie lustra zamień na:

```rust
                if let Some(mut next) = mirror_deal(prev.as_ref(), &l, &snap, buyer, now) {
                    super::evidence::enrich(&media_dir, &mut next, chain, now);
                    db::doc_put(c, "deal", &next.id, &next)?;
                }
```

Jeśli `mirror_deal` zwraca `None` przy niezmienionym statusie, ale plik doszedł później, `enrich` zadziała przy następnej zmianie. Kolejność „najpierw upload, potem transakcja” sprawia, że plik jest pierwszy.

- [ ] **Krok 3:** `cargo test --manifest-path server/Cargo.toml && cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings && cargo fmt --manifest-path server/Cargo.toml -- --check`. Oczekiwane: PASS.

- [ ] **Krok 4: commit**

```bash
git add server/src/solana server/tests/solana.rs
git commit -m "feat(server): mirror the complaint and the oracle report from media by on-chain hashes"
```

---

### Task B8: wyrocznia czyta z `server/` `/media` i tam wysyła raport (do 13:00)

**Pliki:**
- Zmień: `oracle/src/storage.ts` (całość), `oracle/src/evidence.ts`, `oracle/src/evidence.test.ts`, `oracle/src/resolve.ts`, `oracle/.env.example`, `oracle/package.json` (usuń `@supabase/supabase-js`), `oracle/README.md`.
- Utwórz: `oracle/src/resolve.test.ts`.

**Interfejsy:**
- Produkuje:
  - `fetchBytes(ref)`, gdzie `ref` to URL albo sha256 → `${API_URL}/media/<sha>`;
  - `uploadReport(bytes) → sha256` (konto wyroczni w `server/`);
  - `shouldResolve(statusChangedAt, now, oracleTimeout) → boolean`.

- [ ] **Krok 1: testy dowodów pod adresowanie hashem**

W `oracle/src/evidence.test.ts`, w `world()`:
- zdjęcie zapisz pod `http://srv/media/${sha256Hex(photo)}`;
- metadane mają `photos: [{ url: <ten URL>, sha256 }]`, `metadataUri = "http://srv/api/listings/l-1/metadata.json"`;
- nagrania i `complaint.json` zapisz w mapie pod **kluczem = sha256 ich bajtów** (`files.set(sha256Hex(b), b)`), a `refs.*Hash` to te same hashe;
- `p` zastąp `const key = { packing: refs.packingVideoHash, unboxing: …, complaint: … }`.

Scenariusze bez zmian w sensie: „unboxing missing” usuwa klucz, „swapped” podmienia bajty pod tym samym kluczem. Dopisz: „photo swapped” podmienia bajty pod URL-em zdjęcia. Uruchom `pnpm --filter oracle test`. Oczekiwane: FAIL (`isMetadata` wymaga `path`, a `dealPaths` szuka ścieżek Supabase).

- [ ] **Krok 2: `evidence.ts`**

1. `ListingMetadata.photos: { url: string; sha256: string }[]` (kształt `server/src/model.rs`); `isMetadata` sprawdza `p.url`. `Complaint.created_at: number` (Unix w sekundach, jak `Complaint` w `@unbox/shared` i `server/src/model.rs`), a nie `string`.
2. Usuń `dealPaths`. W `collectEvidence`:

```ts
  const packing = await check(refs.packingVideoHash.toLowerCase(), "seller", refs.packingVideoHash);
  const unboxing = await check(refs.unboxingVideoHash.toLowerCase(), "buyer", refs.unboxingVideoHash);
  const complaintBytes = await check(refs.complaintHash.toLowerCase(), "buyer", refs.complaintHash);
```

   a zdjęcia: `check(photo.url, "seller", photo.sha256)` i `photos.push({ path: photo.url, bytes })`.

`pnpm --filter oracle test`. Oczekiwane: PASS dla `evidence.test.ts`.

- [ ] **Krok 3: `storage.ts` (całość)**

```ts
// Evidence and reports live in server/ /media, addressed by sha256 (CLAUDE.md §6).
import type { FetchBytes } from "./evidence.ts";

const api = () => {
  const url = process.env.API_URL?.replace(/\/$/, "");
  if (!url) throw new Error("missing env API_URL (server/, e.g. http://localhost:4000)");
  return url;
};
export const mediaUrl = (sha: string) => `${api()}/media/${sha.toLowerCase()}`;

// null only when the file definitely is not there (404, or 400 for a non-hash like the all-zero hash).
// Network/server errors throw, so a flaky connection is never mistaken for missing evidence.
export const fetchBytes: FetchBytes = async (ref) => {
  const res = await fetch(ref.startsWith("http") ? ref : mediaUrl(ref));
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`GET ${ref}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

let token: string | null = null;
async function signIn(): Promise<string> {
  const email = process.env.ORACLE_API_EMAIL ?? "wyrocznia@unbox.local";
  const password = process.env.ORACLE_API_PASSWORD;
  if (!password) throw new Error("missing env ORACLE_API_PASSWORD");
  const post = (path: string, body: unknown) =>
    fetch(`${api()}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let res = await post("/api/auth/login", { email, password });
  if (res.status === 401) res = await post("/api/auth/register", { email, password, name: "Wyrocznia" });
  if (!res.ok) throw new Error(`oracle account: HTTP ${res.status} ${await res.text()}`);
  return ((await res.json()) as { token: string }).token;
}

/** Uploads report.json; returns the server's sha256, which must equal ours (checked by the caller). */
export async function uploadReport(bytes: Uint8Array): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    token ??= await signIn();
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/json" }), "report.json");
    const res = await fetch(`${api()}/api/media`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    if (res.status === 401) { token = null; continue; }
    if (!res.ok) throw new Error(`POST /api/media: HTTP ${res.status} ${await res.text()}`);
    return ((await res.json()) as { sha256: string }).sha256;
  }
  throw new Error("POST /api/media: unauthorized after re-login");
}
```

- [ ] **Krok 4: `resolve.ts` + test bramki czasu (Review Focus 5)**

`oracle/src/resolve.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldResolve } from "./resolve.ts";

test("no resolve_dispute in the last 30 s before ORACLE_TIMEOUT or after it", () => {
  assert.equal(shouldResolve(1000, 1000 + 600 - 31, 600), true);
  assert.equal(shouldResolve(1000, 1000 + 600 - 30, 600), false);
  assert.equal(shouldResolve(1000, 1000 + 601, 600), false);
});
```

W `resolve.ts`:
- `export const shouldResolve = (changedAt: number, now: number, timeout: number) => changedAt + timeout - now > DEADLINE_MARGIN_S;`, a `secondsLeft`/oba warunki zastąp wywołaniem `shouldResolve(d.account.statusChangedAt.toNumber(), Math.floor(Date.now() / 1000), timeouts().oracle)`;
- usuń gałąź „reusing existing report.json” i `parseExistingVerdict`; przy adresowaniu hashem nie ma czego szukać po deal, a ponowienie po nieudanym `resolve_dispute` po prostu tworzy nowy raport;
- po zbudowaniu `bytes`:

```ts
    const stored = await uploadReport(bytes);
    if (stored !== sha256Hex(bytes)) throw new Error(`report upload hash mismatch: ${stored} vs ${sha256Hex(bytes)}`);
```

  i dalej `chain.resolveDispute(d, verdict, sha256(bytes))`.

- [ ] **Krok 5: env i zależności**

`oracle/.env.example`: usuń sekcję Supabase i dopisz:

```
# server/ (evidence in /media, report upload as the oracle account)
API_URL=http://localhost:4000
ORACLE_API_EMAIL=wyrocznia@unbox.local
ORACLE_API_PASSWORD=
```

`pnpm --filter oracle remove @supabase/supabase-js` (na hoście). W `oracle/README.md` podmień opis storage.

`pnpm --filter oracle test && pnpm --filter oracle typecheck`. Oczekiwane: PASS. Potem `pnpm --filter oracle fixture <katalog fixture>`: werdykty jak przed zmianą (fixture czyta pliki lokalne).

- [ ] **Krok 6: commit**

```bash
git add oracle pnpm-lock.yaml
git commit -m "feat(oracle): evidence and report.json through server media instead of Supabase"
```

---

### I1 i I2: z osobą A

- [ ] **I1 (~11:00):**
  1. Serwer w trybie solana (`ARBITER_PUBKEY`, `PUBLIC_BASE_URL` na IP z LAN, osobny `DATA_DIR`).
  2. Oba telefony z `EXPO_PUBLIC_PAYMENTS=solana`, zasilone z portfela zespołu.
  3. Ania wystawia → Bartek kupuje → Ania nadaje → Bartek „Wszystko OK”. Sygnatury `create_listing`, `purchase`, `mark_shipped` i `accept_delivery` w Explorerze.
  4. „Odbierz środki” na transakcji w `Paid` po `SHIP_TIMEOUT` (scena C).
- [ ] **I2 (~15:00):**
  1. `pnpm --filter oracle dev` z `API_URL` na ten sam serwer.
  2. Spór z telefonu → `resolve_dispute` w Explorerze → werdykt w aplikacji (B7) → zwrot → `confirm_return` → `Refunded`.
- [ ] **Staging demo:** transakcja A w `Shipped` (< 60 min przed prezentacją) i transakcja C w `Paid` z minionym terminem, przygotowane z telefonów albo przez `cli`.
- [ ] Błąd po stronie ekranów zgłaszasz A. Nie naprawiasz go w `app/` poza `app/src/solana/`.

## Definition of Done

- [ ] `pnpm test:program` zielony (`unbox_escrow`, `dispute`, `escrow-client`), w programie brak `NotImplemented`, deploy na devnecie z profilem `demo`.
- [ ] `node --import tsx --test app/src/solana/*.test.ts` zielony.
- [ ] `cargo test` i `clippy` zielone w `server/` i `cli/`.
- [ ] `pnpm --filter oracle test` i `typecheck` zielone; wyrocznia nie zależy od Supabase.
- [ ] I1 i I2 przeszły na 2 telefonach, a linki do Explorera są zapisane dla O6 (README i pitch).

## Prompt startowy dla Twojego agenta

```
Pracujesz w repo unboxproof (HackYeah 2026). Przeczytaj CLAUDE.md (§2, §4, §5, §6),
server/README.md (tryb solana) i docs/superpowers/plans/2026-10-04-b-escrow-chain.md.
Jesteś osobą B: płatności i łańcuch. Realizuj B0–B8 po kolei, z testami i commitami z planu;
B0 jako pierwsze i od razu push, bo osoba A na nie czeka. Nie edytujesz plików osoby A
(app/** poza app/src/solana/**, server/src/** poza server/src/solana/** i jedną linią allowed_mime w B0,
packages/shared/src poza escrow.ts). Program testujesz w dev containerze (pnpm test:program),
pnpm install tylko na hoście. Deploy tylko przez pnpm deploy:devnet.
```

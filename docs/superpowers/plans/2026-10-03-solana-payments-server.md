# Pipeline płatności SOL: program `unbox_escrow` + `server/` (Rust) w trybie `PAYMENTS=solana` — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Po akceptacji skopiuj ten plik do `docs/superpowers/plans/2026-10-03-solana-payments-server.md` (pierwszy commit wykonania).

> **Podział wykonania (2026-10-03):** Osoba 1 wykonuje Task 1, 2, 3, 9 oraz Task 10 kroki 1, 3, 4, 5, 6 (gałęzie `feat/solana-payments` → `feat/solana-program`). Taski 4–8 i Task 10 krok 2 (`server/`, `scripts/`) robi inna osoba na `feat/solana-server`. Po Task 1 `state.rs`, `constants.rs` i sygnatury `logic.rs` są zamrożone (zależy od nich `server/`). E2E (Task 10 krok 4) dopiero po merge'u `feat/solana-server`.

**Goal:** Pełny przepływ w SOL na devnecie, od wystawienia przez płatność do escrow, nadanie i odbiór, aż po wypłatę. Rustowy `server/` z `main` przestaje być źródłem prawdy o pieniądzach; webhook Helius i poller wpisują do jego SQLite stan odczytany z programu.

**Architecture:**
- **Program `unbox_escrow`** trzyma SOL kupującego i egzekwuje reguły (CLAUDE.md §2). Każdą transakcję podpisuje portfel w aplikacji albo, do testów, `unbox-cli` z pliku keypaira.
- **`server/`** (axum + SQLite) dostaje tryb `PAYMENTS=solana`, domyślny. W tym trybie:
  - zostają konta i login (Ania, Bartek), treść ogłoszeń, media i widoki;
  - użytkownik zapisuje w profilu adres portfela;
  - publikacja ogłoszenia zwraca argumenty `create_listing` i serwuje `metadata.json` o bajtach równych `listing_hash`;
  - webhook Helius (oraz poller co 5 s jako zapas) to tylko sygnał; serwer czyta konta `Deal` przez RPC i odbija ich stan w dokumentach `listing`/`deal`;
  - ledger, `sweep`, akcje REST (`purchase`/`ship`/…) i własne rozstrzyganie sporów są w tym trybie wyłączone.
- **Spory** rozstrzyga wyrocznia O5 (`oracle/`), która już woła `resolve_dispute` i `settle_expired`.
- **Tryb `PAYMENTS=demo`** zostaje bez zmian, żeby testy kolegi (17 Rust, 11 kontraktu) przechodziły i żeby było awaryjne demo offline.

**Tech Stack:**

| Warstwa | Wybór |
|---|---|
| Program | Anchor 1.1.2, Rust 1.95 |
| Testy programu | `@anchor-lang/core` 1.1.2 + `node:test` na Surfpoolu |
| Server | axum 0.8, rusqlite, reqwest (rustls), base64, crate `unbox_escrow` (`no-entrypoint`) i `anchor-lang` =1.1.2 do dekodowania kont |
| CLI | `anchor-client` =1.1.2, `solana-keypair` 3.0.1, clap 4 |

**Spec:**
- `CLAUDE.md` (§2, §3 kroki 1–7, §4, §6, §7), `docs/zadania/README.md` (konwencje, wektory QR), `docs/zadania/1-program.md` (interfejs instrukcji);
- `server/README.md` na `main` (kontrakt REST kolegi);
- decyzje z tej sesji:
  - tryb `PAYMENTS=solana` w `server/`, domyślny;
  - ceny w SOL (lamporty), bo „w SOL musi to działać”;
  - login i adres portfela w profilu;
  - spory rozstrzyga wyrocznia O5 on-chain;
  - Helius webhook + polling.

## Context

Kolega przepisał backend na Rust (`server/`, PR #1 zmergowany do `main` 3.10 23:07):
- auth JWT, ogłoszenia, transakcje, media, wywołania AI;
- demo-ledger w PLN; backend sam zmienia stan i sam aplikuje werdykt, „bez blockchaina”.

To łamie zasadę nr 1 z CLAUDE.md §2. Do tego wyrocznia O5 na `main` rozmawia już z programem bezpośrednio, ale program to wciąż pusty stub.

Ten plan robi trzy rzeczy:
1. **Faza A:** minimum programu, czyli IDL v0, płatność, nadanie, odbiór, anulowanie i `settle_expired`.
2. **Faza B:** podłączenie `server/` do łańcucha.
3. **Faza C:** CLI do demo bez telefonu, dokumentacja i E2E na devnecie.

Dane demo (Ania sprzedaje, Bartek kupuje, kurtka Levi's, sukienka Zara, Nike) zostają z seeda, z cenami w SOL.

## Global Constraints

- Tylko devnet/localnet. Żadnych kluczy, `.env` ani keypairów w gicie (`.gitignore` ma `**/keys/`, `*-keypair.json`, `.env*`).
- W `PAYMENTS=solana` **serwer nie podpisuje transakcji, nie ma klucza i nie zmienia stanu pieniędzy**. Status i kwoty transakcji pochodzą wyłącznie z kont `Deal`. Pola akcji w API to podpowiedzi UI.
- Payload webhooka nie jest zaufany. Brane są z niego tylko adresy znanych PDA ogłoszeń, a stan zawsze czytany jest z RPC.
- `PAYMENTS=demo` musi zachować dotychczasowe zachowanie 1:1:
  - `cargo test` w `server/` i `pnpm test:contract` przechodzą;
  - harness testów i `scripts/run-contract-test.ts` ustawiają `PAYMENTS=demo`.
- Nowe pola modelu (`walletAddress`, `onchain`, `address`) mają `#[serde(default, skip_serializing_if = "Option::is_none")]`. Stare dokumenty w SQLite i odpowiedzi w trybie demo się nie zmieniają.
- **Kwoty w SOL:** `priceMinor` = lamporty, `currency = "SOL"`. Zakres `priceMinor` 1..=100 000 000 jak dotąd (≤ 0,1 SOL), bo zgadza się z `Minor` w `@unbox/shared`.
- **Ceny seeda:** kurtka 0,06 SOL, sukienka 0,03 SOL, Nike 0,09 SOL. 0,12/0,18 SOL przekroczyłyby limit `Minor` w aplikacji.
- **Anchor:** `=1.1.2` i `anchor-client =1.1.2`; `CpiContext::new(program_id: Pubkey, accounts)` (API 1.x).
- **Commitmenty on-chain:**
  - `ship = sha256(deal_pubkey || secret)`, `return = sha256("return" || deal_pubkey || secret)`;
  - wektory testowe z `docs/zadania/README.md` (sprawdzone: `53c95ae0…7977`, `5e5f3dfa…649d`);
  - payload QR: `UNBOX1:<deal_base58>:<secret_base58>`.
- **Timeouty:**
  - program: `demo` domyślnie (600/3600/600/600/600 s), `test-timeouts` po 5 s tylko do testów;
  - `server/` w `PAYMENTS=solana` liczy `deadlineAt` funkcją `unbox_escrow::logic::deadline`, więc nie ma drugiej kopii wartości.
- **Kod, commity i komentarze po angielsku; komunikaty API po polsku** (konwencja `server/`). Błędy w kształcie `{error:{code,message}}`: istniejące kody, a do tego `UPSTREAM` (502) przy awarii RPC.
- **Toolchain Rust jest tylko w dev containerze** (`unbox-dev:latest`). Montuj **całe repo**, bo `server/` zależy od `../programs/unbox_escrow`:
  `docker run --rm -it -v "$PWD":/work -w /work -v unbox-cargo-registry:/root/.cargo/registry -v $HOME/.config/solana:/root/.config/solana -p 4000:4000 unbox-dev bash`.

## Review Focus

1. **Stare albo obce konta programu na devnecie.** Gdy `Deal` się nie dekoduje (stary layout) albo PDA nie należy do żadnego ogłoszenia, indekser pomija konto z ostrzeżeniem i nie psuje pozostałych. Test: Task 8, `ignores_unknown_and_undecodable_accounts`.
2. **Webhook.**
   - Duplikaty i retry Helius dają jeden wpis na osi czasu.
   - Śmieciowy JSON zwraca 200 i `synced: 0` bez zapytań do RPC; zły sekret zwraca 401; padnięte RPC zwraca 502, żeby Helius ponowił.
   - Nieaktualny odczyt nie cofa statusu.

   Test: Task 6, `stale_snapshot_is_ignored`, `timeline_once_per_status`, oraz Task 8, `webhook_*`.
3. **Podmieniona albo niezgodna treść.** Jeśli `listing_hash` on-chain ≠ hash ogłoszenia w bazie, ogłoszenie nie trafia do „Przeglądaj”, a transakcja nie powstaje. Po publikacji treści nie da się edytować. Test: Task 7, `publish_freezes_listing`, i Task 8, `mismatched_listing_hash_is_not_mirrored`.
4. **Tryb demo nietknięty.** Wszystkie dotychczasowe testy przechodzą z `PAYMENTS=demo`. W trybie solana stare akcje REST zwracają 409 i nie ruszają stanu. Test: Task 4 (pełny `cargo test`), Task 7, `legacy_actions_rejected_in_solana_mode`.
5. **Kupujący bez podłączonego portfela albo z cudzym adresem.**
   - Transakcja i tak się pojawia: kupujący jako `wallet:<adres>`, sprzedawca ją widzi.
   - Adres portfela jest unikalny między kontami; zły adres zwraca 400.
   - `/me/wallet` bez adresu zwraca saldo 0.

   Test: Task 5, `wallet_address_*`, i Task 8, `unknown_buyer_wallet_still_mirrored`, `wallet_balance_from_chain`.

---

## Mapa plików

```
programs/unbox_escrow/            Faza A (bez zmian względem poprzedniej wersji planu)
  Cargo.toml                      MODIFY  feature test-timeouts
  src/{lib,state,constants,errors,events,logic}.rs, src/instructions/*.rs
tests/{helpers.ts,unbox_escrow.test.ts}   CREATE  testy programu
package.json (root)               MODIFY  test:program, deploy:devnet
packages/shared/idl/*             CREATE  pnpm sync-idl (oracle czyta IDL stąd)

server/Cargo.toml                 MODIFY  + unbox_escrow (path), anchor-lang, base64
server/.env.example, server/README.md   MODIFY  PAYMENTS, RPC_URL, ARBITER_PUBKEY, WEBHOOK_SECRET, SOLANA_POLL_MS
server/src/config.rs              MODIFY  PaymentsMode, SolanaConfig
server/src/state.rs               MODIFY  chain: Option<Arc<RpcChain>>, chain_sync
server/src/model.rs               MODIFY  User.wallet_address, Listing.onchain, Deal.onchain, Wallet.address
server/src/db.rs                  MODIFY  user_by_wallet, user_update
server/src/error.rs               MODIFY  ApiError::upstream
server/src/seed.rs                MODIFY  SOL w trybie solana, bez top_up
server/src/deals.rs               MODIFY  brak lazy-expire w trybie solana
server/src/lib.rs                 MODIFY  pub mod solana; spawn_background zależny od trybu
server/src/routes.rs              MODIFY  wallet-address, publish, metadata.json, chain sync, webhook, blokady akcji
server/src/machine.rs             MODIFY  tylko literał Deal w testach (onchain: None)
server/src/solana/mod.rs          CREATE  explorer_tx_url, demo_only
server/src/solana/chain.rs        CREATE  RpcChain (JSON-RPC: accounts, program accounts, signatures, balance)
server/src/solana/mirror.rs       CREATE  czyste mapowanie Deal on-chain → model Deal (+ testy)
server/src/solana/indexer.rs      CREATE  sync_addresses / sync_all → SQLite
server/src/solana/webhook.rs      CREATE  candidate_keys + handler
server/tests/common/mod.rs        MODIFY  PAYMENTS=demo w harnessie, pub mod fake_rpc
server/tests/common/fake_rpc.rs   CREATE  fałszywe RPC Solany (axum) + builder konta Deal
server/tests/wallet_address.rs    CREATE
server/tests/solana.rs            CREATE  publikacja, lustro, webhook, poller, saldo
scripts/run-contract-test.ts      MODIFY  PAYMENTS=demo
cli/Cargo.toml, cli/src/{main,qr}.rs    CREATE  unbox-cli (osobny [workspace], jak server/)
.devcontainer/devcontainer.json   MODIFY  forwardPorts += 4000
CLAUDE.md                         MODIFY  §2, §4, §6, §7, §13
```

## Faza A — program `unbox_escrow` (minimum dla pipeline'u)

### Task 1: Stan, stałe, błędy, eventy i czysta logika

**Files:**
- Modify: `programs/unbox_escrow/Cargo.toml` (sekcja `[features]`)
- Modify: `programs/unbox_escrow/src/lib.rs`
- Create: `programs/unbox_escrow/src/{constants,state,errors,events,logic}.rs`

**Interfaces:**
- Produces (używa Task 2–3 i backend):
  - `constants::{DEAL_SEED, MAX_METADATA_URI_LEN, MAX_TRACKING_LEN, SHIP_TIMEOUT, UNBOX_TIMEOUT, ORACLE_TIMEOUT, RETURN_SHIP_TIMEOUT, RETURN_CONFIRM_TIMEOUT, TIMEOUT_PROFILE: &str}`
  - `state::{Deal, DealStatus, Verdict, STATUS_OFFSET}`, `Deal::set_status(&mut self, deal: Pubkey, to: DealStatus, now: i64)`
  - `errors::UnboxError`, `events::DealStatusChanged { deal, from, to, at }`
  - `logic::{ship_commitment(&Pubkey, &[u8;32]) -> [u8;32], return_commitment(..) -> [u8;32], timeout_for(DealStatus) -> Option<i64>, deadline(DealStatus, i64) -> Option<i64>, Payee, expiry_outcome(DealStatus) -> Option<(DealStatus, Payee)>, require_before_deadline(&Deal, i64) -> Result<()>, require_hash(&[u8;32]) -> Result<()>, require_text(&str, usize) -> Result<()>}`

- [ ] **Step 1: Dodaj feature `test-timeouts`** w `programs/unbox_escrow/Cargo.toml`, w `[features]` pod `demo = []`:

```toml
test-timeouts = []
```

- [ ] **Step 2: Napisz deklaracje (bez logiki)**

`programs/unbox_escrow/src/constants.rs`:
```rust
pub const DEAL_SEED: &[u8] = b"deal";
pub const MAX_METADATA_URI_LEN: usize = 200;
pub const MAX_TRACKING_LEN: usize = 32;

// Seconds. `test-timeouts` wins over `demo`; with neither, production values apply.
#[cfg(feature = "test-timeouts")]
mod timeouts {
    pub const PROFILE: &str = "test";
    pub const SHIP: i64 = 5;
    pub const UNBOX: i64 = 5;
    pub const ORACLE: i64 = 5;
    pub const RETURN_SHIP: i64 = 5;
    pub const RETURN_CONFIRM: i64 = 5;
}

#[cfg(all(feature = "demo", not(feature = "test-timeouts")))]
mod timeouts {
    pub const PROFILE: &str = "demo";
    pub const SHIP: i64 = 10 * 60;
    pub const UNBOX: i64 = 60 * 60;
    pub const ORACLE: i64 = 10 * 60;
    pub const RETURN_SHIP: i64 = 10 * 60;
    pub const RETURN_CONFIRM: i64 = 10 * 60;
}

#[cfg(not(any(feature = "demo", feature = "test-timeouts")))]
mod timeouts {
    const DAY: i64 = 24 * 60 * 60;
    pub const PROFILE: &str = "prod";
    pub const SHIP: i64 = 3 * DAY;
    pub const UNBOX: i64 = 7 * DAY;
    pub const ORACLE: i64 = DAY;
    pub const RETURN_SHIP: i64 = 3 * DAY;
    pub const RETURN_CONFIRM: i64 = 7 * DAY;
}

pub const TIMEOUT_PROFILE: &str = timeouts::PROFILE;
pub const SHIP_TIMEOUT: i64 = timeouts::SHIP;
pub const UNBOX_TIMEOUT: i64 = timeouts::UNBOX;
pub const ORACLE_TIMEOUT: i64 = timeouts::ORACLE;
pub const RETURN_SHIP_TIMEOUT: i64 = timeouts::RETURN_SHIP;
pub const RETURN_CONFIRM_TIMEOUT: i64 = timeouts::RETURN_CONFIRM;
```

`programs/unbox_escrow/src/events.rs`:
```rust
use anchor_lang::prelude::*;

use crate::state::DealStatus;

#[event]
pub struct DealStatusChanged {
    pub deal: Pubkey,
    pub from: DealStatus,
    pub to: DealStatus,
    pub at: i64,
}
```

`programs/unbox_escrow/src/errors.rs`:
```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum UnboxError {
    #[msg("Action not allowed in the current status")]
    InvalidStatus,
    #[msg("Signer is not allowed to perform this action")]
    Unauthorized,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Buyer and seller must be different")]
    SameParty,
    #[msg("Listing hash does not match")]
    ListingHashMismatch,
    #[msg("Arbiter does not match")]
    ArbiterMismatch,
    #[msg("QR secret does not match the commitment")]
    QrMismatch,
    #[msg("Verdict must be Seller or Buyer")]
    InvalidVerdict,
    #[msg("Text is too long")]
    StringTooLong,
    #[msg("Text must not be empty")]
    EmptyText,
    #[msg("Hash must not be empty")]
    EmptyHash,
    #[msg("Not implemented yet")]
    NotImplemented,
}
```

`programs/unbox_escrow/src/state.rs`:
```rust
use anchor_lang::prelude::*;

use crate::events::DealStatusChanged;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum DealStatus {
    Listed,
    Paid,
    Shipped,
    Disputed,
    ReturnRequested,
    Returning,
    Completed,
    Refunded,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum Verdict {
    None,
    Seller,
    Buyer,
}

/// One account per listing; it also holds the escrowed lamports.
/// Strings are last so `status` sits at a fixed offset (STATUS_OFFSET) for memcmp filters.
#[account]
#[derive(InitSpace, Debug)]
pub struct Deal {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub arbiter: Pubkey,
    pub deal_id: u64,
    pub price_lamports: u64,
    pub listing_hash: [u8; 32],
    pub status: DealStatus,
    pub status_changed_at: i64,
    pub qr_commitment: [u8; 32],
    pub packing_video_hash: [u8; 32],
    pub unboxing_video_hash: [u8; 32],
    pub complaint_hash: [u8; 32],
    pub verdict: Verdict,
    pub report_hash: [u8; 32],
    pub return_qr_commitment: [u8; 32],
    pub return_video_hash: [u8; 32],
    pub bump: u8,
    #[max_len(200)]
    pub metadata_uri: String,
    #[max_len(32)]
    pub tracking_number: String,
    #[max_len(32)]
    pub return_tracking_number: String,
}

/// 8-byte discriminator + seller, buyer, arbiter + deal_id, price_lamports + listing_hash.
pub const STATUS_OFFSET: usize = 8 + 32 * 3 + 8 * 2 + 32;

impl Deal {
    /// The only way to change status, so deadlines (`status_changed_at`) and the event never drift.
    pub fn set_status(&mut self, deal: Pubkey, to: DealStatus, now: i64) {
        let from = self.status;
        self.status = to;
        self.status_changed_at = now;
        emit!(DealStatusChanged { deal, from, to, at: now });
    }
}
```

`programs/unbox_escrow/src/lib.rs` (na razie bez instrukcji):
```rust
use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod logic;
pub mod state;

declare_id!("CEoTTEq46mxFrNqPu9EbpFbDshsrSTZV9GB14XPT1Nyq");

#[program]
pub mod unbox_escrow {}
```

- [ ] **Step 3: Napisz testy logiki** w `programs/unbox_escrow/src/logic.rs`. Na początek same sygnatury z `todo!()` plus testy:

```rust
use anchor_lang::prelude::*;

use crate::state::{Deal, DealStatus};

pub fn ship_commitment(_deal: &Pubkey, _secret: &[u8; 32]) -> [u8; 32] { todo!() }
pub fn return_commitment(_deal: &Pubkey, _secret: &[u8; 32]) -> [u8; 32] { todo!() }
pub fn timeout_for(_status: DealStatus) -> Option<i64> { todo!() }
pub fn deadline(_status: DealStatus, _changed_at: i64) -> Option<i64> { todo!() }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Payee { Seller, Buyer, Nobody }

pub fn expiry_outcome(_status: DealStatus) -> Option<(DealStatus, Payee)> { todo!() }
pub fn require_before_deadline(_deal: &Deal, _now: i64) -> Result<()> { todo!() }
pub fn require_hash(_hash: &[u8; 32]) -> Result<()> { todo!() }
pub fn require_text(_text: &str, _max: usize) -> Result<()> { todo!() }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::*;

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    // Vectors from docs/zadania/README.md: deal = bytes 1..=32, secret = 32 x 0xab.
    fn vector_deal() -> Pubkey {
        let mut bytes = [0u8; 32];
        for (i, b) in bytes.iter_mut().enumerate() {
            *b = i as u8 + 1;
        }
        Pubkey::new_from_array(bytes)
    }

    #[test]
    fn vector_deal_base58() {
        assert_eq!(vector_deal().to_string(), "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw");
    }

    #[test]
    fn ship_commitment_matches_vector() {
        assert_eq!(
            hex(&ship_commitment(&vector_deal(), &[0xab; 32])),
            "53c95ae0a78bfd76222068846946ee779ca3d184074836c3586cd0fa91ff7977"
        );
    }

    #[test]
    fn return_commitment_matches_vector() {
        assert_eq!(
            hex(&return_commitment(&vector_deal(), &[0xab; 32])),
            "5e5f3dfadff170096733860b3fb82e2ce226c81a8103a67fc0bb850fff1b649d"
        );
    }

    #[test]
    fn deadline_only_for_timed_statuses() {
        assert_eq!(deadline(DealStatus::Paid, 100), Some(100 + SHIP_TIMEOUT));
        assert_eq!(deadline(DealStatus::Shipped, 100), Some(100 + UNBOX_TIMEOUT));
        assert_eq!(deadline(DealStatus::Disputed, 100), Some(100 + ORACLE_TIMEOUT));
        assert_eq!(deadline(DealStatus::ReturnRequested, 100), Some(100 + RETURN_SHIP_TIMEOUT));
        assert_eq!(deadline(DealStatus::Returning, 100), Some(100 + RETURN_CONFIRM_TIMEOUT));
        for s in [DealStatus::Listed, DealStatus::Completed, DealStatus::Refunded, DealStatus::Cancelled] {
            assert_eq!(deadline(s, 100), None);
        }
    }

    #[test]
    fn expiry_outcome_follows_claude_md_table() {
        use DealStatus::*;
        assert_eq!(expiry_outcome(Paid), Some((Refunded, Payee::Buyer)));
        assert_eq!(expiry_outcome(Shipped), Some((Completed, Payee::Seller)));
        assert_eq!(expiry_outcome(Disputed), Some((ReturnRequested, Payee::Nobody)));
        assert_eq!(expiry_outcome(ReturnRequested), Some((Completed, Payee::Seller)));
        assert_eq!(expiry_outcome(Returning), Some((Refunded, Payee::Buyer)));
        for s in [Listed, Completed, Refunded, Cancelled] {
            assert_eq!(expiry_outcome(s), None);
        }
    }

    #[test]
    fn deadline_boundary_is_exclusive_for_parties() {
        let mut deal = sample_deal();
        deal.status = DealStatus::Paid;
        deal.status_changed_at = 1_000;
        assert!(require_before_deadline(&deal, 1_000 + SHIP_TIMEOUT - 1).is_ok());
        assert!(require_before_deadline(&deal, 1_000 + SHIP_TIMEOUT).is_err());
        deal.status = DealStatus::Listed;
        assert!(require_before_deadline(&deal, 0).is_err());
    }

    #[test]
    fn hash_and_text_guards() {
        assert!(require_hash(&[0u8; 32]).is_err());
        assert!(require_hash(&[1u8; 32]).is_ok());
        assert!(require_text("", 32).is_err());
        assert!(require_text(&"x".repeat(33), 32).is_err());
        assert!(require_text("INPOST123", 32).is_ok());
    }

    #[cfg(all(feature = "demo", not(feature = "test-timeouts")))]
    #[test]
    fn demo_profile_values() {
        assert_eq!(TIMEOUT_PROFILE, "demo");
        assert_eq!((SHIP_TIMEOUT, UNBOX_TIMEOUT, ORACLE_TIMEOUT), (600, 3600, 600));
        assert_eq!((RETURN_SHIP_TIMEOUT, RETURN_CONFIRM_TIMEOUT), (600, 600));
    }

    fn sample_deal() -> Deal {
        Deal {
            seller: Pubkey::new_unique(),
            buyer: Pubkey::default(),
            arbiter: Pubkey::new_unique(),
            deal_id: 1,
            price_lamports: 1,
            listing_hash: [1; 32],
            status: DealStatus::Listed,
            status_changed_at: 0,
            qr_commitment: [0; 32],
            packing_video_hash: [0; 32],
            unboxing_video_hash: [0; 32],
            complaint_hash: [0; 32],
            verdict: crate::state::Verdict::None,
            report_hash: [0; 32],
            return_qr_commitment: [0; 32],
            return_video_hash: [0; 32],
            bump: 255,
            metadata_uri: String::new(),
            tracking_number: String::new(),
            return_tracking_number: String::new(),
        }
    }
}
```

- [ ] **Step 4: Sprawdź, że testy nie przechodzą.** W kontenerze: `cargo test -p unbox_escrow --lib`. Oczekiwany wynik: FAIL (panic `not yet implemented`).

- [ ] **Step 5: Zaimplementuj logikę.** Podmień sygnatury z `todo!()` w `logic.rs` (moduł testów zostaje bez zmian):

```rust
use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::constants::*;
use crate::errors::UnboxError;
use crate::state::{Deal, DealStatus};

/// Shipping QR commitment: sha256(deal_pubkey || secret).
pub fn ship_commitment(deal: &Pubkey, secret: &[u8; 32]) -> [u8; 32] {
    hashv(&[deal.as_ref(), &secret[..]]).to_bytes()
}

/// Return QR commitment: sha256("return" || deal_pubkey || secret); the prefix separates it from shipping.
pub fn return_commitment(deal: &Pubkey, secret: &[u8; 32]) -> [u8; 32] {
    hashv(&[b"return", deal.as_ref(), &secret[..]]).to_bytes()
}

pub fn timeout_for(status: DealStatus) -> Option<i64> {
    match status {
        DealStatus::Paid => Some(SHIP_TIMEOUT),
        DealStatus::Shipped => Some(UNBOX_TIMEOUT),
        DealStatus::Disputed => Some(ORACLE_TIMEOUT),
        DealStatus::ReturnRequested => Some(RETURN_SHIP_TIMEOUT),
        DealStatus::Returning => Some(RETURN_CONFIRM_TIMEOUT),
        DealStatus::Listed | DealStatus::Completed | DealStatus::Refunded | DealStatus::Cancelled => None,
    }
}

pub fn deadline(status: DealStatus, changed_at: i64) -> Option<i64> {
    timeout_for(status).map(|t| changed_at + t)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Payee {
    Seller,
    Buyer,
    Nobody,
}

/// What `settle_expired` does after the deadline (CLAUDE.md §4). Anyone may trigger it.
pub fn expiry_outcome(status: DealStatus) -> Option<(DealStatus, Payee)> {
    match status {
        DealStatus::Paid => Some((DealStatus::Refunded, Payee::Buyer)),
        DealStatus::Shipped => Some((DealStatus::Completed, Payee::Seller)),
        DealStatus::Disputed => Some((DealStatus::ReturnRequested, Payee::Nobody)),
        DealStatus::ReturnRequested => Some((DealStatus::Completed, Payee::Seller)),
        DealStatus::Returning => Some((DealStatus::Refunded, Payee::Buyer)),
        _ => None,
    }
}

/// Party actions need `now < deadline`; `settle_expired` needs `now >= deadline`, so there is no race.
pub fn require_before_deadline(deal: &Deal, now: i64) -> Result<()> {
    let end = deadline(deal.status, deal.status_changed_at).ok_or(error!(UnboxError::InvalidStatus))?;
    require!(now < end, UnboxError::DeadlinePassed);
    Ok(())
}

pub fn require_hash(hash: &[u8; 32]) -> Result<()> {
    require!(*hash != [0u8; 32], UnboxError::EmptyHash);
    Ok(())
}

pub fn require_text(text: &str, max: usize) -> Result<()> {
    require!(!text.is_empty(), UnboxError::EmptyText);
    require!(text.len() <= max, UnboxError::StringTooLong);
    Ok(())
}
```

- [ ] **Step 6: Uruchom testy i build.** `cargo test -p unbox_escrow --lib` daje 8 passed. `anchor build` przechodzi.
- [ ] **Step 7: Commit**

```bash
git add programs/unbox_escrow
git commit -m "feat(program): deal state, timeouts, QR commitments and expiry rules"
```

### Task 2: IDL v0 + `create_listing`, `cancel_listing`, `purchase`

**Files:**
- Create: `programs/unbox_escrow/src/instructions/mod.rs` i 10 plików instrukcji
- Modify: `programs/unbox_escrow/src/lib.rs`, root `package.json` (skrypty)
- Create: `tests/helpers.ts`, `tests/unbox_escrow.test.ts`, `packages/shared/idl/*` (przez `pnpm sync-idl`)

**Interfaces:**
- Consumes: wszystko z Task 1.
- Produces:
  - instrukcje i konta z tabeli w `docs/zadania/1-program.md`; nazwy kont: `seller`, `buyer`, `arbiter`, `caller`, `deal`, `system_program`;
  - wypłacane strony to `UncheckedAccount` z `has_one`;
  - handlery `handle_<instrukcja>`;
  - TS: `tests/helpers.ts` eksportuje `program, connection, funded, dealPda, sha256, bytes32, sleep, statusOf, anchorCode, createListed, createPaid`.

- [ ] **Step 1: Helpery testów** — `tests/helpers.ts`:

```ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as anchor from "@anchor-lang/core";
import type { UnboxEscrow } from "../target/types/unbox_escrow";

export const { Keypair, PublicKey, LAMPORTS_PER_SOL } = anchor.web3;
export type Kp = anchor.web3.Keypair;
type Pk = anchor.web3.PublicKey;

const env = anchor.AnchorProvider.env();
export const provider = new anchor.AnchorProvider(env.connection, env.wallet, {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});
anchor.setProvider(provider);
export const program = anchor.workspace.UnboxEscrow as anchor.Program<UnboxEscrow>;
export const connection = provider.connection;

export const sha256 = (...parts: Uint8Array[]) => createHash("sha256").update(Buffer.concat(parts)).digest();
export const bytes32 = (b: Uint8Array) => Array.from(b);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const statusOf = (deal: { status: object }) => Object.keys(deal.status)[0];

/** Matcher for assert.rejects: the Anchor error code (e.g. "QrMismatch"). */
export const anchorCode = (code: string) => (e: any) => {
  assert.equal(e?.error?.errorCode?.code, code, String(e));
  return true;
};

export async function funded(sol = 5): Promise<Kp> {
  const kp = Keypair.generate();
  const signature = await connection.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction({ signature, ...(await connection.getLatestBlockhash()) }, "confirmed");
  return kp;
}

export const dealPda = (seller: Pk, dealId: anchor.BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), seller.toBuffer(), dealId.toArrayLike(Buffer, "le", 8)],
    program.programId,
  )[0];

let nextId = Date.now();
export interface Listed { seller: Kp; arbiter: Kp; deal: Pk; dealId: anchor.BN; listingHash: Buffer; price: anchor.BN }

export async function createListed(price = new anchor.BN(LAMPORTS_PER_SOL / 10)): Promise<Listed> {
  const seller = await funded();
  const arbiter = Keypair.generate();
  const dealId = new anchor.BN(nextId++);
  const deal = dealPda(seller.publicKey, dealId);
  const listingHash = sha256(Buffer.from(`listing-${dealId}`));
  await program.methods
    .createListing(dealId, price, bytes32(listingHash), `https://example.com/listings/${deal}/metadata.json`, arbiter.publicKey)
    .accountsPartial({ seller: seller.publicKey, deal })
    .signers([seller])
    .rpc();
  return { seller, arbiter, deal, dealId, listingHash, price };
}

export async function createPaid(): Promise<Listed & { buyer: Kp }> {
  const l = await createListed();
  const buyer = await funded();
  await program.methods
    .purchase(bytes32(l.listingHash), l.arbiter.publicKey)
    .accountsPartial({ buyer: buyer.publicKey, deal: l.deal })
    .signers([buyer])
    .rpc();
  return { ...l, buyer };
}
```

- [ ] **Step 2: Testy wystawienia i zakupu** — `tests/unbox_escrow.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as anchor from "@anchor-lang/core";
import {
  Keypair, anchorCode, bytes32, connection, createListed, dealPda, funded, program, sha256, statusOf,
} from "./helpers";

const buy = (l: { deal: anchor.web3.PublicKey }, who: anchor.web3.Keypair, hash: Uint8Array, arbiter: anchor.web3.PublicKey) =>
  program.methods.purchase(bytes32(hash), arbiter).accountsPartial({ buyer: who.publicKey, deal: l.deal }).signers([who]).rpc();

describe("listing and purchase", () => {
  it("create_listing stores the listing", async () => {
    const l = await createListed();
    const deal = await program.account.deal.fetch(l.deal);
    assert.equal(statusOf(deal), "listed");
    assert.ok(deal.seller.equals(l.seller.publicKey));
    assert.ok(deal.arbiter.equals(l.arbiter.publicKey));
    assert.equal(deal.priceLamports.toString(), l.price.toString());
    assert.deepEqual(Buffer.from(deal.listingHash), l.listingHash);
  });

  it("create_listing rejects price 0", async () => {
    const seller = await funded();
    const dealId = new anchor.BN(1);
    await assert.rejects(
      program.methods
        .createListing(dealId, new anchor.BN(0), bytes32(sha256(Buffer.from("x"))), "https://x.example/m.json", Keypair.generate().publicKey)
        .accountsPartial({ seller: seller.publicKey, deal: dealPda(seller.publicKey, dealId) })
        .signers([seller])
        .rpc(),
      anchorCode("InvalidPrice"),
    );
  });

  it("purchase moves the price into escrow", async () => {
    const l = await createListed();
    const before = await connection.getBalance(l.deal);
    const buyer = await funded();
    await buy(l, buyer, l.listingHash, l.arbiter.publicKey);
    const deal = await program.account.deal.fetch(l.deal);
    assert.equal(statusOf(deal), "paid");
    assert.ok(deal.buyer.equals(buyer.publicKey));
    assert.equal(await connection.getBalance(l.deal), before + l.price.toNumber());
  });

  it("purchase rejects the seller, a different description and a different arbiter", async () => {
    const l = await createListed();
    const buyer = await funded();
    await assert.rejects(buy(l, l.seller, l.listingHash, l.arbiter.publicKey), anchorCode("SameParty"));
    await assert.rejects(buy(l, buyer, sha256(Buffer.from("other")), l.arbiter.publicKey), anchorCode("ListingHashMismatch"));
    await assert.rejects(buy(l, buyer, l.listingHash, Keypair.generate().publicKey), anchorCode("ArbiterMismatch"));
  });

  it("cancel_listing is seller-only and blocks purchase", async () => {
    const l = await createListed();
    const stranger = await funded();
    await assert.rejects(
      program.methods.cancelListing().accountsPartial({ seller: stranger.publicKey, deal: l.deal }).signers([stranger]).rpc(),
      anchorCode("Unauthorized"),
    );
    await program.methods.cancelListing().accountsPartial({ seller: l.seller.publicKey, deal: l.deal }).signers([l.seller]).rpc();
    assert.equal(statusOf(await program.account.deal.fetch(l.deal)), "cancelled");
    await assert.rejects(buy(l, await funded(), l.listingHash, l.arbiter.publicKey), anchorCode("InvalidStatus"));
  });
});
```

- [ ] **Step 3: Skrypty w root `package.json`.** Do `"scripts"` dopisz te dwa wpisy, a `test:program` zastąp. Testy budują program z 5-sekundowymi timeoutami; deploy zawsze przebudowuje bez nich.

```json
"test:program": "anchor build -- --features test-timeouts && anchor test --skip-build",
"deploy:devnet": "anchor build && anchor deploy --provider.cluster devnet"
```

- [ ] **Step 4: Sprawdź, że testy nie przechodzą.** W kontenerze: `pnpm test:program`. Oczekiwany wynik: FAIL (`program.methods.createListing is not a function`, bo program nie ma jeszcze instrukcji).

- [ ] **Step 5: Instrukcje.** `programs/unbox_escrow/src/instructions/mod.rs`:

```rust
pub mod accept_delivery;
pub mod cancel_listing;
pub mod confirm_return;
pub mod create_listing;
pub mod mark_returned;
pub mod mark_shipped;
pub mod open_dispute;
pub mod purchase;
pub mod resolve_dispute;
pub mod settle_expired;

pub use accept_delivery::*;
pub use cancel_listing::*;
pub use confirm_return::*;
pub use create_listing::*;
pub use mark_returned::*;
pub use mark_shipped::*;
pub use open_dispute::*;
pub use purchase::*;
pub use resolve_dispute::*;
pub use settle_expired::*;
```

`instructions/create_listing.rs`:
```rust
use anchor_lang::prelude::*;

use crate::constants::{DEAL_SEED, MAX_METADATA_URI_LEN};
use crate::errors::UnboxError;
use crate::events::DealStatusChanged;
use crate::logic::{require_hash, require_text};
use crate::state::{Deal, DealStatus};

#[derive(Accounts)]
#[instruction(deal_id: u64)]
pub struct CreateListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        init,
        payer = seller,
        space = Deal::DISCRIMINATOR.len() + Deal::INIT_SPACE,
        seeds = [DEAL_SEED, seller.key().as_ref(), &deal_id.to_le_bytes()],
        bump
    )]
    pub deal: Account<'info, Deal>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_listing(
    ctx: Context<CreateListing>,
    deal_id: u64,
    price_lamports: u64,
    listing_hash: [u8; 32],
    metadata_uri: String,
    arbiter: Pubkey,
) -> Result<()> {
    require!(price_lamports > 0, UnboxError::InvalidPrice);
    require_hash(&listing_hash)?;
    require_text(&metadata_uri, MAX_METADATA_URI_LEN)?;
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &mut ctx.accounts.deal;
    deal.seller = ctx.accounts.seller.key();
    deal.arbiter = arbiter;
    deal.deal_id = deal_id;
    deal.price_lamports = price_lamports;
    deal.listing_hash = listing_hash;
    deal.metadata_uri = metadata_uri;
    deal.status = DealStatus::Listed;
    deal.status_changed_at = now;
    deal.bump = ctx.bumps.deal;
    emit!(DealStatusChanged { deal: key, from: DealStatus::Listed, to: DealStatus::Listed, at: now });
    Ok(())
}
```

`instructions/cancel_listing.rs`:
```rust
use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::{Deal, DealStatus};

#[derive(Accounts)]
pub struct CancelListing<'info> {
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handle_cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
    require!(ctx.accounts.deal.status == DealStatus::Listed, UnboxError::InvalidStatus);
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    ctx.accounts.deal.set_status(key, DealStatus::Cancelled, now);
    Ok(())
}
```

`instructions/purchase.rs`:
```rust
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::{Deal, DealStatus};

#[derive(Accounts)]
pub struct Purchase<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump
    )]
    pub deal: Account<'info, Deal>,
    pub system_program: Program<'info, System>,
}

pub fn handle_purchase(ctx: Context<Purchase>, expected_listing_hash: [u8; 32], expected_arbiter: Pubkey) -> Result<()> {
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Listed, UnboxError::InvalidStatus);
    require_keys_neq!(ctx.accounts.buyer.key(), deal.seller, UnboxError::SameParty);
    // The buyer signs the exact description and arbiter they were shown.
    require!(expected_listing_hash == deal.listing_hash, UnboxError::ListingHashMismatch);
    require_keys_eq!(expected_arbiter, deal.arbiter, UnboxError::ArbiterMismatch);
    let price = deal.price_lamports;

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer { from: ctx.accounts.buyer.to_account_info(), to: ctx.accounts.deal.to_account_info() },
        ),
        price,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let buyer = ctx.accounts.buyer.key();
    let deal = &mut ctx.accounts.deal;
    deal.buyer = buyer;
    deal.set_status(key, DealStatus::Paid, now);
    Ok(())
}
```

Pozostałe instrukcje mają ostateczne konta (IDL v0), ale ciało `NotImplemented`. `mark_shipped`, `accept_delivery` i `settle_expired` wypełnia Task 3, a resztę `docs/zadania/1-program.md`.

`instructions/mark_shipped.rs`:
```rust
use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

#[derive(Accounts)]
pub struct MarkShipped<'info> {
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handle_mark_shipped(
    _ctx: Context<MarkShipped>,
    _qr_commitment: [u8; 32],
    _packing_video_hash: [u8; 32],
    _tracking_number: String,
) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
```

`instructions/accept_delivery.rs`:
```rust
use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

#[derive(Accounts)]
pub struct AcceptDelivery<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = buyer @ UnboxError::Unauthorized,
        has_one = seller @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
    /// CHECK: payee; `has_one = seller` pins the address.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
}

pub fn handle_accept_delivery(_ctx: Context<AcceptDelivery>, _qr_secret: [u8; 32]) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
```

`instructions/open_dispute.rs`:
```rust
use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = buyer @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handle_open_dispute(
    _ctx: Context<OpenDispute>,
    _qr_secret: [u8; 32],
    _unboxing_video_hash: [u8; 32],
    _complaint_hash: [u8; 32],
) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
```

`instructions/resolve_dispute.rs`:
```rust
use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::{Deal, Verdict};

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    pub arbiter: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = arbiter @ UnboxError::Unauthorized,
        has_one = seller @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
    /// CHECK: payee; `has_one = seller` pins the address.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
}

pub fn handle_resolve_dispute(_ctx: Context<ResolveDispute>, _verdict: Verdict, _report_hash: [u8; 32]) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
```

`instructions/mark_returned.rs`:
```rust
use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

#[derive(Accounts)]
pub struct MarkReturned<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = buyer @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handle_mark_returned(
    _ctx: Context<MarkReturned>,
    _return_qr_commitment: [u8; 32],
    _return_video_hash: [u8; 32],
    _return_tracking_number: String,
) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
```

`instructions/confirm_return.rs`:
```rust
use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

#[derive(Accounts)]
pub struct ConfirmReturn<'info> {
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ UnboxError::Unauthorized,
        has_one = buyer @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
    /// CHECK: payee; `has_one = buyer` pins the address.
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,
}

pub fn handle_confirm_return(_ctx: Context<ConfirmReturn>, _return_qr_secret: [u8; 32]) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
```

`instructions/settle_expired.rs`:
```rust
use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

#[derive(Accounts)]
pub struct SettleExpired<'info> {
    /// Anyone: nobody has to "guard" the deal.
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ UnboxError::Unauthorized,
        has_one = buyer @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
    /// CHECK: payee; `has_one = seller` pins the address.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: payee; `has_one = buyer` pins the address.
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,
}

pub fn handle_settle_expired(_ctx: Context<SettleExpired>) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
```

`programs/unbox_escrow/src/lib.rs`:
```rust
use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod logic;
pub mod state;

pub use instructions::*;
pub use state::Verdict;

declare_id!("CEoTTEq46mxFrNqPu9EbpFbDshsrSTZV9GB14XPT1Nyq");

#[program]
pub mod unbox_escrow {
    use super::*;

    pub fn create_listing(
        ctx: Context<CreateListing>,
        deal_id: u64,
        price_lamports: u64,
        listing_hash: [u8; 32],
        metadata_uri: String,
        arbiter: Pubkey,
    ) -> Result<()> {
        handle_create_listing(ctx, deal_id, price_lamports, listing_hash, metadata_uri, arbiter)
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        handle_cancel_listing(ctx)
    }

    pub fn purchase(ctx: Context<Purchase>, expected_listing_hash: [u8; 32], expected_arbiter: Pubkey) -> Result<()> {
        handle_purchase(ctx, expected_listing_hash, expected_arbiter)
    }

    pub fn mark_shipped(
        ctx: Context<MarkShipped>,
        qr_commitment: [u8; 32],
        packing_video_hash: [u8; 32],
        tracking_number: String,
    ) -> Result<()> {
        handle_mark_shipped(ctx, qr_commitment, packing_video_hash, tracking_number)
    }

    pub fn accept_delivery(ctx: Context<AcceptDelivery>, qr_secret: [u8; 32]) -> Result<()> {
        handle_accept_delivery(ctx, qr_secret)
    }

    pub fn open_dispute(
        ctx: Context<OpenDispute>,
        qr_secret: [u8; 32],
        unboxing_video_hash: [u8; 32],
        complaint_hash: [u8; 32],
    ) -> Result<()> {
        handle_open_dispute(ctx, qr_secret, unboxing_video_hash, complaint_hash)
    }

    // The arbiter can only pick a side, only while Disputed, only before ORACLE_TIMEOUT.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, verdict: Verdict, report_hash: [u8; 32]) -> Result<()> {
        handle_resolve_dispute(ctx, verdict, report_hash)
    }

    pub fn mark_returned(
        ctx: Context<MarkReturned>,
        return_qr_commitment: [u8; 32],
        return_video_hash: [u8; 32],
        return_tracking_number: String,
    ) -> Result<()> {
        handle_mark_returned(ctx, return_qr_commitment, return_video_hash, return_tracking_number)
    }

    pub fn confirm_return(ctx: Context<ConfirmReturn>, return_qr_secret: [u8; 32]) -> Result<()> {
        handle_confirm_return(ctx, return_qr_secret)
    }

    // Here the intermediary disappears: after a deadline anyone closes the deal by the fixed table.
    pub fn settle_expired(ctx: Context<SettleExpired>) -> Result<()> {
        handle_settle_expired(ctx)
    }
}
```

- [ ] **Step 6: Uruchom testy.** `pnpm test:program` daje 5 passed (`listing and purchase`). `cargo test -p unbox_escrow --lib` dalej 8 passed.
- [ ] **Step 7: IDL v0 i commit**

```bash
pnpm sync-idl
git add programs/unbox_escrow tests package.json packages/shared/idl
git commit -m "feat(program): idl v0 with create_listing, cancel_listing and purchase"
```

### Task 3: `mark_shipped`, `accept_delivery`, `settle_expired` (wysyłka, odbiór, terminy) + deploy

**Files:**
- Modify: `programs/unbox_escrow/src/instructions/{mark_shipped,accept_delivery,settle_expired}.rs`
- Modify: `tests/helpers.ts`, `tests/unbox_escrow.test.ts`

**Interfaces:**
- Consumes: `logic::{ship_commitment, deadline, expiry_outcome, Payee, require_before_deadline, require_hash, require_text}`, `Deal::set_status`.
- Produces: działający happy path i `settle_expired` (wszystkie 5 wierszy) na devnecie. Od tego zależy backend (Faza B) i CLI.

- [ ] **Step 1: Helper `createShipped`** — w `tests/helpers.ts` zmień import na `import { createHash, randomBytes } from "node:crypto";` i dopisz:

```ts
export async function createShipped(): Promise<Listed & { buyer: Kp; secret: Buffer }> {
  const p = await createPaid();
  const secret = randomBytes(32);
  await program.methods
    .markShipped(bytes32(sha256(p.deal.toBuffer(), secret)), bytes32(sha256(Buffer.from("packing.mp4"))), "INPOST-1")
    .accountsPartial({ seller: p.seller.publicKey, deal: p.deal })
    .signers([p.seller])
    .rpc();
  return { ...p, secret };
}

/** Program built with `test-timeouts` (5 s); Surfpool's clock follows wall time. */
export const waitPastDeadline = () => sleep(6_000);
```

- [ ] **Step 2: Testy** — dopisz na końcu `tests/unbox_escrow.test.ts` (i rozszerz import z `./helpers` o `createPaid, createShipped, waitPastDeadline`):

```ts
type Party = { deal: anchor.web3.PublicKey; seller: anchor.web3.Keypair; buyer: anchor.web3.Keypair };

const accept = (s: Party, who: anchor.web3.Keypair, secret: Uint8Array) =>
  program.methods.acceptDelivery(bytes32(secret))
    .accountsPartial({ buyer: who.publicKey, deal: s.deal, seller: s.seller.publicKey })
    .signers([who]).rpc();

const settle = (s: Party, caller: anchor.web3.Keypair) =>
  program.methods.settleExpired()
    .accountsPartial({ caller: caller.publicKey, deal: s.deal, seller: s.seller.publicKey, buyer: s.buyer.publicKey })
    .signers([caller]).rpc();

describe("shipping, receiving and expiry", () => {
  it("happy path pays the seller exactly the price", async () => {
    const s = await createShipped();
    const shipped = await program.account.deal.fetch(s.deal);
    assert.equal(statusOf(shipped), "shipped");
    assert.equal(shipped.trackingNumber, "INPOST-1");
    const sellerBefore = await connection.getBalance(s.seller.publicKey);
    const dealBefore = await connection.getBalance(s.deal);
    await accept(s, s.buyer, s.secret);
    assert.equal(statusOf(await program.account.deal.fetch(s.deal)), "completed");
    assert.equal(await connection.getBalance(s.seller.publicKey), sellerBefore + s.price.toNumber());
    assert.equal(await connection.getBalance(s.deal), dealBefore - s.price.toNumber()); // rent stays
  });

  it("only the seller ships, only the buyer accepts, only with the right QR", async () => {
    const p = await createPaid();
    const stranger = await funded();
    await assert.rejects(
      program.methods.markShipped(bytes32(sha256(Buffer.from("c"))), bytes32(sha256(Buffer.from("v"))), "X-1")
        .accountsPartial({ seller: stranger.publicKey, deal: p.deal }).signers([stranger]).rpc(),
      anchorCode("Unauthorized"),
    );
    const s = await createShipped();
    await assert.rejects(accept(s, s.buyer, Buffer.alloc(32, 7)), anchorCode("QrMismatch"));
    await assert.rejects(accept(s, stranger, s.secret), anchorCode("Unauthorized"));
  });

  it("Paid past SHIP_TIMEOUT: anyone refunds the buyer, the seller can no longer ship", async () => {
    const p = await createPaid();
    const stranger = await funded();
    await assert.rejects(settle(p, stranger), anchorCode("DeadlineNotReached"));
    await waitPastDeadline();
    await assert.rejects(
      program.methods.markShipped(bytes32(sha256(Buffer.from("c"))), bytes32(sha256(Buffer.from("v"))), "X-1")
        .accountsPartial({ seller: p.seller.publicKey, deal: p.deal }).signers([p.seller]).rpc(),
      anchorCode("DeadlinePassed"),
    );
    const buyerBefore = await connection.getBalance(p.buyer.publicKey);
    await settle(p, stranger);
    assert.equal(statusOf(await program.account.deal.fetch(p.deal)), "refunded");
    assert.equal(await connection.getBalance(p.buyer.publicKey), buyerBefore + p.price.toNumber());
  });

  it("Shipped past UNBOX_TIMEOUT: anyone pays the seller, the buyer can no longer accept", async () => {
    const s = await createShipped();
    const stranger = await funded();
    await waitPastDeadline();
    await assert.rejects(accept(s, s.buyer, s.secret), anchorCode("DeadlinePassed"));
    const sellerBefore = await connection.getBalance(s.seller.publicKey);
    await settle(s, stranger);
    assert.equal(statusOf(await program.account.deal.fetch(s.deal)), "completed");
    assert.equal(await connection.getBalance(s.seller.publicKey), sellerBefore + s.price.toNumber());
    await assert.rejects(settle(s, stranger), anchorCode("InvalidStatus"));
  });
});
```

- [ ] **Step 3: Sprawdź, że testy nie przechodzą.** `pnpm test:program`. Oczekiwany wynik: nowe testy padają z `NotImplemented`, a 5 starych przechodzi.

- [ ] **Step 4: Implementacja.** Podmień handlery:

`mark_shipped.rs` (importy: `use crate::constants::{DEAL_SEED, MAX_TRACKING_LEN}; use crate::logic::{require_before_deadline, require_hash, require_text}; use crate::state::{Deal, DealStatus};`):
```rust
pub fn handle_mark_shipped(
    ctx: Context<MarkShipped>,
    qr_commitment: [u8; 32],
    packing_video_hash: [u8; 32],
    tracking_number: String,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Paid, UnboxError::InvalidStatus);
    require_before_deadline(deal, now)?;
    require_hash(&qr_commitment)?;
    require_hash(&packing_video_hash)?;
    require_text(&tracking_number, MAX_TRACKING_LEN)?;
    let key = ctx.accounts.deal.key();
    let deal = &mut ctx.accounts.deal;
    deal.qr_commitment = qr_commitment;
    deal.packing_video_hash = packing_video_hash;
    deal.tracking_number = tracking_number;
    deal.set_status(key, DealStatus::Shipped, now);
    Ok(())
}
```

`accept_delivery.rs` (importy: `use crate::logic::{require_before_deadline, ship_commitment}; use crate::state::{Deal, DealStatus};`):
```rust
pub fn handle_accept_delivery(ctx: Context<AcceptDelivery>, qr_secret: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Shipped, UnboxError::InvalidStatus);
    require_before_deadline(deal, now)?;
    // The secret is revealed in the same tx as the decision and the status changes, so the QR is single-use.
    require!(ship_commitment(&key, &qr_secret) == deal.qr_commitment, UnboxError::QrMismatch);
    let price = deal.price_lamports;
    ctx.accounts.deal.sub_lamports(price)?;
    ctx.accounts.seller.add_lamports(price)?;
    ctx.accounts.deal.set_status(key, DealStatus::Completed, now);
    Ok(())
}
```

`settle_expired.rs` (importy: `use crate::logic::{deadline, expiry_outcome, Payee};`):
```rust
pub fn handle_settle_expired(ctx: Context<SettleExpired>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    let (to, payee) = expiry_outcome(deal.status).ok_or(error!(UnboxError::InvalidStatus))?;
    let end = deadline(deal.status, deal.status_changed_at).ok_or(error!(UnboxError::InvalidStatus))?;
    require!(now >= end, UnboxError::DeadlineNotReached);
    let price = deal.price_lamports;
    match payee {
        Payee::Seller => {
            ctx.accounts.deal.sub_lamports(price)?;
            ctx.accounts.seller.add_lamports(price)?;
        }
        Payee::Buyer => {
            ctx.accounts.deal.sub_lamports(price)?;
            ctx.accounts.buyer.add_lamports(price)?;
        }
        Payee::Nobody => {}
    }
    ctx.accounts.deal.set_status(key, to, now);
    Ok(())
}
```

- [ ] **Step 5: Uruchom testy.** `pnpm test:program` daje 9 passed.
  - Jeśli testy z `waitPastDeadline` padają z `DeadlineNotReached`, zegar Surfpoola nie idzie za czasem rzeczywistym. Wtedy w `waitPastDeadline` zastąp `sleep` przez:

    ```ts
    await (connection as any)._rpcRequest("surfnet_timeTravel", [{ absoluteTimestamp: Date.now() + 10_000 }]);
    await sleep(2_500); // Clock sysvar settles on the next block
    ```
- [ ] **Step 6: Deploy na devnet** (tylko Ty, Osoba 1; deployer zasilony): `pnpm deploy:devnet`. Skrypt przebudowuje bez `test-timeouts`, więc na devnecie są timeouty `demo`. Zapisz link do Explorera transakcji deployu.
- [ ] **Step 7: Commit**

```bash
pnpm sync-idl
git add programs/unbox_escrow tests packages/shared/idl
git commit -m "feat(program): ship, accept delivery and permissionless settle_expired"
```

---

## Faza B — `server/` w trybie `PAYMENTS=solana`

Komendy `cargo` w tej fazie uruchamiasz w kontenerze, w katalogu `/work/server`. Najpierw zrób `git pull --rebase`, żeby mieć `server/` z `main`.

### Task 4: Tryb `PAYMENTS`, klient RPC, fałszywe RPC do testów

**Files:**
- Modify: `server/Cargo.toml`, `server/src/{config.rs,state.rs,lib.rs,routes.rs}` (tylko `health`), `server/tests/common/mod.rs`, `server/.env.example`, `scripts/run-contract-test.ts`
- Create: `server/src/solana/{mod.rs,chain.rs}`, `server/tests/common/fake_rpc.rs`, `server/tests/solana.rs`

**Interfaces:**
- Produces:
  - `config::{PaymentsMode::{Demo, Solana}, SolanaConfig { rpc_url, cluster, arbiter: Pubkey, webhook_secret: Option<String>, poll_ms: u64 }}`; nowe pola `Config.payments`, `Config.solana: Option<SolanaConfig>`
  - `state::ChainSync { last_sync_at, last_error }`; nowe pola `AppState.chain: Option<Arc<RpcChain>>`, `AppState.chain_sync: Arc<Mutex<ChainSync>>`
  - `solana::chain::RpcChain::{new(&str), accounts(&[Pubkey]), all_deals(), latest_signature(&Pubkey), balance(&Pubkey)}`, wszystkie async i zwracają `Result<_, String>`
  - `solana::{explorer_tx_url(&str, &SolanaConfig) -> String, demo_only(&AppState) -> ApiResult<()>}`
  - testy: `common::fake_rpc::{FakeRpc::{start, put_deal, put_raw, set_balance, set_failing, calls}, chain_deal(..)}`

- [ ] **Step 1: Zależności.** W `server/Cargo.toml`, w `[dependencies]`, dopisz:

```toml
# On-chain Deal layout, PDA seeds and deadlines come from the program crate itself (no second copy).
unbox_escrow = { path = "../programs/unbox_escrow", features = ["no-entrypoint"] }
anchor-lang = "=1.1.2"
base64 = "0.22"
```
Zmień też `description` na `"unbox shop backend: HTTP API, SQLite, media; PAYMENTS=solana mirrors the unbox_escrow program"`.

- [ ] **Step 2: Tryb demo w istniejących testach.**
  - W `server/tests/common/mod.rs`, w `try_start`, w tablicy domyślnych zmiennych dopisz `("PAYMENTS", "demo".into()),`.
  - Pod `#![allow(dead_code)]` dopisz `pub mod fake_rpc;`.
  - W `scripts/run-contract-test.ts`, w `env` procesu serwera (linia z `AI: 'mock'`), dopisz `PAYMENTS: 'demo',`.

- [ ] **Step 3: Fałszywe RPC.** Plik `server/tests/common/fake_rpc.rs`:

```rust
//! Fake Solana JSON-RPC with the methods the server uses, backed by in-memory accounts.
use anchor_lang::prelude::Pubkey;
use anchor_lang::{AccountSerialize, Discriminator};
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use unbox_escrow::state::{Deal, DealStatus, Verdict};

#[derive(Default)]
struct Inner {
    accounts: Mutex<HashMap<String, Vec<u8>>>,
    balances: Mutex<HashMap<String, u64>>,
    failing: AtomicBool,
    calls: AtomicUsize,
}

#[derive(Clone)]
pub struct FakeRpc {
    pub url: String,
    inner: Arc<Inner>,
}

impl FakeRpc {
    pub async fn start() -> FakeRpc {
        let inner = Arc::new(Inner::default());
        let app = Router::new().route("/", post(handle)).with_state(inner.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        FakeRpc { url, inner }
    }

    pub fn put_deal(&self, address: &Pubkey, deal: &Deal) {
        let mut data = Vec::new();
        deal.try_serialize(&mut data).unwrap();
        self.put_raw(address, data);
    }

    pub fn put_raw(&self, address: &Pubkey, data: Vec<u8>) {
        self.inner.accounts.lock().unwrap().insert(address.to_string(), data);
    }

    pub fn set_balance(&self, address: &str, lamports: u64) {
        self.inner.balances.lock().unwrap().insert(address.to_string(), lamports);
    }

    pub fn set_failing(&self, failing: bool) {
        self.inner.failing.store(failing, Ordering::SeqCst);
    }

    pub fn calls(&self) -> usize {
        self.inner.calls.load(Ordering::SeqCst)
    }
}

async fn handle(State(s): State<Arc<Inner>>, Json(req): Json<Value>) -> Result<Json<Value>, StatusCode> {
    s.calls.fetch_add(1, Ordering::SeqCst);
    if s.failing.load(Ordering::SeqCst) {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let owner = unbox_escrow::ID.to_string();
    let account = |data: &Vec<u8>| {
        json!({ "data": [B64.encode(data), "base64"], "owner": owner, "lamports": 1, "executable": false, "rentEpoch": 0 })
    };
    let params = &req["params"];
    let result = match req["method"].as_str().unwrap_or("") {
        "getMultipleAccounts" => {
            let accounts = s.accounts.lock().unwrap();
            let value: Vec<Value> = params[0]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .iter()
                .map(|k| k.as_str().and_then(|k| accounts.get(k)).map(|d| account(d)).unwrap_or(Value::Null))
                .collect();
            json!({ "context": { "slot": 1 }, "value": value })
        }
        "getProgramAccounts" => {
            let accounts = s.accounts.lock().unwrap();
            let items: Vec<Value> = accounts
                .iter()
                .filter(|(_, d)| d.starts_with(Deal::DISCRIMINATOR))
                .map(|(k, d)| json!({ "pubkey": k, "account": account(d) }))
                .collect();
            json!(items)
        }
        "getSignaturesForAddress" => json!([{ "signature": format!("sig-{}", params[0].as_str().unwrap_or("")) }]),
        "getBalance" => {
            let lamports = s.balances.lock().unwrap().get(params[0].as_str().unwrap_or("")).copied().unwrap_or(0);
            json!({ "context": { "slot": 1 }, "value": lamports })
        }
        other => {
            return Ok(Json(json!({ "jsonrpc": "2.0", "id": req["id"].clone(),
                                   "error": { "code": -32601, "message": format!("{other} is not faked") } })))
        }
    };
    Ok(Json(json!({ "jsonrpc": "2.0", "id": req["id"].clone(), "result": result })))
}

/// An on-chain Deal as the program would store it; `listing_hash_hex` must equal the published hash.
pub fn chain_deal(seller: Pubkey, buyer: Pubkey, status: DealStatus, changed_at: i64, listing_hash_hex: &str, price: u64) -> Deal {
    Deal {
        seller,
        buyer,
        arbiter: "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw".parse().unwrap(),
        deal_id: 1,
        price_lamports: price,
        listing_hash: hex::decode(listing_hash_hex).unwrap().try_into().unwrap(),
        status,
        status_changed_at: changed_at,
        qr_commitment: [0; 32],
        packing_video_hash: [0; 32],
        unboxing_video_hash: [0; 32],
        complaint_hash: [0; 32],
        verdict: Verdict::None,
        report_hash: [0; 32],
        return_qr_commitment: [0; 32],
        return_video_hash: [0; 32],
        bump: 255,
        metadata_uri: "http://localhost/api/listings/x/metadata.json".into(),
        tracking_number: String::new(),
        return_tracking_number: String::new(),
    }
}
```

- [ ] **Step 4: Testy uruchomienia trybu solana.** Plik `server/tests/solana.rs` (kolejne taski dopisują tu testy):

```rust
mod common;

use common::fake_rpc::FakeRpc;
use common::*;
use reqwest::{Method, StatusCode};

pub const ARBITER: &str = "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw";

/// Backend in PAYMENTS=solana against the fake RPC. A long poll interval keeps webhook tests honest.
async fn solana_backend(rpc: &FakeRpc, poll_ms: &str) -> Backend {
    Backend::start(&[
        ("PAYMENTS", "solana"),
        ("RPC_URL", rpc.url.as_str()),
        ("ARBITER_PUBKEY", ARBITER),
        ("WEBHOOK_SECRET", "s3cret"),
        ("SOLANA_POLL_MS", poll_ms),
    ])
    .await
}

#[tokio::test]
async fn solana_mode_requires_arbiter() {
    let err = Backend::try_start(&[("PAYMENTS", "solana")]).await.err().expect("must not start without ARBITER_PUBKEY");
    assert!(err.contains("ARBITER_PUBKEY"), "{err}");
}

#[tokio::test]
async fn health_reports_solana_mode() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let (s, v) = b.anon().call(Method::GET, "/api/health", None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["payments"], "solana");
    assert_eq!(v["timeouts"], "demo");
    assert_eq!(v["chain"]["programId"], unbox_escrow::ID.to_string());
    assert_eq!(v["chain"]["arbiter"], ARBITER);
}
```

- [ ] **Step 5: Sprawdź, że testy nie przechodzą.** `cargo test --test solana`. Oczekiwany wynik: FAIL. `solana_mode_requires_arbiter` panikuje, bo serwer nie zna `PAYMENTS` i startuje; `health_reports_solana_mode` nie ma `payments`.

- [ ] **Step 6: Konfiguracja.** W `server/src/config.rs`:
  - dopisz importy `use anchor_lang::prelude::Pubkey;` i `use std::str::FromStr;`;
  - dopisz typy:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PaymentsMode {
    /// Demo ledger in SQLite (offline demo and the original test suite).
    Demo,
    /// Money and deal status live in the unbox_escrow program; the server only mirrors them.
    Solana,
}

#[derive(Clone, Debug)]
pub struct SolanaConfig {
    pub rpc_url: String,
    /// "devnet" or anything else (Explorer links then use a custom cluster URL).
    pub cluster: String,
    /// Oracle key that new listings name as the arbiter (ORACLE_PUBKEY of person 5).
    pub arbiter: Pubkey,
    /// Helius sends it back verbatim in the Authorization header.
    pub webhook_secret: Option<String>,
    pub poll_ms: u64,
}
```
  - w `struct Config` dopisz pola `pub payments: PaymentsMode,` i `pub solana: Option<SolanaConfig>,`;
  - w `from_env`, przed `Ok(Self {`:

```rust
        let payments = match var("PAYMENTS").as_deref().unwrap_or("solana") {
            "solana" => PaymentsMode::Solana,
            "demo" => PaymentsMode::Demo,
            other => return Err(format!("PAYMENTS={other}: dozwolone solana|demo")),
        };
        let solana = match payments {
            PaymentsMode::Demo => None,
            PaymentsMode::Solana => {
                let arbiter = var("ARBITER_PUBKEY").ok_or("PAYMENTS=solana wymaga ARBITER_PUBKEY (klucz wyroczni)")?;
                Some(SolanaConfig {
                    rpc_url: var("RPC_URL").unwrap_or_else(|| "https://api.devnet.solana.com".into()),
                    cluster: var("CLUSTER").unwrap_or_else(|| "devnet".into()),
                    arbiter: Pubkey::from_str(&arbiter).map_err(|_| format!("ARBITER_PUBKEY={arbiter}: niepoprawny adres"))?,
                    webhook_secret: var("WEBHOOK_SECRET"),
                    poll_ms: num("SOLANA_POLL_MS", 5000)?,
                })
            }
        };
```
  - w `Ok(Self { ... })` dopisz `payments,` i `solana,`.

- [ ] **Step 7: Klient RPC.** Plik `server/src/solana/mod.rs`:

```rust
//! PAYMENTS=solana: the money and the rules live in the `unbox_escrow` program. This module only reads
//! accounts over RPC and mirrors them into SQLite; it never signs or sends a transaction.
pub mod chain;

use crate::config::{PaymentsMode, SolanaConfig};
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

pub fn explorer_tx_url(signature: &str, cfg: &SolanaConfig) -> String {
    if cfg.cluster == "devnet" {
        format!("https://explorer.solana.com/tx/{signature}?cluster=devnet")
    } else {
        format!("https://explorer.solana.com/tx/{signature}?cluster=custom&customUrl={}", cfg.rpc_url)
    }
}

/// The REST actions move money in the demo ledger, so in PAYMENTS=solana the wallet signs them instead.
pub fn demo_only(s: &AppState) -> ApiResult<()> {
    if s.cfg.payments == PaymentsMode::Solana {
        Err(ApiError::invalid_state("W trybie Solana tę operację podpisujesz w portfelu w aplikacji"))
    } else {
        Ok(())
    }
}
```

Plik `server/src/solana/chain.rs`:
```rust
//! Minimal Solana JSON-RPC reader for the unbox_escrow program.
use anchor_lang::prelude::Pubkey;
use anchor_lang::Discriminator;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::time::Duration;
use unbox_escrow::state::Deal;

pub struct RpcChain {
    http: reqwest::Client,
    url: String,
}

fn base64_data(account: &Value) -> Result<Vec<u8>, String> {
    let data = account["data"][0].as_str().ok_or("account without base64 data")?;
    B64.decode(data).map_err(|e| e.to_string())
}

impl RpcChain {
    pub fn new(url: &str) -> Self {
        let http = reqwest::Client::builder().timeout(Duration::from_secs(10)).build().expect("http client");
        Self { http, url: url.to_string() }
    }

    async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
        let res = self.http.post(&self.url).json(&body).send().await.map_err(|e| format!("{method}: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("{method}: HTTP {}", res.status()));
        }
        let mut v: Value = res.json().await.map_err(|e| format!("{method}: {e}"))?;
        if let Some(err) = v.get("error") {
            return Err(format!("{method}: {err}"));
        }
        Ok(v["result"].take())
    }

    /// Data of those `keys` that exist and are owned by the program.
    pub async fn accounts(&self, keys: &[Pubkey]) -> Result<Vec<(Pubkey, Vec<u8>)>, String> {
        let program = unbox_escrow::ID.to_string();
        let mut out = Vec::new();
        for chunk in keys.chunks(100) {
            let ids: Vec<String> = chunk.iter().map(Pubkey::to_string).collect();
            let result =
                self.call("getMultipleAccounts", json!([ids, { "encoding": "base64", "commitment": "confirmed" }])).await?;
            let values = result["value"].as_array().ok_or("getMultipleAccounts without value")?;
            for (key, account) in chunk.iter().zip(values) {
                if account["owner"].as_str() == Some(program.as_str()) {
                    out.push((*key, base64_data(account)?));
                }
            }
        }
        Ok(out)
    }

    /// Every account of the program that starts with the Deal discriminator.
    pub async fn all_deals(&self) -> Result<Vec<(Pubkey, Vec<u8>)>, String> {
        let filter = json!({ "memcmp": { "offset": 0, "bytes": B64.encode(Deal::DISCRIMINATOR), "encoding": "base64" } });
        let params = json!([unbox_escrow::ID.to_string(),
                            { "encoding": "base64", "commitment": "confirmed", "filters": [filter] }]);
        let result = self.call("getProgramAccounts", params).await?;
        result
            .as_array()
            .ok_or("getProgramAccounts did not return an array")?
            .iter()
            .map(|item| {
                let key = item["pubkey"].as_str().ok_or("item without pubkey")?;
                let key: Pubkey = key.parse().map_err(|_| format!("bad pubkey {key}"))?;
                Ok((key, base64_data(&item["account"])?))
            })
            .collect()
    }

    /// Newest transaction touching `key`, for the Explorer link.
    pub async fn latest_signature(&self, key: &Pubkey) -> Result<Option<String>, String> {
        let result =
            self.call("getSignaturesForAddress", json!([key.to_string(), { "limit": 1, "commitment": "confirmed" }])).await?;
        Ok(result[0]["signature"].as_str().map(str::to_string))
    }

    pub async fn balance(&self, key: &Pubkey) -> Result<u64, String> {
        let result = self.call("getBalance", json!([key.to_string(), { "commitment": "confirmed" }])).await?;
        result["value"].as_u64().ok_or_else(|| "getBalance without value".to_string())
    }
}
```

- [ ] **Step 8: Stan i start.**

  W `server/src/state.rs`:
  - dodaj `use crate::solana::chain::RpcChain;`;
  - dodaj typ:

    ```rust
    #[derive(Default, Clone)]
    pub struct ChainSync {
        pub last_sync_at: Option<Unix>,
        pub last_error: Option<String>,
    }
    ```
  - w `AppState` dodaj pola:

    ```rust
        /// PAYMENTS=solana: read-only RPC client; None in demo mode.
        pub chain: Option<Arc<RpcChain>>,
        pub chain_sync: Arc<Mutex<ChainSync>>,
    ```
  - w `AppState::new`, przed `Self {`, dopisz `let chain = cfg.solana.as_ref().map(|s| Arc::new(RpcChain::new(&s.rpc_url)));`, a w `Self { … }` dopisz `chain,` i `chain_sync: Arc::new(Mutex::new(ChainSync::default())),`.

  W `server/src/lib.rs`:
  - zmień opis crate'a na `//! unbox — shop backend: HTTP API (axum), SQLite, media. PAYMENTS=solana mirrors the unbox_escrow program; PAYMENTS=demo keeps the demo ledger.`;
  - dopisz `pub mod solana;`;
  - na początku `spawn_background`:

    ```rust
        if state.cfg.payments == config::PaymentsMode::Solana {
            // No sweep and no dispute analysis: deadlines and verdicts are enforced on-chain.
            return;
        }
    ```

  W `server/src/routes.rs`, w `health`, zastąp budowę `v` i zwrot:
```rust
    let mut v = json!({ "ok": db_ok, "db": if db_ok { "ok" } else { "error" }, "ai": ai,
                        "timeouts": s.cfg.timeouts_mode, "version": env!("CARGO_PKG_VERSION"), "payments": "demo" });
    if let Some(sol) = &s.cfg.solana {
        let sync = s.chain_sync.lock().unwrap_or_else(|p| p.into_inner()).clone();
        v["payments"] = json!("solana");
        v["timeouts"] = json!(unbox_escrow::constants::TIMEOUT_PROFILE);
        v["chain"] = json!({ "programId": unbox_escrow::ID.to_string(), "cluster": sol.cluster,
                             "arbiter": sol.arbiter.to_string(), "lastSyncAt": sync.last_sync_at,
                             "lastSyncError": sync.last_error });
    }
    (status, Json(v)).into_response()
```
`rpcUrl` celowo nie trafia do `health`, bo URL Heliusa zawiera klucz API.

  W `server/.env.example` dopisz:
```dotenv
# solana (default): money and status come from the unbox_escrow program | demo: SQLite demo ledger
PAYMENTS=solana
RPC_URL=https://api.devnet.solana.com
CLUSTER=devnet
# Oracle public key (ORACLE_PUBKEY of person 5); new listings name it as the arbiter. Required with PAYMENTS=solana.
ARBITER_PUBKEY=
# Same value as authHeader of the Helius webhook (POST /api/webhooks/helius).
WEBHOOK_SECRET=
SOLANA_POLL_MS=5000
```

- [ ] **Step 9: Uruchom wszystkie testy.**
  - `cargo test` daje wszystkie dotychczasowe testy (unit i integracyjne) plus 2 nowe w `solana.rs`; wszystko passed.
  - `cargo clippy --all-targets -- -D warnings` jest czysty.
  - Z root repo `pnpm test:contract` daje 11/11, bo skrypt startuje serwer z `PAYMENTS=demo`.
- [ ] **Step 10: Commit**

```bash
git add server scripts/run-contract-test.ts
git commit -m "feat(server): PAYMENTS=solana mode with read-only RPC client; demo ledger kept for tests"
```

### Task 5: Model on-chain i adres portfela w profilu

**Files:**
- Modify: `server/src/{model.rs,db.rs,routes.rs,error.rs}`. Literały struktur dostają nowe pola w `seed.rs`, `deals.rs`, `wallet.rs`, `routes.rs` i w module testów `machine.rs`.
- Create: `server/tests/wallet_address.rs`

**Interfaces:**
- Produces:
  - `model::{User.wallet_address: Option<String>, Listing.onchain: Option<OnChainListing>, Deal.onchain: Option<OnChainDeal>, Wallet.address: Option<String>}`
  - `model::OnChainListing { deal, deal_id: u64, seller_wallet, listing_hash, metadata_uri, published: bool }`
  - `model::OnChainDeal { deal, seller_wallet, buyer_wallet, price_lamports: u64, transactions: Vec<ChainTx> }`, `model::ChainTx { status: DealStatus, at, signature: Option<String>, explorer_url: Option<String> }`
  - `db::{user_by_wallet(c, &str) -> ApiResult<Option<User>>, user_update(c, &User) -> ApiResult<()>}`, `ApiError::upstream(m)` (502 `UPSTREAM`)
  - `PUT /api/me/wallet-address {address}` → `User` (JSON z `walletAddress`)

- [ ] **Step 1: Testy** — `server/tests/wallet_address.rs` (tryb demo, adres portfela działa w obu trybach):

```rust
mod common;

use common::*;
use reqwest::{Method, StatusCode};
use serde_json::json;

const ADDR_A: &str = "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw";
const ADDR_B: &str = "CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t";

#[tokio::test]
async fn wallet_address_is_validated_unique_and_persisted() {
    let b = Backend::start(&[]).await;
    let ania = b.login("ania@demo.pl").await;
    let bartek = b.login("bartek@demo.pl").await;
    let (s, v) = ania.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": "nope" }))).await;
    assert_eq!((s, v["error"]["code"].clone()), (StatusCode::BAD_REQUEST, json!("VALIDATION")));
    let (s, v) = ania.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_A }))).await;
    assert_eq!((s, v["walletAddress"].clone()), (StatusCode::OK, json!(ADDR_A)));
    let (s, v) = bartek.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_A }))).await;
    assert_eq!((s, v["error"]["code"].clone()), (StatusCode::CONFLICT, json!("INVALID_STATE")));
    let (s, _) = bartek.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_B }))).await;
    assert_eq!(s, StatusCode::OK);
    let (_, me) = ania.call(Method::GET, "/api/me", None).await;
    assert_eq!(me["walletAddress"], ADDR_A);
    let (s, _) = b.anon().call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_A }))).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn wallet_address_survives_restart_and_is_omitted_when_unset() {
    let mut b = Backend::start(&[]).await;
    let celina = b.login("celina@demo.pl").await;
    let (_, me) = celina.call(Method::GET, "/api/me", None).await;
    assert!(me.get("walletAddress").is_none(), "{me}");
    celina.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_B }))).await;
    b.restart().await;
    let celina = b.login("celina@demo.pl").await;
    let (_, me) = celina.call(Method::GET, "/api/me", None).await;
    assert_eq!(me["walletAddress"], ADDR_B);
}
```

- [ ] **Step 2: Sprawdź, że testy nie przechodzą.** `cargo test --test wallet_address`. Oczekiwany wynik: FAIL (404 dla `PUT /api/me/wallet-address`).

- [ ] **Step 3: Model.** W `server/src/model.rs`:
  - w `User`, po `created_at`, dopisz:

    ```rust
        /// Solana wallet (base58) linked by the app; PAYMENTS=solana maps on-chain parties to users with it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub wallet_address: Option<String>,
    ```
  - w `Listing`, po `updated_at`, dopisz:

    ```rust
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub onchain: Option<OnChainListing>,
    ```
  - w `Deal`, po `created_at`, dopisz:

    ```rust
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub onchain: Option<OnChainDeal>,
    ```
  - w `Wallet`, po `ledger`, dopisz:

    ```rust
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub address: Option<String>,
    ```
  - dopisz nowe typy:

```rust
/// A listing published to the unbox_escrow program (PAYMENTS=solana). From here on its content is frozen.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OnChainListing {
    /// Deal PDA (base58) = ["deal", seller_wallet, deal_id.to_le_bytes()].
    pub deal: String,
    pub deal_id: u64,
    pub seller_wallet: String,
    /// sha256(canonicalJson(ListingMetadata)), the same bytes as served at `metadata_uri`.
    pub listing_hash: String,
    pub metadata_uri: String,
    /// The Deal account exists on-chain with this hash (seen by the webhook or the poller).
    pub published: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OnChainDeal {
    pub deal: String,
    pub seller_wallet: String,
    pub buyer_wallet: String,
    pub price_lamports: u64,
    /// One entry per observed status change, with the Explorer link.
    pub transactions: Vec<ChainTx>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChainTx {
    pub status: DealStatus,
    pub at: Unix,
    pub signature: Option<String>,
    pub explorer_url: Option<String>,
}
```

- [ ] **Step 4: Literały struktur.** Uruchom `cargo build --all-targets`. Każdy błąd `missing field` uzupełnij wartością `None`:
  - `wallet_address: None` w `User { … }` w `seed.rs::register_user`;
  - `onchain: None` w `Listing { … }` w `seed.rs::listings` (`mk`) i w `routes.rs::create_listing`;
  - `onchain: None` w `Deal { … }` w `deals.rs::purchase` i w `machine.rs` (`fn paid()` w testach);
  - `address: None` w `Wallet { … }` w `wallet.rs::wallet_of`.

  Logika trybu demo się nie zmienia.

- [ ] **Step 5: DB, błąd i endpoint.**

  W `server/src/db.rs`, w sekcji użytkowników:
```rust
/// Few users in this app, so a scan is fine; the address is unique (enforced in PUT /me/wallet-address).
pub fn user_by_wallet(c: &Connection, address: &str) -> ApiResult<Option<User>> {
    let mut st = c.prepare("SELECT data FROM users")?;
    let rows = st.query_map([], |r| r.get::<_, String>(0))?;
    for r in rows {
        let u: User = serde_json::from_str(&r?).expect("użytkownik w bazie");
        if u.wallet_address.as_deref() == Some(address) {
            return Ok(Some(u));
        }
    }
    Ok(None)
}

pub fn user_update(c: &Connection, u: &User) -> ApiResult<()> {
    c.execute(
        "UPDATE users SET data = ?2 WHERE id = ?1",
        params![u.id, serde_json::to_string(u).expect("serializacja")],
    )?;
    Ok(())
}
```

  W `server/src/error.rs`, w `impl ApiError`, dopisz:
```rust
    pub fn upstream(m: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, "UPSTREAM", m)
    }
```

  W `server/src/routes.rs`:
  - dodaj importy `use anchor_lang::prelude::Pubkey;` i `use std::str::FromStr;`, a do importu `axum::routing` dopisz `put`;
  - w `router` dopisz `.route("/me/wallet-address", put(set_wallet_address))`;
  - w sekcji „konto” dopisz:
```rust
#[derive(Deserialize)]
struct WalletAddressBody {
    address: String,
}

/// Links the app's Solana wallet to the account; PAYMENTS=solana maps on-chain parties to users by it.
async fn set_wallet_address(State(s): State<AppState>, AuthUser(mut u): AuthUser, b: Bytes) -> Res {
    let i: WalletAddressBody = body(&b)?;
    let address = i.address.trim().to_string();
    Pubkey::from_str(&address).map_err(|_| ApiError::validation("address: niepoprawny adres portfela Solana"))?;
    let mut conn = s.conn();
    let user = db::tx(&mut conn, |c| {
        if let Some(other) = db::user_by_wallet(c, &address)? {
            if other.id != u.id {
                return Err(ApiError::invalid_state("Ten portfel jest już podłączony do innego konta"));
            }
        }
        u.wallet_address = Some(address);
        db::user_update(c, &u)?;
        Ok(u)
    })?;
    ok(&user)
}
```

- [ ] **Step 6: Uruchom testy.** `cargo test` daje wszystko passed, w tym 2 nowe w `wallet_address.rs`. `cargo clippy --all-targets -- -D warnings` jest czysty.
- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): wallet address in profile and on-chain fields on listings and deals"
```

### Task 6: `solana/mirror.rs` — konto `Deal` z łańcucha → dokument `Deal` w API (czysta funkcja)

**Files:**
- Create: `server/src/solana/mirror.rs`
- Modify: `server/src/solana/mod.rs` (`pub mod mirror;`)

**Interfaces:**
- Consumes: `model::*` (z Task 5), `machine::status_label`, `unbox_escrow::{state::{Deal, DealStatus, Verdict}, logic::deadline}`.
- Produces:
  - `mirror::{model_status(ChainStatus) -> Option<DealStatus>, hex_opt(&[u8;32]) -> Option<String>, close_reason(Option<&Deal>, DealStatus, ChainVerdict, Unix) -> Option<CloseReason>}`
  - `mirror::ChainSnapshot<'a> { address: &'a str, deal: &'a ChainDeal, signature: Option<String>, explorer_url: Option<String> }`
  - `mirror::mirror_deal(prev: Option<&Deal>, listing: &Listing, snap: &ChainSnapshot, buyer: Party, now: Unix) -> Option<Deal>`

- [ ] **Step 1: Szkielet z `todo!()` i testy** — `server/src/solana/mirror.rs`:

```rust
//! Pure mapping of an on-chain `Deal` account onto the API `Deal` document (PAYMENTS=solana).
//! The program decides status and money; this only translates them and keeps the timeline.

use crate::machine::status_label;
use crate::model::*;
use unbox_escrow::state::{Deal as ChainDeal, DealStatus as ChainStatus, Verdict as ChainVerdict};

pub struct ChainSnapshot<'a> {
    pub address: &'a str,
    pub deal: &'a ChainDeal,
    pub signature: Option<String>,
    pub explorer_url: Option<String>,
}

pub fn model_status(_s: ChainStatus) -> Option<DealStatus> { todo!() }
pub fn hex_opt(_h: &[u8; 32]) -> Option<String> { todo!() }
pub fn close_reason(_prev: Option<&Deal>, _to: DealStatus, _verdict: ChainVerdict, _changed_at: Unix) -> Option<CloseReason> { todo!() }
pub fn mirror_deal(_prev: Option<&Deal>, _listing: &Listing, _snap: &ChainSnapshot, _buyer: Party, _now: Unix) -> Option<Deal> { todo!() }

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::Pubkey;
    use unbox_escrow::constants::{SHIP_TIMEOUT, UNBOX_TIMEOUT};

    const PRICE: u64 = 60_000_000;

    fn listing() -> Listing {
        Listing {
            id: "l-kurtka-levis".into(),
            seller_id: "u-ania".into(),
            seller: Party { id: "u-ania".into(), name: "Ania Kowalska".into() },
            title: "Kurtka jeansowa Levi's".into(),
            description: "Klasyczna kurtka.".into(),
            category_id: "odziez-meska".into(),
            condition: Condition::Dobry,
            brand: "Levi's".into(),
            size: "M".into(),
            defects: vec![],
            photos: vec![],
            price_minor: PRICE as i64,
            currency: "SOL".into(),
            status: ListingStatus::Listed,
            created_at: 1,
            updated_at: 1,
            onchain: None,
        }
    }

    fn chain(status: ChainStatus, at: i64) -> ChainDeal {
        ChainDeal {
            seller: Pubkey::new_from_array([1; 32]),
            buyer: Pubkey::new_from_array([2; 32]),
            arbiter: Pubkey::new_from_array([3; 32]),
            deal_id: 1,
            price_lamports: PRICE,
            listing_hash: [5; 32],
            status,
            status_changed_at: at,
            qr_commitment: [0; 32],
            packing_video_hash: [0; 32],
            unboxing_video_hash: [0; 32],
            complaint_hash: [0; 32],
            verdict: ChainVerdict::None,
            report_hash: [0; 32],
            return_qr_commitment: [0; 32],
            return_video_hash: [0; 32],
            bump: 255,
            metadata_uri: String::new(),
            tracking_number: String::new(),
            return_tracking_number: String::new(),
        }
    }

    fn buyer() -> Party {
        Party { id: "u-bartek".into(), name: "Bartek Nowak".into() }
    }

    fn mirror(prev: Option<&Deal>, c: &ChainDeal) -> Option<Deal> {
        let snap = ChainSnapshot { address: "PDA", deal: c, signature: Some("sig1".into()), explorer_url: Some("https://x/sig1".into()) };
        mirror_deal(prev, &listing(), &snap, buyer(), 999)
    }

    #[test]
    fn listed_and_cancelled_are_not_deals() {
        assert!(mirror(None, &chain(ChainStatus::Listed, 1)).is_none());
        assert!(mirror(None, &chain(ChainStatus::Cancelled, 1)).is_none());
    }

    #[test]
    fn paid_deal_has_secured_sol_payment_and_program_deadline() {
        let d = mirror(None, &chain(ChainStatus::Paid, 100)).unwrap();
        assert_eq!(d.id, "l-kurtka-levis");
        assert_eq!(d.status, DealStatus::Paid);
        assert_eq!(d.deadline_at, Some(100 + SHIP_TIMEOUT));
        assert_eq!(d.payment.status, PaymentStatus::Secured);
        assert_eq!((d.payment.amount_minor, d.payment.currency.as_str()), (PRICE as i64, "SOL"));
        assert_eq!(d.payment.secured_at, 100);
        assert_eq!(d.buyer.id, "u-bartek");
        assert_eq!(d.timeline.len(), 1);
        assert_eq!(d.timeline[0].kind, "paid");
        let onchain = d.onchain.unwrap();
        assert_eq!(onchain.deal, "PDA");
        assert_eq!(onchain.buyer_wallet, Pubkey::new_from_array([2; 32]).to_string());
        assert_eq!(onchain.transactions[0].signature.as_deref(), Some("sig1"));
        assert_eq!(d.created_at, 999);
    }

    #[test]
    fn timeline_once_per_status() {
        let paid = mirror(None, &chain(ChainStatus::Paid, 100)).unwrap();
        let again = mirror(Some(&paid), &chain(ChainStatus::Paid, 100)).unwrap();
        assert_eq!(again.timeline.len(), 1);
        assert_eq!(again.onchain.as_ref().unwrap().transactions.len(), 1);
        let shipped = mirror(Some(&again), &chain(ChainStatus::Shipped, 150)).unwrap();
        let kinds: Vec<_> = shipped.timeline.iter().map(|t| t.kind.as_str()).collect();
        assert_eq!(kinds, ["paid", "shipped"]);
        assert_eq!(shipped.payment.secured_at, 100);
    }

    #[test]
    fn stale_snapshot_is_ignored() {
        let shipped = mirror(None, &chain(ChainStatus::Shipped, 200)).unwrap();
        assert!(mirror(Some(&shipped), &chain(ChainStatus::Paid, 100)).is_none());
    }

    #[test]
    fn completion_after_shipping_depends_on_the_deadline() {
        let shipped = mirror(None, &chain(ChainStatus::Shipped, 200)).unwrap();
        let accepted = mirror(Some(&shipped), &chain(ChainStatus::Completed, 200 + UNBOX_TIMEOUT - 1)).unwrap();
        assert_eq!(accepted.close_reason, Some(CloseReason::Accepted));
        assert_eq!(accepted.payment.status, PaymentStatus::Released);
        assert_eq!(accepted.payment.settled_at, Some(200 + UNBOX_TIMEOUT - 1));
        assert_eq!(accepted.deadline_at, None);
        let expired = mirror(Some(&shipped), &chain(ChainStatus::Completed, 200 + UNBOX_TIMEOUT)).unwrap();
        assert_eq!(expired.close_reason, Some(CloseReason::UnboxTimeout));
    }

    #[test]
    fn refunds_and_verdicts_get_their_close_reason() {
        let paid = mirror(None, &chain(ChainStatus::Paid, 100)).unwrap();
        let refunded = mirror(Some(&paid), &chain(ChainStatus::Refunded, 100 + SHIP_TIMEOUT)).unwrap();
        assert_eq!(refunded.close_reason, Some(CloseReason::ShipTimeout));
        assert_eq!(refunded.payment.status, PaymentStatus::Refunded);

        let disputed = mirror(None, &chain(ChainStatus::Disputed, 300)).unwrap();
        let mut won = chain(ChainStatus::Completed, 310);
        won.verdict = ChainVerdict::Seller;
        let resolved = mirror(Some(&disputed), &won).unwrap();
        assert_eq!((resolved.close_reason, resolved.verdict), (Some(CloseReason::VerdictSeller), Some(Verdict::Seller)));

        let requested = mirror(None, &chain(ChainStatus::ReturnRequested, 400)).unwrap();
        let kept = mirror(Some(&requested), &chain(ChainStatus::Completed, 5_000)).unwrap();
        assert_eq!(kept.close_reason, Some(CloseReason::ReturnShipTimeout));
    }

    #[test]
    fn hashes_and_texts_are_none_until_set() {
        let mut c = chain(ChainStatus::Shipped, 100);
        let d = mirror(None, &c).unwrap();
        assert_eq!((d.qr_commitment, d.tracking_number), (None, None));
        c.qr_commitment = [0xab; 32];
        c.tracking_number = "INPOST-1".into();
        let d = mirror(None, &c).unwrap();
        assert_eq!(d.qr_commitment, Some("ab".repeat(32)));
        assert_eq!(d.tracking_number.as_deref(), Some("INPOST-1"));
        assert_eq!(hex_opt(&[0; 32]), None);
    }
}
```

- [ ] **Step 2: Sprawdź, że testy nie przechodzą.** `cargo test --lib solana::mirror`. Oczekiwany wynik: FAIL (`not yet implemented`).

- [ ] **Step 3: Implementacja** (podmień funkcje z `todo!()`):

```rust
pub fn model_status(s: ChainStatus) -> Option<DealStatus> {
    Some(match s {
        ChainStatus::Paid => DealStatus::Paid,
        ChainStatus::Shipped => DealStatus::Shipped,
        ChainStatus::Disputed => DealStatus::Disputed,
        ChainStatus::ReturnRequested => DealStatus::ReturnRequested,
        ChainStatus::Returning => DealStatus::Returning,
        ChainStatus::Completed => DealStatus::Completed,
        ChainStatus::Refunded => DealStatus::Refunded,
        ChainStatus::Listed | ChainStatus::Cancelled => return None,
    })
}

pub fn hex_opt(h: &[u8; 32]) -> Option<String> {
    (*h != [0u8; 32]).then(|| hex::encode(h))
}

fn text_opt(s: &str) -> Option<String> {
    (!s.is_empty()).then(|| s.to_string())
}

fn event_kind(s: DealStatus) -> &'static str {
    match s {
        DealStatus::Paid => "paid",
        DealStatus::Shipped => "shipped",
        DealStatus::Disputed => "disputed",
        DealStatus::ReturnRequested => "return_requested",
        DealStatus::Returning => "returning",
        DealStatus::Completed => "completed",
        DealStatus::Refunded => "refunded",
    }
}

/// The program allows party actions only before the deadline and settle_expired only after it,
/// so the previous status plus "before/after deadline" tells why the deal closed.
pub fn close_reason(prev: Option<&Deal>, to: DealStatus, verdict: ChainVerdict, changed_at: Unix) -> Option<CloseReason> {
    let before_deadline = prev.and_then(|d| d.deadline_at).is_some_and(|dl| changed_at < dl);
    match (to, prev.map(|d| d.status)) {
        (DealStatus::Completed, _) if verdict == ChainVerdict::Seller => Some(CloseReason::VerdictSeller),
        (DealStatus::Completed, Some(DealStatus::Shipped)) => {
            Some(if before_deadline { CloseReason::Accepted } else { CloseReason::UnboxTimeout })
        }
        (DealStatus::Completed, Some(DealStatus::ReturnRequested)) => Some(CloseReason::ReturnShipTimeout),
        (DealStatus::Refunded, Some(DealStatus::Paid)) => Some(CloseReason::ShipTimeout),
        (DealStatus::Refunded, Some(DealStatus::Returning)) => {
            Some(if before_deadline { CloseReason::ReturnConfirmed } else { CloseReason::ReturnConfirmTimeout })
        }
        _ => prev.and_then(|d| d.close_reason),
    }
}

/// The API document for `listing`'s deal. None when the account is not a deal yet (Listed/Cancelled)
/// or the snapshot is older than the stored one (RPC nodes can lag; webhook and poller race).
pub fn mirror_deal(prev: Option<&Deal>, listing: &Listing, snap: &ChainSnapshot, buyer: Party, now: Unix) -> Option<Deal> {
    let chain = snap.deal;
    let status = model_status(chain.status)?;
    if prev.is_some_and(|p| chain.status_changed_at < p.status_changed_at) {
        return None;
    }
    let mut timeline = prev.map(|p| p.timeline.clone()).unwrap_or_default();
    let mut transactions = prev.and_then(|p| p.onchain.as_ref()).map(|o| o.transactions.clone()).unwrap_or_default();
    if prev.map(|p| p.status) != Some(status) {
        timeline.push(TimelineEvent { at: chain.status_changed_at, kind: event_kind(status).into(), label: status_label(status).into() });
        transactions.push(ChainTx {
            status,
            at: chain.status_changed_at,
            signature: snap.signature.clone(),
            explorer_url: snap.explorer_url.clone(),
        });
    }
    let terminal = matches!(status, DealStatus::Completed | DealStatus::Refunded);
    let payment = Payment {
        status: match status {
            DealStatus::Completed => PaymentStatus::Released,
            DealStatus::Refunded => PaymentStatus::Refunded,
            _ => PaymentStatus::Secured,
        },
        amount_minor: chain.price_lamports as i64,
        currency: "SOL".into(),
        secured_at: prev.map(|p| p.payment.secured_at).unwrap_or(chain.status_changed_at),
        settled_at: terminal.then_some(chain.status_changed_at),
    };
    let verdict = match chain.verdict {
        ChainVerdict::None => None,
        ChainVerdict::Seller => Some(Verdict::Seller),
        ChainVerdict::Buyer => Some(Verdict::Buyer),
    };
    Some(Deal {
        id: listing.id.clone(),
        listing: ListingMetadata::of(listing),
        listing_hash: hex::encode(chain.listing_hash),
        seller_id: listing.seller_id.clone(),
        seller: listing.seller.clone(),
        buyer_id: buyer.id.clone(),
        buyer,
        status,
        status_changed_at: chain.status_changed_at,
        deadline_at: unbox_escrow::logic::deadline(chain.status, chain.status_changed_at),
        payment,
        qr_commitment: hex_opt(&chain.qr_commitment),
        packing_video_sha256: hex_opt(&chain.packing_video_hash),
        tracking_number: text_opt(&chain.tracking_number),
        unboxing_video_sha256: hex_opt(&chain.unboxing_video_hash),
        complaint: prev.and_then(|p| p.complaint.clone()),
        complaint_hash: hex_opt(&chain.complaint_hash),
        analysis: prev.and_then(|p| p.analysis.clone()),
        verdict,
        return_qr_commitment: hex_opt(&chain.return_qr_commitment),
        return_video_sha256: hex_opt(&chain.return_video_hash),
        return_tracking_number: text_opt(&chain.return_tracking_number),
        close_reason: close_reason(prev, status, chain.verdict, chain.status_changed_at),
        timeline,
        created_at: prev.map(|p| p.created_at).unwrap_or(now),
        onchain: Some(OnChainDeal {
            deal: snap.address.to_string(),
            seller_wallet: chain.seller.to_string(),
            buyer_wallet: chain.buyer.to_string(),
            price_lamports: chain.price_lamports,
            transactions,
        }),
    })
}
```

- [ ] **Step 4: Uruchom testy.** `cargo test --lib solana::mirror` daje 7 passed, a pełny `cargo test` jest zielony.
- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): pure mirror of on-chain Deal accounts into API deals"
```

### Task 7: Publikacja ogłoszenia w SOL, `metadata.json`, blokady trybu demo

**Files:**
- Modify: `server/src/{routes.rs,seed.rs,deals.rs}`, `server/tests/solana.rs`

**Interfaces:**
- Consumes: `OnChainListing` (Task 5), `solana::demo_only` (Task 4), `machine::{hash_document, canonical_json, sha256_hex}`, `unbox_escrow::{ID, constants::{DEAL_SEED, MAX_METADATA_URI_LEN}}`.
- Produces:
  - `POST /api/listings/{id}/publish` (właściciel z podłączonym portfelem) → `{listingId, deal, dealId, priceLamports, listingHash, metadataUri, arbiter, programId}`, czyli argumenty `create_listing`. Operacja jest idempotentna.
  - `GET /api/listings/{id}/metadata.json` zwraca dokładnie bajty, których sha256 = `listingHash`.
  - W trybie solana:
    - „Przeglądaj” pokazuje tylko ogłoszenia z `onchain.published`;
    - edycja po publikacji i anulowanie opublikowanego zwracają 409;
    - `purchase`/`ship`/`accept`/`dispute`/`return`/`confirm-return`/`settle` zwracają 409;
    - nie ma leniwego wygaszania (`expire_if_due`);
    - seed jest w SOL i bez `top_up`.

- [ ] **Step 1: Testy** — dopisz do `server/tests/solana.rs` (i rozszerz importy):

```rust
use anchor_lang::prelude::Pubkey;
use serde_json::json;
use sha2::{Digest, Sha256};

pub fn random_key() -> Pubkey {
    Pubkey::new_from_array(rand::random())
}

pub async fn linked(b: &Backend, email: &str, wallet: &Pubkey) -> Api {
    let a = b.login(email).await;
    let (s, v) = a.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": wallet.to_string() }))).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    a
}

#[tokio::test]
async fn seed_is_in_sol_and_unpublished_listings_are_hidden() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let (_, browse) = b.anon().call(Method::GET, "/api/listings", None).await;
    assert_eq!(browse, json!([]));
    let ania = b.login("ania@demo.pl").await;
    let (_, mine) = ania.call(Method::GET, "/api/me/listings", None).await;
    let kurtka = mine.as_array().unwrap().iter().find(|l| l["id"] == "l-kurtka-levis").unwrap().clone();
    assert_eq!((kurtka["currency"].clone(), kurtka["priceMinor"].clone()), (json!("SOL"), json!(60_000_000)));
}

#[tokio::test]
async fn publish_returns_create_listing_args_and_serves_hashed_metadata() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let ania = b.login("ania@demo.pl").await;
    let (s, v) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    assert_eq!((s, v["error"]["code"].clone()), (StatusCode::CONFLICT, json!("INVALID_STATE")), "no wallet yet");

    let seller = random_key();
    let ania = linked(&b, "ania@demo.pl", &seller).await;
    let (s, v) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let deal_id = v["dealId"].as_u64().unwrap();
    let (pda, _) = Pubkey::find_program_address(&[b"deal", seller.as_ref(), &deal_id.to_le_bytes()], &unbox_escrow::ID);
    assert_eq!(v["deal"], pda.to_string());
    assert_eq!(v["priceLamports"], 60_000_000);
    assert_eq!(v["arbiter"], ARBITER);
    assert_eq!(v["programId"], unbox_escrow::ID.to_string());
    let uri = v["metadataUri"].as_str().unwrap().to_string();
    assert_eq!(uri, format!("{}/api/listings/l-kurtka-levis/metadata.json", b.url));
    let bytes = reqwest::get(&uri).await.unwrap().bytes().await.unwrap();
    assert_eq!(hex::encode(Sha256::digest(&bytes)), v["listingHash"].as_str().unwrap());

    let (_, again) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    assert_eq!(again["deal"], v["deal"], "publish is idempotent");
    let bartek = linked(&b, "bartek@demo.pl", &random_key()).await;
    assert_eq!(bartek.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await.0, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn publish_freezes_listing() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let ania = linked(&b, "ania@demo.pl", &random_key()).await;
    let (_, v) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    let (s, e) = ania.call(Method::PATCH, "/api/listings/l-kurtka-levis", Some(json!({ "title": "Inna kurtka" }))).await;
    assert_eq!((s, e["error"]["code"].clone()), (StatusCode::CONFLICT, json!("INVALID_STATE")));
    let bytes = reqwest::get(v["metadataUri"].as_str().unwrap()).await.unwrap().bytes().await.unwrap();
    assert_eq!(hex::encode(Sha256::digest(&bytes)), v["listingHash"].as_str().unwrap());
}

#[tokio::test]
async fn legacy_actions_rejected_in_solana_mode() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let bartek = b.login("bartek@demo.pl").await;
    let (s, v) = bartek.call(Method::POST, "/api/listings/l-sukienka-zara/purchase", None).await;
    assert_eq!((s, v["error"]["code"].clone()), (StatusCode::CONFLICT, json!("INVALID_STATE")));
    let (_, l) = b.anon().call(Method::GET, "/api/listings/l-sukienka-zara", None).await;
    assert_eq!(l["status"], "Listed");
    for action in ["ship", "accept", "dispute", "return", "confirm-return", "settle"] {
        let (s, _) = bartek.call(Method::POST, &format!("/api/deals/l-sukienka-zara/{action}"), Some(json!({}))).await;
        assert_eq!(s, StatusCode::CONFLICT, "{action}");
    }
}
```
`linked` przyda się też w Task 8.

- [ ] **Step 2: Sprawdź, że testy nie przechodzą.** `cargo test --test solana`. Oczekiwany wynik: FAIL:
  - browse zwraca 3 ogłoszenia;
  - `currency` = PLN;
  - `/publish` i `/metadata.json` zwracają 404;
  - `purchase` zwraca 201.

- [ ] **Step 3: Seed w SOL.** W `server/src/seed.rs`:
  - dodaj import `use crate::config::PaymentsMode;`;
  - w `register_user` zastąp domknięcie `db::tx`:

```rust
    let demo_ledger = state.cfg.payments == PaymentsMode::Demo;
    db::tx(&mut conn, |c| {
        db::user_insert(c, &user, &hash)?;
        // PAYMENTS=solana: the balance is the wallet's SOL on-chain; there is no ledger to top up.
        if demo_ledger {
            wallet::top_up(c, &user.id, DEMO_START_BALANCE_MINOR, now)?;
        }
        Ok(())
    })?;
```
  - zmień sygnaturę na `fn listings(t: Unix, sol: bool) -> Vec<Listing>`;
  - na początku funkcji dopisz:

    ```rust
        // Devnet prices stay under 0.1 SOL, the `Minor` limit of @unbox/shared.
        let currency = if sol { "SOL" } else { "PLN" };
        let amount = |pln: i64, lamports: i64| if sol { lamports } else { pln };
    ```
  - w `mk` ustaw `currency: currency.into()`;
  - ceny w trzech wywołaniach: `amount(12_000, 60_000_000)` (kurtka), `amount(6_000, 30_000_000)` (sukienka), `amount(18_000, 90_000_000)` (Nike);
  - w `seed` wywołuj `listings(now, state.cfg.payments == PaymentsMode::Solana)`.

- [ ] **Step 4: Brak leniwego wygaszania.** W `server/src/deals.rs`, na początku `expire_if_due`:

```rust
    // PAYMENTS=solana: deadlines are enforced by the program (settle_expired, callable by anyone).
    if state.cfg.payments == crate::config::PaymentsMode::Solana {
        return get_deal(&state.conn(), id);
    }
```

- [ ] **Step 5: Trasy.** W `server/src/routes.rs`:
  - dodaj importy `use crate::config::PaymentsMode;`, `use crate::solana;` i `use unbox_escrow::constants::{DEAL_SEED, MAX_METADATA_URI_LEN};`;
  - w `router` dopisz:

    ```rust
            .route("/listings/{id}/publish", post(publish_listing))
            .route("/listings/{id}/metadata.json", get(listing_metadata))
    ```
  - jako **pierwszą instrukcję** handlerów `purchase`, `ship`, `accept`, `dispute`, `mark_returned`, `confirm_return` i `settle` dopisz `solana::demo_only(&s)?;`, przed parsowaniem ciała, żeby w trybie solana zawsze było 409;
  - w `create_listing` ustaw `currency: if s.cfg.payments == PaymentsMode::Solana { "SOL" } else { "PLN" }.into(),`;
  - w `list_listings` dopisz przed filtrem `let solana_mode = s.cfg.payments == PaymentsMode::Solana;`, a do warunku `filter` dopisz `&& (!solana_mode || l.onchain.as_ref().is_some_and(|o| o.published))`;
  - w `update_listing`, w `db::tx`, po sprawdzeniu statusu dopisz:

    ```rust
            if l.onchain.is_some() {
                return Err(ApiError::invalid_state("Ogłoszenie jest opublikowane w umowie, treści nie można już zmienić"));
            }
    ```
  - w `cancel_listing`, po sprawdzeniu statusu dopisz:

    ```rust
            if l.onchain.as_ref().is_some_and(|o| o.published) {
                return Err(ApiError::invalid_state("Opublikowane ogłoszenie anulujesz w portfelu (cancel_listing)"));
            }
    ```
  - w sekcji ogłoszeń dopisz:
```rust
/// PAYMENTS=solana: freezes the listing and returns the `create_listing` arguments; the app signs them.
async fn publish_listing(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>) -> Res {
    let sol = s.cfg.solana.clone().ok_or_else(|| ApiError::invalid_state("Publikacja w umowie działa tylko przy PAYMENTS=solana"))?;
    let wallet = u
        .wallet_address
        .clone()
        .ok_or_else(|| ApiError::invalid_state("Najpierw podłącz portfel (PUT /api/me/wallet-address)"))?;
    let seller = Pubkey::from_str(&wallet).map_err(|_| ApiError::internal("Zapisany adres portfela jest niepoprawny"))?;
    let t = s.now();
    let base = s.cfg.public_base_url.clone();
    let mut conn = s.conn();
    let l = db::tx(&mut conn, |c| {
        let mut l = load_listing(c, &id)?;
        if l.seller_id != u.id {
            return Err(ApiError::forbidden("To nie Twoje ogłoszenie"));
        }
        if l.status != ListingStatus::Listed {
            return Err(ApiError::invalid_state("Ogłoszenie nie jest już dostępne"));
        }
        if l.currency != "SOL" {
            return Err(ApiError::invalid_state("Cena ogłoszenia nie jest w SOL"));
        }
        if l.onchain.is_none() {
            let deal_id = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let (deal, _) =
                Pubkey::find_program_address(&[DEAL_SEED, seller.as_ref(), &deal_id.to_le_bytes()], &unbox_escrow::ID);
            let metadata_uri = format!("{base}/api/listings/{}/metadata.json", l.id);
            if metadata_uri.len() > MAX_METADATA_URI_LEN {
                return Err(ApiError::internal("PUBLIC_BASE_URL jest za długi: metadata_uri musi mieć najwyżej 200 znaków"));
            }
            l.onchain = Some(OnChainListing {
                deal: deal.to_string(),
                deal_id,
                seller_wallet: wallet.clone(),
                listing_hash: machine::hash_document(&ListingMetadata::of(&l)),
                metadata_uri,
                published: false,
            });
            l.updated_at = t;
            db::doc_put(c, "listing", &l.id, &l)?;
        }
        Ok(l)
    })?;
    let o = l.onchain.as_ref().expect("onchain set above");
    ok(&json!({
        "listingId": l.id, "deal": o.deal, "dealId": o.deal_id, "priceLamports": l.price_minor,
        "listingHash": o.listing_hash, "metadataUri": o.metadata_uri,
        "arbiter": sol.arbiter.to_string(), "programId": unbox_escrow::ID.to_string()
    }))
}

/// Exactly the bytes whose sha256 is `listing_hash` on-chain.
async fn listing_metadata(State(s): State<AppState>, Path(id): Path<String>) -> Res {
    let l = load_listing(&s.conn(), &id)?;
    let o = l.onchain.as_ref().ok_or_else(|| ApiError::not_found("Ogłoszenie nie jest opublikowane w umowie"))?;
    let bytes = machine::canonical_json(&ListingMetadata::of(&l));
    if machine::sha256_hex(bytes.as_bytes()) != o.listing_hash {
        return Err(ApiError::internal("Treść ogłoszenia nie zgadza się z hashem w umowie"));
    }
    Ok(([(header::CONTENT_TYPE, "application/json")], bytes).into_response())
}
```

- [ ] **Step 6: Uruchom testy.** `cargo test` daje wszystko passed, w tym 4 nowe w `solana.rs`; w trybie demo nic się nie zmieniło. `cargo clippy --all-targets -- -D warnings` jest czysty. `pnpm test:contract` daje 11/11.
- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): publish listings to the escrow program in SOL; demo-only REST actions"
```

### Task 8: Indekser, webhook Helius, poller, synchronizacja po transakcji, saldo SOL

**Files:**
- Create: `server/src/solana/{indexer.rs,webhook.rs}`
- Modify: `server/src/solana/mod.rs`, `server/src/lib.rs` (`spawn_background`), `server/src/routes.rs` (trasy solana i `my_wallet`), `server/tests/solana.rs`

**Interfaces:**
- Consumes:
  - `mirror::{mirror_deal, model_status, ChainSnapshot}` (Task 6)
  - `RpcChain`, `AppState.chain`, `AppState.chain_sync` (Task 4)
  - `db::user_by_wallet`, `OnChainListing` (Task 5)
- Produces:
  - `indexer::{known_addresses(&AppState) -> ApiResult<HashMap<String, String>>, sync_addresses(&AppState, &[Pubkey]) -> Result<usize, String>, sync_all(&AppState) -> Result<usize, String>, spawn_poller(&AppState)}`
  - `webhook::{candidate_keys(&Value) -> Vec<Pubkey>, helius(..)}`
  - trasy tylko w trybie solana:
    - `POST /api/webhooks/helius` → `{synced}`;
    - `POST /api/chain/sync/{address}` (zalogowany) → `{listingId, listingStatus, published, dealStatus}`;
  - `GET /api/me/wallet` w trybie solana → `{balanceMinor: lamporty z RPC, currency: "SOL", heldMinor, ledger: [], address}`.

- [ ] **Step 1: Testy `candidate_keys`.** `server/src/solana/webhook.rs`: sygnatury z `todo!()` i testy jednostkowe.

```rust
//! Helius webhook (accountAddresses = [PROGRAM_ID]). The payload is only a trigger: addresses of known
//! listings found in it are re-read over RPC. Nothing else in the payload is used or trusted.

use super::indexer;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;
use anchor_lang::prelude::Pubkey;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{header, HeaderMap};
use axum::Json;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::str::FromStr;

const MAX_CANDIDATES: usize = 256;

pub fn candidate_keys(_payload: &Value) -> Vec<Pubkey> { todo!() }

pub async fn helius(_s: State<AppState>, _headers: HeaderMap, _body: Bytes) -> ApiResult<Json<Value>> { todo!() }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_keys_in_raw_and_enhanced_payloads() {
        let a = Pubkey::new_from_array([1; 32]);
        let b = Pubkey::new_from_array([2; 32]);
        let payload = json!([
            { "transaction": { "message": { "accountKeys": [a.to_string()] },
              "signatures": ["5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"] } },
            { "accountData": [{ "account": b.to_string(), "nativeBalanceChange": 0 }], "type": "UNKNOWN" }
        ]);
        let keys = candidate_keys(&payload);
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&a) && keys.contains(&b));
    }

    #[test]
    fn ignores_junk_and_caps_the_list() {
        assert!(candidate_keys(&json!({ "hello": "world", "n": 5 })).is_empty());
        assert!(candidate_keys(&Value::Null).is_empty());
        let many: Vec<String> = (0..1000u32)
            .map(|i| {
                let mut b = [0u8; 32];
                b[..4].copy_from_slice(&i.to_le_bytes());
                Pubkey::new_from_array(b).to_string()
            })
            .collect();
        assert_eq!(candidate_keys(&json!(many)).len(), MAX_CANDIDATES);
    }
}
```
W `server/src/solana/mod.rs` dopisz `pub mod indexer;`, `pub mod mirror;` (jeśli jeszcze nie ma) i `pub mod webhook;`.

- [ ] **Step 2: Testy integracyjne.** Dopisz do `server/tests/solana.rs`. Rozszerz import do `use serde_json::{json, Value};` i dodaj:

```rust
use common::fake_rpc::chain_deal;
use std::str::FromStr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use unbox_escrow::state::{Deal as ChainDeal, DealStatus as ChainStatus};

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn raw_payload(address: &Pubkey) -> Value {
    json!([{ "slot": 1, "meta": { "err": null },
             "transaction": { "message": { "accountKeys": [address.to_string(), unbox_escrow::ID.to_string(),
                                                           "11111111111111111111111111111111"] },
                              "signatures": ["5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"] } }])
}

/// Ania (wallet linked) has published the jacket and Bartek has linked his wallet; nothing is on-chain yet.
struct Market {
    b: Backend,
    rpc: FakeRpc,
    ania: Api,
    bartek: Api,
    seller: Pubkey,
    buyer: Pubkey,
    deal: Pubkey,
    hash: String,
}

async fn market(poll_ms: &str) -> Market {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, poll_ms).await;
    let (seller, buyer) = (random_key(), random_key());
    let ania = linked(&b, "ania@demo.pl", &seller).await;
    let bartek = linked(&b, "bartek@demo.pl", &buyer).await;
    let (_, v) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    let deal = Pubkey::from_str(v["deal"].as_str().unwrap()).unwrap();
    let hash = v["listingHash"].as_str().unwrap().to_string();
    Market { b, rpc, ania, bartek, seller, buyer, deal, hash }
}

impl Market {
    fn chain(&self, status: ChainStatus, at: i64) -> ChainDeal {
        chain_deal(self.seller, self.buyer, status, at, &self.hash, 60_000_000)
    }

    async fn webhook(&self, payload: Value, secret: Option<&str>) -> (StatusCode, Value) {
        let mut req = reqwest::Client::new().post(format!("{}/api/webhooks/helius", self.b.url)).json(&payload);
        if let Some(s) = secret {
            req = req.header("authorization", s);
        }
        let res = req.send().await.unwrap();
        let status = res.status();
        (status, res.json().await.unwrap_or(Value::Null))
    }

    async fn notify(&self) -> Value {
        let (s, v) = self.webhook(raw_payload(&self.deal), Some("s3cret")).await;
        assert_eq!(s, StatusCode::OK, "{v}");
        v
    }
}

#[tokio::test]
async fn webhook_publishes_listing_into_browse() {
    let m = market("600000").await;
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Listed, now()));
    assert_eq!(m.notify().await["synced"], 1);
    let (_, browse) = m.b.anon().call(Method::GET, "/api/listings", None).await;
    let ids: Vec<Value> = browse.as_array().unwrap().iter().map(|l| l["id"].clone()).collect();
    assert_eq!(ids, [json!("l-kurtka-levis")]);
}

#[tokio::test]
async fn on_chain_purchase_ship_accept_is_mirrored() {
    let m = market("600000").await;
    let t = now();
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Paid, t));
    m.notify().await;
    let (_, deals) = m.bartek.call(Method::GET, "/api/deals?role=buyer", None).await;
    let d = &deals[0];
    assert_eq!((d["status"].clone(), d["payment"]["status"].clone()), (json!("Paid"), json!("secured")));
    assert_eq!((d["payment"]["amountMinor"].clone(), d["payment"]["currency"].clone()), (json!(60_000_000), json!("SOL")));
    assert_eq!(d["buyer"]["id"], "u-bartek");
    let (_, l) = m.b.anon().call(Method::GET, "/api/listings/l-kurtka-levis", None).await;
    assert_eq!(l["status"], "Sold");

    let mut shipped = m.chain(ChainStatus::Shipped, t + 5);
    shipped.tracking_number = "INPOST-1".into();
    shipped.qr_commitment = [0xab; 32];
    m.rpc.put_deal(&m.deal, &shipped);
    m.notify().await;
    let (_, d) = m.ania.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!((d["status"].clone(), d["trackingNumber"].clone()), (json!("Shipped"), json!("INPOST-1")));

    let mut done = shipped.clone();
    done.status = ChainStatus::Completed;
    done.status_changed_at = t + 10;
    m.rpc.put_deal(&m.deal, &done);
    m.notify().await;
    let (_, d) = m.bartek.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!((d["payment"]["status"].clone(), d["closeReason"].clone()), (json!("released"), json!("accepted")));
    let kinds: Vec<Value> = d["timeline"].as_array().unwrap().iter().map(|e| e["type"].clone()).collect();
    assert_eq!(kinds, [json!("paid"), json!("shipped"), json!("completed")]);
    let explorer = d["onchain"]["transactions"][2]["explorerUrl"].as_str().unwrap().to_string();
    assert!(explorer.contains(&format!("sig-{}", m.deal)) && explorer.contains("cluster=devnet"), "{explorer}");
}

#[tokio::test]
async fn webhook_is_idempotent_and_authenticated() {
    let m = market("600000").await;
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Paid, now()));
    assert_eq!(m.webhook(raw_payload(&m.deal), None).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(m.webhook(raw_payload(&m.deal), Some("wrong")).await.0, StatusCode::UNAUTHORIZED);
    m.notify().await;
    m.notify().await; // Helius retry
    let (_, d) = m.ania.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!(d["timeline"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn webhook_ignores_junk_without_rpc_and_reports_rpc_failure() {
    let m = market("600000").await;
    let before = m.rpc.calls();
    for junk in [json!("not an array"), json!({ "hello": "world" }), raw_payload(&random_key())] {
        assert_eq!(m.webhook(junk, Some("s3cret")).await, (StatusCode::OK, json!({ "synced": 0 })));
    }
    assert_eq!(m.rpc.calls(), before, "junk must not reach RPC");
    m.rpc.set_failing(true);
    assert_eq!(m.webhook(raw_payload(&m.deal), Some("s3cret")).await.0, StatusCode::BAD_GATEWAY);
}

#[tokio::test]
async fn mismatched_listing_hash_is_not_mirrored() {
    let m = market("600000").await;
    let mut forged = m.chain(ChainStatus::Listed, now());
    forged.listing_hash = [9; 32];
    m.rpc.put_deal(&m.deal, &forged);
    m.notify().await;
    let (_, browse) = m.b.anon().call(Method::GET, "/api/listings", None).await;
    assert_eq!(browse, json!([]));
    forged.status = ChainStatus::Paid;
    m.rpc.put_deal(&m.deal, &forged);
    m.notify().await;
    let (_, deals) = m.ania.call(Method::GET, "/api/deals?role=seller", None).await;
    assert_eq!(deals, json!([]));
}

#[tokio::test]
async fn ignores_unknown_and_undecodable_accounts() {
    let m = market("600000").await;
    let mut garbage = <ChainDeal as anchor_lang::Discriminator>::DISCRIMINATOR.to_vec();
    garbage.extend_from_slice(&[1, 2, 3]);
    m.rpc.put_raw(&m.deal, garbage);
    assert_eq!(m.notify().await["synced"], 0);
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Listed, now()));
    assert_eq!(m.notify().await["synced"], 1);
}

#[tokio::test]
async fn unknown_buyer_wallet_still_mirrored() {
    let m = market("600000").await;
    let stranger = random_key();
    let mut paid = m.chain(ChainStatus::Paid, now());
    paid.buyer = stranger;
    m.rpc.put_deal(&m.deal, &paid);
    m.notify().await;
    let (_, deals) = m.ania.call(Method::GET, "/api/deals?role=seller", None).await;
    assert_eq!(deals[0]["buyer"]["id"], format!("wallet:{stranger}"));
}

#[tokio::test]
async fn wallet_balance_from_chain() {
    let m = market("600000").await;
    m.rpc.set_balance(&m.buyer.to_string(), 1_500_000_000);
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Paid, now()));
    m.notify().await;
    let (s, w) = m.bartek.call(Method::GET, "/api/me/wallet", None).await;
    assert_eq!(s, StatusCode::OK, "{w}");
    assert_eq!(
        (w["balanceMinor"].clone(), w["currency"].clone(), w["heldMinor"].clone()),
        (json!(1_500_000_000u64), json!("SOL"), json!(60_000_000))
    );
    assert_eq!(w["address"], m.buyer.to_string());
    let celina = m.b.login("celina@demo.pl").await;
    let (_, w) = celina.call(Method::GET, "/api/me/wallet", None).await;
    assert_eq!((w["balanceMinor"].clone(), w["ledger"].clone()), (json!(0), json!([])));
}

#[tokio::test]
async fn chain_sync_endpoint_and_poller() {
    let m = market("200").await;
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Listed, now()));
    let (s, v) = m.ania.call(Method::POST, &format!("/api/chain/sync/{}", m.deal), None).await;
    assert_eq!((s, v["published"].clone()), (StatusCode::OK, json!(true)));
    assert_eq!(m.ania.call(Method::POST, &format!("/api/chain/sync/{}", random_key()), None).await.0, StatusCode::NOT_FOUND);
    assert_eq!(m.ania.call(Method::POST, "/api/chain/sync/nope", None).await.0, StatusCode::BAD_REQUEST);

    // No webhook: the poller (200 ms) picks the purchase up by itself.
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Paid, now()));
    let mut status = Value::Null;
    for _ in 0..30 {
        let (_, d) = m.bartek.call(Method::GET, "/api/deals?role=buyer", None).await;
        status = d[0]["status"].clone();
        if status == "Paid" {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert_eq!(status, "Paid");
    let (_, h) = m.b.anon().call(Method::GET, "/api/health", None).await;
    assert!(h["chain"]["lastSyncAt"].is_i64(), "{h}");
}
```

- [ ] **Step 3: Sprawdź, że testy nie przechodzą.** `cargo test --test solana` i `cargo test --lib solana::webhook`. Oczekiwany wynik: FAIL (`/api/webhooks/helius` zwraca 404, a `candidate_keys` panikuje na `todo!()`).

- [ ] **Step 4: Indekser** — `server/src/solana/indexer.rs`:

```rust
//! Mirrors `Deal` accounts of the program into SQLite. Triggered by the Helius webhook, the poller and
//! `POST /api/chain/sync/{address}`. Read-only: the chain is the source of truth, SQLite is a cache.

use super::explorer_tx_url;
use super::mirror::{mirror_deal, model_status, ChainSnapshot};
use crate::db;
use crate::error::{ApiError, ApiResult};
use crate::model::*;
use crate::state::AppState;
use anchor_lang::prelude::Pubkey;
use anchor_lang::AccountDeserialize;
use std::collections::HashMap;
use std::time::Duration;
use unbox_escrow::state::{Deal as ChainDeal, DealStatus as ChainStatus};

/// Deal PDA (base58) → listing id, for every listing published (or being published) to the program.
pub fn known_addresses(state: &AppState) -> ApiResult<HashMap<String, String>> {
    Ok(db::doc_list::<Listing>(&state.conn(), "listing")?
        .into_iter()
        .filter_map(|l| l.onchain.map(|o| (o.deal, l.id)))
        .collect())
}

/// Re-reads `addresses` over RPC; returns how many Deal accounts of known listings were applied.
pub async fn sync_addresses(state: &AppState, addresses: &[Pubkey]) -> Result<usize, String> {
    let chain = state.chain.clone().ok_or("PAYMENTS=demo")?;
    let accounts = chain.accounts(addresses).await?;
    ingest(state, accounts).await
}

/// Full pass over getProgramAccounts: startup (state survives in SQLite anyway) and the polling fallback.
pub async fn sync_all(state: &AppState) -> Result<usize, String> {
    let chain = state.chain.clone().ok_or("PAYMENTS=demo")?;
    let result = match chain.all_deals().await {
        Ok(accounts) => ingest(state, accounts).await,
        Err(e) => Err(e),
    };
    let mut sync = state.chain_sync.lock().unwrap_or_else(|p| p.into_inner());
    match &result {
        Ok(_) => {
            sync.last_sync_at = Some(state.now());
            sync.last_error = None;
        }
        Err(e) => sync.last_error = Some(e.clone()),
    }
    result
}

/// Fallback when webhooks do not arrive (no tunnel, Helius hiccup). The first tick runs at once.
pub fn spawn_poller(state: &AppState) {
    let Some(cfg) = state.cfg.solana.clone() else { return };
    let s = state.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(cfg.poll_ms.max(100)));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tick.tick().await;
            if let Err(e) = sync_all(&s).await {
                tracing::warn!("chain poll: {e}");
            }
        }
    });
}

async fn ingest(state: &AppState, accounts: Vec<(Pubkey, Vec<u8>)>) -> Result<usize, String> {
    let chain = state.chain.clone().ok_or("PAYMENTS=demo")?;
    let known = known_addresses(state).map_err(|e| e.message)?;
    let mut applied = 0;
    for (address, data) in accounts {
        let key = address.to_string();
        let Some(listing_id) = known.get(&key) else {
            tracing::debug!(%key, "deal of an unknown listing, skipped");
            continue;
        };
        let deal = match ChainDeal::try_deserialize(&mut data.as_slice()) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!(%key, "not a current Deal account, skipped: {e}");
                continue;
            }
        };
        let signature = if status_changes(state, listing_id, deal.status) {
            chain.latest_signature(&address).await.unwrap_or_else(|e| {
                tracing::warn!(%key, "no signature: {e}");
                None
            })
        } else {
            None
        };
        apply(state, listing_id, &key, &deal, signature).map_err(|e| e.message)?;
        applied += 1;
    }
    Ok(applied)
}

fn status_changes(state: &AppState, listing_id: &str, status: ChainStatus) -> bool {
    let Some(next) = model_status(status) else { return false };
    let stored: Option<Deal> = db::doc_get(&state.conn(), "deal", listing_id).ok().flatten();
    stored.map(|d| d.status) != Some(next)
}

fn apply(state: &AppState, listing_id: &str, address: &str, chain: &ChainDeal, signature: Option<String>) -> ApiResult<()> {
    let explorer_url = signature.as_deref().zip(state.cfg.solana.as_ref()).map(|(sig, cfg)| explorer_tx_url(sig, cfg));
    let now = state.now();
    let mut conn = state.conn();
    db::tx(&mut conn, |c| {
        let mut l: Listing =
            db::doc_get(c, "listing", listing_id)?.ok_or_else(|| ApiError::not_found("Nie ma takiego ogłoszenia"))?;
        let Some(onchain) = l.onchain.as_mut() else { return Ok(()) };
        // The account must describe exactly the content we serve; otherwise it is not this listing's deal.
        if hex::encode(chain.listing_hash) != onchain.listing_hash || chain.seller.to_string() != onchain.seller_wallet {
            tracing::warn!(%address, "on-chain deal does not match the stored listing, ignored");
            return Ok(());
        }
        match chain.status {
            ChainStatus::Listed => {
                if !onchain.published {
                    onchain.published = true;
                    l.updated_at = now;
                    db::doc_put(c, "listing", &l.id, &l)?;
                }
            }
            ChainStatus::Cancelled => {
                if l.status != ListingStatus::Cancelled {
                    l.status = ListingStatus::Cancelled;
                    l.updated_at = now;
                    db::doc_put(c, "listing", &l.id, &l)?;
                }
            }
            _ => {
                onchain.published = true;
                if l.status != ListingStatus::Sold {
                    l.status = ListingStatus::Sold;
                    l.updated_at = now;
                }
                db::doc_put(c, "listing", &l.id, &l)?;
                let prev: Option<Deal> = db::doc_get(c, "deal", &l.id)?;
                let buyer_wallet = chain.buyer.to_string();
                let buyer = match db::user_by_wallet(c, &buyer_wallet)? {
                    Some(u) => Party { id: u.id, name: u.name },
                    None => Party { id: format!("wallet:{buyer_wallet}"), name: format!("Portfel {}…", &buyer_wallet[..6]) },
                };
                let snap = ChainSnapshot { address, deal: chain, signature, explorer_url };
                if let Some(next) = mirror_deal(prev.as_ref(), &l, &snap, buyer, now) {
                    db::doc_put(c, "deal", &next.id, &next)?;
                }
            }
        }
        Ok(())
    })
}
```

- [ ] **Step 5: Webhook** (podmień funkcje z `todo!()` w `webhook.rs`):

```rust
/// Every string in the payload that parses as a 32-byte key; works for Helius raw and enhanced payloads.
pub fn candidate_keys(payload: &Value) -> Vec<Pubkey> {
    let mut found = BTreeSet::new();
    collect(payload, &mut found);
    found.into_iter().collect()
}

fn collect(value: &Value, out: &mut BTreeSet<Pubkey>) {
    if out.len() >= MAX_CANDIDATES {
        return;
    }
    match value {
        Value::String(s) if (32..=44).contains(&s.len()) => {
            if let Ok(key) = Pubkey::from_str(s) {
                out.insert(key);
            }
        }
        Value::Array(items) => items.iter().for_each(|item| collect(item, out)),
        Value::Object(map) => map.values().for_each(|item| collect(item, out)),
        _ => {}
    }
}

pub async fn helius(State(s): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult<Json<Value>> {
    let cfg = s.cfg.solana.as_ref().ok_or_else(|| ApiError::not_found("Nie ma takiego endpointu"))?;
    if let Some(secret) = &cfg.webhook_secret {
        let given = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok());
        if given != Some(secret.as_str()) {
            return Err(ApiError::unauthorized("Nieprawidłowy sekret webhooka"));
        }
    }
    let payload: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let known = indexer::known_addresses(&s)?;
    let keys: Vec<Pubkey> =
        candidate_keys(&payload).into_iter().filter(|k| known.contains_key(&k.to_string())).collect();
    let synced = if keys.is_empty() {
        0
    } else {
        // 502 makes Helius retry later; the poller covers the gap meanwhile.
        indexer::sync_addresses(&s, &keys).await.map_err(|e| ApiError::upstream(format!("RPC: {e}")))?
    };
    tracing::info!(synced, "helius webhook");
    Ok(Json(json!({ "synced": synced })))
}
```

- [ ] **Step 6: Trasy, saldo i start.**

  W `server/src/routes.rs`, w `router`, przed `Router::new().nest("/api", api)`:
```rust
    if state.cfg.payments == PaymentsMode::Solana {
        api = api
            .route("/webhooks/helius", post(solana::webhook::helius))
            .route("/chain/sync/{address}", post(chain_sync));
    }
```
  W sekcji transakcji:
```rust
/// The app calls this right after its transaction confirms, so the UI does not wait for the webhook.
async fn chain_sync(State(s): State<AppState>, AuthUser(_u): AuthUser, Path(address): Path<String>) -> Res {
    let key = Pubkey::from_str(&address).map_err(|_| ApiError::validation("Niepoprawny adres umowy"))?;
    let listing_id = solana::indexer::known_addresses(&s)?
        .remove(&address)
        .ok_or_else(|| ApiError::not_found("Nie ma ogłoszenia z tym adresem umowy"))?;
    solana::indexer::sync_addresses(&s, &[key]).await.map_err(|e| ApiError::upstream(format!("RPC: {e}")))?;
    let conn = s.conn();
    let listing = load_listing(&conn, &listing_id)?;
    let deal: Option<Deal> = db::doc_get(&conn, "deal", &listing_id)?;
    ok(&json!({
        "listingId": listing_id, "listingStatus": listing.status,
        "published": listing.onchain.map(|o| o.published), "dealStatus": deal.map(|d| d.status)
    }))
}
```
  `my_wallet` zastąp tym:
```rust
async fn my_wallet(State(s): State<AppState>, AuthUser(u): AuthUser) -> Res {
    if let Some(chain) = s.chain.clone() {
        // PAYMENTS=solana: the balance is the wallet's SOL; "held" is what sits in escrow for this buyer.
        let balance = match &u.wallet_address {
            Some(a) => {
                let key = Pubkey::from_str(a).map_err(|_| ApiError::internal("Zapisany adres portfela jest niepoprawny"))?;
                chain.balance(&key).await.map_err(|e| ApiError::upstream(format!("RPC: {e}")))?
            }
            None => 0,
        };
        let held_minor = db::doc_list::<Deal>(&s.conn(), "deal")?
            .iter()
            .filter(|d| d.buyer_id == u.id && d.payment.status == PaymentStatus::Secured)
            .map(|d| d.payment.amount_minor)
            .sum();
        return ok(&Wallet {
            balance_minor: balance as i64,
            currency: "SOL".into(),
            held_minor,
            ledger: vec![],
            address: u.wallet_address.clone(),
        });
    }
    deals::expire_due_for(&s, &u.id)?; // saldo zawsze po domknięciu transakcji, których termin minął
    ok(&wallet::wallet_of(&s.conn(), &u.id)?)
}
```
  W `server/src/lib.rs`, w `spawn_background`, w gałęzi solana przed `return;` dopisz `solana::indexer::spawn_poller(state);`.

- [ ] **Step 7: Uruchom testy.**
  - `cargo test` daje wszystko passed: 2 nowe testy jednostkowe webhooka i 9 nowych w `solana.rs`.
  - `cargo clippy --all-targets -- -D warnings` jest czysty.
  - `pnpm test:contract` daje 11/11.
- [ ] **Step 8: Commit**

```bash
git add server
git commit -m "feat(server): mirror escrow deals from Helius webhooks and polling; SOL wallet balance"
```

---

## Faza C — CLI, dokumentacja, E2E

### Task 9: `unbox-cli` — demo bez telefonu (login w `server/`, podpis z pliku keypaira)

**Files:**
- Create: `cli/Cargo.toml`, `cli/src/{main.rs,qr.rs}`

**Interfaces:**
- Consumes:
  - `unbox_escrow::{accounts::*, instruction::*, state::Deal, logic::ship_commitment, ID}`;
  - API `server/`: `POST /api/auth/login`, `PUT /api/me/wallet-address`, `POST /api/listings/{id}/publish`, `GET /api/listings/{id}`, `POST /api/chain/sync/{deal}`, `GET /api/deals/{id}`;
  - `anchor_client::{Client, Cluster::Custom(http, ws), CommitmentConfig, Program, Signer}`, `solana_keypair::read_keypair_file`.
- Produces: `unbox-cli --email <e> --keypair <path> <link|publish|buy|ship|accept|settle|show>` oraz `qr::{ship_payload, parse_ship}`.

CLI to narzędzie deweloperskie i zapasowe demo. Podpisuje wyłącznie kluczem z pliku osoby, która je uruchamia. Nie wysyła nagrań do storage, tylko liczy ich hash; upload robi aplikacja (O4).

- [ ] **Step 1: Crate** — `cli/Cargo.toml` (własny pusty `[workspace]`, tak jak w `server/`):

```toml
[package]
name = "unbox_cli"
version = "0.1.0"
edition = "2021"
publish = false

# Standalone crate: an empty [workspace] keeps it out of the root workspace (programs/*).
[workspace]

[[bin]]
name = "unbox-cli"
path = "src/main.rs"

[dependencies]
unbox_escrow = { path = "../programs/unbox_escrow", features = ["no-entrypoint"] }
anchor-client = "=1.1.2"
solana-keypair = "3.0.1"
anyhow = "1"
clap = { version = "4", features = ["derive", "env"] }
getrandom = "0.3"
hex = "0.4"
reqwest = { version = "0.12", default-features = false, features = ["blocking", "json", "rustls-tls"] }
serde_json = "1"
sha2 = "0.10"
```

- [ ] **Step 2: Testy QR.** `cli/src/qr.rs`: sygnatury z `todo!()` i testy na wektorach z `docs/zadania/README.md`.

```rust
use std::str::FromStr;

use anchor_client::anchor_lang::prelude::Pubkey;
use anyhow::{anyhow, bail, Result};

const SHIP_PREFIX: &str = "UNBOX1";
const RETURN_PREFIX: &str = "UNBOX1R";

pub fn ship_payload(_deal: &Pubkey, _secret: &[u8; 32]) -> String { todo!() }
pub fn parse_ship(_payload: &str) -> Result<(Pubkey, [u8; 32])> { todo!() }

#[cfg(test)]
mod tests {
    use super::*;

    const DEAL: &str = "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw";
    const PAYLOAD: &str =
        "UNBOX1:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t";

    #[test]
    fn payload_matches_the_shared_vector() {
        assert_eq!(ship_payload(&Pubkey::from_str(DEAL).unwrap(), &[0xab; 32]), PAYLOAD);
    }

    #[test]
    fn parse_round_trip_and_whitespace() {
        let (deal, secret) = parse_ship(&format!("  {PAYLOAD}\n")).unwrap();
        assert_eq!(deal.to_string(), DEAL);
        assert_eq!(secret, [0xab; 32]);
    }

    #[test]
    fn rejects_return_qr_and_garbage() {
        assert!(parse_ship(&PAYLOAD.replacen("UNBOX1", "UNBOX1R", 1)).unwrap_err().to_string().contains("return"));
        assert!(parse_ship("hello").is_err());
        assert!(parse_ship("UNBOX1:abc:def").is_err());
        assert!(parse_ship(&format!("{PAYLOAD}:extra")).is_err());
    }
}
```
Tymczasowy `cli/src/main.rs`, żeby crate się kompilował: `mod qr;` i `fn main() {}`.

- [ ] **Step 3: Sprawdź, że testy nie przechodzą.** `cd /work/cli && cargo test`. Oczekiwany wynik: FAIL (`not yet implemented`).

- [ ] **Step 4: Implementacja `qr.rs`** (podmień obie funkcje):

```rust
/// `UNBOX1:<deal_base58>:<secret_base58>`; 32 bytes in base58 is the pubkey encoding.
pub fn ship_payload(deal: &Pubkey, secret: &[u8; 32]) -> String {
    format!("{SHIP_PREFIX}:{deal}:{}", Pubkey::new_from_array(*secret))
}

pub fn parse_ship(payload: &str) -> Result<(Pubkey, [u8; 32])> {
    let mut parts = payload.trim().split(':');
    match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(SHIP_PREFIX), Some(deal), Some(secret), None) => {
            Ok((Pubkey::from_str(deal)?, Pubkey::from_str(secret)?.to_bytes()))
        }
        (Some(RETURN_PREFIX), ..) => bail!("this is a return QR, not a shipping QR"),
        _ => Err(anyhow!("not an UNBOX1 QR payload")),
    }
}
```

- [ ] **Step 5: Komendy** — `cli/src/main.rs`:

```rust
mod qr;

use std::rc::Rc;
use std::str::FromStr;

use anchor_client::anchor_lang::prelude::Pubkey;
use anchor_client::anchor_lang::system_program;
use anchor_client::{Client, Cluster, CommitmentConfig, Program, Signer};
use anyhow::{anyhow, ensure, Context, Result};
use clap::{Parser, Subcommand};
use reqwest::blocking::{Client as Http, RequestBuilder};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use solana_keypair::{read_keypair_file, Keypair};
use unbox_escrow::logic::ship_commitment;
use unbox_escrow::state::Deal;
use unbox_escrow::{accounts, instruction};

#[derive(Parser)]
#[command(name = "unbox-cli", about = "Drive the SOL escrow flow without a phone (devnet/localnet only)")]
struct Cli {
    #[arg(long, env = "RPC_URL", default_value = "https://api.devnet.solana.com")]
    rpc: String,
    #[arg(long, env = "API_URL", default_value = "http://localhost:4000")]
    api: String,
    /// Keypair file of whoever signs: the seller, the buyer, or anyone for `settle`.
    #[arg(long, env = "KEYPAIR")]
    keypair: String,
    /// Account in server/ (demo: ania@demo.pl sells, bartek@demo.pl buys).
    #[arg(long, env = "EMAIL")]
    email: String,
    #[arg(long, env = "PASSWORD", default_value = "demo1234")]
    password: String,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Link this keypair's address to the account (PUT /api/me/wallet-address).
    Link,
    /// Seller: publish a listing and sign create_listing.
    Publish {
        #[arg(long)]
        listing: String,
    },
    /// Buyer: verify the description hash, then pay into escrow (purchase).
    Buy {
        #[arg(long)]
        listing: String,
    },
    /// Seller: mark shipped; prints the QR payload for the card. Hashes the video, does not upload it.
    Ship {
        #[arg(long)]
        listing: String,
        #[arg(long)]
        tracking: String,
        #[arg(long)]
        video: String,
    },
    /// Buyer: "Wszystko OK" with the scanned QR payload (accept_delivery).
    Accept {
        #[arg(long)]
        qr: String,
    },
    /// Anyone: close a deal after its deadline (settle_expired).
    Settle {
        #[arg(long)]
        listing: String,
    },
    /// Print the server's view of a deal (you must be a party).
    Show {
        #[arg(long)]
        listing: String,
    },
}

type Prog = Program<Rc<Keypair>>;

struct Api {
    http: Http,
    base: String,
    token: String,
}

fn send(req: RequestBuilder) -> Result<Value> {
    let res = req.send()?;
    let status = res.status();
    let body: Value = res.json().unwrap_or(Value::Null);
    ensure!(status.is_success(), "HTTP {status}: {body}");
    Ok(body)
}

impl Api {
    fn login(base: &str, email: &str, password: &str) -> Result<Api> {
        let http = Http::new();
        let v = send(http.post(format!("{base}/api/auth/login")).json(&json!({ "email": email, "password": password })))?;
        let token = v["token"].as_str().context("login without token")?.to_string();
        Ok(Api { http, base: base.to_string(), token })
    }

    fn get(&self, path: &str) -> Result<Value> {
        send(self.http.get(format!("{}{path}", self.base)).bearer_auth(&self.token))
    }

    fn post(&self, path: &str) -> Result<Value> {
        send(self.http.post(format!("{}{path}", self.base)).bearer_auth(&self.token))
    }

    fn put(&self, path: &str, body: Value) -> Result<Value> {
        send(self.http.put(format!("{}{path}", self.base)).bearer_auth(&self.token).json(&body))
    }

    fn deal_of(&self, listing: &str) -> Result<Pubkey> {
        let l = self.get(&format!("/api/listings/{listing}"))?;
        let deal = l["onchain"]["deal"].as_str().context("listing is not published on-chain (run publish first)")?;
        Ok(Pubkey::from_str(deal)?)
    }
}

fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

fn ws_url(rpc: &str) -> String {
    rpc.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1)
}

/// Fetches metadata.json and checks it against the on-chain hash; the server is not trusted for this.
fn verified_metadata(http: &Http, uri: &str, expected: &[u8; 32]) -> Result<String> {
    let bytes = http.get(uri).send()?.error_for_status()?.bytes()?;
    ensure!(sha256(&bytes) == *expected, "metadata.json at {uri} does not match listing_hash");
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn report(cli: &Cli, api: &Api, deal: &Pubkey, signature: &str) -> Result<()> {
    let cluster = if cli.rpc.contains("devnet") { "devnet".to_string() } else { format!("custom&customUrl={}", cli.rpc) };
    println!("deal:     {deal}");
    println!("tx:       https://explorer.solana.com/tx/{signature}?cluster={cluster}");
    match api.post(&format!("/api/chain/sync/{deal}")) {
        Ok(v) => println!("server:   {v}"),
        Err(e) => eprintln!("warning: server sync failed ({e}); the transaction is confirmed anyway"),
    }
    Ok(())
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let payer = Rc::new(read_keypair_file(&cli.keypair).map_err(|e| anyhow!("cannot read keypair {}: {e}", cli.keypair))?);
    let me = payer.pubkey();
    let client = Client::new_with_options(Cluster::Custom(cli.rpc.clone(), ws_url(&cli.rpc)), payer, CommitmentConfig::confirmed());
    let program: Prog = client.program(unbox_escrow::ID)?;
    let api = Api::login(&cli.api, &cli.email, &cli.password)?;

    match &cli.cmd {
        Cmd::Link => {
            let user = api.put("/api/me/wallet-address", json!({ "address": me.to_string() }))?;
            println!("linked {} to {}", me, user["email"]);
            Ok(())
        }
        Cmd::Publish { listing } => {
            let p = api.post(&format!("/api/listings/{listing}/publish"))?;
            let deal = Pubkey::from_str(p["deal"].as_str().context("deal")?)?;
            let listing_hash: [u8; 32] = hex::decode(p["listingHash"].as_str().context("listingHash")?)?
                .try_into()
                .map_err(|_| anyhow!("listingHash is not 32 bytes"))?;
            let metadata_uri = p["metadataUri"].as_str().context("metadataUri")?.to_string();
            verified_metadata(&api.http, &metadata_uri, &listing_hash)?;
            let signature = program
                .request()
                .accounts(accounts::CreateListing { seller: me, deal, system_program: system_program::ID })
                .args(instruction::CreateListing {
                    deal_id: p["dealId"].as_u64().context("dealId")?,
                    price_lamports: p["priceLamports"].as_u64().context("priceLamports")?,
                    listing_hash,
                    metadata_uri,
                    arbiter: Pubkey::from_str(p["arbiter"].as_str().context("arbiter")?)?,
                })
                .send()?;
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Buy { listing } => {
            let deal = api.deal_of(listing)?;
            let account: Deal = program.account(deal)?;
            println!("{}", verified_metadata(&api.http, &account.metadata_uri, &account.listing_hash)?);
            println!("price:    {} lamports, arbiter {}", account.price_lamports, account.arbiter);
            let signature = program
                .request()
                .accounts(accounts::Purchase { buyer: me, deal, system_program: system_program::ID })
                .args(instruction::Purchase { expected_listing_hash: account.listing_hash, expected_arbiter: account.arbiter })
                .send()?;
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Ship { listing, tracking, video } => {
            let deal = api.deal_of(listing)?;
            let mut secret = [0u8; 32];
            getrandom::fill(&mut secret).map_err(|e| anyhow!("random: {e}"))?;
            let video_hash = sha256(&std::fs::read(video).with_context(|| format!("read {video}"))?);
            let signature = program
                .request()
                .accounts(accounts::MarkShipped { seller: me, deal })
                .args(instruction::MarkShipped {
                    qr_commitment: ship_commitment(&deal, &secret),
                    packing_video_hash: video_hash,
                    tracking_number: tracking.clone(),
                })
                .send()?;
            println!("QR:       {}", qr::ship_payload(&deal, &secret));
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Accept { qr } => {
            let (deal, secret) = qr::parse_ship(qr)?;
            let account: Deal = program.account(deal)?;
            let signature = program
                .request()
                .accounts(accounts::AcceptDelivery { buyer: me, deal, seller: account.seller })
                .args(instruction::AcceptDelivery { qr_secret: secret })
                .send()?;
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Settle { listing } => {
            let deal = api.deal_of(listing)?;
            let account: Deal = program.account(deal)?;
            let signature = program
                .request()
                .accounts(accounts::SettleExpired { caller: me, deal, seller: account.seller, buyer: account.buyer })
                .args(instruction::SettleExpired {})
                .send()?;
            report(&cli, &api, &deal, &signature.to_string())
        }
        Cmd::Show { listing } => {
            println!("{}", serde_json::to_string_pretty(&api.get(&format!("/api/deals/{listing}"))?)?);
            Ok(())
        }
    }
}
```

- [ ] **Step 6: Uruchom testy i build.** `cd /work/cli && cargo test` daje 3 passed. `cargo build` i `cargo clippy -- -D warnings` przechodzą.
  - Jeśli nie ma `read_keypair_file`, wyrównaj wersję `solana-keypair` z wynikiem `cargo tree -p anchor-client -i solana-keypair`.
- [ ] **Step 7: Commit**

```bash
git add cli
git commit -m "feat(cli): unbox-cli signs the escrow flow from keypair files and syncs server/"
```

### Task 10: Dokumentacja, CLAUDE.md, port, E2E na devnecie

**Files:**
- Modify: `server/README.md`, `CLAUDE.md`, `.devcontainer/devcontainer.json`

**Interfaces:**
- Consumes: wszystko powyżej.
- Produces: instrukcja dla zespołu, kontrakt trybu solana dla O4/O5, potwierdzony E2E z linkami do Explorera.

- [ ] **Step 1: Port.** W `.devcontainer/devcontainer.json` ustaw `"forwardPorts": [8899, 4000]`.

- [ ] **Step 2: `server/README.md`.** Zaktualizuj pierwszy akapit: backend nie jest już źródłem prawdy dla płatności w trybie domyślnym. Dopisz sekcję (po polsku, jak reszta README):

````markdown
## Tryb `PAYMENTS=solana` (domyślny)

Pieniądze i reguły są w programie `unbox_escrow` (CLAUDE.md §2). Backend nie ma kluczy, niczego nie podpisuje
i nie zmienia stanu pieniędzy: odbija w SQLite stan kont `Deal` odczytany przez RPC. Webhook Helius i poller
(`SOLANA_POLL_MS`) to tylko sygnał „przeczytaj ponownie”; payloadowi nie ufamy.

| Krok | Aplikacja | Backend |
|---|---|---|
| Portfel | generuje keypair, `PUT /api/me/wallet-address {address}` | mapuje adres ↔ konto (unikalny) |
| Wystaw | `POST /api/listings/{id}/publish` → podpisuje `create_listing` z odpowiedzi | zamraża treść, serwuje `GET /api/listings/{id}/metadata.json` (bajty = `listingHash`) |
| Kup / nadaj / odbierz / reklamuj / zwróć / „Odbierz środki” | podpisuje instrukcję programu, potem `POST /api/chain/sync/{deal}` | odczytuje konto i aktualizuje `listing`/`deal` |
| Przeglądaj, szczegóły | `GET /api/listings`, `GET /api/deals/{id}` | tylko ogłoszenia widoczne on-chain; `payment.currency = "SOL"`, kwoty w lamportach, `onchain.transactions[].explorerUrl` |
| Portfel | `GET /api/me/wallet` | saldo SOL z RPC, `heldMinor` = środki w escrow, `address` |

Stare `POST /api/listings/{id}/purchase` i `POST /api/deals/{id}/{ship|accept|dispute|return|confirm-return|settle}`
zwracają w tym trybie 409. Spory rozstrzyga wyrocznia (`oracle/`) instrukcją `resolve_dispute`.

`PAYMENTS=demo`: dawny ledger w SQLite. Używają go `cargo test`, `pnpm test:contract` i awaryjne demo offline.

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `PAYMENTS` | `solana` | `solana` albo `demo` |
| `RPC_URL` | `https://api.devnet.solana.com` | RPC devnet (najlepiej Helius; URL z kluczem nie trafia do `/api/health`) |
| `CLUSTER` | `devnet` | do linków Solana Explorer |
| `ARBITER_PUBKEY` | — (wymagane w `solana`) | klucz wyroczni, arbiter nowych ogłoszeń |
| `WEBHOOK_SECRET` | puste | wartość `authHeader` webhooka Helius |
| `SOLANA_POLL_MS` | `5000` | co ile poller czyta `getProgramAccounts` |

### Webhook Helius (devnet)
1. Tunel do portu 4000: `docker run --rm --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://localhost:4000`
2. Webhook (URL tunelu zmienia się po restarcie, więc zaktualizuj go przez `PUT /v0/webhooks/{id}`):
       curl -X POST "https://api.helius.xyz/v0/webhooks?api-key=$HELIUS_API_KEY" -H 'Content-Type: application/json' \
         -d '{"webhookURL":"https://<tunel>/api/webhooks/helius","transactionTypes":["ANY"],
              "accountAddresses":["CEoTTEq46mxFrNqPu9EbpFbDshsrSTZV9GB14XPT1Nyq"],
              "webhookType":"rawDevnet","authHeader":"<WEBHOOK_SECRET>"}'
3. Bez tunelu wszystko działa przez poller, z opóźnieniem `SOLANA_POLL_MS`.

Build: `server/` zależy od `../programs/unbox_escrow`, więc w kontenerze montuj całe repo, nie sam `server/`.
````

- [ ] **Step 3: `CLAUDE.md`** (po polsku; zgodnie z §9 każda zmiana trafia też do §13):
  - **§2:** dopisz punkt „`server/` (Rust) w trybie `PAYMENTS=solana` tylko odbija stan programu: nie ma kluczy i nie trzyma środków. Webhook Helius i poller to sygnał do odczytu kont z RPC. `PAYMENTS=demo` (ledger w SQLite) służy wyłącznie testom i awaryjnemu demo offline”.
  - **§4, struktura `Deal`:** pola `String` (`metadata_uri`, `tracking_number`, `return_tracking_number`) na końcu, po `bump`. Dopisz „`status` ma stały offset 152 (`STATUS_OFFSET`)”.
  - **§4, tabela timeoutów:** kolumna `test-timeouts` z wartością 5 s, z dopiskiem „tylko `pnpm test:program`; `pnpm deploy:devnet` przebudowuje bez tej flagi”.
  - **§6:**
    - Portfel: po wygenerowaniu keypaira `PUT /api/me/wallet-address`.
    - Wystaw: `POST /api/listings/{id}/publish`, potem `create_listing` z odpowiedzi; `metadata.json` serwuje `server/`.
    - Po każdej transakcji: `POST /api/chain/sync/{deal}`.
    - Przeglądaj: `GET /api/listings`.
    - Ceny w SOL, maks. 0,1 SOL (limit `Minor`).
  - **§7:**
    - w drzewie dopisz `server/  # Rust (axum + SQLite): konta, ogłoszenia, media; PAYMENTS=solana odbija program` i `cli/  # unbox-cli: demo bez telefonu`;
    - w komendach dopisz `pnpm test:program`, `pnpm deploy:devnet`, `pnpm dev:server` (w kontenerze, `PAYMENTS=solana …`) oraz `cd cli && cargo run -- --help`.
  - **§13, wpisy z datą wykonania:**
    - (a) `server/` podłączony do programu trybem `PAYMENTS=solana` (domyślny): webhook Helius + poller, publikacja ogłoszeń, saldo SOL; ledger tylko w `PAYMENTS=demo`;
    - (b) ceny w SOL (lamporty), seed 0,06/0,03/0,09 SOL;
    - (c) login zostaje, portfel przypisany do konta adresem;
    - (d) `Deal`: Stringi na końcu konta;
    - (e) feature `test-timeouts`;
    - (f) `unbox-cli` jako zapasowe demo.

- [ ] **Step 4: E2E na devnecie.** Wymagania:
  - program z Task 3 na devnecie;
  - `ARBITER_PUBKEY` od O5;
  - tunel i webhook z README.

  Keypairy trzymaj w `keys/`, który jest w `.gitignore`.

```bash
# host, repo root: demo wallets funded from the team wallet (faucet is unreliable)
solana-keygen new --no-bip39-passphrase -o keys/seller.json
solana-keygen new --no-bip39-passphrase -o keys/buyer.json
solana transfer --allow-unfunded-recipient $(solana-keygen pubkey keys/seller.json) 1 --url devnet
solana transfer --allow-unfunded-recipient $(solana-keygen pubkey keys/buyer.json) 1 --url devnet

# container shell 1, /work/server
PAYMENTS=solana RPC_URL=<helius devnet rpc> ARBITER_PUBKEY=<oracle pubkey> WEBHOOK_SECRET=<secret> \
  PUBLIC_BASE_URL=http://<laptop LAN IP>:4000 cargo run

# container shell 2, /work/cli (RPC_URL exported to the same devnet RPC)
cargo run -q -- --email ania@demo.pl   --keypair ../keys/seller.json link
cargo run -q -- --email bartek@demo.pl --keypair ../keys/buyer.json  link
cargo run -q -- --email ania@demo.pl   --keypair ../keys/seller.json publish --listing l-kurtka-levis
curl -s localhost:4000/api/listings | jq '.[].id'                               # "l-kurtka-levis"
cargo run -q -- --email bartek@demo.pl --keypair ../keys/buyer.json  buy --listing l-kurtka-levis
head -c 1000000 /dev/urandom > /tmp/packing.mp4
cargo run -q -- --email ania@demo.pl   --keypair ../keys/seller.json ship --listing l-kurtka-levis --tracking INPOST-1 --video /tmp/packing.mp4
cargo run -q -- --email bartek@demo.pl --keypair ../keys/buyer.json  accept --qr 'UNBOX1:…'
cargo run -q -- --email bartek@demo.pl --keypair ../keys/buyer.json  show --listing l-kurtka-levis \
  | jq '{status, payment, closeReason, tx: .onchain.transactions}'
```
Oczekiwane wyniki:
- status `Completed`, `payment.status = "released"`, `closeReason = "accepted"`;
- 3 wpisy `onchain.transactions` z `explorerUrl`;
- w logu serwera po każdej transakcji `helius webhook synced=1`, co dowodzi, że ścieżka webhooka działa niezależnie od `/chain/sync`;
- link z `accept` w Solana Explorer pokazuje przelew 0,06 SOL z konta `Deal` do sprzedającego.

Moment „pośrednik znika”:
1. `publish` + `buy` sukienki (`l-sukienka-zara`).
2. Odczekaj 10 min (timeout `demo`).
3. Celina z dowolnym kluczem: `cargo run -q -- --email celina@demo.pl --keypair ../keys/seller.json settle --listing l-sukienka-zara`.
4. Status `Refunded`, kupujący dostaje 0,03 SOL.

- [ ] **Step 5: Pełna weryfikacja przed „gotowe”:**
  - `cargo test -p unbox_escrow --lib` (8);
  - `pnpm test:program` (9);
  - `cd server && cargo test` (wszystkie dotychczasowe + nowe), `cargo clippy --all-targets -- -D warnings`, `cargo fmt -- --check`;
  - `pnpm test:contract` (11/11);
  - `cd cli && cargo test` (3);
  - E2E z kroku 4 z linkami do Explorera.

  Czego nie dało się uruchomić (np. brak tunelu), zapisz wprost w raporcie.
- [ ] **Step 6: Commit**

```bash
git add server/README.md CLAUDE.md .devcontainer/devcontainer.json
git commit -m "docs: PAYMENTS=solana runbook, Helius webhook setup and CLAUDE.md decisions"
```

---

## Przekazania dla zespołu (wyślij po Task 8)

- **O5, wyrocznia:**
  - `settleExpired` musi przekazać `caller: keypair.publicKey`, bo w IDL v0 to signer.
  - `resolveDispute` ma konta `arbiter, deal, seller`; dodatkowy `buyer` jest ignorowany.
  - `metadata.json` serwuje teraz `server/` (`/api/listings/{id}/metadata.json`), a zdjęcia mają pole `url`, nie `path`.
  - `TIMEOUTS=demo` zgadza się z programem.
- **O4, app shell:**
  - Helpery QR w `@unbox/shared` liczą dziś `sha256(utf8(dealId) || secret)` i biorą sekret w hex. Program wymaga `sha256(deal_pubkey_bytes || secret)` i base58 w payloadzie (CLAUDE.md §4, wektory w `docs/zadania/README.md`).
  - Kwoty są w SOL i lamportach (`formatSol` zamiast `formatPln`), z limitem `Minor` ≤ 0,1 SOL.
  - Nowe pola: `User.walletAddress`, `Listing.onchain`, `Deal.onchain`, `Wallet.address`.
  - Nowe przepływy: link → publish + `create_listing` → `chain/sync`.
- **O2/O3, ekrany:** każda akcja to transakcja z `app/src/solana`, a po niej `POST /api/chain/sync/{deal}`. Stare akcje REST zwracają 409 w trybie solana.
- **Właściciel `server/`:** podział `PAYMENTS=solana|demo`. Testy kolegi działają w `demo` dzięki harnessowi.

## Pułapki

- **`test-timeouts` w `target/deploy`.** Po `pnpm test:program` plik `.so` ma 5-sekundowe terminy. Na devnet deployuj **tylko** przez `pnpm deploy:devnet`.
- **`Pubkey::find_program_address` na hoście** wymaga `curve25519` w crate'cie adresu Solany. Jeśli `publish_listing` się nie kompiluje, dodaj `solana-address` z feature `curve25519` w wersji z `cargo tree -i solana-address`.
- **Build `server/` w kontenerze** wymaga montażu całego repo (zależność `../programs/unbox_escrow`). Instrukcja z `server/README.md` z montażem samego `server/` przestaje działać, więc zaktualizuj ją w Task 10.
- **Stare konta `Deal` na devnecie** (sprzed zmiany layoutu z Task 1) są pomijane z ostrzeżeniem (Review Focus 1).
- **Pliki w kontenerze powstają jako root** (`target/`, `Cargo.lock`). Przed commitem na hoście ewentualnie `sudo chown -R $USER server cli`. `pnpm install` tylko na hoście (§13).
- **Telefon nie widzi `localhost`.** `EXPO_PUBLIC_API_URL=http://<IP-laptopa>:4000`, a w kontenerze `-p 4000:4000`.
- **`PUBLIC_BASE_URL` trafia do `metadata_uri` on-chain.** Ustaw go **przed** publikacją, najlepiej na stały adres LAN; tunel zmienia URL po restarcie.

## Poza zakresem (świadomie)

- Ciała `open_dispute`, `resolve_dispute`, `mark_returned`, `confirm_return` i ich testy: dalej według `docs/zadania/1-program.md`. `server/` już je odbije, bo mapuje każdy status.
- Treść `complaint.json` w trybie solana: on-chain jest tylko hash, a treść idzie do storage przez aplikację (O4/O5).
- Ekrany Expo i `packages/api-client` (O2–O4): po Task 8 przekaż kontrakt z `server/README.md`.

## Weryfikacja end-to-end (skrót)

1. **Program:**
   - `cargo test -p unbox_escrow --lib` (8);
   - `pnpm test:program` (9, Surfpool, terminy 5 s);
   - `pnpm deploy:devnet`.
2. **Server:**
   - `cargo test` (stare testy w `PAYMENTS=demo` + 2 `wallet_address` + 15 `solana` + 9 unit `mirror`/`webhook`), clippy, fmt;
   - `pnpm test:contract` 11/11;
   - `curl /api/health` na devnecie: `payments: "solana"`, `chain.lastSyncAt` ustawione.
3. **Pipeline (Task 10, krok 4):**
   - `link → publish → buy → ship → accept` przez CLI;
   - w logu `helius webhook synced=1`;
   - oś czasu i `explorerUrl`;
   - przelew do sprzedającego w Explorerze;
   - osobno `settle` po terminie cudzym kluczem.

## Wykonanie

Branch: `feat/solana-payments` od świeżego `main` (`git pull --rebase`, bo lokalny `main` jest 16 commitów za `origin/main`). Kod projektu wolno pisać od sob 23:00, czyli teraz.

Rekomendacja: **Native**. Taski są sekwencyjne (program → model → mirror → indekser), plan zawiera pełny kod i interfejsy, a każdy krok kończy się testem. Przy terminie hackathonu liczy się tempo. Na końcu jeden przegląd całej gałęzi, ze szczególną uwagą na `programs/` (pieniądze) i na to, że `PAYMENTS=demo` jest nietknięty.

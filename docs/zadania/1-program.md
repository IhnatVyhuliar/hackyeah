# Osoba 1: program on-chain `unbox_escrow` + testy

## Rola i cel
Piszesz miejsce, w którym znika pośrednik. Program trzyma SOL kupującego na koncie `Deal`, egzekwuje maszynę stanów, terminy, uprawnienia i commitmenty QR, a arbitrowi pozwala tylko wskazać jedną ze stron w statusie `Disputed`. Jury czyta ten kod i sprawdza, czy robi to, co pokazuje demo, więc ma być krótki, czytelny i przetestowany.

Jesteś **właścicielem IDL**. Tylko Ty zmieniasz konto `Deal` i instrukcje. Po każdej zmianie: `anchor build` → `pnpm sync-idl` → commit.

## Twoje pliki
- `Anchor.toml`, `Cargo.toml` (workspace), `rust-toolchain.toml`, `programs/unbox_escrow/**`, `tests/**`.
- W root `package.json` tylko skrypty `sync-idl` i testów Anchora oraz devDependencies testów (małe commity; plik zakłada O4).
- W `packages/shared`: wyłącznie `idl/` (generowane przez `sync-idl`) i wartość `PROGRAM_ID`.

**Nie dotykasz:** `app/`, `oracle/`, `scripts/`, reszty `packages/shared`.

## Przeczytaj najpierw
`CLAUDE.md` §2 (zasada nr 1), §4 (całość: konto, maszyna stanów, uprawnienia, `settle_expired`, timeouty, QR), §7 (stack), §12 (pytania jury). `docs/zadania/README.md` (przekazania, wektory testowe, otwarte kwestie).
Wzorce z bootcampu: `github.com/matzayonc/solana-live-course-2026`, katalogi `diamond-hands` i `holdup` (podział na `instructions/`, `state.rs`, `error.rs`, `constants.rs`; `update_price.rs` w `holdup` to wzorzec „tylko ten klucz może”).

## Stack i setup
Anchor 1.1.2, Rust 1.95, Surfpool, Node 24, pnpm, `@anchor-lang/core` 1.1.2, `@solana/web3.js` 1.99.0, mocha + chai + ts-mocha. Wszystko jest w dev containerze sponsora.

**K0, przed 23:00 (tylko środowisko):**
- Sklonuj repo bootcampu i zbuduj dev container (VS Code „Reopen in Container” albo `docker build -t live .`). Budowa trwa, więc zrób to wcześniej.
- Żeby pracować na naszym repo w kontenerze: skopiuj `.devcontainer/` i `Dockerfile` z repo bootcampu do naszego repo albo uruchom obraz z zamontowanym katalogiem (`docker run -it -v "$PWD":/work -w /work live bash`).
- `solana-keygen new` (deployer), `solana config set --url <RPC devnet od O4>`, zasil deployera kilkoma SOL od O6 (deploy kosztuje ok. 2–3 SOL).

**Po 23:00:**
```bash
# w kontenerze, poza repo:
anchor init unbox_escrow --test-template mocha   # sprawdź `anchor init --help`: pnpm, bez gita
# przenieś do root repo: Anchor.toml, Cargo.toml, rust-toolchain.toml, programs/, tests/
# Anchor.toml: [toolchain] package_manager = "pnpm"; skrypt testów z tsconfig w tests/
anchor keys sync && anchor build && anchor test
```
Trzymaj `tsconfig` testów w `tests/tsconfig.json`, żeby nie kolidował z root i z `app/`.

Układ programu (zgodny z `CLAUDE.md` §7):
```
programs/unbox_escrow/src/
  lib.rs  state.rs  constants.rs  errors.rs  events.rs
  logic.rs                         # czyste funkcje: commitmenty QR, terminy; testy #[cfg(test)]
  instructions/
    create_listing.rs  cancel_listing.rs  purchase.rs  mark_shipped.rs
    accept_delivery.rs  open_dispute.rs  resolve_dispute.rs
    mark_returned.rs  confirm_return.rs  settle_expired.rs
```

## Interfejs (propozycja; wiążące jest to, co trafi do IDL v0)

| Instrukcja | Argumenty | Konta (poza `deal` i `system_program`) |
|---|---|---|
| `create_listing` | `deal_id: u64, price_lamports: u64, listing_hash: [u8;32], metadata_uri: String, arbiter: Pubkey` | `seller` (signer, mut), `deal` (init, PDA) |
| `cancel_listing` | — | `seller` (signer) |
| `purchase` | `expected_listing_hash: [u8;32], expected_arbiter: Pubkey` | `buyer` (signer, mut) |
| `mark_shipped` | `qr_commitment: [u8;32], packing_video_hash: [u8;32], tracking_number: String` | `seller` (signer) |
| `accept_delivery` | `qr_secret: [u8;32]` | `buyer` (signer), `seller` (mut, `address = deal.seller`) |
| `open_dispute` | `qr_secret: [u8;32], unboxing_video_hash: [u8;32], complaint_hash: [u8;32]` | `buyer` (signer) |
| `resolve_dispute` | `verdict: Verdict, report_hash: [u8;32]` | `arbiter` (signer, `address = deal.arbiter`), `seller` (mut, `address = deal.seller`) |
| `mark_returned` | `return_qr_commitment: [u8;32], return_video_hash: [u8;32], return_tracking_number: String` | `buyer` (signer) |
| `confirm_return` | `return_qr_secret: [u8;32]` | `seller` (signer), `buyer` (mut, `address = deal.buyer`) |
| `settle_expired` | — | `caller` (signer, ktokolwiek), `seller` i `buyer` (mut, `address = deal.*`) |

- PDA: `seeds = [b"deal", deal.seller.as_ref(), &deal.deal_id.to_le_bytes()], bump = deal.bump`.
- Event: `DealStatusChanged { deal: Pubkey, from: DealStatus, to: DealStatus, at: i64 }`.
- Błędy (propozycja): `InvalidStatus, Unauthorized, DeadlinePassed, DeadlineNotReached, InvalidPrice, SameParty, ListingHashMismatch, ArbiterMismatch, QrMismatch, InvalidVerdict, StringTooLong, EmptyHash`.

## Zadania

### P0. IDL v0 (do 00:30, wszyscy na to czekają)
- [ ] `state.rs`: `Deal` dokładnie jak w §4 (`#[derive(InitSpace)]`, `#[max_len]`), `DealStatus` (`Listed, Paid, Shipped, Disputed, ReturnRequested, Returning, Completed, Refunded, Cancelled`), `Verdict` (`None, Seller, Buyer`).
- [ ] Wszystkie 10 instrukcji z argumentami i strukturami kont z tabeli wyżej. Ciała mogą zwracać `Ok(())`.
- [ ] Skrypt `sync-idl` w root `package.json`: kopiuje `target/idl/unbox_escrow.json` i `target/types/unbox_escrow.ts` do `packages/shared/idl/`.
- [ ] `anchor build` → `pnpm sync-idl` → commit `program: idl v0` → info na kanale.
- [ ] Rozważ przeniesienie pól `String` (`metadata_uri`, `tracking_number`, `return_tracking_number`) na koniec struktury. Wtedy `status` ma stały offset i aplikacja oraz wyrocznia mogą filtrować `getProgramAccounts` przez `memcmp` po statusie. Jeśli to zrobisz, popraw kolejność w `CLAUDE.md` §4.

### P0. „Hello” na devnecie (K1, 02:00)
- [ ] Program z IDL v0 na devnecie: `anchor keys sync`, `anchor deploy --provider.cluster devnet`, `PROGRAM_ID` do `packages/shared` (commit). Program jest upgradeable, więc kolejne deploye zachowują ten sam adres.
- [ ] Keypair programu (`target/deploy/unbox_escrow-keypair.json`) **nie trafia do gita**. Deployuje tylko Ty, więc zrób kopię zapasową u siebie.

### P0. Logika (pełny program na devnecie do 06:00)
Kolejność: najpierw happy path, bo od niego zależy K3.
- [ ] `constants.rs`: timeouty z §4 za feature `demo`, domyślnie włączonym (`[features] default = ["demo"]`). Wartości produkcyjne pod `#[cfg(not(feature = "demo"))]`.
- [ ] Helpery w `logic.rs` lub `state.rs`:
  - `set_status(deal, to, now)`: ustawia `status`, `status_changed_at` i emituje `DealStatusChanged` (używane przy **każdej** zmianie statusu);
  - `pay(deal, to, amount)`: `deal.sub_lamports(amount)?` + `to.add_lamports(amount)?` (rent zostaje na koncie);
  - `ship_commitment(deal_key, secret)` = `hashv(&[deal_key.as_ref(), &secret])`, `return_commitment` = `hashv(&[b"return", deal_key.as_ref(), &secret])`;
  - `deadline(status, changed_at) -> Option<i64>`.
- [ ] `create_listing` (`price > 0`, `arbiter` z argumentu, hashe ≠ 0, `metadata_uri` ≤ 200) → `purchase` (CPI `system_program::transfer` buyer → `deal`, `buyer ≠ seller`, oba `expected_*` zgodne z kontem) → `mark_shipped` → `accept_delivery`. **Deploy na devnet** i sygnał dla O2–O4 (to odblokowuje K3).
- [ ] `cancel_listing`, `open_dispute`, `resolve_dispute` (`verdict ≠ None`; `Seller` → wypłata i `Completed`; `Buyer` → `ReturnRequested`), `mark_returned`, `confirm_return`.
- [ ] `settle_expired`: pięć wierszy z tabeli §4. Uwaga na `Disputed → ReturnRequested`: bez przelewu, ale `status_changed_at = now`, więc od tej chwili liczy się `RETURN_SHIP_TIMEOUT`.
- [ ] Akcje stron: `require!(now < deadline, DeadlinePassed)`. `settle_expired`: `require!(now >= deadline, DeadlineNotReached)`. `confirm_return` według tabeli nie ma terminu; wynik jest taki sam jak `settle_expired`, więc wyścigu nie ma.
- [ ] Jeden komentarz przy `resolve_dispute` i `settle_expired`, że tu znika pośrednik: arbiter może tylko wybrać stronę, a po terminie każdy domyka transakcję. Innych komentarzy tylko przy regułach biznesowych.
- [ ] **Brak instrukcji admina**, brak ścieżki przelewu do kogokolwiek poza `deal.seller` i `deal.buyer`.

### P0. Testy (K2, 08:00) — każda ścieżka z §4
- [ ] Happy path: create → purchase → mark_shipped → accept_delivery, saldo sprzedającego `+price`, status `Completed`.
- [ ] `cancel_listing` → `Cancelled`; `purchase` po anulowaniu → `InvalidStatus`.
- [ ] `purchase`: kupujący = sprzedający, zły `expected_listing_hash`, zły `expected_arbiter`; `create_listing` z `price = 0`.
- [ ] `accept_delivery` i `open_dispute`: zły sekret → `QrMismatch`; podpis nie-kupującego → `Unauthorized`.
- [ ] Spór → `Seller` → `Completed` (saldo). Spór → `Buyer` → `mark_returned` → `confirm_return` → `Refunded` (saldo kupującego `+price`). Zły sekret zwrotu → błąd.
- [ ] `resolve_dispute`: nie-arbiter, `verdict = None`, zły status.
- [ ] `settle_expired`: każdy z 5 wierszy; przed terminem → `DeadlineNotReached`; w `Listed`/`Completed` → `InvalidStatus`.
- [ ] Akcje stron po terminie → `DeadlinePassed` (`mark_shipped`, `accept_delivery`, `resolve_dispute`, `mark_returned`).
- [ ] Test Rust (`cargo test`) dla `ship_commitment`/`return_commitment` na wektorach z `docs/zadania/README.md`. W testach TS: commitment z helpera `@unbox/shared` dla prawdziwego PDA przechodzi weryfikację programu.
- [ ] Terminy w testach: 10 min z `demo` to za długo. Wybierz to, co szybciej zadziała: time travel w Surfpoolu albo feature `test-timeouts` z kilkusekundowymi wartościami. Jeśli dodasz feature, dopisz go do tabeli timeoutów w `CLAUDE.md` §4.

### P1. Dla reszty zespołu (do 14:00)
- [ ] Sprawdź, że `TIMEOUTS` w `packages/shared` = `constants.rs` (demo). Rozbieżność zgłoś O4.
- [ ] Mapa programu dla jury dla O6: która instrukcja i która linia egzekwuje który wiersz tabel §4 (linki `programs/unbox_escrow/src/instructions/...#Lxx`). Trafi do README.
- [ ] Pomóż O6 ze skryptem stagingu (`scripts/stage.ts`) przy wywołaniach programu.

### P2. Jeśli zostanie czas
- [ ] Build bez `demo` (`--no-default-features`) się kompiluje. To dowód, że wartości produkcyjne istnieją.
- [ ] Odpowiedź na „czy możecie zmienić program?”: `solana program show <PROGRAM_ID>` (upgrade authority) + komenda `--final` do slajdu.

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| IDL v0 w `packages/shared/idl/` | wszyscy | 00:30 |
| „hello” na devnecie + `PROGRAM_ID` | wszyscy | K1 02:00 |
| happy path na devnecie | O2, O3, O4 | ok. 04:00 |
| pełny program na devnecie | wszyscy | 06:00 |
| testy wszystkich ścieżek zielone | jury (README) | K2 08:00 |
| mapa programu z liniami | O6 | 14:00 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| root `package.json`, pnpm workspace | O4 | 23:30 |
| RPC devnet, SOL dla deployera | O4, O6 | K0 |
| `ORACLE_PUBKEY` (tylko do testów na devnecie; lokalnie generujesz własny) | O5 | K0 |

## Jak testować samodzielnie
`cargo test` (czyste funkcje), `anchor test` (instrukcje na Surfpoolu), Explorer po deployu. Od nikogo nic nie potrzebujesz: arbitra do testów generujesz sam.

## Definition of Done
- [ ] Każdy wiersz tabel uprawnień i `settle_expired` z §4 ma test i test przechodzi.
- [ ] Program z `demo` na devnecie, `PROGRAM_ID` w `packages/shared`, IDL zsynchronizowany i zacommitowany.
- [ ] Brak instrukcji admina; środki płyną tylko do `deal.seller` albo `deal.buyer`.
- [ ] Zmiany layoutu konta po K2 tylko w ostateczności: psują istniejące konta na devnecie i staging demo.

## Pułapki
- `@anchor-lang/core`, nie `@coral-xyz/anchor`. Przykłady z internetu mają stare importy.
- `system_program::transfer` **z** konta z danymi nie działa. Wypłaty to `sub_lamports`/`add_lamports`. Wpłata w `purchase` to normalny CPI, bo płaci zwykły portfel.
- Ścieżka do `hashv` mogła się zmienić w nowszych crate'ach Solany. Sprawdź, co kompiluje się z Anchor 1.1.2 (`anchor_lang::solana_program::hash::hashv` albo osobny crate sha256).
- Zapomniany `set_status` = zły `status_changed_at` = złe terminy. Zmieniaj status tylko przez helper.
- `String` w Borsh ma zmienną długość, więc pola za nim nie mają stałego offsetu (patrz IDL v0).
- Każda zmiana layoutu po deployu wymaga nowych kont. Stare konta `Deal` przestają się deserializować.

## Otwarta kwestia
Paczka bez karty QR blokuje `open_dispute` (`docs/zadania/README.md`, „Otwarte kwestie” pkt 1). Nie zmieniaj tego bez decyzji zespołu. Jeśli zapadnie decyzja (a), zmiana dotyczy `open_dispute` i IDL.

## Prompt startowy do Claude Code
```
Pracujesz w repo unboxproof (HackYeah 2026, Superteam „Finanse bez pośrednika”). Przeczytaj CLAUDE.md (szczególnie §2, §4, §7)
oraz docs/zadania/README.md i docs/zadania/1-program.md. Jesteś Osobą 1: program Anchor 1.1.2 `unbox_escrow`
w programs/unbox_escrow i testy w tests/. Nie edytujesz app/, oracle/, scripts/ ani packages/shared poza idl/ i PROGRAM_ID.
Zacznij od IDL v0: state.rs (Deal 1:1 z §4) i wszystkie instrukcje z argumentami z tabeli w 1-program.md, z pustymi ciałami;
anchor build, pnpm sync-idl. Potem logika w kolejności: create_listing → purchase → mark_shipped → accept_delivery (deploy),
potem reszta, a do każdej instrukcji testy mocha. Klient TS: @anchor-lang/core, @solana/web3.js 1.99.0.
Po każdej instrukcji uruchom anchor test. Żadnych instrukcji admina.
```

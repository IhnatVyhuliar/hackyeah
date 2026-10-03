# Osoba 2: backend on-chain (program Anchor `sellsol_escrow` + SDK)

## Rola i cel
Piszesz serce projektu, czyli miejsce, w którym znika pośrednik. Program trzyma pieniądze kupującego w PDA i **sam** decyduje o wypłacie albo zwrocie według tabeli z KONTRAKT §3, na podstawie pomiarów od weryfikatora albo terminów. Jury będzie czytać Twój kod („czy program robi to, co pokazuje demo”), więc ma być prosty, czytelny i dobrze przetestowany. Do tego SDK w TypeScripcie, którego używa serwer Osoby 4 do budowania transakcji i wysyłania werdyktu.

Od ok. H+8, gdy program jest gotowy, przejmujesz opowieść: deck, uzasadnienie projektowe, model zagrożeń i ściągę na pytania jury. Znasz najlepiej odpowiedź na „gdzie w kodzie znika pośrednik”.

## Twoje foldery
- `/program`: workspace Anchor (poza npm workspaces).
- `/packages/sdk`: klient TS + zacommitowany IDL + skrypty (`packages/sdk/scripts/`).
- Od H+8: `docs/design-rationale.md`, `docs/qa-jury.md`, deck (PDF w `docs/`).

**Nie dotykasz:** `/app`, `/landing`, `/server`, `/scripts`, `/ai`, `/packages/shared/src`. Helpery z wektorami testowymi piszesz **razem** z Osobą 4 w H0–H1: ona commituje, Ty sprawdzasz zgodność z programem.

## Przeczytaj najpierw
`CLAUDE.md`, `docs/KONTRAKT.md`: §3 (tabela decyzji), §4.1 (statusy), §5 (konta, instrukcje, błędy, eventy, wypłata, konfiguracja demo, SDK), §6 (hasze, PDA, wektory) i §14 (odpowiedzi dla jury).
Wzorce z bootcampu Superteam: repo `matzayonc/solana-live-course-2026`, katalogi `diamond-hands` (podział na `instructions/`, `state.rs`, `error.rs`, `constants.rs`) i `holdup` (`update_price.rs`: konto z `price_authority` to dokładnie nasz wzorzec weryfikatora).

## Stack i setup
Anchor 1.1.2, Rust 1.95, Solana CLI, Surfpool (lokalny walidator Anchor 1.1), Node 24, `@anchor-lang/core` ^1.1.2, `@solana/web3.js` 1.99.0, mocha/chai.

Najszybciej: dev container z repo bootcampu (VS Code „Reopen in Container” albo GitHub Codespaces). Wszystko jest już zainstalowane. Alternatywa: lokalnie przez AVM (`avm install 1.1.2`), `rustup` 1.95, instalator Surfpool.

```bash
cd hackyeah
anchor init --no-git --package-manager npm --test-template mocha sellsol-escrow
mv sellsol-escrow program && cd program
anchor keys sync                    # ustala PROGRAM_ID w declare_id! i Anchor.toml
anchor build && anchor test         # pusty test musi przejść na Surfpool
```
- W `program/.gitignore` dodaj wyjątek `!target/deploy/sellsol_escrow-keypair.json` i zacommituj keypair programu. Celowo: cały zespół ma ten sam `PROGRAM_ID` (tylko devnet).
- **H+1:** wpisz `PROGRAM_ID` do `docs/KONTRAKT.md` §5 i daj znać na kanale (zmiana kontraktu przez Osobę 4 albo za jej zgodą).
- Przed startem albo w H0 zasil portfel deployera na devnecie (faucet.solana.com z logowaniem GitHub; deploy kosztuje ok. 2–4 SOL). Ustaw RPC (Helius albo QuickNode, adres od Osoby 4).

Układ programu:
```
program/programs/sellsol-escrow/src/
  lib.rs  constants.rs  error.rs  events.rs  state.rs
  logic.rs                      # czyste funkcje: decide(), fee(), z testami #[cfg(test)]
  instructions/
    initialize_config.rs  fund_escrow.rs  seller_decline.rs  commit_shipment.rs
    confirm_receipt.rs  open_claim.rs  submit_verdict.rs  claim_timeout.rs
program/tests/sellsol-escrow.ts
```

## Zadania

### P0. Program (H0–H+6)
- [ ] `state.rs`: `Config`, `Escrow`, `EscrowStatus`, `Reason`, `Thresholds`, `Measurements` **dokładnie** jak w KONTRAKT §5.1 (`#[derive(InitSpace)]`).
- [ ] `logic.rs`: `decide(m: &Measurements, t: &Thresholds) -> (bool /*released*/, Reason)` według §3 (kolejność: `RecordingInvalid` → `TransitBroken` → `ItemMismatch` → `VerifiedOk`) oraz `fee(amount, fee_bps) -> u64` (u128, w dół). Testy jednostkowe Rust dla każdego wiersza (`cargo test`, szybkie).
- [ ] Helper wypłaty: bezpośrednio `escrow.sub_lamports(amount)?`, `winner.add_lamports(amount - fee)?`, `fee_wallet.add_lamports(fee)?` (nie `system_program::transfer`, bo PDA ma dane). Bez opłaty dla `SellerDeclined` i `ShipTimeout`. **Nie zamykaj kont escrow.**
- [ ] `initialize_config`: tylko upgrade authority. Konta `program: Program<SellsolEscrow>` (constraint `programdata_address() == Some(program_data.key())`) i `program_data: Account<ProgramData>` (constraint `upgrade_authority_address == Some(admin.key())`). Jeśli to w Anchor 1.1 sprawia problemy, fallback: `pub const ADMIN: Pubkey = pubkey!("…")`. Walidacja `fee_bps ≤ 1000`, `min ≤ max`.
- [ ] `fund_escrow`: walidacje z §5.2, `init` PDA `["escrow", order_id]`, CPI `system_program::transfer` kupujący → PDA, kopiowanie `verifier`/`fee_bps`/`fee_wallet`/`verdict_window` z `Config`, `ship_deadline`, event `EscrowFunded`.
- [ ] `seller_decline`, `commit_shipment` (sprawdza `expected_amount` i `expected_terms_hash`: to jest akceptacja sprzedającego), `confirm_receipt`, `open_claim`, `submit_verdict` (`address = escrow.verifier`, wyniki ≤ 100), `claim_timeout` (trzy przypadki z §3).
- [ ] Konta odbiorców zawsze `mut` + `address = escrow.buyer/seller/fee_wallet`. Wszystkie błędy z §5.4, eventy z §5.4.
- [ ] Komentarze tylko tam, gdzie są reguły biznesowe. Przy `decide()` jedno zdanie: „Tu znika pośrednik: decyzja wynika z pomiarów i progów zapisanych przy wpłacie”.

### P0. Testy (do M1 = H+6)
W `tests/sellsol-escrow.ts` (mocha, Surfpool), konfiguracja localnet z `min_*_window = 1`, okna 2 s, `sleep(3000)` dla timeoutów (albo time travel Surfpool, jeśli szybko zadziała). Przypadki:
- [ ] fund → commit → confirm_receipt → `Released/BuyerConfirmed`, salda: sprzedający `+amount−fee`, `fee_wallet +fee`.
- [ ] fund → commit → open_claim → verdict OK → `Released/VerifiedOk`.
- [ ] verdict `recording_valid=false` → `Released/RecordingInvalid`.
- [ ] verdict `qr_match=false` / `seal_intact=false` / `package_score < min` / `weight_diff_g > tol` → `Refunded/TransitBroken`.
- [ ] verdict `match_score < min` / `defect_found` / `!tests_passed` → `Refunded/ItemMismatch`.
- [ ] `seller_decline` → `Refunded/SellerDeclined` (bez opłaty).
- [ ] timeouty: `ShipTimeout` (zwrot bez opłaty), `OpenTimeout` (wypłata), `VerifierTimeout` (zwrot); `claim_timeout` przed terminem → `DeadlineNotReached`.
- [ ] uprawnienia: verdict od nie-weryfikatora → `UnauthorizedVerifier`; commit od nie-sprzedającego; drugi `initialize_config`; `initialize_config` nie przez upgrade authority.
- [ ] `commit_shipment` ze złym `expected_amount`/`expected_terms_hash` → `AmountMismatch`/`TermsMismatch`.
- [ ] podwójne rozstrzygnięcie i zły status → `InvalidStatus`; okna poza granicami → `InvalidWindow`; kupujący = sprzedający → `SameParty`.
- [ ] Wektory z KONTRAKT §6: PDA dla `5e115e11-de00-4000-8000-000000000001` zgadza się z helperem z `@sellsol/shared`. Wpisz wynik do §6.

### P0. Zamrożenie interfejsu + SDK (H+3, SDK do H+10)
- [ ] **H+3:** zamroź layout kont i sygnatury instrukcji. Skrypt `npm run sync-idl -w packages/sdk` kopiuje `program/target/idl/sellsol_escrow.json` i `target/types/sellsol_escrow.ts` do `packages/sdk/idl/`. Commit. Od tej chwili zmiany tylko przez zmianę kontraktu.
- [ ] `packages/sdk` (`@sellsol/sdk`): klasa `SellSolSdk` z KONTRAKT §5.6.
  - `build*Tx`: `program.methods.<ix>(...).accounts({...}).transaction()`, ustawia `feePayer` i świeży `recentBlockhash`.
  - Anchor `Provider` z portfelem tylko-do-odczytu (podpis rzuca wyjątek), bo budujemy transakcje bez podpisu.
  - `submitVerdict`/`claimTimeout`/`initializeConfig` podpisują przekazanym `Keypair` (własny `keypairWallet`, nie `NodeWallet`).
  - `getEscrow`/`getConfig` zwracają typy `EscrowState`/`ConfigState` z `@sellsol/shared` (hex, unix, statusy jako stringi, `0` → `null`).
  - `serializeUnsigned(tx)` (base64, `requireAllSignatures: false`).
- [ ] Hasze w API SDK są hex, konwersja na `[u8;32]` w środku. Lamporty jako string.
- [ ] Test SDK na localnecie: zbuduj → podpisz w teście → wyślij → `getEscrow` zwraca oczekiwany stan.

### P0. Devnet (do H+10)
- [ ] `anchor deploy --provider.cluster devnet` (RPC z env).
- [ ] `packages/sdk/scripts/init-config.ts`: konfiguracja demo z KONTRAKT §5.5, pubkey weryfikatora i `fee_wallet` od Osoby 4.
- [ ] `packages/sdk/scripts/inspect-escrow.ts <orderId>`: czytelny wydruk konta + link do Explorera.
- [ ] Test dymny na devnecie: jedno escrow (plomba demo 10 albo osobny testowy UUID **spoza puli**) od fund do `confirm_receipt`. Linki w `packages/sdk/README.md`.

### P1. Opowieść i materiały (od ok. H+8)
- [ ] `docs/design-rationale.md` (wymagane w zgłoszeniu): jaka relacja finansowa została przeprojektowana (kupujący ↔ sprzedający w handlu z drugiej ręki), kto był pośrednikiem (platforma z ochroną kupującego i działem sporów: opłata, ręczne decyzje, możliwość blokady albo cofnięcia), co konkretnie się zmienia (reguły w programie, pomiary zamiast opinii, timeouty, dowody on-chain), dla kogo i dlaczego tak ukrywamy krypto.
- [ ] Model zagrożeń (sekcja w rationale):
  - skopiowana plomba → taśma VOID + `packageScore` + waga;
  - przejęty klucz weryfikatora → może tylko wybrać stronę, nie zabrać środków; dalej M z N;
  - upgrade authority → szczerze: devnet jest upgradowalny, plan `--final` albo Squads;
  - zwrot zostawia przedmiot u kupującego → przepływ zwrotu jako następny krok;
  - fałszywie negatywne AI → ponowne nagranie do terminu.
- [ ] `docs/qa-jury.md`: 5 pytań z PDF-u (gdzie znika pośrednik z linkiem do linii w `submit_verdict.rs`/`logic.rs`; co gdy strona zniknie; kto co może; dlaczego blockchain; co dalej) + 5 trudnych („czy AI to nie nowy pośrednik?”, „co jeśli AI się pomyli?”, „kto płaci za weryfikację?”, „co z RODO i nagraniami?” (on-chain tylko hasze), „jak to się skaluje?”).
- [ ] **Deck ≤ 10 slajdów** (Claude Design → PDF, do H+20), w kolejności:
  1. SellSol + zespół;
  2. problem;
  3. dla kogo (Ania i Bartek);
  4. jak to działa w 4 krokach;
  5. gdzie znika pośrednik (tabela §3 + fragment kodu);
  6. architektura i kto co może;
  7. demo (zrzuty + Explorer);
  8. zaufanie i ograniczenia;
  9. potencjał (paczkomaty z kamerami i wagami jako wyrocznie, 1% vs ochrona kupującego);
  10. co dalej + linki.

### P2. Jeśli zostanie czas
- [ ] Cranker: skrypt wołający `claim_timeout` dla przeterminowanych escrow (może go wpiąć Osoba 4).
- [ ] Time travel w testach zamiast `sleep`.
- [ ] Wersja USDC (Token-2022) jako gałąź poglądowa.

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| `PROGRAM_ID` w KONTRAKT §5 | wszyscy | H+1 |
| weryfikacja wektorów helperów | O4 | H+1 |
| zamrożony IDL + sygnatury SDK (stuby OK) | O4 | H+3 |
| testy wszystkich wierszy tabeli zielone | wszyscy (M1) | H+6 |
| deploy devnet + config + SDK działający | O4 | H+10 |
| `design-rationale.md`, `qa-jury.md`, deck PDF | O4 (zgłoszenie) | H+20 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| szkielet repo, `@sellsol/shared` | O4 | H+1 |
| pubkey weryfikatora, `fee_wallet`, RPC | O4 | H+1 |

## Jak testować samodzielnie
- `cargo test` (logika), `anchor test` (całe instrukcje na Surfpool), test SDK na localnecie, `inspect-escrow` na devnecie.
- Niczego nie potrzebujesz od innych poza pubkeyem weryfikatora (na localnecie wygeneruj własny).

## Definition of Done
- [ ] Wszystkie przypadki testowe z listy przechodzą.
- [ ] Program na devnecie, config zainicjowany, `PROGRAM_ID` w KONTRAKT i README.
- [ ] SDK używany przez serwer Osoby 4 tworzy działające transakcje (pierwsza transakcja w Explorerze do H+12).
- [ ] `docs/design-rationale.md`, `docs/qa-jury.md` i deck PDF gotowe.

## Pułapki
- `@anchor-lang/core` to nowa nazwa `@coral-xyz/anchor` (Anchor 1.x). Przykłady z internetu mogą mieć stare importy.
- W przeglądarkowych i RN buildach Anchor nie eksportuje `Wallet`/`NodeWallet`. SDK działa tylko w Node, ale i tak użyj własnego `keypairWallet`.
- `system_program::transfer` **z** PDA z danymi nie zadziała: przesuwaj lamporty bezpośrednio.
- Po każdej zmianie kont przebuduj i zsynchronizuj IDL (`sync-idl`), bo inaczej serwer zbuduje złe transakcje.
- Escrow o danym `order_id` można założyć tylko raz: testy na devnecie rób na UUID spoza puli plomb demo.
- Nie dodawaj instrukcji typu „admin zmienia wynik” ani „admin wypłaca”. To zabiłoby sens projektu.

## Prompt startowy do Claude Code
```
Pracujesz w repo SellSol (hackathon Superteam „Finance Without Intermediaries”, 24 h). Przeczytaj CLAUDE.md,
docs/KONTRAKT.md (szczególnie §3, §5, §6) i docs/zadania/2-backend-solana.md.
Jesteś Osobą 2: program Anchor 1.1.2 `sellsol_escrow` w /program i SDK w /packages/sdk. Nie edytujesz innych folderów.
Zacznij od state.rs i logic.rs (decide + fee z testami cargo), potem instrukcje w kolejności fund_escrow → commit_shipment →
confirm_receipt → open_claim → submit_verdict → claim_timeout → seller_decline → initialize_config, a do każdej test mocha.
Nazwy kont, pól, instrukcji, błędów i eventów bierz 1:1 z KONTRAKT §5. Kod ma być krótki i czytelny dla jury.
Używaj @anchor-lang/core (nie @coral-xyz/anchor). Po każdej instrukcji uruchom anchor test.
```

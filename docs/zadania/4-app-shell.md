# Osoba 4: app shell (monorepo, `packages/shared`, portfel, Solana, storage, media)

## Rola i cel
Budujesz fundament, na którym stoją O2, O3 i O5:
- w pierwszych 30 minutach monorepo, które instaluje się i odpala na telefonie;
- `@unbox/shared` (stałe, etykiety, QR, ścieżki, typy JSON);
- trzy moduły aplikacji, przez które ekrany rozmawiają ze światem: `app/src/solana/` (portfel + wszystkie instrukcje), `app/src/storage/` (Supabase), `app/src/media/` (kamera, nagrywanie, QR, hash);
- ekrany wspólne dla obu ról: Portfel i Szczegóły transakcji.

Ryzyko nr 1 projektu to Anchor + web3.js w React Native. Twój spike rozstrzyga je przed K1.

## Twoje pliki
- Root: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.gitignore`.
- `packages/shared/**` poza `idl/` i wartością `PROGRAM_ID` (te zmienia O1).
- `app/` (scaffold), `app/src/{solana,storage,media,ui}/**`, wspólne komponenty w `app/src/components/` (lista z właścicielami w `docs/ui.md` §4), `app/.env.example`.
- Trasy: `app/app/_layout.tsx`, `app/app/(tabs)/_layout.tsx`, `app/app/(tabs)/wallet.tsx`, `app/app/deal/[deal].tsx`, `app/app/dev.tsx`.

**Nie dotykasz:** tras O2 i O3 (lista w `docs/zadania/README.md`), `programs/`, `tests/`, `oracle/`, `scripts/`.

## Przeczytaj najpierw
`CLAUDE.md` §3 (przepływ), §4 (instrukcje, statusy, QR), §6 (cała aplikacja, granice modułów, nagrania, storage, etykiety), §7 (stack, struktura). `docs/zadania/README.md` (trasy, konwencje, wektory). `docs/zadania/1-program.md` (tabela argumentów instrukcji: pisz pod nią, zanim pojawi się IDL v0). `docs/ui.md` (§3–4 theme i komponenty wspólne, §5 zgoda, cykl operacji i czas sieci, §6.6, §6.12–6.13, §7 macierz „Co teraz?”, §8 werdykt, §9 błędy).

## Stack i setup
Node 24, pnpm, Expo (najnowsze SDK) + expo-router + TypeScript, Expo Go na telefonach, `@anchor-lang/core` 1.1.2, `@solana/web3.js` 1.99.0, `@noble/hashes`, `bs58`, `react-native-get-random-values`, `buffer`. Moduły Expo: `expo-camera`, `expo-file-system`, `expo-crypto`, `expo-secure-store` (wszystkie działają w Expo Go).

**K0, przed 23:00 (tylko środowisko):**
- Projekt Supabase, **publiczny** bucket `unbox`, polityka: anon może tylko `insert` do `unbox` (bez update i delete). Sprawdź limit rozmiaru pliku (darmowy plan: 50 MB). Klucz anon dla zespołu, service key prywatnie dla O5.
- Darmowe RPC devnet (Helius) dla zespołu.
- Najnowsze Expo Go na telefonach demo.

## Zadania

### P0. Scaffold monorepo (do 23:30, wszyscy czekają)
- [ ] Root `package.json` (`private`, `packageManager`, skrypt `typecheck`, overrides `@anchor-lang/core` → `1.1.2` i `@solana/web3.js` → `1.99.0` jak w bootcampie), `pnpm-workspace.yaml` (`app`, `oracle`, `packages/*`), `.npmrc` (`node-linker=hoisted`). Root już jest na `main` (O1, `pnpm@9.15.9`): dopisz `typecheck` i swoje paczki, nie zakładaj go od nowa.
- [ ] `.gitignore`: `node_modules`, `.env*` z wyjątkiem `!.env.example`, `target/`, `.anchor/`, `test-ledger/`, `**/keys/`, `*-keypair.json`, `oracle/fixtures/**/*.mp4`, `.expo/`.
- [ ] `app/`: `create-expo-app` (szablon domyślny: expo-router + TS). Działa w Expo Go przez `pnpm --filter app start`.
- [ ] `packages/shared` jako `@unbox/shared` z `"main": "src/index.ts"` (TS bez builda: Metro, `tsx` i Node 24 biorą źródła bezpośrednio).
- [ ] Commit na `main`, info na kanale. Od teraz root zmieniasz małymi commitami.

### P0. `@unbox/shared` (do 01:00)
- [ ] `constants.ts`: `PROGRAM_ID` (placeholder do deployu O1), `ORACLE_PUBKEY` (od O5), `CLUSTER = "devnet"`, `TIMEOUTS` (demo, zgodne z `constants.rs`), `explorerTxUrl(sig)`, `explorerAddressUrl(pk)`.
- [ ] `status.ts`: typ `DealStatus` i `STATUS_LABELS_PL` 1:1 z tabeli w `CLAUDE.md` §6.
- [ ] `qr.ts`: `encodeShipPayload`, `encodeReturnPayload`, `parseQrPayload(text) → { kind: "ship" | "return", deal, secret } | null`, `shipCommitment`, `returnCommitment`.
- [ ] `paths.ts`: `listingPath(deal, file)`, `dealPath(deal, file)`, `publicUrl(supabaseUrl, path)`.
- [ ] `pda.ts`: `dealPda(seller, dealId)`, `newDealId()`.
- [ ] `types.ts`: `ListingMetadata`, `Complaint`, `ComplaintCategory` + `COMPLAINT_LABELS_PL`, `OracleReport` (kształt z §5, ustal z O5).
- [ ] Testy (`node --test`, bez nowych zależności) na wektorach z `docs/zadania/README.md`.

### P0. Spiki (K1, 02:00)
- [ ] **Transakcja z telefonu:** polyfille jako pierwszy import w `app/app/_layout.tsx` (`react-native-get-random-values`, potem `global.Buffer = Buffer`), `Keypair.generate()`, saldo, przelew od O6, a gdy IDL v0 jest na devnecie: `Program` z `@anchor-lang/core` + własny obiekt portfela (`publicKey`, `signTransaction`, `signAllTransactions`) → `create_listing`.
  - Jeśli `@anchor-lang/core` nie działa w Hermesie: instrukcje budowane ręcznie z IDL (coder z Anchora albo dyskryminator + borsh) i web3.js. Daj znać zespołowi od razu.
- [ ] **Hash 60 MB na telefonie:** czytanie kawałkami (`expo-file-system`: nowe API `File`/`FileHandle` albo `readAsStringAsync` z `position`/`length` z `expo-file-system/legacy`) + przyrostowy `sha256` z `@noble/hashes`. Zmierz czas na telefonie demo.
- [ ] Wyniki (wersje, pułapki, czasy) w `docs/spiki.md`.

### P0. Moduły aplikacji (do 03:00, potem rozwijasz)
- [ ] `app/src/solana/wallet.ts`: keypair w `expo-secure-store` (generowany przy pierwszym uruchomieniu), `getPublicKey()`, `importSecretKey(base58)` (dev menu), `getBalance()`, `requestTestSol()` (airdrop; przy błędzie komunikat „Nie udało się pobrać testowych środków, poproś zespół o przelew”).
- [ ] `app/src/solana/program.ts`: `Connection(EXPO_PUBLIC_RPC_URL, "confirmed")`, provider z własnym portfelem, `Program` z IDL z shared.
- [ ] `app/src/solana/deals.ts`: `fetchDeals({ status?, seller?, buyer? })` (`memcmp` na `seller` i `buyer`, status filtrowany w kliencie, chyba że O1 przeniesie stringi na koniec), `fetchDeal(pk)`. Zwraca prosty typ `DealView` (stringi base58, hashe w hex, liczby, status jako string, `deadline`).
- [ ] `app/src/solana/actions.ts`: po jednej funkcji na instrukcję: `createListing`, `cancelListing`, `purchase`, `markShipped`, `acceptDelivery`, `openDispute`, `markReturned`, `confirmReturn`, `settleExpired`. Zwracają sygnaturę. Błędy Anchora mapujesz na komunikaty PL bez żargonu.
- [ ] `app/src/storage/`: `uploadFile(path, localUri, contentType, onProgress?)` dla wideo i zdjęć (postęp do paska w `TxProgress`, `docs/ui.md` §5.3) (REST Supabase `POST /storage/v1/object/unbox/<path>` z `x-upsert: false` przez upload binarny z `expo-file-system`, bez ładowania pliku do JS), `uploadBytes(path, bytes, contentType)` dla JSON-ów, `downloadBytes(url)`, `publicUrl(path)`.
- [ ] `app/src/media/`:
  - `Recorder`: `CameraView` w trybie wideo, 720p, `recordAsync({ maxDuration: 120 })`, bez dźwięku, z callbackiem `onQrScanned` (jeśli spike O3 potwierdzi skan w trakcie nagrywania);
  - `QrScanner` (fallback po nagraniu i skan zwrotu u sprzedającego);
  - `hashFile(uri) → hex` (kawałkami, ze spike'a);
  - obsługa uprawnień do kamery.
- [ ] `app/.env.example`: `EXPO_PUBLIC_RPC_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Tymczasowy ekran testowy, który woła każdą funkcję. Usuń go przed K4.
- [ ] Prymitywy UI z `docs/ui.md` §3–4 (O2 i O3 ich potrzebują): `app/src/ui/{theme,format}.ts`, `Screen`, `Button`, `Card`, `Notice`, `TxProgress`, `SuccessView`, `StatusBadge`, `Countdown`, `ExplorerLink`, `ConfirmSheet`, `BalanceGuard`, `RoleBanner`, `RulesSheet`. Do tego `app/src/solana/clock.ts` (`networkNow()` z Clock sysvar, §5.4), bo z niego liczą się wszystkie terminy.

### P0. Nawigacja i ekrany wspólne (do K2 08:00, dopracowanie do K3)
- [ ] `(tabs)/_layout.tsx`: Przeglądaj, Wystaw, Sprzedaże, Zakupy, Portfel. Puste pliki tras O2 i O3 z nagłówkiem, żeby nikt nie tworzył ich równolegle.
- [ ] **Portfel**: adres (kopiuj), saldo w SOL, „Doładuj testowe SOL”, dyskretny link do Explorera. Długie przytrzymanie adresu otwiera `/dev`: import klucza demo, podgląd RPC i `PROGRAM_ID`, „tylko devnet”.
- [ ] **Szczegóły transakcji** (`deal/[deal].tsx`, układ w `docs/ui.md` §6.6; `nextStep.ts` + `NextStepCard` wg §7, `Timeline`, `VerdictCard` wg §8):
  - etykieta statusu z shared i oś statusów (ścieżka przejść z §4, bieżący podświetlony);
  - odliczanie do terminu (`status_changed_at + TIMEOUTS`);
  - przycisk „Odbierz środki” (`settleExpired`) dla **każdego** użytkownika, gdy termin minął i status jest w tabeli `settle_expired`;
  - werdykt: gdy `verdict ≠ None`, pobierz `deals/<deal>/report.json`, sprawdź `sha256 == report_hash` („Raport zgodny z zapisem ✓”) i pokaż `reasoning` po polsku;
  - „Anuluj ogłoszenie” dla sprzedającego w `Listed`;
  - przyciski przejścia do tras O2/O3 zależnie od roli i statusu: sprzedający `Paid` → `/seller/[deal]/pack`, `Returning` → `/seller/[deal]/confirm-return`; kupujący `Shipped` → `/buyer/[deal]/unbox`, `ReturnRequested` → `/buyer/[deal]/return`;
  - link „Zobacz w Solana Explorer” (konto `Deal`);
  - odświeżanie co 3–5 s.

### P1. Odporność (do K4)
- [ ] Wspólny stan „Zabezpieczam środki…” z ponowieniem przy wygasłym blockhashu.
- [ ] Jeśli spike kamery wymaga `react-native-vision-camera`: decyzja zespołu, dev build (`npx expo run:android` albo EAS) na oba telefony demo. Zacznij wcześnie, bo kolejka EAS bywa długa.
- [ ] `pnpm typecheck` zielony w całym workspace.

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| Supabase (bucket, anon key), RPC | wszyscy | K0 |
| service key Supabase | O5 | K0 |
| scaffold monorepo | wszyscy | 23:30 |
| `@unbox/shared` z testami | O2, O3, O5, O6 | 01:00 |
| spiki: tx z telefonu, hash 60 MB | wszyscy | K1 02:00 |
| `solana`, `storage`, `media` | O2, O3 | 03:00 |
| Portfel, Szczegóły transakcji | wszyscy | K2 08:00 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| IDL v0, potem `PROGRAM_ID` | O1 | 00:30, K1 |
| `ORACLE_PUBKEY` | O5 | K0 |
| wynik spike'a kamery | O3 | K1 |
| kształt `report.json` | O5 | 01:00 |

## Jak testować samodzielnie
`pnpm --filter @unbox/shared test`, `pnpm typecheck`, ekran testowy na telefonie (każda funkcja `solana`/`storage`/`media`), Explorer.

## Definition of Done
- [ ] Ekrany O2 i O3 importują tylko `app/src/{solana,storage,media}`, `@unbox/shared` i komponenty. Nikt poza `app/src/solana/` nie importuje web3/anchor.
- [ ] Każda instrukcja programu ma funkcję w `actions.ts` przetestowaną na devnecie z telefonu.
- [ ] Wideo 2 min hashuje się i wysyła z telefonu demo bez crasha.
- [ ] Portfel i Szczegóły transakcji działają dla obu ról; „Odbierz środki” działa po terminie.

## Pułapki
- `Wallet`/`NodeWallet` z Anchora nie działają w RN. Napisz własny obiekt portfela.
- Dwie kopie `@solana/web3.js` w drzewie = dziwne błędy `instanceof PublicKey`. Sprawdź `pnpm why @solana/web3.js`.
- Polyfille muszą być pierwszym importem, przed czymkolwiek z web3.
- Argumenty u64 (`deal_id`, cena) jako `BN`.
- Nie wczytuj całego wideo do JS-a (base64 z 60 MB to ok. 80 MB stringa). Hash kawałkami, upload binarny.
- Darmowy Supabase ma limit 50 MB na plik. 2 min 720p może go przekroczyć: obniż bitrate nagrania albo skróć limit czasu (to zmiana §6, uzgodnij).
- Publiczny devnet RPC ma limity: odświeżaj co ≥ 3 s, używaj Helius.
- Klucz anon Supabase jest publiczny z założenia. Service key nigdy w `app/`.
- Wszystkie telefony muszą mieć ten sam Expo Go, zgodny z SDK projektu.

## Prompt startowy do Claude Code
```
Pracujesz w repo unboxproof (HackYeah 2026). Przeczytaj CLAUDE.md (§3, §4, §6, §7), docs/zadania/README.md
i docs/zadania/4-app-shell.md. Jesteś Osobą 4: app shell. Edytujesz root monorepo, packages/shared (poza idl/),
app/src/{solana,storage,media}, app/app/_layout.tsx, (tabs)/_layout.tsx, (tabs)/wallet.tsx, deal/[deal].tsx, dev.tsx.
Kolejność: (1) scaffold pnpm workspace + Expo (expo-router, TS) + @unbox/shared; (2) shared: stałe, etykiety PL,
QR payload i commitmenty z testami na wektorach z README; (3) spike: @anchor-lang/core + @solana/web3.js 1.99.0
w Expo Go (polyfille, własny obiekt portfela) i hash 60 MB kawałkami; (4) moduły solana/storage/media;
(5) Portfel i Szczegóły transakcji. Nie dodawaj natywnych zależności bez uzgodnienia z zespołem.
```

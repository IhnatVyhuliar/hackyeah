# Zadania — przegląd

Od 04.10 01:30 obowiązuje podział na dwie osoby: [plan A (aplikacja + server)](../superpowers/plans/2026-10-04-a-app-server.md) i [plan B (escrow + łańcuch)](../superpowers/plans/2026-10-04-b-escrow-chain.md). Poniższe pliki ról zostają jako opis zakresu.

Specyfikacja jest w `CLAUDE.md` (§4 program, §5 wyrocznia, §6 aplikacja) oraz w IDL w `packages/shared/idl/`. Ten katalog mówi, **kto co robi, do kiedy i na kogo czeka**. Godziny i kamienie K0–K6 pochodzą z `CLAUDE.md` §10.

## Role

| # | Rola | Plik | Twoje pliki |
|---|---|---|---|
| 1 | Program + testy | [1-program.md](1-program.md) | `Anchor.toml`, `Cargo.toml`, `programs/`, `tests/`, skrypty `sync-idl`/`test` w root `package.json`, stała `PROGRAM_ID` |
| 2 | App: sprzedający | [2-app-sprzedajacy.md](2-app-sprzedajacy.md) | trasy sprzedającego (niżej), `app/src/components/{QrCard,DealRow,RecordingChecklist}.tsx`, `app/src/components/printQrCard.ts` |
| 3 | App: kupujący | [3-app-kupujacy.md](3-app-kupujacy.md) | trasy kupującego (niżej), `app/src/components/ListingCard.tsx` |
| 4 | App shell | [4-app-shell.md](4-app-shell.md) | root monorepo, `packages/shared` (poza `idl/`), `app/src/{solana,storage,media,ui}`, pozostałe komponenty z `docs/ui.md` §4, layouty, Portfel, Szczegóły transakcji |
| 5 | Wyrocznia | [5-wyrocznia.md](5-wyrocznia.md) | `oracle/` |
| 6 | Pitch i demo | [6-pitch-demo.md](6-pitch-demo.md) | `README.md`, `docs/` (poza `docs/zadania/`), `scripts/` |

## Trasy w aplikacji (każdy plik ma jednego właściciela)

```
app/app/_layout.tsx                      O4  polyfille jako pierwszy import, providery
app/app/(tabs)/_layout.tsx               O4  zakładki
app/app/(tabs)/index.tsx                 O3  Przeglądaj
app/app/(tabs)/sell.tsx                  O2  Wystaw
app/app/(tabs)/sales.tsx                 O2  Moje sprzedaże
app/app/(tabs)/purchases.tsx             O3  Moje zakupy
app/app/(tabs)/wallet.tsx                O4  Portfel
app/app/listing/[deal].tsx               O3  Szczegóły ogłoszenia + „Kup”
app/app/deal/[deal].tsx                  O4  Szczegóły transakcji (oś statusów, termin, „Odbierz środki”, werdykt, Explorer)
app/app/seller/[deal]/pack.tsx           O2  Spakuj i nadaj
app/app/seller/[deal]/confirm-return.tsx O2  Potwierdź zwrot
app/app/buyer/[deal]/unbox.tsx           O3  Nagraj otwarcie → „Wszystko OK” / „Reklamuję”
app/app/buyer/[deal]/complaint.tsx       O3  Formularz reklamacji
app/app/buyer/[deal]/return.tsx          O3  Odeślij zwrot
app/app/dev.tsx                          O4  ukryte menu deweloperskie
```

Ekran „Szczegóły transakcji” (O4) nie zawiera logiki sprzedającego ani kupującego. Przyciski akcji z kamerą prowadzą do tras O2 i O3.

Wygląd, teksty i stany wszystkich ekranów opisuje [`docs/ui.md`](../ui.md).

## Przekazania

| Kiedy | Od → do | Co | Jak sprawdzić |
|---|---|---|---|
| K0 (przed 23:00) | O4 → wszyscy | projekt Supabase, publiczny bucket `unbox`, klucz anon; RPC devnet (Helius) | `.env.example` w `app/` i `oracle/` |
| K0 | O4 → O5 (prywatnie) | `SUPABASE_SERVICE_KEY` | wyrocznia wysyła plik testowy |
| K0 | O5 → O4 | `ORACLE_PUBKEY` (keypair wyroczni poza gitem) | — |
| K0 | O6 → O1, O5 | zasilony portfel zespołu; po kilka SOL dla deployera i wyroczni | `solana balance` |
| 23:30 | O4 → wszyscy | scaffold monorepo na `main` | `pnpm install && pnpm --filter app start` działa na telefonie |
| 00:30 | O1 → wszyscy | **IDL v0**: konto `Deal` i wszystkie instrukcje z ostatecznymi argumentami (ciała mogą być puste) | `packages/shared/idl/unbox_escrow.json` w repo |
| 01:00 | O4 → O2, O3, O5 | `@unbox/shared`: etykiety, QR (payload + commitmenty), ścieżki storage, typy JSON, wektory testowe | `pnpm --filter @unbox/shared test` |
| K1 (02:00) | O1 | „hello” program na devnecie | link w Explorerze |
| K1 | O3 → O4 | wynik spike'a kamery (wideo + QR naraz?) | wpis w `docs/spiki.md` |
| K1 | O4 | transakcja z telefonu, czas hashowania 60 MB | wpis w `docs/spiki.md` |
| K1 | O5 | Gemini: 2 wideo → JSON, czas i jakość | wpis w `docs/spiki.md` |
| K1 | O2 | druk karty QR z telefonu (`expo-print`) | wydrukowana karta skanuje się |
| 03:00 | O4 → O2, O3 | `app/src/solana` (funkcje dla wszystkich instrukcji), `storage`, `media` (nagrywanie + hash) | ekran testowy wywołuje każdą funkcję |
| 04:00 | O6 → O5 | rekwizyty: ubranie z plamą, pudełka, taśma, etykiety, karty QR | — |
| 05:00 | O5 + O6 | 4 nagrania fixture | `pnpm --filter oracle fixture` |
| 06:00 | O1 → wszyscy | pełny program na devnecie, `PROGRAM_ID` w `packages/shared` | `anchor test` zielony |
| **K2 (08:00)** | wszyscy | program + testy na devnecie; app: portfel, przeglądanie, wystawianie, zakup; wyrocznia `fixture` | demo wewnętrzne |
| 10:00 | O6 | skrypty: zasilenie portfeli, seed ogłoszeń, staging | `scripts/status.ts` pokazuje konta |
| **K3 (12:00)** | O2, O3, O4 | happy path E2E na devnecie | linki w Explorerze |
| 14:00 | O5 | wyrocznia rozstrzyga prawdziwy spór na devnecie | `resolve_dispute` w Explorerze |
| **K4 (16:00)** | wszyscy | spór i zwrot E2E, **feature freeze** | 2 telefony, pełna ścieżka |
| 16:00–18:00 | O6 + wszyscy | 2 próby demo według `docs/demo.md` | lista kontrolna |
| **K5 (19:00)** | O6 | README, slajdy, wideo, nagranie zapasowe | link do wideo działa w trybie incognito |
| **K6 (21:00)** | O6 | zgłoszenie na HackTribe | potwierdzenie |

## Wspólne konwencje (implementuje O4 w `@unbox/shared`)

- **Hashe:** on-chain `[u8; 32]`, w JSON-ach i logach 64 znaki hex lowercase. sha256 z `@noble/hashes`, bo działa i w RN, i w Node.
- **`deal_id`:** u64 z `newDealId()` (np. `Date.now()`), unikalny w obrębie sprzedającego. PDA liczy `dealPda(seller, dealId)`.
- **Kwoty:** w kodzie lamporty (`BN` w wywołaniach Anchora), w UI SOL. Parsowanie ceny bez floatów.
- **Czas:** unix w sekundach. Terminy w UI = `status_changed_at + TIMEOUTS[status]`. Stałe `TIMEOUTS` w shared muszą się zgadzać z `constants.rs` (sprawdza O1).
- **`metadata_uri`:** publiczny URL Supabase do `listings/<deal>/metadata.json` (≤ 200 znaków).
- **`metadata.json`** (`ListingMetadata`): `{ v: 1, title, description, brand, size, condition, defects: string[], photos: { path, sha256 }[] }`. Hashe zdjęć są w metadanych, więc `listing_hash` obejmuje też zdjęcia.
- **`complaint.json`** (`Complaint`): `{ v: 1, category, description, created_at }`, kategorie z etykietami PL w shared.
- **`report.json`**: kształt z `CLAUDE.md` §5 + `prompt_version`, `model`, `verdict`, `evidence`, `created_at` (ustala O5, typ w shared).

## Wektory testowe QR (shared, testy programu, wyrocznia)

```
deal   = bajty 1..32         = 4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw
secret = 32 × 0xab           = CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t

shipCommitment   = sha256(deal || secret)
                 = 53c95ae0a78bfd76222068846946ee779ca3d184074836c3586cd0fa91ff7977
returnCommitment = sha256("return" || deal || secret)
                 = 5e5f3dfadff170096733860b3fb82e2ce226c81a8103a67fc0bb850fff1b649d

payload wysyłki  = UNBOX1:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t
payload zwrotu   = UNBOX1R:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t
```

## Otwarte kwestie (decyduje zespół; po decyzji wpis w `CLAUDE.md` §13)

1. **Paczka bez karty QR.** `open_dispute` wymaga sekretu z karty. Sprzedający, który nie włoży karty (np. wyśle pustą paczkę), blokuje reklamację, a po `UNBOX_TIMEOUT` dostaje SOL. Opcje:
   - (a) `open_dispute` z opcjonalnym sekretem, a `decide()` przy braku QR sprawdza `seller_recording.qr_card_packed`. To zmiana IDL (O1) i `decide()` (O5).
   - (b) Zostawiamy i mówimy o tym wprost jako o ograniczeniu.
2. **Sekret widoczny na nagraniu pakowania.** `packing.mp4` jest publiczny, więc czytelny QR na nagraniu zdradza sekret przed doręczeniem. Ustalenie robocze: karta składana na pół, QR do środka, na nagraniu widać tylko złożoną kartę (O2 w instrukcji nagrywania, O6 w rekwizytach, O5 w prompcie).

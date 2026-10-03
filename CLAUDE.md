# CLAUDE.md — unboxproof (nazwa robocza)

Mobilny marketplace używanych ubrań na Solanie, w którym **opłatę za ochronę kupującego zastępuje escrow on-chain + wąska wyrocznia AI**. Wyrocznia ocenia reklamacje na podstawie nagrań wideo pakowania i rozpakowania z jednorazowym kodem QR.

Projekt na HackYeah 2026, wyzwanie Superteam Poland „Finanse bez pośrednika”. Zespół: 6 osób, React Native, wszyscy pracują z Claude.

Odpowiadaj zespołowi **po polsku**. Kod, identyfikatory, commity i komentarze piszemy **po angielsku**. Teksty w UI są **po polsku**. README piszemy po angielsku, bo jest dla jury.

---

## 1. Kontekst wyzwania (czytaj, zanim cokolwiek zaprojektujesz)

- **Zadanie:** zbudować na Solanie (wystarczy devnet) aplikację, która usuwa z transakcji finansowej konieczność zaufania do pośrednika. Ma to być działająca aplikacja, a nie makieta.
- **Aplikacja jest kompletna, gdy:**
  1. realizuje co najmniej jeden pełny scenariusz od wejścia użytkownika do zakończonej transakcji;
  2. da się w niej pokazać moment, w którym pośrednik przestaje być potrzebny;
  3. działa **na żywo** na prezentacji (nagranie służy tylko jako plan awaryjny).
- **Kryteria oceny:**

  | Kryterium | Waga |
  |---|---|
  | Związek z wyzwaniem | **30%** |
  | Kompletność i działanie | 25% |
  | Pomysł i wybór problemu | 20% |
  | Potencjał wdrożeniowy | 15% |
  | Oryginalność | 10% |

- **Okno pracy (regulamin, pkt 5):** rozwiązywanie zadania zaczynamy **nie wcześniej niż w sobotę 3.10.2026 o 23:00**. Przed 23:00 wolno tylko przygotować środowisko (dev container, Expo Go, konta Supabase/Gemini/RPC, zasilenie portfeli devnet), bez kodu projektu.
- **Do oddania na HackTribe** (termin: **niedziela 4.10.2026, 23:00**; ostatnie zmiany po terminie są nieważne; po polsku albo angielsku):
  - tytuł projektu, nazwa zespołu, lista członków (1–6 osób);
  - szczegółowy opis z uzasadnieniem projektowym;
  - PDF z prezentacją (maks. 10 slajdów);
  - publiczny link do wideo (maks. 3 min);
  - publiczne repozytorium z czytelnym README.
- **Jury zagląda do repo** (przed prezentacją i po niej) i sprawdza, czy program on-chain robi to, co pokazuje demo. Interfejs może być surowy.
- **Na demo jury chce zobaczyć** potwierdzoną transakcję w eksploratorze (Solana Explorer) i zapyta o pięć rzeczy z §12. Za awarię nie ma dyskwalifikacji, ale trzeba wprost powiedzieć, co poszło nie tak.
- **Źródła:** `RULES Finance Without Intermediaries.pdf` i `CRITERIA Finance Without Intermediaries PL_ENG.pdf` w root repo.
- **Użytkownik docelowy** (nazywamy go wprost, jak wymaga regulamin): *osoby kupujące i sprzedające używane ubrania online (użytkownicy Vinted/OLX), spoza świata krypto*. Dlatego UI unika żargonu:
  - nie używa słów „transakcja on-chain”, „podpis”, „lamport”, „PDA”;
  - pisze „środki zabezpieczone w umowie”, „saldo”, „zwrot”;
  - link „Zobacz w Solana Explorer” jest obecny, ale dyskretny.

### Uzasadnienie projektowe (wersja do opisu i pitchu)

- **Relacja:** płatność kupującego dla sprzedającego za używane ubranie kupione online od nieznajomego.
- **Pośrednik dziś:** platforma (np. Vinted). Trzyma pieniądze, pobiera opłatę za „ochronę kupującego” (stała kwota + procent ceny; **przed użyciem w pitchu sprawdź aktualny cennik**), a reklamacje rozstrzyga ręcznie jej support według reguł, których strony nie widzą i nie mogą wyegzekwować.
- **Co się zmienia po jego usunięciu:**
  - Pieniądze trzyma program, którego kod każdy może przeczytać.
  - Reguły (terminy, kto co może) są identyczne dla każdego i nie da się ich zmienić w trakcie sprawy.
  - Spór rozstrzyga wyrocznia AI o **binarnym** uprawnieniu (kupujący albo sprzedający). Nie może zabrać środków ani ich zamrozić, bo po terminie każdy może domknąć transakcję.
  - Dowody (hash ogłoszenia, hashe nagrań, commitment QR) są zapisane on-chain ze znacznikiem czasu.
  - Koszt dla użytkownika: opłata sieci (ułamek grosza) plus depozyt za miejsce na koncie `Deal`, który dziś zostaje na koncie (patrz „Znane ograniczenia” w §12). Koszt wyroczni (tokeny Gemini) **pokrywamy my**.

---

## 2. Zasada nr 1 — NIENEGOCJOWALNA

> „Logika, która zastępuje pośrednika, musi znajdować się w programie on-chain. Jeśli warunki transakcji egzekwuje Twój backend, pośrednik nie zniknął — zmienił się w Ciebie.” — regulamin wyzwania

- **Wszystko, co dotyczy pieniędzy, terminów i uprawnień, żyje w programie** `programs/unbox_escrow`.
- Aplikacja i wyrocznia **tylko składają transakcje**. Aplikacja może ukrywać przyciski niedozwolonych akcji, ale **nigdy nie jest jedynym strażnikiem reguły**. Jeśli dodajesz sprawdzenie w aplikacji, upewnij się, że program egzekwuje to samo.
- **Wyrocznia** może tylko wywołać `resolve_dispute` z werdyktem `Seller` albo `Buyer`, wyłącznie w statusie `Disputed` i wyłącznie przed upływem `ORACLE_TIMEOUT`. Nie ma żadnej ścieżki, którą przelałaby środki komuś poza stronami.
- **Brak instrukcji admina.** Nikt, także my, nie może przesunąć środków poza ścieżkami maszyny stanów.
- `server/` (Rust) w trybie `PAYMENTS=solana` (domyślnym) tylko odbija stan programu: nie ma kluczy, niczego nie podpisuje i nie trzyma środków. Webhook Helius i poller to sygnał do ponownego odczytu kont `Deal` z RPC. `PAYMENTS=demo` (ledger w SQLite) służy wyłącznie testom i awaryjnemu demo offline.
- Jeśli zadanie skłania Cię do przeniesienia reguły biznesowej poza program, **zatrzymaj się i zgłoś to użytkownikowi**.

---

## 3. Przepływ użytkownika

**Wystawienie i zakup**

1. Sprzedający wystawia ogłoszenie: zdjęcia, opis, rozmiar, marka, stan, **lista wad**, cena w SOL. Metadane trafiają do storage, a sha256 pliku metadanych do konta `Deal` (`create_listing`). Po zakupie opisu nie da się zmienić.
2. Kupujący kupuje: SOL trafia do escrow w koncie `Deal` (`purchase`).

**Wysyłka**

3. Sprzedający pakuje paczkę **nagrywając to w aplikacji**. Na nagraniu widać ubranie, wydrukowaną kartę QR wkładaną do środka, zaklejenie paczki i etykietę przewoźnika.
4. Aplikacja liczy hash nagrania, wysyła plik, po czym wywołuje `mark_shipped` z:
   - commitmentem QR;
   - hashem nagrania;
   - numerem przesyłki.

**Rozpakowanie** (kupujący, wyłącznie w aplikacji)

5. Kupujący **nagrywa w aplikacji pełne otwarcie**, od zamkniętej paczki. QR widać dopiero po otwarciu, a aplikacja wykrywa go podczas nagrywania.
6. **Zaraz po nagraniu** kupujący wybiera jedną z opcji:
   - **„Wszystko OK”** → `accept_delivery(qr_secret)` → SOL trafia do sprzedającego. Nagranie nie jest wysyłane.
   - **„Reklamuję”** → kupujący wybiera kategorię i opisuje problem → wysyłka nagrania i `complaint.json` → `open_dispute(qr_secret, video_hash, complaint_hash)`.
7. Jeśli kupujący nic nie zrobi do `UNBOX_TIMEOUT`, ktokolwiek wywołuje `settle_expired` → SOL trafia do sprzedającego. **Bez nagrania nie ma reklamacji.**

**Spór**

8. Wyrocznia analizuje oba nagrania, zdjęcia, opis i reklamację, po czym wywołuje `resolve_dispute`:
   - `Seller` → SOL trafia do sprzedającego, koniec.
   - `Buyer` → `ReturnRequested` (kupujący musi odesłać towar).

**Zwrot**

9. Kupujący nagrywa pakowanie zwrotu z **nowym QR** wygenerowanym przez swoją aplikację, po czym wywołuje `mark_returned`.
10. Sprzedający skanuje QR zwrotu → `confirm_return(return_qr_secret)` → SOL trafia do kupującego. Jeśli sprzedający milczy do `RETURN_CONFIRM_TIMEOUT`, `settle_expired` również zwraca SOL kupującemu.

---

## 4. Program on-chain (Anchor) — `programs/unbox_escrow`

### Konto `Deal` (jedno na ogłoszenie, trzyma też escrow w lamportach)

PDA: `["deal", seller, deal_id.to_le_bytes()]`.

```rust
pub struct Deal {
    pub seller: Pubkey,
    pub buyer: Pubkey,                 // Pubkey::default() dopóki Listed
    pub arbiter: Pubkey,               // klucz wyroczni, ustalony przy create_listing, niezmienny
    pub deal_id: u64,
    pub price_lamports: u64,
    pub listing_hash: [u8; 32],        // sha256 bajtów metadata.json
    pub status: DealStatus,
    pub status_changed_at: i64,        // Clock::unix_timestamp przy KAŻDEJ zmianie statusu
    pub qr_commitment: [u8; 32],
    pub packing_video_hash: [u8; 32],
    pub unboxing_video_hash: [u8; 32],
    pub complaint_hash: [u8; 32],
    pub verdict: Verdict,              // None | Seller | Buyer
    pub report_hash: [u8; 32],         // sha256 raportu wyroczni
    pub return_qr_commitment: [u8; 32],
    pub return_video_hash: [u8; 32],
    pub bump: u8,
    #[max_len(200)] pub metadata_uri: String,
    #[max_len(32)] pub tracking_number: String,
    #[max_len(32)] pub return_tracking_number: String,
}
```

Pola `String` są na końcu, więc `status` ma stały offset 152 (`STATUS_OFFSET` w `state.rs`: 8 bajtów dyskryminatora + 3 × `Pubkey` + 2 × `u64` + `listing_hash`). Dzięki temu `getProgramAccounts` może filtrować po statusie przez `memcmp`.

**Escrow:**

- `purchase` przelewa `price_lamports` od kupującego na konto `Deal` (CPI `system_program::transfer`).
- Wypłata to bezpośrednia zmiana lamportów konta należącego do programu: `sub_lamports` / `add_lamports`. Rent zostaje na koncie.

### Maszyna stanów

```
Listed ──purchase──▶ Paid ──mark_shipped──▶ Shipped
Listed ──cancel_listing──▶ Cancelled
Shipped ──accept_delivery(qr_secret)──▶ Completed                       (SOL → sprzedający)
Shipped ──open_dispute(qr_secret, video_hash, complaint_hash)──▶ Disputed
Disputed ──resolve_dispute(Seller, report_hash)──▶ Completed            (SOL → sprzedający)
Disputed ──resolve_dispute(Buyer, report_hash)──▶ ReturnRequested
ReturnRequested ──mark_returned(return_qr_commitment, video_hash, tracking)──▶ Returning
Returning ──confirm_return(return_qr_secret)──▶ Refunded                (SOL → kupujący)
```

### Uprawnienia

| Instrukcja | Podpisuje | Status wejściowy | Warunki |
|---|---|---|---|
| `create_listing` | sprzedający | — | `price > 0`, `arbiter` podany jawnie |
| `cancel_listing` | sprzedający | `Listed` | — |
| `purchase(expected_listing_hash, expected_arbiter)` | kupujący ≠ sprzedający | `Listed` | argumenty zgodne z kontem, czyli kupujący **jawnie akceptuje arbitra** |
| `mark_shipped` | sprzedający | `Paid` | `now < changed_at + SHIP_TIMEOUT` |
| `accept_delivery` | kupujący | `Shipped` | `now < changed_at + UNBOX_TIMEOUT`, commitment QR się zgadza |
| `open_dispute` | kupujący | `Shipped` | jw. |
| `resolve_dispute` | `deal.arbiter` | `Disputed` | `now < changed_at + ORACLE_TIMEOUT`, werdykt ≠ `None` |
| `mark_returned` | kupujący | `ReturnRequested` | `now < changed_at + RETURN_SHIP_TIMEOUT` |
| `confirm_return` | sprzedający | `Returning` | commitment QR zwrotu się zgadza |
| `settle_expired` | **ktokolwiek** | patrz tabela niżej | `now >= changed_at + TIMEOUT` |

### `settle_expired` — tu widać, że nikt nie musi „pilnować” umowy

| Status | Termin | Wynik | Sens |
|---|---|---|---|
| `Paid` | `SHIP_TIMEOUT` | `Refunded` | sprzedający zniknął, kupujący odzyskuje SOL |
| `Shipped` | `UNBOX_TIMEOUT` | `Completed` | brak nagrania lub decyzji, sprzedający dostaje SOL |
| `Disputed` | `ORACLE_TIMEOUT` | `ReturnRequested` | wyrocznia milczy, więc neutralny zwrot towaru za pieniądze |
| `ReturnRequested` | `RETURN_SHIP_TIMEOUT` | `Completed` | kupujący nie odesłał, sprzedający dostaje SOL |
| `Returning` | `RETURN_CONFIRM_TIMEOUT` | `Refunded` | sprzedający nie potwierdził, kupujący dostaje SOL |

Akcje stron wymagają `now < deadline`, a `settle_expired` wymaga `now >= deadline`. Dzięki temu na granicy terminu nie ma wyścigu.

### Timeouty (`constants.rs`, feature flag `demo`, domyślnie WŁĄCZONY na hackathonie)

| Stała | Produkcja | `demo` | `test-timeouts` |
|---|---|---|---|
| `SHIP_TIMEOUT` | 3 dni | 10 min | 5 s |
| `UNBOX_TIMEOUT` | 7 dni | 60 min (żeby dało się przygotować transakcję przed prezentacją) | 5 s |
| `ORACLE_TIMEOUT` | 24 h | 10 min | 5 s |
| `RETURN_SHIP_TIMEOUT` | 3 dni | 10 min | 5 s |
| `RETURN_CONFIRM_TIMEOUT` | 7 dni | 10 min | 5 s |

`test-timeouts` wygrywa z `demo` i służy tylko do `pnpm test:program`. `pnpm deploy:devnet` przebudowuje program bez tej flagi. Zegar Surfpoola stoi między slotami, więc testy przesuwają go przez `surfnet_timeTravel` (`waitPastDeadline` w `tests/helpers.ts`).

### Kod QR (jednorazowy)

- **Sekret:** 32 losowe bajty generowane w aplikacji sprzedającego (`expo-crypto`).
- **Payload QR:**
  - wysyłka: `UNBOX1:<deal_pubkey_base58>:<secret_base58>`;
  - zwrot: `UNBOX1R:<deal_pubkey_base58>:<secret_base58>`.
- **Commitment wysyłki:** `sha256(deal_pubkey || secret)`. On-chain liczony w `logic::ship_commitment` przez `solana_sha256_hasher::hashv(&[deal.as_ref(), &secret])`.
- **Commitment zwrotu:** `sha256("return" || deal_pubkey || secret)`.
- **Jednorazowość wynika z programu:** sekret ujawnia się w tej samej transakcji co decyzja (`accept_delivery`/`open_dispute`), a zmiana statusu uniemożliwia ponowne użycie. Sprzedający zna sekret, ale nic mu to nie daje, bo te instrukcje może podpisać tylko kupujący.
- Każda zmiana statusu emituje event Anchora (`DealStatusChanged`), z którego korzystają UI i wyrocznia.

---

## 5. Wyrocznia — `oracle/` (Node 24 + TypeScript)

Wyrocznia to wąski serwis, który **zgłasza fakt**, a nie decyduje o pieniądzach. Jej klucz to `deal.arbiter`. Pipeline:

1. **Polling** co ok. 5 s: konta `Deal` w statusie `Disputed`. Przy okazji wyrocznia wywołuje `settle_expired` dla przeterminowanych transakcji. To tylko wygoda: każdy może to zrobić.
2. **Dowody:** pobierz `metadata.json` i zdjęcia, nagranie pakowania, nagranie otwarcia i `complaint.json`. Policz sha256 każdego pliku i porównaj z on-chain. **Brak pliku albo niezgodny hash oznacza, że przegrywa autor pliku**, bez wołania AI.
3. **Gemini:**
   - Oba wideo wysyłasz przez Files API (czekasz na stan ACTIVE), dodajesz zdjęcia, opis z listą wad i reklamację.
   - Odpowiedź ma być w **structured output (JSON schema)**.
   - Model ustawiasz zmienną `GEMINI_MODEL`. **Nie wpisuj go na sztywno; sprawdź aktualne modele i API** na ai.google.dev/gemini-api/docs/models oraz …/video-understanding. Od 06.2026 domyślne jest Interactions API. SDK: `@google/genai`.
4. **Raport** (minimum):

   ```ts
   {
     buyer_recording:  { continuous, starts_with_sealed_package, qr_revealed_on_opening, quality: "good"|"poor", notes },
     seller_recording: { item_clearly_visible, qr_card_packed, package_sealed_and_labeled, quality: "good"|"poor", notes },
     package_matches_shipping_recording: boolean,  // taśma, etykieta, numer przesyłki
     item_matches_listing: boolean,
     undisclosed_damage: { present: boolean, description, timestamps: string[] },
     reasoning: string
   }
   ```

5. **Werdykt wydaje deterministyczna funkcja `decide()` w kodzie, NIE model.** Model tylko wypełnia pola raportu.

   ```ts
   const b = r.buyer_recording, s = r.seller_recording;
   const buyerOk  = b.continuous && b.starts_with_sealed_package && b.qr_revealed_on_opening && b.quality === "good";
   if (!buyerOk) return "SELLER";                              // słabe/ucięte nagranie działa przeciw autorowi
   const sellerOk = s.quality === "good" && s.item_clearly_visible && s.qr_card_packed;
   if (sellerOk && !r.package_matches_shipping_recording) return "SELLER"; // paczka inna niż nadana → manipulacja
   if (!r.item_matches_listing || r.undisclosed_damage.present) return "BUYER";
   return "SELLER";
   ```

   - Werdykt jest **zawsze binarny**.
   - Prompt każe modelowi być **sceptycznym wobec słabych, uciętych lub zasłoniętych nagrań** i traktować je jako argument przeciw ich autorowi.
   - Słabe nagranie sprzedającego wyłącza sprawdzenie zgodności paczki, czyli działa przeciw sprzedającemu.
6. **Zapis i rozstrzygnięcie:** raport (z `prompt_version` i `model`) trafia do storage jako `report.json`, a jego sha256 do `resolve_dispute(verdict, report_hash)`. Każdy może potem zweryfikować, na jakiej podstawie zapadł werdykt.

- Prompt jest wersjonowany w `oracle/prompts/v1.md`. Zmiana promptu oznacza nowy plik `v2.md`; nie edytuj `v1.md` w miejscu.
- `pnpm --filter oracle fixture <dir>` uruchamia ocenę na lokalnych plikach, bez łańcucha. Używaj tego do iterowania promptu.
- **Zmienne env** (`oracle/.env`, nigdy w gicie; wzór w `.env.example`): `GEMINI_API_KEY`, `GEMINI_MODEL`, `ORACLE_KEYPAIR` (ścieżka), `RPC_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

---

## 6. Aplikacja mobilna — `app/` (React Native, Expo, TypeScript, expo-router)

### Ekrany

| Ekran | Zawartość |
|---|---|
| Przeglądaj | konta `Listed` z `getProgramAccounts` + `metadata.json` |
| Szczegóły ogłoszenia | zdjęcia, opis, **lista wad**, cena, przycisk „Kup” |
| Wystaw | zdjęcia z aparatu, formularz, cena |
| Moje sprzedaże | „Spakuj i nadaj”: generuje QR (wydruk przez `expo-print`/udostępnij), nagrywa pakowanie, wpisuje numer przesyłki |
| Moje zakupy | „Nagraj otwarcie” → „Wszystko OK” / „Reklamuję”; ścieżka zwrotu |
| Szczegóły transakcji | oś statusów, odliczanie do terminu, przycisk `settle_expired` po terminie („Odbierz środki”), werdykt AI z uzasadnieniem, link do Explorera |
| Portfel | adres, saldo, „Doładuj testowe SOL” |

Wygląd, teksty, stany i komponenty każdego ekranu, macierz „Co teraz?” dla statusów i ról: **`docs/ui.md`**.

### Portfel i Solana

- Keypair generowany przy pierwszym uruchomieniu i trzymany w `expo-secure-store`.
- Ukryte menu deweloperskie pozwala zaimportować klucz portfela demo. Tylko devnet.
- `@solana/web3.js` 1.99.0 + `@anchor-lang/core` 1.1.2 (IDL z `packages/shared`). Wersje jak w dev containerze, patrz „Stack” w §7.
- Portfel wbudowany zamiast Wallet Adaptera to świadoma decyzja: użytkownik spoza krypto nie ma Phantoma. Regulamin dopuszcza oba podejścia, jeśli wybór jest uzasadniony.
- Polyfille na samym początku entry: `react-native-get-random-values`, `buffer`.
- RPC ustawiasz w `EXPO_PUBLIC_RPC_URL`. Publiczny devnet ma limity zapytań; w razie potrzeby użyj darmowego RPC devnet, np. Helius.

### Backend `server/` w trybie `PAYMENTS=solana` (kontrakt: `server/README.md`)

- **Portfel:** po wygenerowaniu keypaira `PUT /api/me/wallet-address {address}`. Adres jest unikalny między kontami.
- **Wystaw:** `POST /api/listings/{id}/publish` zamraża treść i zwraca argumenty `create_listing` (`deal`, `dealId`, `priceLamports`, `listingHash`, `metadataUri`, `arbiter`). Aplikacja podpisuje `create_listing`. `metadata.json` serwuje `server/` (`GET /api/listings/{id}/metadata.json`, bajty = `listingHash`).
- **Po każdej transakcji** (kup, nadaj, odbierz, reklamuj, zwróć, „Odbierz środki”): `POST /api/chain/sync/{deal}`, żeby UI nie czekało na webhook.
- **Przeglądaj:** `GET /api/listings` pokazuje tylko ogłoszenia widoczne on-chain. Stare akcje REST (`purchase`, `ship`, …) zwracają 409.
- **Ceny w SOL:** `priceMinor` w lamportach, `currency = "SOL"`, maks. 0,1 SOL (limit `Minor` w `@unbox/shared`). Seed: kurtka 0,06, sukienka 0,03, Nike 0,09 SOL.
- `PUBLIC_BASE_URL` trafia on-chain w `metadata_uri`, więc ustaw go **przed** publikacją, najlepiej na stały adres LAN.

### Granice modułów (żeby 3 osoby nie wchodziły sobie w drogę)

- **`app/src/solana/`** to jedyne miejsce, które importuje web3/anchor. Wystawia funkcje typu `purchase(deal)`, `openDispute(...)` i `fetchDeals()`.
- **`app/src/storage/`** odpowiada za upload i pobieranie plików z Supabase.
- **`app/src/media/`** obsługuje kamerę, nagrywanie, wykrywanie QR i hashowanie.
- Ekrany korzystają tylko z tych trzech modułów.

### Nagrania

- Nagrywanie **tylko w aplikacji**, bez wyboru z galerii. Limit: 720p i maks. 2 min.
- sha256 liczony **kawałkami** (`expo-file-system` + `@noble/hashes`), zanim plik zostanie wysłany.
- **Kolejność zawsze ta sama: najpierw upload, potem transakcja z hashem.**

### Spike w pierwszych godzinach

Sprawdź, czy da się **jednocześnie nagrywać wideo i wykrywać QR**:

1. Najpierw `expo-camera` (działa w Expo Go).
2. Jeśli nie wystarcza: `react-native-vision-camera` (wymaga dev builda).
3. Fallback: zaraz po zakończeniu nagrania krótki skan QR. Wyrocznia i tak sprawdza w wideo, czy QR ujawnił się przy otwarciu.

**Nowe natywne zależności tylko po uzgodnieniu z zespołem**, bo wymagają przebudowy dev builda u wszystkich.

### Storage (Supabase Storage, publiczny bucket `unbox`, bez bazy danych)

```
listings/<deal>/metadata.json, listings/<deal>/photo-<n>.jpg
deals/<deal>/packing.mp4, unboxing.mp4, complaint.json, return-packing.mp4, report.json
```

- Pliki są niezmienne: `upsert: false`.
- `listing_hash` to sha256 **dokładnie tych bajtów, które wysłano**. Nie serializuj JSON-a ponownie przed weryfikacją.
- Adres PDA `deal` liczysz po stronie klienta przed `create_listing`, więc ścieżka w storage jest znana z góry.

### Etykiety statusów w UI

| Status | Etykieta |
|---|---|
| `Listed` | Wystawione |
| `Paid` | Opłacone – czeka na wysyłkę |
| `Shipped` | W drodze |
| `Disputed` | Reklamacja – trwa ocena |
| `ReturnRequested` | Reklamacja uznana – odeślij paczkę |
| `Returning` | Zwrot w drodze |
| `Completed` | Zakończone – środki u sprzedającego |
| `Refunded` | Środki zwrócone kupującemu |
| `Cancelled` | Anulowane |

Etykiety trzymamy w `packages/shared`.

---

## 7. Struktura repo i komendy

```
/
├── CLAUDE.md
├── README.md                  # EN, dla jury: co gdzie leży, jak uruchomić, uzasadnienie
├── Anchor.toml
├── package.json               # root workspace + skrypty (sync-idl, testy Anchora)
├── pnpm-workspace.yaml        # app, oracle, packages/*
├── .npmrc                     # node-linker=hoisted  (Metro + pnpm)
├── rustfmt.toml               # max_width 120, jak server/rustfmt.toml
├── programs/unbox_escrow/     # TU ZNIKA POŚREDNIK
│   └── src/{lib.rs, state.rs, constants.rs, errors.rs, events.rs, logic.rs, instructions/*.rs}
├── tests/                     # testy Anchora (TS, localnet) — każda ścieżka z §4
├── packages/shared/           # IDL + typy, PROGRAM_ID, ORACLE_PUBKEY, commitmenty QR, etykiety PL
├── app/                       # React Native (Expo)
├── oracle/                    # wyrocznia Gemini + crank settle_expired
│   ├── prompts/v1.md
│   └── src/{watch, evidence, gemini, decide, resolve}.ts
├── server/                    # Rust (axum + SQLite): konta, ogłoszenia, media; PAYMENTS=solana odbija program
├── cli/                       # unbox-cli: demo bez telefonu, podpisuje z pliku keypaira (osobny crate)
├── scripts/                   # zasilenie portfeli demo, seed ogłoszeń, staging demo
└── docs/                      # uzasadnienie, skrypt demo, materiały do pitchu
```

| Komenda | Co robi |
|---|---|
| `anchor build` | buduje program (profil `demo`) |
| `pnpm test:program` | buduje z `test-timeouts` i odpala testy na localnecie (Surfpool); w dev containerze |
| `pnpm deploy:devnet` | przebudowuje bez `test-timeouts` i robi upgrade na devnecie (**tylko właściciel programu**). Przy limitach publicznego RPC: `DEPLOY_URL=<RPC Helius> pnpm deploy:devnet`. Nigdy samo `anchor deploy`: po `pnpm test:program` w `target/deploy` leży build z 5-sekundowymi terminami |
| `pnpm sync-idl` | kopiuje `target/idl/*.json` i `target/types/*.ts` do `packages/shared`; commitujemy wynik |
| `pnpm --filter app start` | Expo |
| `pnpm --filter oracle dev` | wyrocznia |
| `pnpm dev:server` | backend `server/` (w dev containerze) |
| `cd cli && cargo run -- --help` | `unbox-cli`: `link`, `publish`, `buy`, `ship`, `accept`, `settle`, `show` (w dev containerze) |

**Stack** (on-chain i klient TS zgodne z dev containerem Superteam, na którym opierają się materiały sponsora):

| Warstwa | Wybór |
|---|---|
| Program | Anchor 1.1.2, Rust 1.95, Solana CLI z obrazu dev containera (`quay.io/ottersec/anchor:v1.1.2`) |
| Lokalny walidator | Surfpool (jest w dev containerze) |
| Klient TS (testy, aplikacja, wyrocznia, skrypty) | `@anchor-lang/core` **1.1.2** (w Anchorze 1.x to nowa nazwa `@coral-xyz/anchor`) + `@solana/web3.js` **1.99.0**, oba przypięte dokładnie przez `pnpm.overrides` w root (jak w przykładach bootcampu); `^1.1.2` pobrałoby już 1.2.0 |
| Node i pakiety | Node 24, pnpm workspace; w `Anchor.toml`: `[toolchain] package_manager = "pnpm"` |
| Aplikacja | Expo (najnowsze SDK, na start Expo Go), expo-router, TypeScript |
| Portfel | wbudowany keypair w `expo-secure-store` (§6) |
| Wyrocznia | Node 24 + TypeScript, `@google/genai` |
| Pliki | Supabase Storage |

Nie mieszaj `@coral-xyz/anchor` z `@anchor-lang/core`. Przykłady z internetu często mają stare importy.

**Toolchain Solany:** lokalnie nie ma Rust/Solana CLI/Anchora. Używaj dev containera Superteam (github.com/matzayonc/solana-live-course-2026, wymaga Dockera). Fallback: Solana Playground (build i deploy z przeglądarki). Toolchain jest potrzebny **tylko** osobom od programu; reszcie wystarczą Node, pnpm, Expo i telefon.

**Inne:**

- Po pierwszym deployu: `anchor keys sync`, a nowe `PROGRAM_ID` wpisz do `packages/shared`.
- Link do Explorera: `https://explorer.solana.com/tx/<sig>?cluster=devnet`.

---

## 8. Podział pracy (6 osób)

| # | Obszar | Katalog | Odpowiada za |
|---|---|---|---|
| 1 | Program + testy | `programs/`, `tests/` | maszyna stanów, `settle_expired`, deploy, **właściciel IDL** |
| 2 | App: sprzedający | `app/` (ekrany sprzedaży) | wystawianie, QR do druku, nagranie pakowania, `mark_shipped`, `confirm_return` |
| 3 | App: kupujący | `app/` (ekrany zakupów) | przeglądanie, zakup, nagranie otwarcia, OK/reklamacja, zwrot |
| 4 | App shell | `app/src/{solana,storage,media}`, `packages/shared`, root monorepo | scaffold, portfel, klient Solany, upload i hash, nawigacja, etykiety, ekrany Portfel i Szczegóły transakcji |
| 5 | Wyrocznia | `oracle/` | Gemini, prompt, `decide()`, `resolve_dispute`, crank |
| 6 | Pitch i demo | `README.md`, `docs/`, `scripts/` | README, slajdy, wideo 3 min, portfele demo, rekwizyty, staging demo, zgłoszenie |

Zadania, kryteria akceptacji i przekazania: `docs/zadania/README.md` (przegląd) i `docs/zadania/<nr>-*.md` (jedna osoba = jeden plik).

### Zasady koordynacji

- **IDL to kontrakt.** Konto `Deal` i instrukcje zmienia tylko osoba 1, a po zmianie od razu robi `anchor build`, `pnpm sync-idl` i commit.
  - Jeśli Twoje zadanie wymaga zmiany IDL, a nie jesteś osobą 1: **przerwij i powiedz to użytkownikowi.**
  - Gdy IDL jeszcze nie istnieje, pisz klienta pod interfejs z §4.
- Każdy pracuje w swoim katalogu. Wspólne pliki (`packages/shared`, root `package.json`) zmieniamy małymi commitami.
- Commituj często i małymi kawałkami, przed pushem `git pull --rebase`. **Nigdy force-push na main.**

---

## 9. Zasady dla Claude

- **Tylko devnet.** Nigdy mainnet ani prawdziwe środki.
- **Nigdy nie commituj** `.env`, keypairów (`*.json` z kluczami, `oracle/keys/`) ani kluczy API. Zawsze dodawaj `.env.example`.
- Prosty działający kod jest lepszy niż abstrakcje. Interfejs może być surowy, ale musi działać na żywo.
- Zanim powiesz „gotowe”, uruchom odpowiednią rzecz: `pnpm test:program` / `pnpm typecheck` / aplikację na telefonie / `oracle fixture`. Jeśli czegoś nie dało się uruchomić, powiedz to wprost.
- Zostań w obszarze zadania (§8). Nie refaktoryzuj cudzych katalogów przy okazji.
- Nie dodawaj zależności bez potrzeby, a natywnych w `app/` bez uzgodnienia.
- Gdy zmienia się decyzja projektowa, **zaktualizuj ten plik i dopisz wpis do §13**.

---

## 10. Harmonogram (sob 3.10 23:00 → ndz 4.10 23:00, regulamin pkt 5)

| Kiedy | | Kamień milowy |
|---|---|---|
| przed sob 23:00 | K0 | Tylko przygotowanie: dev container zbudowany, Expo Go na telefonach, konta Supabase/Gemini/Helius, portfel zespołu zasilony devnet SOL. Bez kodu projektu |
| sob 23:00 | — | **Start** |
| ndz 02:00 | K1 | Scaffold monorepo; toolchain działa; „hello” program na devnecie; aplikacja odpala się na telefonach. Spiki: kamera (wideo + QR), Gemini (2 wideo → JSON, czas i jakość na nagraniu z plamą), hash 60 MB pliku na telefonie, jedna tx z telefonu |
| ndz 08:00 | K2 | Program z pełną maszyną stanów i testami na devnecie; app: portfel, przeglądanie, wystawianie, zakup; wyrocznia działa na plikach lokalnych (`fixture`) |
| ndz 12:00 | K3 | **Happy path E2E na devnecie** (wystaw → kup → nadaj → nagraj → OK → wypłata) |
| ndz 16:00 | K4 | **Spór i zwrot E2E** z prawdziwym Gemini. **Feature freeze** |
| ndz 19:00 | K5 | README, slajdy, wideo 3 min, nagranie zapasowe demo |
| **ndz 21:00** | K6 | **Wysyłka na HackTribe** (2 h bufora przed 23:00) |

Szczegółowe zadania, przekazania między osobami i godziny: `docs/zadania/`.

---

## 11. Demo (na żywo, 2 telefony)

- **Przygotowanie:**
  - Telefon sprzedającego i telefon kupującego z portfelami demo zasilonymi z `scripts/` (faucet bywa zawodny, więc zasilamy z wcześniej naładowanego portfela zespołu).
  - Program zbudowany z `demo`.
  - Wyrocznia uruchomiona.
- **Transakcja A** (przygotowana mniej niż 60 min przed prezentacją, w stanie `Shipped`): pudełko z wydrukowanym QR i ubraniem z **nieujawnioną plamą**. Na żywo:
  1. nagranie otwarcia;
  2. „Reklamuję”;
  3. werdykt AI z uzasadnieniem;
  4. transakcja `resolve_dispute` w Explorerze.
- **Transakcja B:** wystawienie i zakup na żywo, potem happy path z „Wszystko OK” i wypłata w Explorerze.
- **Moment „pośrednik znika”:** transakcja w `Paid` z minionym `SHIP_TIMEOUT`. Kupujący klika „Odbierz środki” (`settle_expired`), nikt nie musi się zgodzić.
- Zawsze miej nagranie zapasowe całego demo.

---

## 12. FAQ jury i uczciwe ograniczenia

| Pytanie | Odpowiedź |
|---|---|
| Gdzie w kodzie znika pośrednik? | `programs/unbox_escrow/src/instructions/`: maszyna stanów, weryfikacja commitmentów QR, ograniczenie arbitra do `Disputed` i dwóch werdyktów, `settle_expired` |
| Co, gdy strona zniknie w połowie? | Tabela `settle_expired` (§4): środki zawsze da się domknąć po terminie, i to może zrobić każdy |
| Kto co może? Czy autorzy mogą coś zmienić? | Tabela uprawnień (§4). Brak instrukcji admina. Na devnecie program jest upgradeable; produkcyjnie `solana program set-upgrade-authority --final`. Arbiter jest widoczny i akceptowany przez kupującego w `purchase` |
| Dlaczego blockchain, a nie baza? | Środki trzyma kod, a nie firma. Commitmenty (ogłoszenie, nagrania, QR) są niezmienne i opatrzone czasem. Reguły są identyczne dla wszystkich i nie da się ich zmienić w trakcie sprawy. Nawet my nie możemy zablokować wypłaty |
| Kto płaci za AI? | My (operator wyroczni) pokrywamy tokeny Gemini. Użytkownik płaci tylko opłatę sieci |
| Co dalej (tydzień)? | Patrz lista „Następne kroki” poniżej |

**Następne kroki:**

- kworum kilku niezależnych wyroczni lub modeli, uruchamianie w TEE z atestacją;
- atestacja urządzenia (Play Integrity / App Attest, C2PA) dla nagrań;
- Arweave/IPFS zamiast Supabase;
- USDC zamiast SOL;
- kaucja za reklamację jako bariera przeciw spamowi;
- instrukcja `close_deal` dla sprzedającego po zakończeniu lub anulowaniu, która zwraca mu depozyt rent;
- możliwość zakwestionowania zwrotu przez sprzedającego;
- wyrocznia statusu przewoźnika (InPost);
- odzyskiwanie portfela (passkeys albo MPC) zamiast jednego klucza na telefonie;
- prywatny bucket z podpisanymi linkami zamiast publicznych nagrań.

**Znane ograniczenia** (mówimy o nich wprost, bo jury ceni świadomość ograniczeń):

- depozyt rent konta `Deal` (663 B, ok. 0,0055 SOL) płaci sprzedający przy wystawieniu i dziś nie wraca, także po anulowaniu; przy cenach 0,03–0,09 SOL to zauważalna część ceny, a nie „ułamek grosza”;

- pojedynczy klucz arbitra to rezydualne zaufanie;
- zmodyfikowany klient może podsunąć spreparowane nagranie;
- dostępność plików zależy od Supabase (integralność gwarantuje hash);
- sprzedający nie może kwestionować zwrotu;
- cena w SOL jest zmienna;
- numer przesyłki nie jest weryfikowany;
- klucz portfela jest tylko na telefonie: utrata telefonu albo usunięcie aplikacji oznacza utratę środków;
- nagrania leżą w publicznym buckecie, a ich ścieżki da się wyprowadzić z adresu transakcji (on-chain są tylko hashe);
- nagrywanie otwarcia każdej paczki to dodatkowy wysiłek kupującego; to cena za brak pośrednika i mówimy o niej w pitchu.

---

## 13. Dziennik decyzji

- **2026-10-03** — Wideo zamiast zdjęć, nagrywa i sprzedający, i kupujący. QR jednorazowy, widoczny dopiero po otwarciu.
- **2026-10-03** — Reklamacja opcjonalna; decyzja zapada od razu po nagraniu; AI analizuje wideo tylko przy reklamacji.
- **2026-10-03** — Uznana reklamacja wymaga zwrotu towaru przed zwrotem SOL.
- **2026-10-03** — Werdykt binarny, wydawany przez `decide()` w kodzie; słabe nagranie działa przeciw autorowi.
- **2026-10-03** — Wyrocznia milczy → zwrot towaru za pieniądze. Brak nagrania w terminie → wypłata do sprzedającego.
- **2026-10-03** — SOL + portfel w aplikacji; Gemini (natywne wideo); Supabase Storage; brak opłat dla użytkownika, koszt Gemini pokrywamy my.
- **2026-10-03** — Stack zgodny z dev containerem Superteam: Anchor 1.1.2, Surfpool, `@anchor-lang/core` ^1.1.2 (zamiast `@coral-xyz/anchor`), `@solana/web3.js` 1.99.0, Node 24 (zamiast 22), pnpm.
- **2026-10-03** — Portfel wbudowany zamiast Wallet Adaptera: świadomy wybór pod użytkownika spoza krypto (regulamin dopuszcza oba podejścia).
- **2026-10-03** — Harmonogram przesunięty: start nie wcześniej niż sob 23:00 (regulamin pkt 5). Do zgłoszenia dodane: nazwa zespołu i lista członków.
- **2026-10-03** — Stary plan SellSol (`docs/KONTRAKT.md`, serwer REST, AI w Pythonie) usunięty. Kontraktem jest ten plik + IDL; zadania w `docs/zadania/`.
- **2026-10-03** — `@anchor-lang/core` przypięty dokładnie do `1.1.2` (także w root `pnpm.overrides`), bo `^1.1.2` pobiera już 1.2.0, niezgodne z CLI 1.1.2. `packageManager: pnpm@9.15.9`; `pnpm install` tylko na hoście, nie w kontenerze (pnpm 12 w kontenerze blokuje build scripts i zapisuje pliki jako root).
- **2026-10-03** — Specyfikacja UI w `docs/ui.md`. Na każdym ekranie transakcji jest karta „Co teraz?” (gdzie są środki, kto ma ruch, do kiedy, co się stanie, jeśli nikt nic nie zrobi). Przycisk `settle_expired` jest widoczny dla każdego, przed terminem zablokowany z odliczaniem, a odblokowuje się według zegara sieci (Clock sysvar), nie telefonu. Każda nieodwracalna operacja ma ekran zgody (`ConfirmSheet`), bo wbudowany portfel podpisuje w tle; przy zakupie widać akceptację weryfikatora. Sukces pokazujemy dopiero po `confirmed`. Werdykt pokazuje ścieżkę reguły `decide()`, a nie „AI zdecydowało”. W tekstach nie ma słów „gwarantowane”, „niezależny” ani „automatycznie”. Tylko tryb jasny, a telefony demo mają kolor roli. Wspólne komponenty UI w `app/src/ui/` i `app/src/components/` (O4).
- **2026-10-04** — `server/` podłączony do programu trybem `PAYMENTS=solana` (domyślny): publikacja ogłoszeń, odbicie kont `Deal` z webhooka Helius i pollera, saldo SOL z RPC. Ledger w SQLite zostaje tylko w `PAYMENTS=demo`.
- **2026-10-04** — Ceny w SOL (lamporty), seed 0,06/0,03/0,09 SOL. Logowanie do `server/` zostaje, a portfel jest przypisany do konta adresem.
- **2026-10-04** — Konto `Deal`: pola `String` przeniesione na koniec, więc `status` ma stały offset 152 (`STATUS_OFFSET`) do filtrów `memcmp`. IDL v0 w `packages/shared/idl/`; program z profilem `demo` wdrożony na devnet pod tym samym adresem.
- **2026-10-04** — Feature `test-timeouts` (wszystkie terminy po 5 s) tylko do testów programu; zegar Surfpoola przesuwamy `surfnet_timeTravel`. Deploy zawsze przebudowuje bez tej flagi.
- **2026-10-04** — `unbox-cli` (`cli/`) jako zapasowe demo bez telefonu: loguje się do `server/`, podpisuje kluczem z pliku osoby, która je uruchamia, i sam sprawdza hash `metadata.json` przed zakupem.

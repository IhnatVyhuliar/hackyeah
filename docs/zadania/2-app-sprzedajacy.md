# Osoba 2: aplikacja — ścieżka sprzedającego

## Rola i cel
Budujesz wszystko, co robi sprzedający:
- wystawienie ogłoszenia: zdjęcia, opis, **lista wad**, cena; metadane do storage, hash on-chain;
- „Spakuj i nadaj”: jednorazowa karta QR do druku, nagranie pakowania, numer przesyłki, `mark_shipped`;
- potwierdzenie zwrotu skanem karty zwrotu (`confirm_return`);
- komponent karty QR, którego O3 używa też przy zwrocie.

Użytkownik nie zna krypto: piszesz „środki zabezpieczone w umowie”, nie „transakcja”, „podpis”, „lamport”.

## Twoje pliki
- `app/app/(tabs)/sell.tsx` (Wystaw), `app/app/(tabs)/sales.tsx` (Moje sprzedaże).
- `app/app/seller/[deal]/pack.tsx`, `app/app/seller/[deal]/confirm-return.tsx`.
- `app/src/components/QrCard.tsx`, `app/src/components/printQrCard.ts`.

**Nie dotykasz:** `app/src/{solana,storage,media}` (O4; brakującą funkcję zgłaszasz O4), tras O3 i O4, `packages/shared` (prośby do O4), `programs/`, `oracle/`.

## Przeczytaj najpierw
`CLAUDE.md` §1 (język UI), §3 kroki 1–4 i 9–10, §4 (`create_listing`, `cancel_listing`, `mark_shipped`, `confirm_return`, QR), §6 (nagrania, storage, kolejność „najpierw upload, potem transakcja”). `docs/zadania/README.md` (trasy, `ListingMetadata`, otwarte kwestie). `docs/zadania/4-app-shell.md` (API modułów).

## Stack i setup
Expo + expo-router + TS, Expo Go. Do karty QR: `qrcode` (czysty JS, generuje SVG) + `react-native-svg` (`SvgXml`) na ekranie, `expo-print` i `expo-sharing` do druku albo PDF-a. Zdjęcia: `expo-image-picker` (`launchCameraAsync`, tylko aparat). Wszystko działa w Expo Go, ale nowe zależności i tak zgłoś zespołowi.

## Zadania

### P0. Spike: karta QR do druku (K1, 02:00)
- [ ] Na telefonie demo: payload z wektora testowego → SVG QR → HTML karty → `Print.printAsync` (albo `printToFileAsync` + udostępnij PDF).
- [ ] Karta: QR min. 5×5 cm, krótki identyfikator transakcji, tekst „Ta karta musi być w paczce. Kupujący zeskanuje ją przy otwieraniu.” Linia zgięcia: **QR po wewnętrznej stronie złożonej karty** (otwarte kwestie, pkt 2).
- [ ] Wydrukowana karta skanuje się aparatem. Wynik w `docs/spiki.md`.

### P0. Wystaw (K2, 08:00)
- [ ] Zdjęcia z aparatu (1–4), podgląd, usuwanie.
- [ ] Formularz: tytuł, opis, marka, rozmiar, stan (lista do wyboru), **wady** (dodawane linijki albo jawnie zaznaczone „Brak wad”), cena w SOL.
- [ ] Cena: string → lamporty bez floatów (`"0.05"` → `50_000_000`), `> 0`.
- [ ] Zapis:
  1. `dealId = newDealId()`, `deal = dealPda(mojKlucz, dealId)`;
  2. upload zdjęć do `listings/<deal>/photo-<n>.jpg` i hash każdego;
  3. `ListingMetadata` (ze ścieżkami i hashami zdjęć) → **jedna** serializacja do bajtów → upload `metadata.json` → `listing_hash = sha256(bajty)`;
  4. `createListing({ dealId, priceLamports, listingHash, metadataUri, arbiter: ORACLE_PUBKEY })`.
- [ ] Postęp po polsku („Wysyłam zdjęcia…”, „Zapisuję ogłoszenie…”, „Gotowe ✓”) + dyskretny link do Explorera.
- [ ] Błąd transakcji po uploadzie: ponów samą transakcję z tym samym `dealId` (pliki już są i nie da się ich nadpisać).

### P0. Moje sprzedaże (K2, 08:00)
- [ ] `fetchDeals({ seller: ja })`, pogrupowane według statusu, etykiety z `STATUS_LABELS_PL`. Dotknięcie → `/deal/[deal]` (ekran O4, z którego wracają przyciski do Twoich tras).
- [ ] Wyróżnij, co wymaga działania: `Paid` („Spakuj i nadaj”, z terminem), `Returning` („Potwierdź zwrot”).

### P0. Spakuj i nadaj (K3, 12:00)
- [ ] Wygeneruj sekret (`expo-crypto`, 32 bajty) i **od razu** zapisz go w `expo-secure-store` pod `qr-secret:<deal>`. Restart aplikacji po wydruku nie może zgubić sekretu, bo wydrukowana karta przestałaby pasować.
- [ ] Karta QR `UNBOX1:<deal>:<secret>` → druk albo PDF.
- [ ] Instrukcja przed nagraniem: ubranie ze wszystkich stron, łącznie z wadami z opisu; złożona karta wkładana do środka; zaklejenie taśmą; etykieta przewoźnika z czytelnym numerem; nagranie bez przerw.
- [ ] Nagranie przez `Recorder` z `app/src/media` (≤ 2 min, 720p, tylko w aplikacji, bez galerii) → podgląd → „Nagraj ponownie” albo „Dalej”.
- [ ] Numer przesyłki (≤ 32 znaki).
- [ ] `hashFile` → upload `deals/<deal>/packing.mp4` → `markShipped({ qrCommitment: shipCommitment(deal, secret), packingVideoHash, trackingNumber })`.
- [ ] Po sukcesie usuń sekret z `secure-store` i pokaż „W drodze. Środki czekają w umowie do decyzji kupującego.”
- [ ] Pokaż termin nadania (`SHIP_TIMEOUT`) i powiedz wprost, co się stanie po nim: środki wrócą do kupującego.

### P0. Potwierdź zwrot (K4, 16:00)
- [ ] Status `Returning`: `QrScanner` → `parseQrPayload` → musi być `kind: "return"` i ten sam `deal`.
- [ ] Lokalnie sprawdź `returnCommitment(deal, secret) == deal.returnQrCommitment` („Kod zgodny ✓” albo „To nie jest karta z tej paczki”).
- [ ] `confirmReturn(secret)` → „Środki zwrócone kupującemu”.
- [ ] Informacja: jeśli nie potwierdzisz do `<termin>`, środki i tak wrócą do kupującego (każdy może zamknąć transakcję).

### P1
- [ ] „Anuluj ogłoszenie” na liście dla `Listed`.
- [ ] Z O6: karty QR dla transakcji A i rekwizyty (złożona karta, etykieta z numerem).

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| wynik spike'a druku karty | wszyscy | K1 02:00 |
| `QrCard` + `printQrCard` | O3 (zwrot) | 06:00 |
| Wystaw + Moje sprzedaże | wszyscy | K2 08:00 |
| Spakuj i nadaj | E2E | K3 12:00 |
| Potwierdź zwrot | E2E | K4 16:00 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| `@unbox/shared` (QR, ścieżki, `ListingMetadata`, etykiety) | O4 | 01:00 |
| `solana`, `storage`, `media` (`Recorder`, `QrScanner`, `hashFile`) | O4 | 03:00 |
| `create_listing` … `accept_delivery` na devnecie | O1 | ok. 04:00 |
| `ORACLE_PUBKEY` w shared | O4/O5 | K0 |

## Jak testować samodzielnie
Do 03:00 makiety ekranów i karta QR na wektorze testowym. Potem na telefonie przeciw devnetowi: wystaw → (O3 albo drugi telefon kupuje) → spakuj i nadaj → status `Shipped` w Explorerze. Zwrot przećwicz z O3.

## Definition of Done
- [ ] Ogłoszenie z telefonu widać w Przeglądaj u O3, a `listing_hash` zgadza się z pobranym `metadata.json`.
- [ ] Wydrukowana karta skanuje się w aplikacji kupującego i przechodzi `accept_delivery` na devnecie.
- [ ] Zwrot potwierdzony skanem na devnecie.
- [ ] Brak żargonu w UI, każdy krok ma stan ładowania i komunikat błędu po polsku.

## Pułapki
- Kolejność zawsze: upload → transakcja z hashem (§6).
- Hashujesz **dokładnie te bajty**, które wysłałeś. Nie serializuj JSON-a drugi raz.
- Sekret nie trafia do logów, metadanych ani storage. Na nagraniu pakowania QR ma być niewidoczny (karta złożona), bo `packing.mp4` jest publiczny.
- `metadata_uri` ≤ 200 i numer przesyłki ≤ 32 znaki, inaczej program odrzuci transakcję.
- Darmowy Supabase: limit 50 MB na plik (`docs/zadania/4-app-shell.md`).
- Aplikacja może ukryć przycisk, ale regułę egzekwuje program. Nie dokładaj w UI reguł, których nie ma w §4.

## Prompt startowy do Claude Code
```
Pracujesz w repo unboxproof (HackYeah 2026). Przeczytaj CLAUDE.md (§1, §3, §4, §6), docs/zadania/README.md
i docs/zadania/2-app-sprzedajacy.md. Jesteś Osobą 2: ścieżka sprzedającego w aplikacji Expo. Edytujesz tylko
app/app/(tabs)/sell.tsx, (tabs)/sales.tsx, app/app/seller/**, app/src/components/QrCard.tsx i printQrCard.ts.
Ze światem rozmawiasz wyłącznie przez app/src/{solana,storage,media} i @unbox/shared (O4); brakujące funkcje zgłaszasz.
Kolejność: spike karty QR do druku (expo-print), Wystaw (upload → metadata.json → sha256 → createListing),
Moje sprzedaże, Spakuj i nadaj (sekret w secure-store, karta, nagranie, hash, upload, markShipped), Potwierdź zwrot.
Teksty UI po polsku, bez żargonu krypto.
```

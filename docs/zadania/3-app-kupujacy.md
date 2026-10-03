# Osoba 3: aplikacja — ścieżka kupującego

## Rola i cel
Budujesz wszystko, co robi kupujący:
- przeglądanie ogłoszeń i zakup;
- nagranie otwarcia paczki z wykrywaniem QR, a zaraz po nim decyzja „Wszystko OK” albo „Reklamuję”;
- formularz reklamacji;
- odesłanie zwrotu z nową kartą QR.

To Twoje ekrany pokazujemy jury na żywo (transakcja A: otwarcie paczki z plamą → „Reklamuję”). Na starcie robisz też spike kamery, od którego zależy cały moduł `media`.

## Twoje pliki
- `app/app/(tabs)/index.tsx` (Przeglądaj), `app/app/(tabs)/purchases.tsx` (Moje zakupy).
- `app/app/listing/[deal].tsx`, `app/app/buyer/[deal]/unbox.tsx`, `app/app/buyer/[deal]/complaint.tsx`, `app/app/buyer/[deal]/return.tsx`.
- Tymczasowo `app/app/spike-camera.tsx` (usuwasz po spike'u).

**Nie dotykasz:** `app/src/{solana,storage,media}` (O4), tras O2 i O4, `packages/shared` (prośby do O4), `programs/`, `oracle/`.

## Przeczytaj najpierw
`CLAUDE.md` §1 (język UI), §3 kroki 2 i 5–9, §4 (`purchase`, `accept_delivery`, `open_dispute`, `mark_returned`, QR), §6 (nagrania, spike kamery, storage). `docs/zadania/README.md` (trasy, `Complaint`, otwarte kwestie). `docs/zadania/4-app-shell.md` (API modułów).

## Stack i setup
Expo + expo-router + TS, Expo Go, `expo-camera`. Kartę QR zwrotu bierzesz z `app/src/components/QrCard.tsx` (O2).

## Zadania

### P0. Spike kamery: wideo + QR naraz (K1, 02:00)
- [ ] `spike-camera.tsx`: `CameraView` z `mode="video"`, `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}`, `onBarcodeScanned` w trakcie `recordAsync`. Sprawdź na **obu telefonach demo**: czy skan działa w trakcie nagrywania, jak szybko łapie kartę z 20–40 cm, ile waży 2 min 720p.
- [ ] Wynik (działa / nie działa / warunki) w `docs/spiki.md` i do O4. Ścieżki:
  1. działa → `Recorder` z `onQrScanned`;
  2. nie działa → propozycja `react-native-vision-camera` (dev build, **decyzja zespołu**);
  3. fallback z `CLAUDE.md` §6 → krótki skan zaraz po nagraniu.

### P0. Przeglądaj i Szczegóły ogłoszenia (K2, 08:00)
- [ ] `fetchDeals({ status: "Listed" })` + pobranie `metadata.json` + `sha256(bajty) == listing_hash`. Niezgodne ogłoszenie ukryj albo oznacz „Opis niezgodny z zapisem”.
- [ ] Siatka: zdjęcie, tytuł, cena w SOL, stan. Odświeżanie gestem.
- [ ] Szczegóły: zdjęcia, opis, marka, rozmiar, stan, **„Wady zgłoszone przez sprzedającego”** na widoku, cena.
- [ ] Ramka po ludzku: „Płacisz do umowy, nie sprzedającemu. Środki trafią do sprzedającego, gdy potwierdzisz odbiór albo minie termin. Spór ocenia niezależny weryfikator na podstawie nagrań.”
- [ ] „Kup” → `purchase({ expectedListingHash, expectedArbiter })`:
  - `expectedListingHash` = hash bajtów, które **kupujący faktycznie zobaczył** (policzony lokalnie);
  - `expectedArbiter` = `ORACLE_PUBKEY` z shared, a nie `deal.arbiter` z konta (inaczej sprawdzenie nic nie daje).
- [ ] Sprawdź saldo przed zakupem i pokaż zrozumiały komunikat. Ukryj „Kup” na własnych ogłoszeniach (program i tak to blokuje).

### P0. Moje zakupy (K2, 08:00)
- [ ] `fetchDeals({ buyer: ja })`, etykiety z shared, dotknięcie → `/deal/[deal]` (O4). Wyróżnij `Shipped` („Nagraj otwarcie”, z terminem) i `ReturnRequested` („Odeślij paczkę”).

### P0. Nagraj otwarcie + „Wszystko OK” (K3, 12:00)
- [ ] Instrukcja: „Zacznij przy zamkniętej paczce. Pokaż etykietę z numerem. Otwieraj w kadrze, bez przerw. Pokaż kartę z kodem i całe ubranie.”
- [ ] `Recorder` (≤ 2 min, 720p). Po wykryciu `UNBOX1:<deal>:<secret>`:
  - inny `deal` → „To kod z innej paczki”;
  - `shipCommitment(deal, secret) == deal.qrCommitment` → baner „Kod zgodny ✓”.
- [ ] QR niewykryty w trakcie → fallback: skan zaraz po nagraniu.
- [ ] Ekran decyzji z odliczaniem do `UNBOX_TIMEOUT`:
  - „Wszystko OK” → `acceptDelivery(secret)` → „Środki przekazane sprzedającemu”. Nagranie **nie** jest wysyłane;
  - „Reklamuję” → formularz reklamacji.
- [ ] Sekret i URI nagrania trzymaj do decyzji tak, żeby przetrwały restart aplikacji.

### P0. Reklamacja (K4, 16:00)
- [ ] Kategorie i etykiety z `COMPLAINT_LABELS_PL` (np. wada nieujawniona w opisie, niezgodny z opisem, inny przedmiot, brak przedmiotu), opis (wymagany).
- [ ] `complaint.json` (`Complaint`) → bajty → `hashFile(nagranie)` → upload `deals/<deal>/unboxing.mp4` → upload `complaint.json` → `openDispute({ qrSecret, unboxingVideoHash, complaintHash: sha256(bajty) })`.
- [ ] Po sukcesie → `/deal/[deal]` („Reklamacja – trwa ocena”; werdykt i uzasadnienie pokazuje ekran O4).

### P0. Zwrot (K4, 16:00)
- [ ] `ReturnRequested`: nowy sekret (`expo-crypto`) zapisany od razu w `secure-store` pod `return-secret:<deal>` → karta `UNBOX1R:` z `QrCard`/`printQrCard` (O2), złożona QR do środka.
- [ ] Instrukcja i nagranie pakowania zwrotu (ubranie, karta, zaklejenie, etykieta) → numer przesyłki (≤ 32 znaki).
- [ ] `hashFile` → upload `deals/<deal>/return-packing.mp4` → `markReturned({ returnQrCommitment: returnCommitment(deal, secret), returnVideoHash, returnTrackingNumber })`.
- [ ] Informacja: „Jeśli sprzedający nie potwierdzi odbioru do `<termin>`, środki wrócą do Ciebie automatycznie.” Pokaż też termin odesłania (`RETURN_SHIP_TIMEOUT`) i to, co się stanie po nim.

### P1
- [ ] Próba na scenę z O6: transakcja A (paczka z plamą) od otwarcia do werdyktu, mierzona stoperem.

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| wynik spike'a kamery | O4, zespół | K1 02:00 |
| Przeglądaj, ogłoszenie, zakup, Moje zakupy | wszyscy | K2 08:00 |
| otwarcie + „Wszystko OK” | E2E | K3 12:00 |
| reklamacja + zwrot | E2E, demo | K4 16:00 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| `@unbox/shared` (QR, etykiety, `Complaint`) | O4 | 01:00 |
| `solana`, `storage`, `media` | O4 | 03:00 |
| `QrCard`, `printQrCard` | O2 | 06:00 |
| ogłoszenia na devnecie | O2 / skrypt seed O6 | K2 |

## Jak testować samodzielnie
Spike na telefonie bez reszty. Potem: ogłoszenie z `scripts/seed.ts` (O6) albo od O2 → zakup → paczka z kartą z wektora testowego (do testu UI) → na devnecie z prawdziwą kartą od O2. Werdykt: z działającą wyrocznią O5.

## Definition of Done
- [ ] Zakup, „Wszystko OK”, reklamacja i zwrot przechodzą na devnecie z telefonu.
- [ ] Bez nagrania nie da się złożyć reklamacji; nagranie tylko z aplikacji.
- [ ] `expected_*` w `purchase` pochodzą z tego, co widział kupujący, a nie z konta.
- [ ] Brak żargonu w UI; każdy krok ma stan ładowania i błąd po polsku.

## Pułapki
- Kolejność zawsze: upload → transakcja z hashem.
- Hash `complaint.json` = hash dokładnie wysłanych bajtów.
- „Wszystko OK” nie wysyła nagrania (prywatność, §3).
- Paczka bez karty QR: kupujący nie ma sekretu i nie złoży reklamacji (otwarte kwestie, pkt 1). Dopóki zespół nie zdecyduje, pokaż uczciwy komunikat, że bez karty z kodem reklamacji nie da się złożyć, i niczego nie obiecuj.
- Darmowy Supabase: limit 50 MB na plik.

## Prompt startowy do Claude Code
```
Pracujesz w repo unboxproof (HackYeah 2026). Przeczytaj CLAUDE.md (§1, §3, §4, §6), docs/zadania/README.md
i docs/zadania/3-app-kupujacy.md. Jesteś Osobą 3: ścieżka kupującego w aplikacji Expo. Edytujesz tylko
app/app/(tabs)/index.tsx, (tabs)/purchases.tsx, app/app/listing/**, app/app/buyer/** i tymczasowy spike-camera.tsx.
Ze światem rozmawiasz wyłącznie przez app/src/{solana,storage,media} i @unbox/shared (O4).
Najpierw spike: expo-camera nagrywa wideo i jednocześnie wykrywa QR (wynik do docs/spiki.md).
Potem: Przeglądaj (weryfikacja listing_hash), ogłoszenie + Kup, Moje zakupy, Nagraj otwarcie → Wszystko OK / Reklamuję,
reklamacja (upload → openDispute), zwrot (nowa karta UNBOX1R, nagranie, markReturned). UI po polsku, bez żargonu.
```

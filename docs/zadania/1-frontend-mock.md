# Osoba 1: frontend (Claude Design + Expo) i fake JSON API

## Rola i cel
Budujesz wszystko, co widać: landing page (web) i aplikację mobilną SellSol (Expo, React Native). Aplikacja działa **od pierwszej godziny bez backendu**, na fake JSON API wbudowanym w aplikację (`MockApiClient` + dane z `packages/shared/fixtures`). Dzięki temu do H+12 nagrasz zapasowe wideo prezentacji, nawet jeśli reszta jeszcze nie działa. Potem aplikacja przełącza się na prawdziwy serwer jedną zmienną środowiskową, bo `HttpApiClient` też piszesz Ty według tego samego kontraktu.

Użytkownik docelowy nie zna krypto: zamiast „PDA” i „lamportów” piszemy „pieniądze czekają w bezpiecznym programie”, a obok SOL pokazujemy złotówki. Szczegóły techniczne (link do Explorera, hasze) mają być dostępne, ale nie na pierwszym planie.

## Twoje foldery
- `/app`: aplikacja Expo (tworzysz ją Ty).
- `/landing`: strona web z eksportu Claude Design (tworzysz ją Ty).
- `/packages/shared/fixtures`: dane demo w JSON i zdjęcia.

**Nie dotykasz:** `/server`, `/scripts`, `/program`, `/packages/sdk`, `/ai`, `/packages/shared/src` (zmiany przez Osobę 4). W `/app` Osoba 4 dopisze później `src/wallet/realWallet.ts`, `src/chain/real*.ts` i `src/polyfills.ts` oraz może edytować `src/config.ts`. Zostaw w kodzie miejsca na te pliki.

## Przeczytaj najpierw
`CLAUDE.md`, `docs/KONTRAKT.md`: zwłaszcza §3 (tabela decyzji, tłumaczysz ją na ludzki język), §4 (statusy i co widzi użytkownik), §7 (typy), §8 (API), §9 (`ApiClient`, `AppWallet`, przepływy transakcji i nagrań) i §11 (dane demo).

## Stack i setup
- Expo, najnowsze stabilne SDK, Expo Router, TypeScript. Telefon z **najnowszym Expo Go** (Android do demo).
- UI: NativeWind (Tailwind dla RN). Jeśli setup zajmie > 30 min, użyj `StyleSheet` z tokenami z Claude Design (`src/theme/tokens.ts`).
- Moduły: `expo-camera` (skan QR + nagrywanie), `expo-file-system` (upload z postępem), `expo-crypto` (sha256 skanu plomby), `expo-secure-store` (token), `expo-image-picker` (zdjęcia oferty), `expo-print` i `expo-sharing` (plomba do druku), `expo-video` (podgląd nagrania), `react-native-qrcode-svg` + `react-native-svg` (rysowanie plomby).
- Typy i helpery importujesz z `@sellsol/shared` (workspace, gotowe w H+1 od Osoby 4). Do tego czasu pracujesz na ekranach i makietach.

```bash
cd hackyeah
npx create-expo-app@latest app          # szablon domyślny (Expo Router + TS)
cd app
npx expo install expo-camera expo-file-system expo-crypto expo-secure-store expo-image-picker \
  expo-print expo-sharing expo-video react-native-svg
npm i react-native-qrcode-svg
npx expo start                           # zeskanuj QR w Expo Go
```

**Nie instaluj w aplikacji `@anchor-lang/core`.** Transakcje buduje serwer, a aplikacja tylko je podpisuje (KONTRAKT §9.3).

Proponowany układ:
```
app/app/                 # trasy Expo Router
  _layout.tsx  index.tsx (powitanie)
  (auth)/login.tsx  (auth)/register.tsx
  (tabs)/_layout.tsx  catalog.tsx  orders.tsx  sell.tsx  wallet.tsx
  listing/[id].tsx  checkout/[listingId].tsx
  order/[id]/index.tsx  order/[id]/pack.tsx  order/[id]/unbox.tsx
  demo.tsx
app/src/
  api/index.ts (wybór klienta)  mockApiClient.ts  httpApiClient.ts  mockState.ts
  wallet/types.ts  mockWallet.ts  index.ts          # realWallet.ts dopisze Osoba 4
  chain/runTx.ts                                    # prepare → signAndSend → submitTx
  components/  theme/  state/  config.ts
```

## Zadania

### P0. Claude Design (H0–H1)
- [ ] W Claude Design przygotuj: mały design system (kolory, typografia, przyciski, karty, statusy), landing (desktop + mobile) i kluczowe ekrany aplikacji: katalog, oferta, checkout, szczegóły zamówienia z osią czasu, pakowanie (kamera + kroki), otwarcie przy paczkomacie, wynik.
- [ ] Eksportuj albo przekaż (handoff) do Claude Code. Tokeny zapisz w `app/src/theme/tokens.ts`.

Prompt startowy do Claude Design:
> Zaprojektuj markę i UI dla „SellSol”, aplikacji mobilnej do bezpiecznego kupowania i sprzedawania używanych ubrań między osobami prywatnymi (jak Vinted/OLX). Pieniądze kupującego czekają w programie na blockchainie Solana. Wypłata następuje dopiero, gdy weryfikacja nagrań (pakowanie z plombą QR, otwarcie paczki przy paczkomacie) potwierdzi, że w paczce był sprzedany przedmiot. Odbiorcy nie znają krypto: ton ciepły, prosty, budzący zaufanie, bez żargonu. Potrzebuję: (1) design systemu, (2) landing page'a (hero, problem „pusta paczka”, jak to działa w 4 krokach, kto dostaje pieniądze i kiedy, porównanie kosztów ochrony kupującego, dlaczego to bezpieczne, CTA), (3) ekranów mobilnych: katalog z kategoriami, oferta, checkout, oś czasu zamówienia, nagrywanie pakowania z krokami, otwarcie przy paczkomacie z wskaźnikiem „plomba zgodna ✓”, ekran wyniku (wypłacono / zwrócono + powód). Język: polski.

### P0. Fixtures + fake JSON API (do H+2, potem rozwijasz)
- [ ] `packages/shared/fixtures/`: `users.json` (`u-ania`, `u-bartek`, adresy portfeli demo od Osoby 4), `categories.json` (6 kategorii z §11), `listings.json` (ok. 12 ofert, w tym `l-kurtka-levis`), `orders.json` (zamówienia w różnych statusach **tylko dla mocka**, z UUID **spoza** puli plomb, np. `0dde0000-0000-4000-8000-00000000000N`), `seal-pool.json` (10 plomb z §11 1:1), `reports.json` (raport pakowania + 4 raporty otwarcia: `ok`, `defect`, `swap`, `invalid_recording`, zgodne z `VerificationReport`).
- [ ] Zdjęcia w `packages/shared/fixtures/photos/` (w fixtures jako `/files/<nazwa>.jpg`). **Zdjęcia `l-kurtka-levis` = ten sam przedmiot, który Osoba 3 nagrywa na wideo testowych** (umówcie się w H0). Reszta: własne zdjęcia albo zdjęcia z Unsplash.
- [ ] `app/src/photos.ts`: mapa `"/files/x.jpg" → require(...)` dla trybu mock (Metro wymaga statycznych `require`).
- [ ] Skrypt `packages/shared/fixtures/print-seals.mjs` → HTML/PDF z 10 plombami (QR z `SELLSOL1|<orderId>|<nonce>`, duży `shortCode`, napis „SellSol, plomba, nie naruszać”, min. 5×5 cm). **Wydrukuj i oddaj Osobie 3 do H+2.**
- [ ] `MockApiClient` implementuje cały `ApiClient` (KONTRAKT §9.1): stan w pamięci, opóźnienia 300–1500 ms, błędy w kształcie `ApiError`. Nowe zamówienia dostają `id` z `seal-pool.json`. Przejścia stanów liczy `fakeChain` z `@sellsol/shared` (od H+2; wcześniej lokalny stub). Weryfikacje są `processing` przez ok. 3 s, potem `done` z raportem z `reports.json` według wybranego scenariusza. Wynik końcowy liczy `evaluateVerdict`.
- [ ] `MockWallet` (`AppWallet`): stały adres demo per rola, saldo „2.5 SOL”, `signAndSend` zwraca `MOCK` + losowy ciąg.

**Akceptacja:** cały przepływ (oferta → zapłata → plomba → pakowanie → nadanie → paczkomat → otwarcie → wynik) da się przeklikać na telefonie w trybie mock, bez laptopa i bez sieci.

### P0. Ekrany aplikacji (M1 = H+6)
- [ ] **Powitanie**: 3 zdania wartości, przyciski „Zaloguj” i „Załóż konto”.
- [ ] **Logowanie i rejestracja**: token w `expo-secure-store`. Pod formularzem przyciski „Zaloguj jako Ania (sprzedająca)” i „…Bartek (kupujący)”.
- [ ] **Katalog**: chipy kategorii, wyszukiwarka, siatka ofert (zdjęcie, tytuł, cena w zł i SOL, stan).
- [ ] **Oferta**: karuzela zdjęć, opis, rozmiar, stan, testy dodatkowe sprzedającego, ramka „Ochrona SellSol: pieniądze czekają w programie, nie u nas”, przycisk „Kup bezpiecznie”.
- [ ] **Checkout**: podsumowanie, saldo portfela, „Kiedy kto dostaje pieniądze” (tabela z KONTRAKT §3 w ludzkim języku, terminy z `windows`), „Zapłać do escrow” → `runTx(orderId, 'fund')` z krokami „Przygotowuję → Podpisuję → Wysyłam → Potwierdzone ✓” i linkiem „Zobacz w Solana Explorer”.
- [ ] **Moje transakcje**: zakładki „Kupuję” i „Sprzedaję”, karta ze statusem (kolor + etykieta z KONTRAKT §4.2).
- [ ] **Szczegóły zamówienia**:
  - oś czasu (`timeline` + `txs` z linkami);
  - termin do następnego kroku (odliczanie z `shipDeadline`/`openDeadline`/`verdictDeadline`);
  - raporty AI (keyframe'y, `reasons` po polsku, pomiary jako paski 0–100);
  - akcje zależne od roli i statusu: sprzedający „Spakuj i nagraj”, „Zatwierdź nadanie”, „Odrzuć zamówienie”; kupujący „Otwórz przy paczkomacie”, „Wszystko OK, potwierdzam odbiór”, „Zgłoś wynik weryfikacji” (`open_claim`); każdy „Odbierz po terminie” (`claim_timeout`), gdy termin minął;
  - wynik: „Wypłacono sprzedającemu” albo „Zwrócono kupującemu” + powód (`outcomeReason` po polsku).
- [ ] **Wystaw ofertę** (kreator): zdjęcia → tytuł, kategoria, stan, rozmiar, marka → cena → waga i wymiary → testy dodatkowe (lista „Pokaż …”) → podsumowanie → `createListing`.
- [ ] **Pakowanie** (sprzedający), KONTRAKT §9.4:
  1. „Wygeneruj plombę” → QR + `shortCode`, „Drukuj / udostępnij”; w trybie demo plomba z puli, już wydrukowana.
  2. Instrukcja (dobre światło, cały czas w kadrze).
  3. Kamera z przyciskami kroków („Pokaż przedmiot” → „Wkładam do paczki” → „Naklejam plombę” → „Pokaż zaklejoną paczkę”), które zapisują `markers`.
  4. Podgląd + upload z paskiem postępu.
  5. Wynik AI (doradczy).
  6. „Zatwierdź nadanie” → `runTx('commit_shipment')`.
- [ ] **Otwarcie przy paczkomacie** (kupujący):
  1. Instrukcja („nie wyjmuj paczki z kadru, nie przerywaj nagrania”).
  2. **Osobny krok skanu plomby** → `sha256` (`expo-crypto`) == `order.seal.sealHash` → zielone „Plomba zgodna z transakcją ✓” albo czerwone ostrzeżenie.
  3. Nagrywanie z krokami („Pokazuję plombę” → „Otwieram” → „Pokazuję przedmiot” → opcjonalnie „Pokazuję wadę”).
  4. Upload + „AI sprawdza…”.
  5. Ważne nagranie → „Zgłoś wynik” (`open_claim`) → „Program rozstrzyga…” → wynik. Nieważne → „Nagraj ponownie” + powody.
- [ ] **Portfel**: adres (kopiuj, link do Explorera), saldo w SOL i zł, aktualna tożsamość demo.
- [ ] **Panel demo** (`/demo`, dostępny z ustawień albo przez długie przytrzymanie logo):
  - przełącz rolę kupujący/sprzedający (zmienia zalogowanego użytkownika i `useDemoIdentity`);
  - scenariusz AI (`ok | defect | swap | invalid_recording`, przekazywany do `uploadUnboxingVideo`);
  - zdarzenia paczkomatu: „Nadano (920 g)”, „Gotowa do odbioru (920 g)”, „Gotowa do odbioru, podmiana (1400 g)”;
  - w mocku „Przewiń czas o 1 h” (do timeoutów) i „Reset danych”.

Ustawienia nagrywania: `mode="video"`, `recordAsync({ maxDuration: 60 })`, jakość `720p`, bitrate ok. 1.5 Mb/s (Android), `mute`. Skan QR **nie** działa w trakcie nagrywania, bo to osobny krok.

### P1. `HttpApiClient` i stany błędów (H+6–H+10)
- [ ] `HttpApiClient` według KONTRAKT §8: `Authorization: Bearer`, mapowanie `ApiError` na komunikaty po polsku, upload multipart z postępem przez `expo-file-system` (sprawdź aktualne API w swoim SDK: upload z postępem bywa w `expo-file-system/legacy`), nagłówek `X-Demo-Scenario` przy `opts.scenario`.
- [ ] Przetestuj go przeciw serwerowi Osoby 4 w trybie mock (adres tunelu od H+3).
- [ ] Stany błędów: brak sieci, transakcja odrzucona albo wygasła (ponów od `prepare`), AI nie odpowiada, brak uprawnień do kamery.
- [ ] `src/config.ts`: `API_MODE`, `API_URL`, `WALLET_MODE`, `RPC_URL`, `PROGRAM_ID`, `CLUSTER` z `EXPO_PUBLIC_*`.

### P1. Landing (H+6–H+12)
- [ ] `/landing`: implementacja z eksportu Claude Design (statyczny HTML/CSS albo Vite + React). Sekcje:
  - hero „Kupuj używane bez ryzyka pustej paczki”;
  - problem;
  - jak to działa w 4 krokach;
  - kto dostaje pieniądze i kiedy (tabela §3 po ludzku);
  - porównanie z opłatą za ochronę kupującego (sprawdź **aktualną** stawkę Vinted/OLX i podaj źródło) vs 1% w SellSol;
  - dlaczego Solana (reguły, których nikt nie zmieni; koszt to ułamek grosza);
  - dla kogo, zespół, CTA (link do wideo i repo).
- [ ] Deploy (Vercel, Netlify albo GitHub Pages), link do README.

### P1. Wideo zapasowe z mocka (do H+12)
- [ ] Nagraj ekran telefonu (`scrcpy --record demo-mock.mp4` albo wbudowany rekorder): pełny scenariusz `ok` + krótko `defect` i `swap`. Lektor albo napisy po polsku, **≤ 3 min**.
- [ ] Wrzuć na wspólny dysk. To plan B, gdyby demo na żywo albo devnet zawiodły.

### P2. Jeśli zostanie czas
- [ ] Animacje osi czasu, ekran wyniku z konfetti przy `VerifiedOk`.
- [ ] Widok „Dowód publiczny”: hasze, link do `/media/:sha256`, link do konta escrow w Explorerze.
- [ ] Tryb ciemny.

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| fixtures + PDF z plombami (wydrukowane) | O3, O4 | H+2 |
| klikalna aplikacja (mock) | wszyscy (demo M1) | H+6 |
| `HttpApiClient` | O4 | H+10 |
| landing online + wideo zapasowe | O4 (README, zgłoszenie) | H+12 |
| wideo finalne (razem z O4) | O4 | H+21 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| `@sellsol/shared` (typy, zod, `ApiClient`, helpery) | O4 | H+1 |
| adresy portfeli demo | O4 | H+1 |
| przepis na polyfille web3.js w Expo Go | O4 | H+2 |
| `fakeChain`, `evaluateVerdict`, `deriveStatus` | O4 | H+2 |
| serwer w trybie mock pod adresem tunelu | O4 | H+3 |
| zdjęcia przedmiotu z nagrań testowych | O3 | H+2 |

## Jak testować samodzielnie
- `EXPO_PUBLIC_API_MODE=mock EXPO_PUBLIC_WALLET_MODE=mock npx expo start`: cały przepływ na telefonie, bez sieci.
- Fixtures przepuść przez schematy zod z `@sellsol/shared` (mały test albo skrypt). Jeśli coś nie przechodzi, popraw fixtures albo zgłoś zmianę kontraktu.
- Od H+3: `EXPO_PUBLIC_API_MODE=http` przeciw serwerowi Osoby 4 w trybie mock.

## Definition of Done
- [ ] Przepływ `ok`, `defect`, `swap`, `invalid_recording` i timeout przeklikany w trybie mock i (z O4) w trybie real.
- [ ] Każdy status z KONTRAKT §4.2 ma swoją etykietę, kolor i właściwe akcje.
- [ ] Każda transakcja pokazuje link do Explorera.
- [ ] Landing online, wideo zapasowe na dysku.
- [ ] Brak importów Anchor w `/app`, brak zmian poza Twoimi folderami.

## Pułapki
- Expo Go obsługuje tylko najnowsze SDK, więc utwórz projekt przez `create-expo-app@latest` i zaktualizuj Expo Go na telefonach.
- Kamera nie działa w emulatorze tak jak na telefonie: testuj na prawdziwym Androidzie.
- Metro nie obsługuje dynamicznych `require`, stąd mapa zdjęć.
- Nie pokazuj kupującemu `qrPayload` (tylko `sealHash` i `shortCode`).
- Nie liczysz decyzji o pieniądzach w UI na serio: `evaluateVerdict` służy tylko do podglądu i mocka, wynik zawsze bierzesz z `Order`.

## Prompt startowy do Claude Code
```
Pracujesz w repo SellSol (hackathon, 24 h). Przeczytaj CLAUDE.md, docs/KONTRAKT.md i docs/zadania/1-frontend-mock.md.
Jesteś Osobą 1: frontend + fake JSON API. Edytujesz tylko /app, /landing i /packages/shared/fixtures.
Cel na teraz: aplikacja Expo (Expo Router, TypeScript) z pełnym przepływem SellSol działającym na MockApiClient
(KONTRAKT §9.1) i MockWallet (§9.2), z danymi z packages/shared/fixtures (§11). Nie instaluj Anchor w aplikacji.
Zacznij od: struktury tras, src/api (interfejs z @sellsol/shared albo tymczasowa kopia typów z §7), fixtures, a potem ekranów
w kolejności z sekcji „P0. Ekrany aplikacji”. Po każdym ekranie sprawdź, że kompiluje się w Expo Go.
Nazwy pól, statusów i akcji bierz dokładnie z KONTRAKT.md; jeśli czegoś brakuje, zapisz pytanie do Osoby 4, nie wymyślaj.
```

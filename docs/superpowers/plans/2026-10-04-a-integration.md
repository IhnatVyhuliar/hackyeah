# A2–A7 + integracja z SolanaEscrow + przeklikanie (demo i devnet) — plan wdrożenia

> **Dla agenta:** WYMAGANY SUB-SKILL: superpowers:executing-plans (zalecany, patrz „Wykonanie”) albo superpowers:subagent-driven-development. Kroki mają checkboxy (`- [ ]`).

**Cel:** aplikacja `app/` przestaje być prototypem na mockach. Dane bierze z `server/`, każdą operację na pieniądzach wykonuje przez `Escrow` (`DemoEscrow` w `PAYMENTS=demo`, `SolanaEscrow` na devnecie), nagrania wysyła do `/media`, a spór kończy się werdyktem wyroczni. Całość jest przeklikana w przeglądarce w obu trybach, a na devnecie każda operacja ma potwierdzoną transakcję w Solana Explorer.

**Architektura:** `AppProvider.tsx` zostaje silnikiem widoku (`dv()`/`vm()`), ale pod spodem ma:
- `app/src/api/` (REST);
- `app/src/data/` (JSON serwera → kształt pozycji prototypu, widok werdyktu);
- `app/src/escrow/` (`DemoEscrow` + przełącznik na `createSolanaEscrow()`);
- `app/src/media/` (nagrywanie, skan, hash, upload, karta QR);
- `app/src/flow.ts` (kolejność upload → escrow → sync → odświeżenie);
- `app/src/session.ts` + `app/src/kv.ts` (logowanie, token, podpięcie portfela).

Web działa przez pliki `*.web.ts(x)` (Metro wybiera je tylko na webie). Ścieżka natywna zostaje bez zmian.

**Stack:** Expo SDK 57 (RN 0.86, React 19.2), TypeScript, pnpm workspace, `@unbox/shared`, `server/` (Rust, binarka z dev containera uruchamiana na hoście), `@solana/web3.js` 1.99.0 + `@anchor-lang/core` 1.1.2 (tylko w `app/src/solana/`), oracle (Node 24 + Gemini).

**Spec:** `CLAUDE.md` §2, §3, §6, §11; `docs/superpowers/plans/2026-10-04-a-app-server.md` (plan A: kod bazowy A2–A7, tu podane są tylko różnice); `server/README.md` + realny kontrakt z kodu (niżej); `docs/ui.md` §5.2, §7, §8; `CRITERIA … .pdf` §5–6 (devnet).

## Kontekst

Strona B (program, `SolanaEscrow`, lustro serwera, wyrocznia) jest na `main`. Z planu A na `main` jest tylko A1. Ekrany to dalej mock: `genItems()`, `USERS`, fałszywe `tx()`/`oracle()`. Osoba A ma kilka godzin opóźnienia, więc użytkownik zlecił całość A2–A7 i integrację I1/I2. Przed startem **daj znać osobie A**, żeby nie robiła tego równolegle (mogła mieć niewypchniętą pracę).

**Decyzje użytkownika (04.10, ok. 09:45):**
1. Weryfikacja w przeglądarce (Expo web, dwie karty: sprzedający i kupujący) + telefony. Dlatego dochodzą zależności webowe (wyłącznie JS) i zamienniki `*.web.*`.
2. Przeklikanie w trybie demo, potem na devnecie, zgodnie z CRITERIA §5–6: każda operacja ma potwierdzoną transakcję w Explorerze, portfele zasilone zawczasu, dwa portfele, logika w programie.
3. Spór na devnecie z prawdziwym Gemini: użytkownik wpisze `GEMINI_API_KEY` do `oracle/.env`.

**Fakty z rozpoznania (ważne przy wykonaniu):**
- Na hoście nie ma `cargo`. Serwer budujemy w `unbox-dev` (`docker exec -w /work unbox-dev bash -lc '…'`), a binarkę `server/target/debug/unbox-server` uruchamiamy **na hoście** (zależy tylko od glibc, binduje 0.0.0.0).
- Na `:4000` działa serwer z innej sesji (`PAYMENTS=solana`, arbiter `2nU6…`). **Nie ruszamy go.** Nasze porty: demo **4100**, devnet **4200**, Metro web **8090** (8081 zajmuje phpmyadmin).
- `server/data/` należy do roota. `DATA_DIR` ustawiamy więc na katalog w scratchpadzie (`$SCRATCH/data-demo`, `$SCRATCH/data-devnet`).
- IP hosta w LAN: `10.250.192.247`. `PUBLIC_BASE_URL` = `http://10.250.192.247:<port>`, żeby `metadata_uri` i media działały z przeglądarki i z telefonu.
- CORS jest otwarty (`CorsLayer::permissive()`).
- Serwer w trybie solana nie publikuje seedów on-chain, więc „Przeglądaj” jest pusty, dopóki ktoś nie wystawi ogłoszenia.
- Ceny w trybie solana to maks. `100_000_000` lamportów (0,1 SOL). Tryb demo ma ceny w PLN (grosze), a seed to 120/60/180 zł.
- Rozbieżności kontraktu z `@unbox/shared`:
  - `CurrencySchema` przyjmuje tylko `'PLN'`;
  - brakuje `onchain`, `walletAddress`, `address`;
  - brakuje kodu błędu `UPSTREAM` (502);
  - `HealthSchema` nie ma `payments`/`chain`;
  - typy zdarzeń timeline różnią się między trybami:
    - demo: `paid, shipped, accepted, disputed, resolved_seller, resolved_buyer, returned, return_confirmed, expired_<Status>`;
    - solana: `paid, shipped, disputed, return_requested, returning, completed, refunded`;
  - `deadlineAt` liczy serwer w obu trybach.
- `POST /api/media` porównuje MIME dokładnie (`video/mp4`, `image/jpeg`, `application/json`; bez parametrów `;codecs=`). Wyrocznia wysyła wideo do Gemini jako `video/mp4`.
- `expo-camera` na webie nie nagrywa (`record is not supported on web`), a `expo-secure-store` na webie to pusty obiekt.
- Chrome 152 jest zainstalowany; jego `MediaRecorder` nagrywa MP4.
- Devnet:
  - program `CEoTTEq46mxFrNqPu9EbpFbDshsrSTZV9GB14XPT1Nyq` wdrożony z profilem `demo` (terminy 10/60/10/10/10 min);
  - portfel zespołu `5QD2…XB7X` ma 2,82 SOL (w kontenerze `solana` używa go domyślnie);
  - `~/.config/unbox/oracle.json` nie istnieje.

## Global Constraints

- UI po polsku. Kod, identyfikatory i commity po angielsku. W UI nie piszemy „transakcja on-chain”, „podpis”, „lamport”, „PDA”. Bez słów „gwarantowane”, „niezależny”, „automatycznie” (CLAUDE.md §13, 03.10).
- Kolejność zawsze ta sama: **upload → `escrow.*` → (tylko `mode === 'solana'`) `POST /api/chain/sync/{deal}` → odświeżenie**. Błąd sync połykamy.
- Aplikacja nigdy nie jest jedynym strażnikiem reguły: ukrywa przyciski, ale decyduje serwer (demo) albo program (solana).
- Nagrania tylko z kamery w aplikacji, 720p, maks. 120 s, bez galerii. Na webie zamiennik `MediaRecorder` (kamera albo wygenerowany obraz) to wyłącznie ścieżka testowa przeglądarki.
- Tylko `app/src/solana/` importuje `@solana/web3.js` / `@anchor-lang/core`.
- Żadnych nowych natywnych zależności. Dochodzą tylko webowe JS: `react-dom`, `react-native-web`, `@expo/metro-runtime` (wersje z `expo install`).
- `pnpm install` tylko na hoście. `cargo` tylko w `unbox-dev`.
- Nie commitujemy `.env`, kluczy ani tokenów. Klucz Gemini wpisuje użytkownik; nie wypisujemy go w logach.
- Tylko devnet. Portfel na webie trzymany jest w `localStorage` i służy wyłącznie do testów na devnecie.
- Gałąź `feat/app-integration`, małe commity, PR do `main`, nigdy force-push na `main`.

## Review Focus

1. **Aplikacja nie widzi serwera** (zły `EXPO_PUBLIC_API_URL`, `localhost` na telefonie) → `ApiError('NETWORK')` z adresem po polsku. „Przeglądaj” pokazuje błąd i „Spróbuj ponownie” zamiast pustej listy. Test: T1 `client.test.ts`.
2. **Operacja przeszła, ale `chain/sync` padł** → sukces w UI, a polling dociąga stan. Test: T4 `flow.test.ts`.
3. **Upload zerwany albo hash się nie zgadza** → `escrow.*` nie jest wołane, nagranie zostaje na urządzeniu i można ponowić. Test: T4 `flow.test.ts`.
4. **Druga strona zmieniła status chwilę wcześniej** albo jest ponowienie po błędzie sieci → `InvalidStatus` → „Stan umowy już się zmienił”. „Spróbuj ponownie” najpierw odświeża dane i nie powtarza akcji przy niezgodnym statusie. Test: T2 smoke (podwójne `accept`) + T4 `flow.test.ts`.
5. **Portfel niepodpięty** (409: adres zajęty, brak `EXPO_PUBLIC_ORACLE_PUBKEY`) w trybie solana → „Kup” i „Wystaw” zablokowane z wyjaśnieniem, a nie błąd w połowie operacji. Test: T3 `fromServer.test.ts` (`canBuy`).

---

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `packages/shared/src/{types,schemas}.ts` (+ test) | typy i schematy 1:1 z `server/src/model.rs` (SOL, `onchain`, `UPSTREAM`) |
| `app/src/api/client.ts`, `index.ts` (+ test) | `ApiError`, `createApi`, funkcje domenowe REST |
| `app/src/kv.ts`, `kv.web.ts` | trwały klucz–wartość: SecureStore (natywnie) / `localStorage` (web) |
| `app/src/solana/wallet.ts` (zmiana) | keypair przez `kv` zamiast bezpośrednio SecureStore, dzięki czemu działa też na webie |
| `app/src/escrow/demo.ts`, `index.ts` | `DemoEscrow` (REST `PAYMENTS=demo`), wybór implementacji, scenariusz AI |
| `app/src/session.ts` | logowanie, przywracanie sesji, podpięcie portfela (`PUT /api/me/wallet-address`) |
| `app/src/data/fromServer.ts` (+ test) | `Listing`/`Deal` → `Item`, `toUnits`, `money`, `canBuy`, `parsePrice` |
| `app/src/data/verdict.ts` (+ test) | raport wyroczni → ścieżka reguły `decide()` |
| `app/src/flow.ts` (+ test) | `perform()` i `explain()` |
| `app/src/media/{hash,upload,qrCard}.ts` + `*.web.ts` | hash kawałkami, upload z weryfikacją, karta do druku |
| `app/src/media/{Recorder,QrScanner}.tsx` + `*.web.tsx` | nagrywanie z wykrywaniem QR, skaner (web: `MediaRecorder` + wklejenie kodu) |
| `app/src/AppProvider.tsx`, `app/src/screens/*.tsx`, `app/src/Root.tsx`, `app/src/ui.tsx` | silnik widoku na prawdziwych danych |
| `app/scripts/{api-smoke,demo-escrow-smoke}.ts` | smoke na żywym serwerze demo |

---

### Task T0: gałąź, zależności webowe, plan w repo

**Pliki:** `app/package.json`, `pnpm-lock.yaml`, `docs/superpowers/plans/2026-10-04-a-integration.md` (kopia tego planu).

- [ ] `git pull --rebase` na `main` (lokalny `main` jest 1 commit za `origin/main`, czyli za landingiem), potem `git checkout -b feat/app-integration`.
- [ ] Zależności webowe (na hoście):
  ```bash
  pnpm --filter app exec npx expo install react-dom react-native-web @expo/metro-runtime
  pnpm install
  ```
  W `app/package.json` dopisz skrypt `"web": "expo start --web --port 8090"`. Sprawdź: `pnpm why @solana/web3.js` → jedna wersja 1.99.0.
- [ ] Skopiuj ten plan do `docs/superpowers/plans/2026-10-04-a-integration.md`.
- [ ] Szybki test: `EXPO_PUBLIC_PAYMENTS=demo pnpm --filter app exec expo start --web --port 8090`. Prototyp otwiera się w przeglądarce bez czerwonego ekranu. Zatrzymaj.
- [ ] Commit: `chore(app): web target for browser click-through (react-native-web)`.

### Task T1 (A2): typy SOL w shared i klient REST

**Pliki:** `packages/shared/src/{types,schemas,shared.test}.ts`; utwórz `app/src/api/{client,index,client.test}.ts`, `app/scripts/api-smoke.ts`.

**Interfejsy (produkuje):**
- `ApiError { status; code; message }`;
- `createApi(base)` → `{ base, setToken, get, post, put, uploadFile(uri, mime, name), uploadBlob(blob, name), mediaUrl(sha) }`;
- `api` (singleton z `EXPO_PUBLIC_API_URL`);
- `login`, `me`, `linkWallet`, `categories`, `listings`, `myListings`, `createListing`, `publishListing`, `cancelListingRest`, `deals(role)`, `deal(id)`, `wallet`, `chainSync(pda)`, `devClock(advanceSecs)`.

- [ ] **Test shared:** dopisz test z planu A (A2 krok 1). Dodatkowo:
  - `UserSchema.parse({..., walletAddress: 'x'}).walletAddress === 'x'`;
  - `ApiErrorSchema` przyjmuje `code: 'UPSTREAM'`.

  `pnpm --filter @unbox/shared test` → FAIL.
- [ ] **Typy i schematy:**
  - `Currency = 'PLN' | 'SOL'`, `User.walletAddress?`, `Wallet.address?`;
  - `OnChainListing { deal; dealId; sellerWallet; listingHash; metadataUri; published }`;
  - `ChainTx { status; at; signature: string | null; explorerUrl: string | null }`;
  - `OnChainDeal { deal; sellerWallet; buyerWallet; priceLamports; transactions: ChainTx[] }`;
  - `Listing.onchain?`, `Deal.onchain?`;
  - `ErrorCode` + `'UPSTREAM'`;
  - `HealthSchema` z `payments` i `chain` jako `.optional()`;
  - schematy zod 1:1 (opcjonalne pola = `.optional()`), `assertSame` musi przejść.

  Uruchom: `pnpm --filter @unbox/shared test && pnpm --filter @unbox/shared typecheck` → PASS.
- [ ] **Test klienta** (plan A, A2 krok 3) → FAIL.
- [ ] **Klient:** kod z planu A (A2 krok 4) z poprawkami:
  - `post` bez body nie wysyła `Content-Type: application/json` z pustym `{}` (serwer czyta surowe bajty, `{}` jest OK, ale zostaw `body ?? {}`, tak jak w planie);
  - dodaj `cancelListingRest = (id) => api.post<Listing>(\`/api/listings/${id}/cancel\`)` i `devClock = (advanceSecs) => api.post<{ now: number }>('/api/dev/clock', { advanceSecs })`.
- [ ] `app/scripts/api-smoke.ts`:
  - loguje `bartek@demo.pl` / `demo1234`;
  - wypisuje `listings().length`, `wallet().balanceMinor` i `deals('buyer').length`;
  - sprawdza, że `api.get('/api/nie-ma')` rzuca `ApiError` z kodem `NOT_FOUND`.
- [ ] **Serwer demo do całego dnia** (po `docker exec -w /work unbox-dev bash -lc 'cargo build --manifest-path server/Cargo.toml'`, na hoście, w tle):
  ```bash
  PAYMENTS=demo AI=mock ENABLE_DEV_CLOCK=1 PORT=4100 DATA_DIR=$SCRATCH/data-demo \
    PUBLIC_BASE_URL=http://10.250.192.247:4100 ./server/target/debug/unbox-server
  ```
- [ ] Uruchom:
  - `node --import tsx --test app/src/api/*.test.ts` → PASS;
  - `EXPO_PUBLIC_API_URL=http://localhost:4100 node --import tsx app/scripts/api-smoke.ts` → 3 liczby i `ok`;
  - `API_URL=http://localhost:4100 pnpm test:contract` → zielony (nowe schematy nie psują kontraktu demo).
- [ ] Commit: `feat(app): REST client for server/ and SOL-mode API types in shared`.

### Task T2 (A3): `kv`, portfel na webie, `DemoEscrow` i przełącznik

**Pliki:** utwórz `app/src/kv.ts`, `app/src/kv.web.ts`, `app/src/escrow/{demo,index}.ts`, `app/scripts/demo-escrow-smoke.ts`; zmień `app/src/solana/wallet.ts`.

**Interfejsy:**
- `kv.get(key): Promise<string | null>`, `kv.set(key, value)`, `kv.del(key)`;
- `createDemoEscrow(api?, { scenario? }): Escrow`;
- `escrow` (live binding), `setDemoScenario(s)`.

- [ ] `kv.ts`: `expo-secure-store` (`getItemAsync`/`setItemAsync`/`deleteItemAsync`).
- [ ] `kv.web.ts`: `localStorage` w `try/catch`. Komentarz: `// Browser storage: devnet-only test wallets and session tokens.`
- [ ] `wallet.ts`: zamień `SecureStore.*` na `kv.*`. Klucz `unbox.wallet.v1` i format bez zmian, dzięki czemu `importWalletJson` też działa na webie. Testy `app/src/solana/*.test.ts` dalej PASS.
- [ ] Smoke `demo-escrow-smoke.ts`: pięć scenariuszy z planu A (A3 krok 1): happy, podwójne `accept` → `InvalidStatus`, karta zwrotu w `accept` → `QrMismatch`, spór `defect` → zwrot → `Refunded` oraz bez scenariusza → `Completed`, po terminie `settleExpired`. Uwagi:
  - seed ma 3 ogłoszenia, więc scenariusze 4–5 wystawiają nowe przez `POST /api/listings`: `categoryId: 'inne'`, `photos: []`, `priceMinor: 5000`;
  - w scenariuszu 5, po `devClock(700)`, serwer sam domyka termin (sweep co 5 s). Akceptuj `Refunded` po `settleExpired` **albo** po samym odczekaniu; `settleExpired` może wtedy dać `InvalidStatus`.
- [ ] `demo.ts`: kod z planu A (A3 krok 2) z poprawkami:
  - `CODES` dodatkowo `VALIDATION → 'Rejected'`, `UPSTREAM → 'Network'`, `NOT_FOUND → 'Rejected'`;
  - `networkNow` = `(await a.post<{ now: number }>('/api/dev/clock', { advanceSecs: 0 })).now`, a przy błędzie `Math.floor(Date.now() / 1000)`. Dzięki temu odliczanie w demo zgadza się z przesuniętym zegarem serwera.
- [ ] `escrow/index.ts`: jak w planie A (A3), z `createSolanaEscrow` z `../solana`.
- [ ] Uruchom:
  - `EXPO_PUBLIC_API_URL=http://localhost:4100 node --import tsx app/scripts/demo-escrow-smoke.ts` (po `seed-reset`: zatrzymaj serwer, uruchom binarkę z argumentem `seed-reset` i tym samym env, potem start) → 5 × `ok`;
  - `node --import tsx --test app/src/solana/*.test.ts` → PASS.
- [ ] Commit: `feat(app): DemoEscrow, Escrow switch and a storage seam so the wallet runs on web`.

### Task T3 (A4): dane z serwera, logowanie, jedno konto na urządzenie

**Pliki:** utwórz `app/src/data/{fromServer,fromServer.test}.ts`, `app/src/session.ts`; zmień `app/src/AppProvider.tsx`, `app/src/screens/{Onboarding,Overlays,Browse,Listing,Deals,Deal,Wallet,Sell}.tsx`, `app/src/ui.tsx`, `app/src/config.ts`.

**Interfejsy:**
- `Item` (jak plan A, A4 krok 2) + `sellerWallet?`, `published: boolean`;
- `fromListing(l, cats)`, `fromDeal(d, cats)`, `toUnits`;
- `money(units, currency) → string` (SOL: `0.060 SOL`, PLN: `120,00 zł`);
- `canBuy(me, mode, linkError)`;
- `parsePrice(text, currency) → { minor } | { error }`;
- `signIn(email, pw) → { user, walletLinkError }`, `restore() → User | null`, `signOut()`;
- stan `AppProvider`: `me`, `deals`, `wallet`, `cats`, `skew`, `linkError`, `refresh()`.

- [ ] **Test adaptera:** test z planu A (A4 krok 1) plus:
  - zdarzenia demo `accepted` → `Completed`, `resolved_buyer` → `ReturnRequested`, `expired_Paid` → `Refunded`;
  - `money(0.06, 'SOL') === '0.060 SOL'`, `money(120, 'PLN') === '120,00 zł'`;
  - `parsePrice('0,2', 'SOL')` → błąd „maks. 0,1 SOL”, `parsePrice('0.05', 'SOL')` → `{ minor: 50_000_000 }`, `parsePrice('120', 'PLN')` → `{ minor: 12000 }`;
  - `canBuy(me z walletAddress, 'solana', '409 tekst')` → `ok: false`.

  Uruchom → FAIL.
- [ ] **Adapter:** kod z planu A (A4 krok 2) z poprawkami:
  - `KIND` obejmuje oba słowniki zdarzeń; `expired_<S>` → `SETTLE[S]` (`Paid→Refunded`, `Shipped→Completed`, `Disputed→ReturnRequested`, `ReturnRequested→Completed`, `Returning→Refunded`);
  - `sig`/`href` bierze z `onchain.transactions[].explorerUrl` (pierwszy wpis o danym statusie);
  - `published = !l.onchain || l.onchain.published` w demo, a w solana `!!l.onchain?.published`;
  - `canBuy` blokuje w solana także przy `linkError`.

  Uruchom → PASS.
- [ ] **`session.ts`:**
  - `signIn` = `login` → `kv.set('unbox.session.v1', token)` → `linkIfNeeded(user)`;
  - `restore` = token z `kv` → `api.setToken` → `me()` → `linkIfNeeded`; przy 401 czyści token;
  - `linkIfNeeded`: tylko `escrow.mode === 'solana'`. Woła `escrow.walletAddress()` (zakłada portfel), a gdy adres ≠ `user.walletAddress`, robi `linkWallet(addr)`. `ApiError` 409 albo `EscrowError` (np. brak klucza weryfikatora) zwraca jako `walletLinkError`, a nie wyjątek.
- [ ] **`AppProvider.tsx`** (silnik zostaje, `@ts-nocheck` zostaje):
  1. **Usuń:** `genItems`, `CATEGORIES`, `USERS`, `PHONES`, `ROLE`, `SCENES`, `FAIL_OPTS`, `PROG_FAIL`, `ERR`, `BASE`, `transition()`, `oracle()`, `scene()`, `takeFail()`, `switchTo()`, `jIv` (losowe drganie kursu). `fetchRate()` z CoinGecko zostaje: to prawdziwy kurs, opisany jako „orientacyjnie”, używany tylko dla SOL.
  2. **Jedno konto:** po zalogowaniu `active = me.id`, `phones = { [me.id]: ph(me.id) }`. Klucz telefonu = id użytkownika z serwera, więc istniejące porównania `d.buyer === k` / `d.seller === k` działają bez zmian. Przed logowaniem `active = '_'`, a `onb` = `'welcome'`.
  3. **`componentDidMount`:** `restore()`. Jeśli zwróci użytkownika, wywołaj `startSession(user)` (stan + `refresh()` + `setInterval(refresh, 3000)` + `syncClock()` co 30 s). Tick 250 ms zostaje. `componentWillUnmount` czyści interwały.
  4. **`refresh()`:**
     - równolegle `listings()`, `myListings()`, `deals('buyer')`, `deals('seller')`, `wallet()`, a raz `categories()`;
     - `deals` = `fromDeal(...)` + `fromListing(...)` dla ogłoszeń bez transakcji (deal o tym samym `id` wygrywa);
     - przy `ApiError` ustawia `feed: 'error'` i `feedError: e.message` (Review Focus 1);
     - **baner z pollingu:** gdy status pozycji, w której biorę udział, zmienił się względem poprzedniego odczytu, a teraz ruch jest mój (`dv().hasHint`), ustaw `banner` „<tytuł>: <etykieta statusu>”. Zastępuje to `notify()`.
  5. **Czas:** `now()` = `Math.floor(Date.now() / 1000) + this.skew`, a `syncClock()` ustawia `skew = (await escrow.networkNow()) - Date.now() / 1000`. `hhmm`/`stamp` formatują absolutny czas unix (`new Date(t * 1000)`).
  6. **`dv()`:**
     - `sN`/`bN` = `d.sellerName`/`d.buyerName`;
     - `deadline = d.deadlineAt`;
     - `priceText = money(d.price, d.currency)`;
     - `zl` tylko dla SOL (dla PLN `''`);
     - dowód „Zaakceptowany arbiter” tylko w solana (`EXPO_PUBLIC_ORACLE_PUBKEY`);
     - `href` = explorer ostatniego zdarzenia z sygnaturą albo `https://explorer.solana.com/address/${d.pda}?cluster=devnet`, a w demo `null`.
  7. **`vm()`:**
     - `roleLabel` = `me.name`; kolor sprzedającego `#FFB547` na zakładce „Sprzedaże”, w przeciwnym razie `#9945FF`;
     - `balance` = `money(toUnits(wallet.balanceMinor, wallet.currency), wallet.currency)`;
     - `addrShort` = `short(wallet.address)` albo „tryb demo”;
     - kategorie Przeglądaj z `cats`;
     - `L.sellerLine` = `sellerName` + skrót `sellerWallet`;
     - `L.short` porównuje cenę i saldo w tej samej walucie;
     - `canBuy` → przycisk „Kup” `disabled` + `Notice` z powodem (Review Focus 5);
     - historia portfela: w demo z `wallet.ledger`, w solana wyprowadzona z pozycji (zakup −, wypłata +, zwrot +);
     - usuń sztuczne `dealsLoad`;
     - filtr ceny pokazuj tylko dla SOL.
- [ ] **Ekrany:**
  - każde `{x.priceText} SOL` → `{x.priceText}`, a `≈ {x.zl}` renderuj tylko przy niepustym `zl` (`Browse`, `Listing`, `Deals`, `Deal`, `Wallet`, `Overlays` `BuySheet`/`OkSheet`, `Recording` `Decide`);
  - `ExplorerLink` tylko gdy `href`;
  - `Photo` w `ui.tsx` dostaje opcjonalne `uri` → `<Image>`;
  - karty i szczegóły pokazują pierwsze zdjęcie ogłoszenia, jeśli jest.
- [ ] **`Onboarding.tsx`:** „Utwórz portfel” → formularz e-mail + hasło + trzy szybkie logowania (`ania@demo.pl` — sprzedająca, `bartek@demo.pl` — kupujący, `celina@demo.pl`, hasło `demo1234`) + błąd po polsku. `OnbCreating` = „Łączę z kontem…”. `OnbReady` pokazuje adres portfela (solana) albo „Tryb demo – saldo prowadzi serwer” oraz `walletLinkError`, jeśli jest.
- [ ] **`RoleStrip`:** `<imię> · devnet|demo` + ikona menu.
- [ ] **Sprawdź w przeglądarce (serwer demo):** `EXPO_PUBLIC_API_URL=http://10.250.192.247:4100 EXPO_PUBLIC_PAYMENTS=demo pnpm --filter app exec expo start --web --port 8090 --clear`. Logowanie bartka → 3 ogłoszenia z seeda w zł. Zakup przez smoke pojawia się w „Transakcje” w ≤ 3 s z odliczaniem. Wyłączenie serwera → błąd z adresem + „Spróbuj ponownie”.
- [ ] Uruchom `node --import tsx --test app/src/data/*.test.ts && pnpm --filter app typecheck` → PASS.
- [ ] Commit: `feat(app): listings, deals and wallet from server/ with sign-in; one account per device`.

### Task T4 (A5): każda akcja przez `Escrow` (`perform`/`explain`)

**Pliki:** utwórz `app/src/flow.ts`, `app/src/flow.test.ts`; zmień `app/src/AppProvider.tsx`, `app/src/screens/{Overlays,Sell,Deal}.tsx`.

**Interfejsy:** `perform(act, { sync?, refresh }) → Promise<TxResult>`, `explain(e) → { title, text, code, retryable }`.

- [ ] Test z planu A (A5 krok 1) + przypadek „hash uploadu niezgodny” (`ApiError(0, 'NETWORK', 'Plik dotarł uszkodzony…')` w `act` przed escrow → `called === 0`) → FAIL. Potem `flow.ts` z planu A (A5 krok 2) → PASS.
- [ ] **`tx(k, cfg)`:**
  - ciało z planu A (A5 krok 3);
  - przed `run`, tylko w solana i gdy `cfg.kind !== 'faucet'`: saldo < 0,000005 SOL → `fail(... needFunds: true)`;
  - etapy w `TxSheet` sterowane fazą (`upload` → `escrow` → `sync`), a nie timerami: `perform` przyjmuje `onStage` (opcjonalny callback: `'chain'` przed `act`, `'sync'` po);
  - `retry` najpierw `await refresh()`, potem sprawdza `cfg.guard`.
- [ ] **Akcje:** tabela `run` z planu A (A5 krok 4) dla `buy`, `cancel`, `accept`, `settle`, `faucet`, `submitPack` (ship/return), `confirmReturn`, a `publish` jak w planie A. Różnice:
  - `publish`:
    - waluta z `escrow.mode` (`solana` → SOL, demo → PLN);
    - `parsePrice` z T3 (błąd → komunikat przy polu i brak `tx`);
    - formularz dostaje pole „Opis” i wybór kategorii z `cats`, a domyślna cena to `0.05`;
    - zdjęcia `uploadPhoto` (T5) przed `createListing`.
  - **Ogłoszenie zapisane w serwerze, ale nie w umowie** (seed w solana albo nieudany `create_listing`): na ekranie „Transakcja” własnej pozycji `Listed` z `!published` w trybie solana pokaż `Notice` „To ogłoszenie nie jest jeszcze zapisane w umowie” i przycisk „Zapisz w umowie”. Przycisk woła `publishListing(id)` (idempotentne) → `escrow.createListing(args)` → `chainSync(args.deal)`.
  - `cancel`: w solana bez `pda` → `cancelListingRest(id)`, w pozostałych przypadkach `escrow.cancelListing`.
  - `faucet`: tylko w solana (w demo przycisk ukryty).
  - Zabezpieczenia `guard: { id, status }` jak w prototypie.
- [ ] **`TxSheet`:** w sukcesie `href = r.explorerUrl`, a `sigShort` z `r.signature`; brak sygnatury (demo) → bez wiersza z Explorerem.
- [ ] Uruchom `node --import tsx --test app/src/flow.test.ts && pnpm --filter app typecheck` → PASS.
- [ ] Commit: `feat(app): every money action goes through Escrow with sync and refresh`.

### Task T5 (A6): nagrywanie, skan QR, hash, upload, karta

**Pliki:** utwórz `app/src/media/{hash,hash.web,upload,upload.web,qrCard,qrCard.web}.ts`, `app/src/media/{Recorder,Recorder.web,QrScanner,QrScanner.web}.tsx`; zmień `app/src/screens/Recording.tsx`, `app/src/Root.tsx`, `app/src/AppProvider.tsx` (`openPack`, `startRec`, `recDone`, `startScan`, `scanDone`).

**Interfejsy:**
- `hashFile(uri) → Promise<Hex32>`;
- `uploadRecording(uri) → Hex32`, `uploadPhoto(uri) → { url, sha256 }`, `uploadJson(text) → Hex32`;
- `<Recorder mode detectQr onDone={(uri, qrPayload | null, secs) => …} onCancel />`;
- `<QrScanner prefix onScan={(payload) => …} onCancel />`;
- `printCard(card, title)`.

- [ ] **`hash.ts` / `upload.ts` / `qrCard.ts`:** kod z planu A (A6 kroki 1, 2, 4). Sprawdź API `expo-file-system` 57 (`File#open()` → `FileHandle.readBytes`, `File#create()` przed `write`). Upload porównuje hash serwera z lokalnym, a niezgodność daje `ApiError('NETWORK', 'Plik dotarł uszkodzony…')`.
- [ ] **`hash.web.ts`:** `fetch(uri)` → `arrayBuffer` → `sha256.create()` z `update` w kawałkach 1 MiB (`subarray`).
- [ ] **`upload.web.ts`:**
  - `blob = await (await fetch(uri)).blob()`;
  - hash z bajtów;
  - `api.uploadBlob(new Blob([blob], { type: mime }), name)`: MIME dokładnie `video/mp4`/`image/jpeg`, bez `;codecs`, bo serwer porównuje dokładnie;
  - `uploadJson` z `new Blob([text], { type: 'application/json' })`.
- [ ] **`qrCard.web.ts`:** `window.open()` + `document.write(html)` karty, bez `print()`, bo okno drukowania blokuje automatyzację. Użytkownik drukuje z tej karty przez Ctrl+P.
- [ ] **`Recorder.tsx`** (natywny), według planu A (A6 krok 3):
  - `CameraView` `mode="video"`, `videoQuality="720p"`, `mute`;
  - uprawnienia kamery i mikrofonu z ekranem prośby po polsku;
  - `recordAsync({ maxDuration: 120 })` dopiero po `onCameraReady`;
  - minimalnie 3 s;
  - `onBarcodeScanned` zapisuje pierwszy payload `UNBOX1*` w ref, gdy `detectQr`;
  - nakładka jak w prototypie: pasek limitu, czas, status „Kod z karty wykryty”, statyczna lista „co pokazać” dla pakowania (bez fałszywego zaliczania punktów).
- [ ] **`Recorder.web.tsx`** (komentarz: `// Browser-only stand-in: expo-camera cannot record on web.`):
  - `getUserMedia({ video: true })`, a przy błędzie `canvas.captureStream(30)` z rysowanym napisem „Nagranie testowe · <godzina>” i ruchomym znacznikiem;
  - `MediaRecorder` z pierwszym wspieranym z `['video/mp4;codecs=avc1', 'video/mp4']`;
  - brak MP4 → komunikat „Ta przeglądarka nie nagrywa MP4 – użyj Chrome albo telefonu”;
  - po stopie `URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }))` → `onDone(uri, null, secs)`;
  - podgląd: `<video autoPlay muted playsInline>` albo sam canvas.
- [ ] **`QrScanner.tsx`:** `CameraView` z `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`, a pierwszy payload z `prefix` → `onScan`.
- [ ] **`QrScanner.web.tsx`:** pole „Wklej treść karty” + „Użyj kodu” (przeglądarka testowa nie ma kamery).
- [ ] **`Pack`:**
  - `openPack` woła `escrow.newQrCard(kind, d.key)` i zapisuje kartę w `pack.card` oraz w `kv` (`unbox.card.<id>.<kind>`, odtwarzana przy ponownym wejściu);
  - zamiast ikony `<QRCode value={card.payload} size={96} />`;
  - „Drukuj kartę” → `printCard`;
  - **tylko na webie** pod kodem tekst payloadu (zaznaczalny) z podpisem „Treść karty – tylko w przeglądarce testowej”.
- [ ] **Zdjęcia w „Wystaw”** (CLAUDE.md §6: zdjęcia z aparatu):
  - natywnie kafelek z aparatem otwiera ekran `PhotoCapture` (`CameraView` + `takePictureAsync({ quality: 0.7 })`), który dopisuje `uri` do `form.photos` (maks. 4, z miniaturami i usuwaniem);
  - na webie kafelek jest ukryty i ogłoszenie idzie bez zdjęć (serwer dopuszcza `photos: []`).
- [ ] **Ekrany nagrywania:**
  - `Camera` → `RecordScreen`, który renderuje `<Recorder>`;
  - `recDone`:
    - unboxing z payloadem → `decide` (`scan.payload`);
    - unboxing bez payloadu → ekran skanu (fallback z CLAUDE.md §6);
    - pakowanie / zwrot → `pack.video = true`, `pack.uri`, `pack.dur`;
  - ekran skanu → `<QrScanner>`;
  - zwrot u sprzedającego: po skanie przycisk „Oddaj X kupującemu” → `confirmReturn`;
  - `Decide`: „Kod z karty odczytany” zamiast „potwierdzony” (sprawdza go umowa).
- [ ] **Sprawdź:**
  - `pnpm --filter app typecheck`;
  - `pnpm --filter app exec npx expo export -p android --output-dir $SCRATCH/android-export` (bundel natywny bez plików `.web`, bez błędów rozwiązywania modułów);
  - w przeglądarce: nagranie testowe → upload → `sha256` serwera = lokalny (log w konsoli).
- [ ] Commit: `feat(app): in-app recording, QR scan, chunked hash and verified upload; browser stand-ins`.

### Task T6 (A7): reklamacja, werdykt, zwrot, menu deweloperskie

**Pliki:** utwórz `app/src/data/{verdict,verdict.test}.ts`; zmień `app/src/AppProvider.tsx` (`complain`, `V`, `renderVals`), `app/src/screens/{Verdict,Overlays}.tsx`.

- [ ] Test i `verdict.ts` jak w planie A (A7 kroki 1–2): wiersze = kolejne warunki `decide()`, `report == null` → `byEvidence`. Raport bierz z `d.analysis.report`, hash z `d.analysis.reportHash`. W `Disputed` z `analysis.status === 'failed'` pokaż „Ocena nie powiodła się – po terminie paczka wraca do sprzedającego za zwrot środków”.
- [ ] `Verdict.tsx`:
  - wiersze z `verdictView`;
  - `reasoning`;
  - „Raport zgodny z zapisem” (skrót `reportHash`, link `api.mediaUrl(reportHash)`);
  - link do Explorera = zdarzenie po `Disputed`;
  - `actReturn` bez zmian.
- [ ] `complain`: kod z planu A (A7 krok 3), kategorie `CATS` → `ComplaintCategory` (tabela w planie A), `complaint.json` = `JSON.stringify({ v: 1, category, description, created_at })` przez `uploadJson`.
- [ ] **`DevSheet`:**
  - wyloguj i szybkie logowanie (ania, bartek, celina);
  - demo: „Przesuń czas o 11 min” (`devClock(660)` → `syncClock()` → `refresh()`);
  - demo: „Wynik oceny AI” (`ok` | `defect`) → `setDemoScenario`;
  - solana: „Importuj portfel” (pole JSON → `importWalletJson`, a potem „Uruchom aplikację ponownie”);
  - podgląd `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_PAYMENTS`, adresu portfela i weryfikatora;
  - napis „tylko devnet”.
- [ ] Uruchom `node --import tsx --test 'app/src/**/*.test.ts' && pnpm --filter app typecheck` → PASS.
- [ ] Commit: `feat(app): complaint with video and complaint.json, verdict with the decide() path, dev menu`.

### Task T7: przeklikanie w trybie demo (przeglądarka, dwie „osoby”)

Narzędzie: Playwright MCP (Chrome 152). Dwie karty o różnych originach mają osobny `localStorage`, czyli osobną sesję:
- **S** = `http://localhost:8090` (ania, sprzedająca);
- **B** = `http://127.0.0.1:8090` (bartek, kupujący).

Serwer demo z T1 (`seed-reset` przed startem). Expo: `EXPO_PUBLIC_API_URL=http://10.250.192.247:4100 EXPO_PUBLIC_PAYMENTS=demo pnpm --filter app web -- --clear`.

- [ ] **D1, happy path:**
  1. S wystawia nowe ogłoszenie.
  2. B widzi je w Przeglądaj i kupuje (`ConfirmSheet`). Saldo B maleje.
  3. S dostaje baner, wchodzi w „Spakuj i nadaj”: karta (kopiuje payload), nagranie testowe, numer przesyłki → „Nadaj”.
  4. B: „Nagraj otwarcie” → nagranie → skan (wkleja payload) → „Wszystko OK” → potwierdzenie.
  5. Oba ekrany pokazują „Zakończone – środki u sprzedającego”, a saldo S rośnie.
- [ ] **D2, spór → zwrot:**
  1. B ustawia „Wynik oceny AI: defect” i kupuje drugie ogłoszenie.
  2. S nadaje. B nagrywa i reklamuje.
  3. Po ok. 3 s pojawia się werdykt „Reklamacja uznana” ze ścieżką reguły.
  4. B: „Spakuj zwrot” (karta zwrotu) → S skanuje kod zwrotu (wkleja) → „Środki zwrócone kupującemu”.
- [ ] **D3, po terminie:** B kupuje trzecie ogłoszenie, S nic nie robi, B klika „Przesuń czas o 11 min” → status `Refunded` (sweep serwera albo „Odbierz środki”).
- [ ] **Błędy:**
  - payload karty zwrotu w „Wszystko OK” → „Kod z karty nie pasuje…”, stan bez zmian;
  - zatrzymany serwer → błąd w Przeglądaj z „Spróbuj ponownie”, a po starcie serwera retry działa.
- [ ] Zrzuty ekranu kluczowych stanów do scratchpadu. Każdy znaleziony błąd: poprawka → test, jeśli dotyczy logiki → commit `fix(app): …`.

### Task T8: devnet (I1 + I2), przeklikanie z transakcjami w Explorerze

- [ ] **Klucz wyroczni:** wygeneruj na hoście `~/.config/unbox/oracle.json` (chmod 600) przez `node -e` z `Keypair.generate()` i zapisz pubkey (dalej `ORACLE_PK`). Zasil z portfela zespołu: `docker exec -w /work unbox-dev solana transfer <ORACLE_PK> 0.1 --allow-unfunded-recipient --url devnet`.
- [ ] **Serwer devnet** (na hoście, w tle):
  ```bash
  PAYMENTS=solana ARBITER_PUBKEY=<ORACLE_PK> PORT=4200 DATA_DIR=$SCRATCH/data-devnet \
    PUBLIC_BASE_URL=http://10.250.192.247:4200 ./server/target/debug/unbox-server
  ```
  Sprawdź, że `/api/health` ma `payments: solana` i `chain.lastSyncError: null`.
- [ ] **Wyrocznia:** `oracle/.env` z `.env.example`:
  - `ORACLE_KEYPAIR=/home/ihnat/.config/unbox/oracle.json`;
  - `API_URL=http://localhost:4200`;
  - `ORACLE_API_PASSWORD=<losowe>`;
  - `CRANK=off`;
  - `GEMINI_API_KEY` **wpisuje użytkownik** (poproszę o to w tym kroku i poczekam).

  Start `pnpm --filter oracle dev` w tle.
- [ ] **Expo:** `EXPO_PUBLIC_API_URL=http://10.250.192.247:4200 EXPO_PUBLIC_PAYMENTS=solana EXPO_PUBLIC_ORACLE_PUBKEY=<ORACLE_PK> EXPO_PUBLIC_RPC_URL=https://api.devnet.solana.com pnpm --filter app web -- --clear`.
- [ ] **Portfele:** w S i B logowanie → portfel powstaje w aplikacji i podpina się do konta. Adresy z ekranu Portfel zasilam z portfela zespołu po 0,25 SOL (`solana transfer … --allow-unfunded-recipient --url devnet`). „Doładuj testowe SOL” sprawdzam raz (publiczny kran może odmówić; ma wtedy pokazać polski komunikat).
- [ ] **S1, happy path na devnecie:** S wystawia (cena 0,05 SOL) → B kupuje → S pakuje i nadaje → B nagrywa, wkleja kod i daje „Wszystko OK” → `Completed`. Przy **każdym** kroku `TxSheet` ma link „Zobacz w Solana Explorer”. Otwieram po jednym linku na instrukcję (`create_listing`, `purchase`, `mark_shipped`, `accept_delivery`) i sprawdzam status „Success / Finalized”. Saldo S rośnie o cenę.
- [ ] **S2, spór z Gemini:** nowe ogłoszenie → zakup → nadanie → B nagrywa i reklamuje (`open_dispute`) → wyrocznia pobiera dowody i woła `resolve_dispute` → werdykt w aplikacji z raportem i linkiem do Explorera. Przy nagraniu testowym oczekiwane jest `SELLER` (`decide()`: słabe nagranie kupującego) → `Completed`. Jeśli wyjdzie `BUYER`, sprawdzam zwrot jak w S3b.
- [ ] **S3, „pośrednik znika”** (równolegle z S2, bo wymaga 10 min realnego czasu): B kupuje, S nie nadaje. Po `SHIP_TIMEOUT` przycisk w B odblokowuje się według czasu sieci → „Odbierz środki” (`settle_expired`) → `Refunded`, link do Explorera.
- [ ] **S3b, ścieżka zwrotu na devnecie** (jeśli S2 dał `SELLER`): kolejny spór przy zatrzymanej wyroczni. Po `ORACLE_TIMEOUT` (10 min) „Przejdź do zwrotu” (`settle_expired`: `Disputed → ReturnRequested`) → B „Spakuj zwrot” (`mark_returned`) → S wkleja kod zwrotu → „Oddaj X kupującemu” (`confirm_return`) → `Refunded`.
- [ ] Wyniki (sygnatury, czasy, co nie działało i dlaczego) zapisuję w `docs/spiki.md` (sekcja „Przeklikanie 04.10”).

### Task T9: dokumentacja i PR

- [ ] `app/README.md`:
  - uruchomienie (telefon i web);
  - tabela env;
  - które pliki `*.web.*` są zamiennikami testowymi i dlaczego;
  - porty;
  - jak przeklikać w dwóch kartach (`localhost` vs `127.0.0.1`);
  - usuń zdanie o stubie i tabelę mocków.
- [ ] `app/.env.example`: bez zmian kluczy. Lokalne `app/.env` dla telefonów (IP LAN, `solana`, `ORACLE_PK`) **nie** idzie do gita.
- [ ] `CLAUDE.md` §13 (data 2026-10-04):
  - aplikacja na danych z `server/` i przez `Escrow`;
  - target web (react-native-web) z zamiennikami: nagrywanie przez `MediaRecorder`, wklejenie treści karty, portfel w `localStorage` (tylko devnet);
  - `DemoEscrow.networkNow` z zegara serwera;
  - klucz wyroczni w `~/.config/unbox/oracle.json`.
- [ ] Uruchom całość testów:
  - `pnpm --filter @unbox/shared test`;
  - `node --import tsx --test 'app/src/**/*.test.ts'`;
  - `pnpm --filter app typecheck`;
  - `API_URL=http://localhost:4100 pnpm test:contract`;
  - `demo-escrow-smoke`.
- [ ] `git pull --rebase`, push gałęzi, PR do `main` z opisem: co działa, wyniki przeklikania demo/devnet z linkami do Explorera, czego nie dało się sprawdzić (telefon: nagrywanie `expo-camera` i skan w trakcie nagrania sprawdza zespół na urządzeniu).

## Weryfikacja end-to-end (podsumowanie)

| Co | Jak | Oczekiwane |
|---|---|---|
| Logika | `pnpm --filter @unbox/shared test`, `node --import tsx --test 'app/src/**/*.test.ts'` | PASS |
| Typy | `pnpm --filter app typecheck` | 0 błędów |
| Bundel natywny | `expo export -p android` | bez błędów modułów |
| Kontrakt serwera demo | `API_URL=http://localhost:4100 pnpm test:contract`, `demo-escrow-smoke.ts` | zielone |
| UI demo | Playwright, dwie karty, D1–D3 + błędy | stany i salda jak w T7 |
| UI devnet | Playwright, S1–S3(b), Explorer | każda operacja = potwierdzona transakcja |

## Wykonanie

Zalecam **Native** (wykonuję sam, potem jeden przegląd całej gałęzi). Prawie każde zadanie zmienia `AppProvider.tsx` i te same ekrany, więc równoległe subagenty wchodziłyby sobie w drogę. Do tego T7–T8 to interaktywne przeklikanie z przerwą na klucz Gemini od użytkownika.

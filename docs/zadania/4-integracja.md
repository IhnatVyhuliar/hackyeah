# Osoba 4: integracja (szkielet, prawdziwy serwer API, wyrocznia, podpięcie aplikacji, demo, zgłoszenie)

## Rola i cel
Jesteś klejem zespołu i właścicielem kontraktu:
- w pierwszej godzinie stawiasz szkielet repo i pakiet `@sellsol/shared` (typy, zod, `ApiClient`, helpery), od którego zależą wszyscy;
- potem budujesz **prawdziwy serwer API**. Ma ten sam kontrakt co fake JSON API Osoby 1 i przełączniki `CHAIN=mock|devnet` oraz `AI=mock|http`, więc działa od ok. H+3, zanim program i AI będą gotowe;
- serwer buduje niepodpisane transakcje przez SDK Osoby 2, przyjmuje nagrania, woła serwis AI Osoby 3 i jako **wyrocznia** wysyła `submit_verdict` z pomiarami. Nie decyduje o pieniądzach: to robi program;
- na końcu podpinasz aplikację do prawdziwego portfela i serwera, przygotowujesz sieć i demo na żywo, piszesz README i wysyłasz zgłoszenie.

Jesteś też „merge masterem”: scalasz gałęzie w punktach łączenia z KONTRAKT §12.

## Twoje foldery
- Root repo (`package.json` z workspaces, `.gitignore`, `README.md`), `/server`, `/scripts`, `/packages/shared/src`.
- `docs/KONTRAKT.md` (jedyna osoba, która go zmienia, po ustaleniu z zespołem), `docs/rn-solana.md`, `docs/demo-script.md`, `scripts/devnet.md`.
- W `/app` **tylko**: `src/wallet/realWallet.ts`, `src/chain/real*.ts`, `src/polyfills.ts`, `src/config.ts`.

**Nie dotykasz:** reszty `/app`, `/landing`, `/packages/shared/fixtures` (Osoba 1), `/program`, `/packages/sdk` (Osoba 2), `/ai` (Osoba 3).

## Przeczytaj najpierw
`CLAUDE.md` i cały `docs/KONTRAKT.md`, zwłaszcza §4 (mapowanie statusów), §6 (helpery i wektory), §7 (typy), §8 (API i warunki `tx/prepare`), §9 (przepływy transakcji, nagrań i wyroczni), §12 (harmonogram) i §13 (ryzyka).

## Stack i setup
Node 24, TypeScript (`tsx`), Hono + `@hono/node-server`, SQLite (`better-sqlite3` albo `node:sqlite`), `zod`, `bcryptjs` + `jose` (JWT), `@noble/hashes`, `@solana/web3.js` 1.99.0, `@sellsol/sdk` (Osoba 2), `vitest`. Narzędzia: Solana CLI, `cloudflared`, `adb` + `scrcpy`.

## Zadania

### P0. H0–H1: szkielet i `@sellsol/shared` (wszyscy na to czekają)
- [ ] `git init`, root `package.json` z `"workspaces": ["app", "landing", "server", "packages/*"]`. **`/program` poza workspaces.** `.gitignore`: `node_modules`, `.env*`, `scripts/keys/`, `server/data/`, `ai/samples/*.mp4`, `ai/data/`. Folderów `/app` i `/landing` nie tworzysz (zrobi to Osoba 1 przez `create-expo-app`).
- [ ] `packages/shared` (`@sellsol/shared`, `"main": "src/index.ts"`, źródła TS bez builda, żeby Metro i `tsx` brały je bezpośrednio):
  - `types.ts`: 1:1 z KONTRAKT §7;
  - `schemas.ts`: zod dla każdego typu (`OrderSchema`, `VerificationReportSchema`, …);
  - `api.ts`: interfejs `ApiClient` z §9.1;
  - `constants.ts`;
  - `helpers.ts`: z §6, sha256 przez `@noble/hashes`;
  - testy `vitest` z **wektorami z §6** (`npm test -w packages/shared`).
- [ ] Z Osobą 2: sprawdźcie, że `escrowPda` z helpera = PDA z programu (wpisze wynik do §6, gdy będzie `PROGRAM_ID`).
- [ ] Klucze devnet w `scripts/keys/` (gitignored):
  - `verifier.json`, `treasury.json`, `fee-wallet.json`, `demo-buyer.json`, `demo-seller.json` (`solana-keygen new --no-bip39-passphrase -o …`);
  - zasil skarbiec i portfele demo (faucet.solana.com z logowaniem GitHub, potem `solana transfer`);
  - pubkeye wpisz do `scripts/devnet.md` i przekaż: weryfikator i `fee_wallet` → Osoba 2, adresy demo → Osoba 1.
- [ ] Darmowe RPC devnet (Helius albo QuickNode) → `RPC_URL` dla zespołu.

### P0. H0–H2: spike React Native + Solana (ryzyko nr 1)
- [ ] W osobnym, wyrzucanym projekcie (`npx create-expo-app@latest` poza repo albo w `spikes/` w `.gitignore`) na **telefonie demo w Expo Go**: `@solana/web3.js@1.99.0` + `react-native-get-random-values` + `buffer` (+ `react-native-url-polyfill`, jeśli potrzebny) → `Keypair.generate()`, `getBalance`, przelew devnet z portfela demo, `Transaction.from(base64)` + `partialSign` + `sendRawTransaction`.
- [ ] Przepis (import polyfilli w punkcie wejścia, wersje paczek, ewentualne zmiany `metro.config.js`) zapisz w `docs/rn-solana.md` i oddaj Osobie 1 do H+2.
- [ ] Jeśli Expo Go nie da rady: plan B to dev build (`npx expo run:android`). Zgłoś to od razu zespołowi.
- [ ] Sprawdź też, czy workspace `@sellsol/shared` (TS bez builda) importuje się w Expo (monorepo, Expo SDK 52+ powinno działać z npm workspaces).

### P0. H+1: test sieci
- [ ] Własny hotspot (telefon albo router) dla laptopów i telefonów demo. Nie polegaj na Wi-Fi wydarzenia.
- [ ] `cloudflared tunnel --url http://localhost:4000` → telefon otwiera `<tunel>/api/health`.
- [ ] Alternatywa na scenę: Android po USB + `adb reverse tcp:4000 tcp:4000` (API po kablu, RPC przez dane komórkowe telefonu) + `scrcpy` na projektor.

### P0. Do H+3: serwer w trybie mock + contract-test
Układ:
```
server/src/
  index.ts  config.ts  db.ts  auth.ts  seed.ts  oracle.ts  treasury.ts  cranker.ts
  routes/  auth.ts listings.ts orders.ts uploads.ts verifications.ts media.ts health.ts
  chain/   types.ts (ChainAdapter)  mockChain.ts (fakeChain z shared)  devnetChain.ts (SDK)
  ai/      types.ts (AiAdapter)     mockAi.ts (raporty z fixtures/reports.json wg scenariusza)  httpAi.ts
```
- [ ] Wszystkie endpointy z KONTRAKT §8, odpowiedzi walidowane zod przed wysłaniem (w dev), błędy `{error:{code,message}}`.
- [ ] `seed.ts`: użytkownicy, kategorie i oferty z `packages/shared/fixtures` (zdjęcia kopiowane do `server/data/files/`). **Zamówień z fixtures nie seedujesz** (są tylko dla mocka w aplikacji). Przy `DEMO_MODE=1` nowe zamówienia dostają kolejne wolne `orderId` z `seal-pool.json`, a `POST /seal` zwraca plombę z puli.
- [ ] Upload: zapis strumieniowo do `server/data/media/<sha256>.mp4` z liczeniem sha256 w locie, limit 50 MB, `GET /media/:sha256`, `GET /files/:name`.
- [ ] `termsHash` przy `POST /orders` (helper z shared). `Order.seal.qrPayload` tylko dla sprzedającego.
- [ ] `ChainAdapter`:
  - `prepare(order, action, wallet) → PreparedTx`;
  - `confirmAndRead(order, signature) → EscrowState | null`;
  - `read(orderId)`;
  - `submitVerdict(orderId, m)`;
  - `claimTimeout(orderId)`.
  `mockChain` używa `fakeChain.applyAction` z shared (`txBase64: "MOCK"`, akceptuje podpisy `MOCK…`, ma „zegar demo” do timeoutów).
- [ ] `AiAdapter`: `analyzePacking(...)`, `analyzeUnboxing(...)`. `mockAi` zwraca raport z `reports.json` według nagłówka `X-Demo-Scenario` (domyślnie `ok`) po ok. 3 s.
- [ ] `GET /orders/:id` liczy `status` przez `deriveStatus(chain, offchain)` (cache odczytu chain 2 s). Terminalny stan on-chain wygrywa.
- [ ] `scripts/contract-test.ts`: pełny przepływ dla każdego scenariusza (`ok`, `defect`, `swap`, `invalid_recording`) + timeout. Każda odpowiedź przez zod. Kod wyjścia ≠ 0 przy błędzie. Do testu uploadu użyj małego pliku `.mp4` (albo nagrania od Osoby 3).
- [ ] Udostępnij adres tunelu Osobie 1 (test `HttpApiClient`).

### P0. H+3–H+12: tryb real (devnet + AI)
- [ ] `devnetChain` przez `@sellsol/sdk`:
  - `prepare`: warunki z §8, `feePayer` = portfel użytkownika, `serializeUnsigned`;
  - `confirmAndRead`: `getTransaction` (potwierdzona, bez błędu) → `getEscrow` → aktualizacja `Order` i `txs` (`explorerUrl`).
  **Nie ufaj samemu podpisowi od klienta**: liczy się stan konta.
- [ ] `httpAi`: multipart do `AI_URL` (`video`, `order_id`, `expected_qr` z plomby, `markers`, `listing_photos` jako URL-e `PUBLIC_BASE_URL/files/...`, `extra_tests`, `listing_description`, przy otwarciu `packing_video_url`), timeout 90 s, `Verification` → `done`/`failed`. Kopiuj keyframe'y do `/files/`. Sprawdź `report.videoSha256 == sha256` uploadu.
- [ ] `oracle.ts` według KONTRAKT §9.5:
  - po `submitTx {action: open_claim}` odczyt escrow (`Verifying`);
  - raport z tym `videoSha256` + `weightDiffG` ze zdarzeń paczkomatu → `sdk.submitVerdict(...)` kluczem `VERIFIER_SECRET_KEY`;
  - brak raportu → `recordingValid = false`;
  - ponowny odczyt i aktualizacja `Order`, wpis do `timeline` po polsku.
- [ ] `treasury.ts`: przy `PATCH /me {walletAddress}` (tylko `CHAIN=devnet`) przelew 1 SOL ze skarbca, jeśli saldo < 0.5 SOL. Limit: raz na portfel.
- [ ] `GET /api/health` zwraca `{ok, chain, ai, programId, cluster}`. Sprawdza RPC i `AI_URL/health`.
- [ ] **Do M2 (H+12): pierwsza prawdziwa transakcja `fund_escrow` w Explorerze**, potem cały scenariusz `ok` przez `contract-test` na devnecie (z kluczami demo podpisującymi w skrypcie).

### P0. H+12–H+16: podpięcie aplikacji (z Osobą 1)
- [ ] `app/src/polyfills.ts`: z przepisu ze spike'a, importowany jako pierwszy w `app/_layout.tsx` (poproś Osobę 1 o tę jedną linijkę albo dodaj ją w uzgodnieniu).
- [ ] `app/src/wallet/realWallet.ts` (`AppWallet`):
  - klucz generowany przy pierwszym uruchomieniu i trzymany w `expo-secure-store`;
  - `useDemoIdentity(role)` ładuje klucze demo z `EXPO_PUBLIC_DEMO_BUYER_SECRET`/`EXPO_PUBLIC_DEMO_SELLER_SECRET`. To tylko devnet, zaznacz to w README;
  - po zalogowaniu `PATCH /me {walletAddress}`.
- [ ] `app/src/chain/realTx.ts` (używany przez `realWallet.signAndSend`): `Transaction.from(base64)` → **odmowa, jeśli instrukcja celuje w program inny niż `PROGRAM_ID` i System Program** → `partialSign` → `sendRawTransaction` → `confirmTransaction` → zwraca podpis. Wygasły blockhash → błąd z kodem, który aplikacja obsłuży ponowieniem `prepare`.
- [ ] `.env` aplikacji: `EXPO_PUBLIC_API_MODE=http`, `EXPO_PUBLIC_WALLET_MODE=real`, adres tunelu, RPC, `PROGRAM_ID`.
- [ ] **M3 (H+16):** na dwóch telefonach (kupujący, sprzedający) przejść scenariusze `ok`, `defect`, `swap`, `invalid_recording` (nagrania na żywo na wydrukowanych plombach) + `ShipTimeout` albo `OpenTimeout` (zamówienie z oknem 60–120 s). Każdy krok z linkiem w Explorerze.

### P1. Odporność demo (H+12–H+18)
- [ ] Plan B dla aplikacji: APK (`npx expo prebuild` + `npx expo run:android --variant release` albo EAS `eas build -p android --profile preview`; kolejka EAS bywa długa, zacznij wcześnie) do H+12.
- [ ] Serwer i AI: działają z laptopa przez tunel. Opcjonalnie hosting (Railway albo Fly) jako druga ścieżka.
- [ ] `cranker.ts` (opcjonalnie): co 30 s `claimTimeout` dla przeterminowanych escrow. To pokazuje, że „każdy może”.
- [ ] Zapas: przed demo założyć jedno zamówienie z krótkim oknem, żeby na scenie od razu pokazać `claim_timeout`.

### P1. Dokumentacja, próby, zgłoszenie (H+18–H+22)
- [ ] `README.md` (root; jury go czyta):
  - czym jest SellSol i dla kogo;
  - diagram (mermaid z KONTRAKT §2);
  - „gdzie znika pośrednik” (link do `logic.rs`/`submit_verdict.rs`);
  - co gdzie leży (tabela folderów);
  - jak uruchomić każdą część (komendy, env);
  - `PROGRAM_ID` + linki do Explorera z demo;
  - konta demo;
  - ograniczenia (szczerze: weryfikator jako wyrocznia, upgradowalny program na devnecie, zwrot bez odesłania przedmiotu, mock paczkomatu);
  - linki: landing, wideo, deck.
- [ ] `docs/demo-script.md`:
  - scenariusz demo na żywo minuta po minucie (kto trzyma który telefon, które plomby, kiedy otworzyć Explorer);
  - lista kontrolna przed wyjściem na scenę (saldo portfeli, hotspot, tunel, AI health, wydrukowane plomby, wideo zapasowe pod ręką);
  - co robimy, gdy coś padnie (wideo zapasowe Osoby 1, gotowe linki z Explorera).
- [ ] **2 pełne próby** (H+19, H+20) według `demo-script.md`; poprawki tylko krytyczne.
- [ ] Wideo finalne ≤ 3 min z Osobą 1 (H+21), publiczny link (sprawdź w trybie incognito).
- [ ] **Zgłoszenie na HackTribe do H+22** (deadline 23:00 4.10):
  - tytuł „SellSol”, nazwa zespołu, lista członków (1–6);
  - opis z uzasadnieniem projektowym (`docs/design-rationale.md` od Osoby 2);
  - PDF ≤ 10 slajdów (Osoba 2), link do wideo;
  - **publiczne repo**; opcjonalnie zrzuty ekranu i link do landingu.

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| szkielet repo + `@sellsol/shared` z testami wektorów | wszyscy | H+1 |
| pubkey weryfikatora, `fee_wallet`, RPC | O2 | H+1 |
| adresy portfeli demo | O1 | H+1 |
| `docs/rn-solana.md` (polyfille) + `fakeChain`/`evaluateVerdict`/`deriveStatus` | O1 | H+2 |
| serwer `CHAIN=mock AI=mock` pod tunelem + contract-test | O1 | H+3 |
| serwer `CHAIN=devnet AI=http` + wyrocznia | wszyscy (M2) | H+12 |
| aplikacja na prawdziwym portfelu i API | wszyscy (M3) | H+16 |
| README, `demo-script.md`, zgłoszenie | jury | H+22 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| `PROGRAM_ID` | O2 | H+1 |
| fixtures + plomby | O1 | H+2 |
| zamrożony IDL + SDK (stuby) | O2 | H+3 |
| 5 nagrań testowych | O3 | H+4 |
| serwis AI po HTTP | O3 | H+8 |
| devnet + config + działający SDK | O2 | H+10 |
| `HttpApiClient` w aplikacji | O1 | H+10 |
| rationale, Q&A, deck | O2 | H+20 |

## Jak testować samodzielnie
- `npm test -w packages/shared` (wektory).
- `CHAIN=mock AI=mock npm run dev -w server` + `npx tsx scripts/contract-test.ts`.
- `CHAIN=devnet AI=mock`: działa bez Osoby 3. `CHAIN=mock AI=http`: działa bez Osoby 2.
- Spike RN na telefonie, niezależnie od aplikacji Osoby 1.

## Definition of Done
- [ ] `contract-test` zielony w trybie mock i na devnecie dla 4 scenariuszy + timeoutu.
- [ ] Aplikacja na dwóch telefonach przechodzi demo z prawdziwymi transakcjami (linki w Explorerze).
- [ ] Serwer nie ma żadnej ścieżki, która przelewa środki użytkowników: tylko buduje transakcje i wysyła pomiary.
- [ ] README, `demo-script.md`, 2 próby, zgłoszenie wysłane przed 23:00.

## Pułapki
- Nie dodawaj w serwerze logiki „kto dostaje pieniądze”. Jeśli kusi, to znak, że coś powinno być w programie (zgłoś Osobie 2).
- `POST /tx` nie może ufać klientowi: czytaj konto. Blockhash wygasa po ok. 60–90 s: `prepare` tuż przed podpisem.
- Faucet devnet ma limity i wspólne IP na wydarzeniu: zasilaj skarbiec wcześnie, nie rób airdropów w czasie demo.
- Każde `orderId` z puli plomb może mieć escrow tylko raz: śledź zużyte plomby (tabela w `scripts/devnet.md`).
- Sekrety (`scripts/keys/`, `.env`) poza git. Klucze demo w aplikacji to świadomy wyjątek tylko dla devnetu.

## Prompt startowy do Claude Code
```
Pracujesz w repo SellSol (hackathon, 24 h). Przeczytaj CLAUDE.md, cały docs/KONTRAKT.md i docs/zadania/4-integracja.md.
Jesteś Osobą 4: integracja. Edytujesz root repo, /server, /scripts, /packages/shared/src, docs/KONTRAKT.md
i w /app tylko src/wallet/realWallet.ts, src/chain/real*.ts, src/polyfills.ts, src/config.ts.
Kolejność: (1) szkielet monorepo (npm workspaces bez /program) i packages/shared: types.ts 1:1 z §7, zod, ApiClient z §9.1,
helpers z §6 z testami vitest na wektorach; (2) serwer Hono + SQLite z CHAIN=mock i AI=mock implementujący wszystkie endpointy
z §8 + scripts/contract-test.ts; (3) devnetChain przez @sellsol/sdk, httpAi, oracle (§9.5), treasury; (4) realWallet i realTx w aplikacji.
Serwer nigdy nie decyduje o pieniądzach: buduje niepodpisane transakcje, czyta stan konta i przekazuje pomiary AI.
```

# unbox — backend sklepu (`server/`)

**Backend: Rust + Axum + SQLite.** Zwykły backend HTTP: **aplikacja → REST API → SQLite / pliki / serwis AI**. W domyślnym trybie `PAYMENTS=solana` backend **nie jest źródłem prawdy o pieniądzach**: środki i stan transakcji trzyma program `unbox_escrow`, a backend tylko odbija w SQLite stan kont `Deal` odczytany przez RPC (szczegóły niżej). Źródłem prawdy dla stanu transakcji i demo-płatności jest wyłącznie w trybie `PAYMENTS=demo`.

- Rust 1.95 (`rust-toolchain.toml` w root repo), `axum` 0.8 + `tokio`, `rusqlite` (wbudowane SQLite, WAL), `serde`/`serde_json`, `jsonwebtoken` (HS256), `bcrypt`, `sha2`, `reqwest` (rustls), `tracing`.
- Samodzielny crate: `server/Cargo.toml` ma własny `[workspace]`, więc nie należy do root workspace'u Cargo (`programs/*`).
- Kontrakt JSON 1:1 z `@unbox/shared` (`packages/shared`): typy, schematy zod, etykiety, helpery QR i `decide()` dla aplikacji.

## Uruchomienie

```bash
cd server
ARBITER_PUBKEY=<klucz wyroczni> cargo run  # domyślnie PAYMENTS=solana (wymaga ARBITER_PUBKEY), http://localhost:4000
PAYMENTS=demo cargo run                     # demo offline: ledger w SQLite, baza w server/data/unbox.db
cargo run -- seed-reset                     # czyści bazę, zakłada dane demo i kończy
cargo test                                  # testy jednostkowe + integracyjne (osobne procesy, bazy tymczasowe)
cargo clippy --all-targets -- -D warnings
cargo fmt -- --check
```

Z root repo: `pnpm dev:server`, `pnpm test:backend`, `pnpm test:contract`. Zmienne ustawiasz w powłoce (`cargo run` nie wczytuje `.env`); wzór i opis: `server/.env.example`.

Na Windows z włączonym Smart App Control niepodpisane `rustc`/`gcc` są blokowane. Wtedy budujemy w kontenerze, montując **całe repo** (`server/` zależy od `../programs/unbox_escrow`), np. z root repo: `docker run --rm -v "$PWD":/work -w /work/server rust:1.95-slim cargo test` (do `clippy`/`fmt`: `rustup component add clippy rustfmt`). Montaż samego `server/` przestał działać.

Telefon nie widzi `localhost`: ustaw w aplikacji `EXPO_PUBLIC_API_URL=http://<IP-laptopa>:4000` albo adres tunelu, a w backendzie `PUBLIC_BASE_URL` na ten sam adres (z niego wyrocznia pobiera nagrania).

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `PORT` | `4000` | port HTTP |
| `DATA_DIR` | `server/data` | baza `unbox.db` + `media/` + `jwt-secret` (gitignored) |
| `AI` | `mock` | `mock` (gotowe raporty, nagłówek `X-Demo-Scenario`) albo `http` (serwis wyroczni) |
| `AI_URL` | `http://localhost:8000` | adres wyroczni (tylko `AI=http`) |
| `AI_TIMEOUT_MS` / `AI_MAX_ATTEMPTS` / `AI_RETRY_MS` | `120000` / `3` / `2000` | timeout i ponowienia oceny |
| `MOCK_AI_DELAY_MS` | `3000` | opóźnienie raportu w `AI=mock` |
| `AI_HEALTH_TTL_MS` | `30000` | jak często health odświeża w tle stan wyroczni |
| `TIMEOUTS` | `demo` | `demo` (minuty) albo `prod` (dni) |
| `MAX_UPLOAD_MB` | `60` | limit pliku w `POST /api/media` |
| `JWT_SECRET` | losowy w `DATA_DIR/jwt-secret` | **wymagany** przy `APP_ENV`/`NODE_ENV=production` (bez niego serwer nie wstaje) |
| `PUBLIC_BASE_URL` | `http://localhost:PORT` | publiczny adres backendu (URL-e plików) |
| `ENABLE_DEV_CLOCK` | `0` | test-only `POST /api/dev/clock`; nigdy w produkcji |
| `SWEEP_MS` | `5000` | co ile backend domyka transakcje po terminie |
| `QUIET` / `RUST_LOG` | — | poziom logów (`tracing`) |

Zwykły start seeduje tylko pustą bazę, więc restart niczego nie zmienia.

## Tryb `PAYMENTS=solana` (domyślny)

Pieniądze i reguły są w programie `unbox_escrow` (CLAUDE.md §2). Backend nie ma kluczy, niczego nie podpisuje
i nie zmienia stanu pieniędzy: odbija w SQLite stan kont `Deal` odczytany przez RPC. Webhook Helius i poller
(`SOLANA_POLL_MS`) to tylko sygnał „przeczytaj ponownie”; payloadowi nie ufamy.

| Krok | Aplikacja | Backend |
|---|---|---|
| Portfel | generuje keypair, `PUT /api/me/wallet-address {address}` | mapuje adres ↔ konto (unikalny) |
| Wystaw | `POST /api/listings/{id}/publish` → podpisuje `create_listing` z odpowiedzi | zamraża treść, serwuje `GET /api/listings/{id}/metadata.json` (bajty = `listingHash`) |
| Kup / nadaj / odbierz / reklamuj / zwróć / „Odbierz środki” | podpisuje instrukcję programu, potem `POST /api/chain/sync/{deal}` | odczytuje konto i aktualizuje `listing`/`deal` |
| Przeglądaj, szczegóły | `GET /api/listings`, `GET /api/deals/{id}` | tylko ogłoszenia widoczne on-chain; `payment.currency = "SOL"`, kwoty w lamportach, `onchain.transactions[].explorerUrl` |
| Portfel | `GET /api/me/wallet` | saldo SOL z RPC, `heldMinor` = środki w escrow, `address` |

Stare `POST /api/listings/{id}/purchase` i `POST /api/deals/{id}/{ship|accept|dispute|return|confirm-return|settle}`
zwracają w tym trybie 409. Spory rozstrzyga wyrocznia (`oracle/`) instrukcją `resolve_dispute`.

Pola `complaint` i `analysis` odbitej transakcji pochodzą z plików w `/media`, których sha256 jest równy `complaint_hash` / `report_hash` z konta `Deal` (plik o innym hashu albo większy niż 1 MiB jest ignorowany). `report.json` wgrywa wyrocznia własnym kontem (`ORACLE_API_EMAIL`).

`PAYMENTS=demo`: dawny ledger w SQLite. Używają go `cargo test`, `pnpm test:contract` i awaryjne demo offline.

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `PAYMENTS` | `solana` | `solana` albo `demo` |
| `RPC_URL` | `https://api.devnet.solana.com` | RPC devnet (najlepiej Helius; URL z kluczem nie trafia do `/api/health`) |
| `CLUSTER` | `devnet` | do linków Solana Explorer |
| `ARBITER_PUBKEY` | — (wymagane w `solana`) | klucz wyroczni, arbiter nowych ogłoszeń |
| `WEBHOOK_SECRET` | puste | wartość `authHeader` webhooka Helius |
| `SOLANA_POLL_MS` | `5000` | co ile poller czyta `getProgramAccounts` |

### Webhook Helius (devnet)
1. Tunel do portu 4000: `docker run --rm --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://localhost:4000`
2. Webhook (URL tunelu zmienia się po restarcie, więc zaktualizuj go przez `PUT /v0/webhooks/{id}`):
       curl -X POST "https://api.helius.xyz/v0/webhooks?api-key=$HELIUS_API_KEY" -H 'Content-Type: application/json' \
         -d '{"webhookURL":"https://<tunel>/api/webhooks/helius","transactionTypes":["ANY"],
              "accountAddresses":["CEoTTEq46mxFrNqPu9EbpFbDshsrSTZV9GB14XPT1Nyq"],
              "webhookType":"rawDevnet","authHeader":"<WEBHOOK_SECRET>"}'
3. Bez tunelu wszystko działa przez poller, z opóźnieniem `SOLANA_POLL_MS`.

Build: `server/` zależy od `../programs/unbox_escrow`, więc w kontenerze montuj całe repo, nie sam `server/`.

## Konta demo (hasło `demo1234`, saldo startowe 1000 zł)

| Konto | Rola w demo |
|---|---|
| `ania@demo.pl` | sprzedająca (3 ogłoszenia startowe) |
| `bartek@demo.pl` | kupujący |
| `celina@demo.pl` | trzecia osoba (testy dostępu) |

Nowe konta (`POST /api/auth/register`) też dostają 1000 zł salda demo.

## Model

- **Ogłoszenie** (`Listing`): `Listed` → `Sold` (zakup) albo `Cancelled`. Edycja i anulowanie tylko w `Listed`.
- **Transakcja** (`Deal`, `id` = id ogłoszenia). Każde przejście wykonuje `machine::transition()` (`server/src/machine.rs`, port maszyny stanów z `@unbox/shared`) w jednej transakcji SQLite razem z księgą płatności:

| Akcja (endpoint) | Kto | Ze stanu | Do stanu | Płatność |
|---|---|---|---|---|
| `POST /api/listings/:id/purchase` | kupujący ≠ sprzedający | ogłoszenie `Listed` | `Paid` | cena zablokowana (`secured`) |
| `POST /api/deals/:id/ship` | sprzedający | `Paid` | `Shipped` | — |
| `POST /api/deals/:id/accept` | kupujący + sekret QR | `Shipped` | `Completed` | wypłata sprzedającemu |
| `POST /api/deals/:id/dispute` | kupujący + sekret QR + nagranie | `Shipped` | `Disputed` | — |
| (ocena AI → `decide()`) | backend | `Disputed` | `Completed` (SELLER) / `ReturnRequested` (BUYER) | wypłata / — |
| `POST /api/deals/:id/return` | kupujący + nagranie | `ReturnRequested` | `Returning` | — |
| `POST /api/deals/:id/confirm-return` | sprzedający + sekret QR zwrotu | `Returning` | `Refunded` | zwrot kupującemu |
| `POST /api/deals/:id/settle` (i automatycznie) | strona transakcji | po terminie | jak niżej | jak niżej |

Terminy (`deadlineAt = statusChangedAt + TIMEOUTS[status]`, demo / prod): `Paid` 10 min / 3 dni → `Refunded`; `Shipped` 60 min / 7 dni → `Completed`; `Disputed` 10 min / 24 h → `ReturnRequested` (neutralny zwrot towaru); `ReturnRequested` 10 min / 3 dni → `Completed`; `Returning` 10 min / 7 dni → `Refunded`. Akcje stron wymagają `now < deadlineAt`, domknięcie `now >= deadlineAt`. Backend domyka transakcje przy odczycie, w portfelu i cyklicznie (`SWEEP_MS`).

**Płatności demo** (tabela `ledger`): saldo = suma wpisów (`topup`, `secure` −cena, `release` +cena sprzedającemu, `refund` +cena kupującemu). Zakup sprawdza saldo w tej samej transakcji SQLite. Jedno rozliczenie na transakcję wymusza też unikalny indeks w bazie. `heldMinor` = suma cen aktywnych zakupów.

**QR** (`server/src/machine.rs`, te same wektory co `@unbox/shared`): sekret = 32 losowe bajty (hex), treść `UNBOX1:<dealId>:<secret>` (zwrot: `UNBOX1R:`), commitment wysyłki `sha256(utf8(dealId) || secret)`, zwrotu `sha256("return" || utf8(dealId) || secret)`. Aplikacja wysyła commitment przy `ship`/`return`, a sekret (ze skanu) przy `accept`/`dispute`/`confirm-return`; backend sprawdza zgodność (`409 QR_MISMATCH`).

## Endpointy

| Metoda i ścieżka | Auth | Odpowiedź |
|---|---|---|
| `GET /api/health` | — | `{ ok, db, ai, timeouts, version }` (bez odpytywania AI przy każdym wywołaniu) |
| `POST /api/auth/register` `{email, password, name}` | — | `201 {token, user}` |
| `POST /api/auth/login` `{email, password}` | — | `{token, user}` |
| `GET /api/me` | ✓ | `User` |
| `GET /api/me/wallet` | ✓ | `{ balanceMinor, heldMinor, currency, ledger[] }` |
| `GET /api/categories` | — | `Category[]` |
| `GET /api/listings?q&categoryId&sellerId` | — | `Listing[]` (tylko `Listed`) |
| `GET /api/listings/:id` | — | `Listing` |
| `GET /api/me/listings` | ✓ | moje ogłoszenia (wszystkie statusy) |
| `POST /api/listings` | ✓ | `201 Listing` |
| `PATCH /api/listings/:id` | ✓ właściciel | `Listing` |
| `POST /api/listings/:id/cancel` | ✓ właściciel | `Listing` |
| `POST /api/listings/:id/purchase` | ✓ | `201 Deal` |
| `GET /api/deals?role=buyer\|seller` | ✓ | `Deal[]` |
| `GET /api/deals/:id` | ✓ strona | `Deal` |
| `POST /api/deals/:id/{ship,accept,dispute,return,confirm-return,settle}` | ✓ strona | `Deal` |
| `POST /api/media` (multipart, pole `file`) | ✓ | `201 { sha256, url, size, mimeType }` |
| `GET /media/:sha256` | — | plik (publiczny, adresowany haszem) |
| `POST /api/dev/clock` `{advanceSecs}` | — | **test-only**, tylko z `ENABLE_DEV_CLOCK=1`/`NODE_ENV=test` |

Błędy zawsze: `{ "error": { "code", "message" } }` (komunikat po polsku). `400 VALIDATION`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (cudza transakcja albo zła rola), `404 NOT_FOUND`, `409 INVALID_STATE | DEADLINE_PASSED | DEADLINE_NOT_REACHED | QR_MISMATCH | INSUFFICIENT_FUNDS`, `413` (za duży plik, kod `VALIDATION`), `500 INTERNAL`.

**Media:** serwer liczy sha256 sam, ignoruje nazwę pliku od klienta, plik nazywa się swoim haszem i nie jest nadpisywany. Dozwolone: `image/jpeg|png|webp|heic`, `video/mp4|quicktime`, `application/json` (`complaint.json`, `report.json`). Nagranie podane w `ship`/`dispute`/`return` musi być wcześniej wgrane przez tę samą osobę (`POST /api/media`), inaczej `400`.

### Przykład: od zakupu do wypłaty

```bash
API=http://localhost:4000
B=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"bartek@demo.pl","password":"demo1234"}' | jq -r .token)
S=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"ania@demo.pl","password":"demo1234"}' | jq -r .token)
curl -s -X POST $API/api/listings/l-kurtka-levis/purchase -H "Authorization: Bearer $B"          # → Deal (Paid)
V=$(curl -s -X POST $API/api/media -H "Authorization: Bearer $S" -F "file=@packing.mp4;type=video/mp4" | jq -r .sha256)
curl -s -X POST $API/api/deals/l-kurtka-levis/ship -H "Authorization: Bearer $S" -H 'Content-Type: application/json' \
  -d "{\"qrCommitment\":\"<shipCommitment(dealId, secret)>\",\"packingVideoSha256\":\"$V\",\"trackingNumber\":\"INP123\"}"
curl -s -X POST $API/api/deals/l-kurtka-levis/accept -H "Authorization: Bearer $B" -H 'Content-Type: application/json' \
  -d '{"qrSecret":"<sekret z QR>"}'                                                                # → Completed
```

Treść QR, commitment i sekret liczą helpery z `@unbox/shared`: `createQr(kind, dealId)` i `verifyQr(payload, …)`.

## Kontrakt z wyrocznią (O5, `AI=http`)

`POST {AI_URL}/v1/disputes/analyze` (JSON, timeout `AI_TIMEOUT_MS`), typy `OracleRequest` / `OracleResponse` w `server/src/model.rs` (schematy zod o tym samym kształcie w `@unbox/shared`):

```jsonc
// żądanie
{ "deal_id": "l-…", "listing": { "v": 1, "title": "…", "defects": ["…"], "photos": [{ "url": "…", "sha256": "…" }], … },
  "listing_hash": "<sha256>", "tracking_number": "INP123",
  "packing_video":  { "url": "<PUBLIC_BASE_URL>/media/<sha256>", "sha256": "<sha256>" },
  "unboxing_video": { "url": "<PUBLIC_BASE_URL>/media/<sha256>", "sha256": "<sha256>" },
  "complaint": { "v": 1, "category": "damaged", "description": "…", "created_at": 1791050000 } }
// odpowiedź: pomiary, BEZ werdyktu
{ "report": { "buyer_recording": {…}, "seller_recording": {…}, "package_matches_shipping_recording": true,
              "item_matches_listing": true, "undisclosed_damage": { "present": false, "description": "", "timestamps": [] },
              "reasoning": "…" },
  "model": "…", "prompt_version": "v1",
  "evidence": { "packing_video_sha256": "<sha256>", "unboxing_video_sha256": "<sha256>" } }
```

Backend: waliduje odpowiedź, sprawdza, że `evidence` = hasze nagrań z transakcji, liczy werdykt `decide(report)` (pola werdyktu od wyroczni są ignorowane), zapisuje raport z `reportHash` i dopiero wtedy zmienia stan. Błędny JSON, 4xx/5xx, timeout, brak pól albo inne hasze → `analysis.status = failed`, stan i płatność bez zmian; po terminie oceny `Disputed → ReturnRequested`. Wyrocznia powinna też mieć `GET /health`.

## Testy

```bash
cd server && cargo test          # 5 jednostkowych (maszyna stanów, decide, QR, hasze) + integracyjne
pnpm test:contract               # z root: black-box 11 scenariuszy sklepu (TS, schematy z @unbox/shared)
```

Testy integracyjne (`server/tests/`) uruchamiają binarkę serwera jako osobny proces, na tymczasowej bazie (`tempfile`) i wolnym porcie; nie dotykają `server/data`. Pokrywają: status codes i kształt błędów, 401/403/404/409, niezmienniki księgi płatności, równoległy zakup, równoległe `accept`/`settle`/`confirm-return`, timeout vs akcja, restart i idempotentny seed, walidację mediów, wyrocznię przez lokalny fake HTTP (zły JSON, 400, 500, timeout, złe hasze, brak pól, podsunięty werdykt) i blokady trybu produkcyjnego. `pnpm test:contract` buduje serwer przez `cargo`; z `API_URL=…` testuje już działający serwer uruchomiony z `ENABLE_DEV_CLOCK=1 AI=mock`.

## Transakcje i wyścigi

Jedno połączenie SQLite (WAL) za mutexem: wszystkie operacje na bazie są serializowane, a każda operacja biznesowa (zakup, przejście stanu z rozliczeniem, edycja ogłoszenia) wykonuje się w transakcji `BEGIN IMMEDIATE`, więc odczyt stanu, decyzja maszyny stanów, zapis i wpis do księgi są atomowe. Dodatkowo unikalny indeks `ledger_settlement` (jedna wypłata/zwrot na transakcję) blokuje drugie rozliczenie na poziomie bazy. W efekcie: dwa równoległe zakupy tego samego ogłoszenia → jeden sukces, drugi `409`; podwójne `accept`/`settle`/`confirm-return` → jedno rozliczenie; saldo sprawdzane w tej samej transakcji co zakup (brak debetu). Ocena AI działa w tle (`tokio::spawn`) i nie trzyma blokady podczas czekania na wyrocznię.

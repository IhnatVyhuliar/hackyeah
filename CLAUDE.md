# SellSol — HackYeah 2026, wyzwanie Superteam „Finance Without Intermediaries”

SellSol to sprzedaż używanych rzeczy (głównie ubrań) między osobami prywatnymi. Pieniądze kupującego czekają w programie na Solanie (devnet). Sprzedający nagrywa pakowanie i zakleja paczkę plombą QR, kupujący nagrywa otwarcie przy paczkomacie. Serwis AI tylko **mierzy** (czy plomba się zgadza, czy nagranie jest ciągłe, czy przedmiot pasuje, czy ma wady). **Program on-chain decyduje** według jawnej tabeli, czy wypłacić sprzedającemu, czy zwrócić kupującemu. Nie ma platformy, która rozstrzyga spory.

Zasada nadrzędna z regulaminu: **logika zastępująca pośrednika musi być w programie on-chain.** Serwer może budować transakcje, przechowywać pliki i przekazywać pomiary, ale nie może decydować o pieniądzach.

## Najpierw przeczytaj
- `docs/KONTRAKT.md`: jedno źródło prawdy (tabela decyzji, program, REST API, typy, AI, dane demo, harmonogram).
- `docs/zadania/<twoja-rola>.md`: twoje zadania, kryteria akceptacji i punkty łączenia.
- `CRITERIA Finance Without Intermediaries PL_ENG.pdf`, `RULES Finance Without Intermediaries.pdf`: wymagania i regulamin hackathonu.

## Mapa repo i właściciele (edytuj tylko swoje foldery)
| Folder | Co | Właściciel |
|---|---|---|
| `/app` | aplikacja Expo (React Native, Expo Router) | Osoba 1 |
| `/landing` | strona web z eksportu Claude Design | Osoba 1 |
| `/packages/shared/fixtures` | dane demo (JSON) i pula plomb | Osoba 1 |
| `/program` | workspace Anchor, program `sellsol_escrow` (poza npm workspaces) | Osoba 2 |
| `/packages/sdk` | klient TS programu (Node: serwer i skrypty) + IDL | Osoba 2 |
| `/ai` | serwis AI (Python, FastAPI, CLI) | Osoba 3 |
| `/server`, `/scripts` | prawdziwe API, wyrocznia, contract-test, klucze devnet | Osoba 4 |
| `/packages/shared/src` | typy, schematy zod, `ApiClient`, helpery | Osoba 4 |
| `/docs` | dokumentacja; `KONTRAKT.md` zmienia tylko Osoba 4 | wszyscy / Osoba 4 |

Wyjątek: Osoba 4 może edytować w `/app` tylko `src/chain/real*`, `src/wallet/real*`, `src/polyfills.ts`, `src/config.ts`.

## Zmiana kontraktu
1. Proponujesz zmianę na kanale zespołu (co, dlaczego, kogo dotyczy).
2. Osoba 4 aktualizuje `docs/KONTRAKT.md` i `packages/shared/src`, robi commit z prefiksem `contract:`.
3. Wszyscy robią `git pull`. Nie zmieniaj po cichu nazw pól, statusów, instrukcji ani endpointów.

## Porty i zmienne środowiskowe
| Usługa | Port | Najważniejsze env |
|---|---|---|
| server (`/api`) | 4000 | `CHAIN=mock\|devnet`, `AI=mock\|http`, `AI_URL`, `RPC_URL`, `PROGRAM_ID`, `VERIFIER_SECRET_KEY`, `TREASURY_SECRET_KEY`, `DEMO_MODE`, `JWT_SECRET`, `PUBLIC_BASE_URL` |
| ai | 8000 | `ANTHROPIC_API_KEY`, `AI_MODEL=claude-opus-5-5`, `AI_DATA_DIR`, `PUBLIC_BASE_URL` |
| app (Metro) | 8081 | `EXPO_PUBLIC_API_MODE=mock\|http`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WALLET_MODE=mock\|real`, `EXPO_PUBLIC_RPC_URL`, `EXPO_PUBLIC_PROGRAM_ID`, `EXPO_PUBLIC_CLUSTER=devnet` |
| landing | 5173 | brak |

Sekrety (`.env`, klucze `*.json`) nie trafiają do git. Wyjątek: keypair programu z `/program/target/deploy`, który dzielimy celowo, bo to tylko devnet.

## Konwencje
- Interfejs aplikacji i raporty AI po polsku. Kod, nazwy pól i instrukcji po angielsku.
- Lamporty zawsze jako string dziesiętny, czasy jako unix w sekundach, hasze jako 64 znaki hex lowercase.
- Gałęzie: `feat/frontend`, `feat/program`, `feat/ai`, `feat/integration`. Merge do `main` w punktach łączenia z `KONTRAKT.md`.
- Stack on-chain zgodny z bootcampem Superteam: Anchor 1.1.2, Rust 1.95, `@anchor-lang/core` ^1.1.2, `@solana/web3.js` 1.99.0, Surfpool, Node 24.
- Kod piszemy w oknie konkursowym: od 3.10 23:00 do 4.10 23:00 (regulamin, pkt 5).

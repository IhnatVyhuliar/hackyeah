# Osoba 5: wyrocznia AI (`oracle/`)

## Rola i cel
Budujesz wąski serwis, który **zgłasza fakt, a nie decyduje o pieniądzach**. Działa tak:
- widzi transakcję w `Disputed`;
- pobiera dowody i sprawdza ich hashe z on-chain;
- prosi Gemini o wypełnienie raportu (model nie wydaje werdyktu);
- werdykt liczy deterministyczna funkcja `decide()`;
- zapisuje `report.json` i wywołuje `resolve_dispute(verdict, report_hash)` kluczem arbitra.

Przy okazji woła `settle_expired` dla przeterminowanych transakcji, ale to tylko wygoda: każdy może to zrobić.

Jury zapyta: „czy AI to nie nowy pośrednik?”. Twoja odpowiedź jest w kodzie: model wypełnia pola, `decide()` jest jawne, arbiter może wskazać tylko jedną ze stron i tylko przed `ORACLE_TIMEOUT`, a gdy milczy, po terminie program sam przechodzi do zwrotu towaru za pieniądze.

## Twoje pliki
`oracle/**`: `package.json` (nazwa `oracle`), `src/{watch,evidence,gemini,decide,resolve}.ts`, `src/fixture.ts`, `prompts/v1.md`, `fixtures/` (bez `.mp4` w gicie), `.env.example`, `keys/` (w `.gitignore`).

**Nie dotykasz:** `app/`, `programs/`, `packages/shared` (typ `OracleReport` uzgadniasz z O4), `scripts/`.

## Przeczytaj najpierw
`CLAUDE.md` §2 (zasada nr 1 i ograniczenia wyroczni), §4 (`resolve_dispute`, `settle_expired`, timeouty), §5 (całość), §6 (ścieżki storage). `docs/zadania/README.md` (konwencje JSON, wektory, otwarte kwestie). Dokumentacja Gemini (sprawdź **aktualne** modele i API, nie pisz z pamięci): ai.google.dev/gemini-api/docs/models, `…/video-understanding`, `…/structured-output`, `…/files`.

## Stack i setup
Node 24 + TypeScript (`tsx`), `@google/genai`, `@anchor-lang/core` ^1.1.2, `@solana/web3.js` 1.99.0, `@unbox/shared`, `node:crypto` do sha256, `fetch` do Supabase (REST albo `@supabase/supabase-js`). Testy: `node --test`.

**K0, przed 23:00 (tylko środowisko):**
- Klucz Gemini (AI Studio); sprawdź limity zapytań dla wideo na swoim planie.
- `solana-keygen new -o oracle/keys/oracle.json` → pubkey do O4 (`ORACLE_PUBKEY`), kilka SOL od O6 na opłaty.
- `oracle/.env.example`: `GEMINI_API_KEY`, `GEMINI_MODEL`, `ORACLE_KEYPAIR`, `RPC_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

## Zadania

### P0. `decide()` z testami (do 01:00)
- [ ] `decide.ts`: dokładnie kod z `CLAUDE.md` §5 + gałąź dowodów (brak albo niezgodny plik → przegrywa autor, bez AI).
- [ ] Testy tabelaryczne (`node --test`): każda gałąź `decide()` + każda gałąź dowodów.
- [ ] Kształt `report.json` uzgodniony z O4 (`OracleReport` w shared): pola z §5 + `prompt_version`, `model`, `deal`, `verdict`, `evidence` (wynik sprawdzenia hashy), `created_at`.

### P0. Spike Gemini (K1, 02:00)
- [ ] Dwa dowolne nagrania z telefonu (pakowanie i otwarcie ubrania z plamą) → Files API (czekasz na `ACTIVE`) → zapytanie ze schematem JSON → raport.
- [ ] Zmierz czasy: upload, przetwarzanie, odpowiedź. Oceń jakość: czy model widzi plamę, ciągłość, odsłonięcie QR. Wybierz `GEMINI_MODEL` na podstawie dokumentacji i spike'a.
- [ ] Wynik w `docs/spiki.md`.

### P0. Fixtures i prompt (K2, 08:00)
- [ ] Z O6 (rekwizyty) nagraj telefonem (720p, ≤ 2 min) 4 przypadki w `oracle/fixtures/<przypadek>/`:

  | Przypadek | Co na nagraniach | Oczekiwany werdykt |
  |---|---|---|
  | `ok` | uczciwe pakowanie i otwarcie, bez szkód, reklamacja bezpodstawna | `SELLER` |
  | `stain` | plama, której nie ma na liście wad (to transakcja A z demo) | `BUYER` |
  | `cut` | otwarcie zaczyna się od otwartej paczki albo ma cięcie | `SELLER` |
  | `disclosed` | plama jest na liście wad w `metadata.json` | `SELLER` |

  Każdy katalog: `metadata.json`, `photo-*.jpg`, `packing.mp4`, `unboxing.mp4`, `complaint.json`, `expected.json`. Pliki `.mp4` trzymaj na wspólnym dysku, nie w gicie.
- [ ] `prompts/v1.md`:
  - rola: moduł pomiarowy, wypełnia pola raportu, nie decyduje, kto dostaje pieniądze;
  - **sceptycyzm**: słabe, ucięte albo zasłonięte nagranie to argument przeciw jego autorowi;
  - wady z listy w ogłoszeniu nie są „nieujawnione”;
  - porównanie paczki z otwarcia z paczką z nagrania pakowania (taśma, etykieta, numer przesyłki z on-chain);
  - karta QR jest złożona na nagraniu pakowania i rozłożona przy otwarciu (otwarte kwestie, pkt 2);
  - znaczniki czasu `mm:ss`, `notes` i `reasoning` **po polsku** (aplikacja pokazuje je użytkownikowi).
- [ ] `gemini.ts`: oba wideo przez Files API, zdjęcia, opis z listą wad, reklamacja, numer przesyłki. Każdą część poprzedza etykieta tekstowa („Nagranie pakowania (sprzedający)”). Structured output ze schematem raportu, niska temperatura. Loguj zużycie tokenów.
- [ ] `fixture.ts`: `pnpm --filter oracle fixture <dir>` → raport + werdykt + porównanie z `expected.json`; kod wyjścia ≠ 0 przy rozbieżności.
- [ ] Wszystkie 4 przypadki zielone 3 razy z rzędu (model jest niedeterministyczny). Zmiana promptu po pierwszym użyciu = nowy `v2.md`.

### P0. Dowody z łańcucha i storage (K3, 12:00)
- [ ] `evidence.ts` dla konta `Deal`: pobierz `metadata.json` (z `metadata_uri`), zdjęcia (ścieżki i hashe z metadanych), `packing.mp4`, `unboxing.mp4`, `complaint.json` (ścieżki z §6).
- [ ] sha256 **dokładnie pobranych bajtów** porównujesz z `listing_hash`, hashami zdjęć, `packing_video_hash`, `unboxing_video_hash`, `complaint_hash`.
- [ ] Brak albo niezgodność plików sprzedającego (metadane, zdjęcia, pakowanie) → `BUYER`; plików kupującego (otwarcie, reklamacja) → `SELLER`; bez wołania AI.
- [ ] Gdy zawodzą obie strony: propozycja „najpierw dowody kupującego”, zgodnie z `decide()`, gdzie bez dobrego nagrania kupującego nie ma reklamacji. Ustal z zespołem i dopisz do `CLAUDE.md` §13.

### P0. Pętla na devnecie (pierwszy spór 14:00, stabilnie do K4 16:00)
- [ ] `watch.ts`: co ok. 5 s `program.account.deal.all()`:
  - `Disputed` bez trwającej obsługi → pipeline, z blokadą w pamięci, żeby nie robić tego dwa razy;
  - status z tabeli `settle_expired` po terminie → `settleExpired` (crank).
- [ ] `resolve.ts`: `report.json` → bajty → upload `deals/<deal>/report.json` → `resolve_dispute(verdict, sha256(bajty))` kluczem z `ORACLE_KEYPAIR`.
  - Jeśli raport już leży w storage (pliki są niezmienne), użyj istniejących bajtów i ich hasha.
- [ ] Nie wysyłaj, gdy do `ORACLE_TIMEOUT` zostało mniej niż ok. 30 s. Program i tak odrzuci transakcję, a milczenie ma zdefiniowany skutek (`ReturnRequested`).
- [ ] Przy błędzie modelu (429, 5xx, nieprawidłowy JSON) maksymalnie 2 ponowienia, potem następna iteracja pętli. **Nigdy nie zgaduj werdyktu.**
- [ ] Logi z czasem każdego etapu. Cel: werdykt w < 2 min od `open_dispute`, bo na scenie każda sekunda się dłuży.

### P1
- [ ] Koszt jednej reklamacji (tokeny × cennik) jako liczba do pitchu (O6): „ocena sporu kosztuje nas ok. X zł”.
- [ ] Uruchamianie na laptopie demo przez hotspot; instrukcja startu w `oracle/README.md`.

### P2
- [ ] Prototyp kworum: dwa modele albo dwa prompty, zgodność raportów (materiał do „Następnych kroków”).

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| `ORACLE_PUBKEY` | O4 (shared), O1 | K0 |
| kształt `report.json` | O4 | 01:00 |
| wynik spike'a Gemini | zespół | K1 02:00 |
| `fixture` zielony na 4 przypadkach | jury (README), O6 | K2 08:00 |
| pierwszy `resolve_dispute` na devnecie | O3, O4, O6 | 14:00 |
| stabilna wyrocznia + crank | demo | K4 16:00 |
| koszt reklamacji | O6 | 17:00 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| service key Supabase | O4 | K0 |
| IDL, `PROGRAM_ID` | O1 | 00:30, K1 |
| `@unbox/shared` (ścieżki, typy) | O4 | 01:00 |
| rekwizyty do fixtures | O6 | 04:00 |
| prawdziwe spory z telefonu | O3 | od K3 |

## Jak testować samodzielnie
`node --test` (`decide`, dowody), `pnpm --filter oracle fixture <dir>` (bez łańcucha), a na devnecie spór założony skryptem O6 albo z telefonu O3.

## Definition of Done
- [ ] 4 fixtures zielone; werdykt zawsze z `decide()`, nigdy z modelu.
- [ ] Spór z telefonu kończy się `resolve_dispute` w Explorerze, a `report.json` ma hash zgodny z on-chain (aplikacja pokazuje „Raport zgodny z zapisem ✓”).
- [ ] Brak pliku lub niezgodny hash rozstrzyga bez AI, zgodnie z §5.
- [ ] W kodzie nie ma ścieżki, która przelewa środki: tylko `resolve_dispute` i `settle_expired`.

## Pułapki
- Model tylko z `GEMINI_MODEL`. Nazwy modeli i domyślne API Gemini zmieniają się; sprawdź dokumentację przed pisaniem kodu.
- Pliki w Files API są tymczasowe i trzeba poczekać na `ACTIVE`, zanim użyjesz ich w zapytaniu.
- Schemat structured output obsługuje tylko podzbiór JSON Schema. Trzymaj go płaskim i prostym.
- Hashujesz pobrane bajty, nie zserializowany ponownie JSON.
- Klucz wyroczni i `.env` nigdy w gicie (`oracle/keys/`).
- Publiczny RPC devnet szybko daje 429 przy `getProgramAccounts` co 5 s: używaj Helius.

## Prompt startowy do Claude Code
```
Pracujesz w repo unboxproof (HackYeah 2026). Przeczytaj CLAUDE.md (§2, §4, §5, §6), docs/zadania/README.md
i docs/zadania/5-wyrocznia.md. Jesteś Osobą 5: wyrocznia w oracle/ (Node 24, TypeScript, @google/genai,
@anchor-lang/core, @solana/web3.js 1.99.0). Edytujesz tylko oracle/.
Kolejność: decide.ts 1:1 z §5 + testy node --test; spike Gemini (Files API, structured output; model z env GEMINI_MODEL,
nazwy i API sprawdź w aktualnej dokumentacji ai.google.dev); prompts/v1.md i komenda fixture na 4 przypadkach;
evidence.ts (hashe z on-chain, brak/niezgodny plik → przegrywa autor); watch.ts + resolve.ts na devnecie.
Model wypełnia tylko pola raportu; werdykt zawsze z decide(). Nigdy nie zgaduj werdyktu przy błędzie modelu.
```

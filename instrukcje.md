# Jak uruchomić projekt lokalnie

Instrukcja krok po kroku: od sklonowania repo do aplikacji na telefonie. Szczegóły każdej części są w `README.md` (EN) i w README poszczególnych katalogów.

**Tylko devnet.** Nie commituj plików `.env` ani keypairów. Każda część ma `.env.example`.

## 1. Co musisz mieć

| Narzędzie | Do czego | Kto potrzebuje |
|---|---|---|
| Git | sklonowanie repo | wszyscy |
| Node **24** | aplikacja, wyrocznia, testy TS | wszyscy |
| pnpm **9.15.9** | instalacja zależności (workspace) | wszyscy |
| Expo Go na telefonie (SDK 57) | podgląd aplikacji | aplikacja |
| Docker + VS Code (Dev Containers) | Anchor, Solana CLI, Rust, Surfpool | program, `server/`, `cli/` |

Node 24 zainstalujesz np. przez `nvm install 24 && nvm use 24`. pnpm w odpowiedniej wersji daje `corepack enable` (Node sam weźmie wersję z `packageManager` w `package.json`).

Sprawdź:

```bash
node -v    # v24.x
pnpm -v    # 9.15.9
```

## 2. Sklonuj repo i zainstaluj zależności

```bash
git clone https://github.com/IhnatVyhuliar/hackyeah.git
cd hackyeah
pnpm install
```

`pnpm install` uruchamiaj **na hoście**, nie w dev containerze. pnpm w kontenerze blokuje skrypty instalacyjne i zapisuje pliki jako root.

## 3. Najszybciej: sama aplikacja na telefonie

Ekrany aplikacji działają dziś na silniku demo z mockami transakcji (`app/src/AppProvider.tsx`), więc do podglądu nie potrzebujesz backendu ani łańcucha.

```bash
cp app/.env.example app/.env
pnpm --filter app start
```

Zeskanuj kod QR z terminala w Expo Go (Android) albo aparatem (iOS). Telefon i laptop muszą być w tej samej sieci Wi-Fi. Jeśli sieć blokuje połączenia między urządzeniami (np. Wi-Fi na hackathonie), uruchom `pnpm --filter app start --tunnel` (Expo za pierwszym razem zaproponuje doinstalowanie `@expo/ngrok`).

Sprawdzenie typów: `pnpm --filter app typecheck`.

## 4. Otwórz kod w edytorze

```bash
code .
```

Do części w Ruście (program, `server/`, `cli/`) użyj dev containera:

1. Przed pierwszym uruchomieniem utwórz katalog na klucze Solany, bo kontener go montuje:
   ```bash
   mkdir -p ~/.config/solana
   ```
2. W VS Code: `Ctrl+Shift+P` → **Dev Containers: Reopen in Container**. Pierwsze budowanie trwa kilka minut.
3. Repo jest w kontenerze w `/work`. Porty 8899 (walidator) i 4000 (`server/`) są przekierowane na hosta.

## 5. Program on-chain (w dev containerze)

```bash
solana-keygen new --no-bip39-passphrase   # tylko jeśli nie masz ~/.config/solana/id.json
anchor build                              # profil demo (terminy w minutach)
pnpm test:program                         # testy wszystkich ścieżek na Surfpoolu (terminy po 5 s)
```

Program jest już wdrożony na devnecie: `CEoTTEq46mxFrNqPu9EbpFbDshsrSTZV9GB14XPT1Nyq`. Deploy (`pnpm deploy:devnet`) robi tylko właściciel programu. Nigdy nie wołaj samego `anchor deploy`, bo po testach w `target/deploy` leży build z 5-sekundowymi terminami.

## 6. Backend `server/` (port 4000)

W dev containerze albo na hoście z zainstalowanym `rustup` (wersję 1.95 dobierze `rust-toolchain.toml`).

```bash
PAYMENTS=demo pnpm dev:server                     # offline: ledger w SQLite, bez łańcucha
ARBITER_PUBKEY=<klucz wyroczni> pnpm dev:server   # tryb domyślny: odbija stan programu z devnetu
```

`cargo run` nie wczytuje plików `.env`, więc zmienne ustaw w powłoce (wzór: `server/.env.example`). Konta demo mają hasło `demo1234`: `ania@demo.pl` sprzedaje, `bartek@demo.pl` kupuje. Reset bazy: `cd server && cargo run -- seed-reset`.

Telefon nie widzi `localhost`. W `app/.env` wpisz `EXPO_PUBLIC_API_URL=http://<IP-laptopa>:4000`, a w backendzie ustaw `PUBLIC_BASE_URL` na ten sam adres **przed** publikacją ogłoszeń (trafia on-chain w `metadata_uri`).

## 7. Wyrocznia `oracle/`

```bash
cp oracle/.env.example oracle/.env   # GEMINI_API_KEY, ORACLE_KEYPAIR, RPC_URL, API_URL, ORACLE_API_PASSWORD
pnpm --filter oracle test            # decide() i dowody, bez kluczy i sieci
pnpm --filter oracle dev             # pętla: wymaga backendu, klucza wyroczni z SOL i Gemini
```

`pnpm --filter oracle fixture fixtures/stain` ocenia sprawę na plikach lokalnych, ale nagrania z `oracle/fixtures/_media/` nie są w gicie (leżą na wspólnym dysku). Skopiuj je tam przed uruchomieniem. Keypair wyroczni trzymaj poza repo (domyślnie `~/.config/unbox/oracle.json`).

## 8. `unbox-cli`: cały przepływ bez telefonu

W dev containerze, przy działającym `server/`:

```bash
cd cli
export RPC_URL=<RPC devnetu> API_URL=http://localhost:4000 ARBITER_PUBKEY=<klucz wyroczni>
cargo run -- --help
```

Przykładowe wywołania (`link`, `publish`, `buy`, `ship`, `accept`) są w `README.md`, sekcja „Running it”.

## 9. Landing

Strona jest na https://vibecourses.co/sellsor/. Lokalnie:

```bash
cd landing && python3 -m http.server 8000   # http://localhost:8000
```

Pełny build z webową wersją aplikacji: `landing/build-site.sh` (pierwszy raz trwa kilka minut). Push na `main` zmieniający `landing/` albo `app/` wdraża stronę automatycznie.

## 10. Typowe problemy

| Objaw | Rozwiązanie |
|---|---|
| `pnpm install` ostrzega o `engines` / dziwne błędy Node | masz Node starszy niż 24: `nvm use 24` |
| pliki w repo należą do roota | `pnpm install` poszło w kontenerze; napraw `sudo chown -R $USER .` i instaluj na hoście |
| dev container nie startuje (błąd montowania) | brak `~/.config/solana` na hoście: `mkdir -p ~/.config/solana` |
| Expo Go: „incompatible SDK” | zaktualizuj Expo Go do wersji obsługującej SDK 57 |
| telefon nie łączy się z Expo | inna sieć albo izolacja klientów Wi-Fi: `--tunnel` |
| aplikacja nie łączy się z backendem | w `EXPO_PUBLIC_API_URL` jest `localhost` zamiast IP laptopa |
| Windows: `rustc`/`gcc` zablokowane | Smart App Control; buduj w kontenerze (patrz `server/README.md`) |

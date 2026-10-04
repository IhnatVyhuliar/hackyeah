# Sellsor – aplikacja React Native (Expo)

Eksport prototypu `Sellsor App v4`: tryb ciemny, jeden telefon, 100 ogłoszeń z wyszukiwarką i filtrami, przeliczanie SOL → zł na żywo (CoinGecko), menu demo.

## Uruchomienie

Aplikacja jest pakietem `app` w workspace pnpm (z roota repo, na hoście, nie w dev containerze):

```bash
pnpm install                     # w roocie repo
cp app/.env.example app/.env     # uzupełnij EXPO_PUBLIC_API_URL (IP laptopa w LAN, nie localhost)
pnpm --filter app start          # Expo Go na telefonie albo emulator
```

`pnpm --filter app typecheck` sprawdza typy. Polyfille (`react-native-get-random-values`, globalny `Buffer`) ładuje `polyfills.ts` jako pierwszy import w `index.ts`, przed `App`.

| Zmienna | Znaczenie |
|---|---|
| `EXPO_PUBLIC_API_URL` | adres `server/`, np. `http://192.168.1.10:4000` |
| `EXPO_PUBLIC_PAYMENTS` | `demo` (REST, `DemoEscrow`) albo `solana` (`app/src/solana/`) |
| `EXPO_PUBLIC_RPC_URL` | RPC devnetu |
| `EXPO_PUBLIC_ORACLE_PUBKEY` | klucz wyroczni (arbiter), któremu ufa aplikacja |

`app/src/solana/index.ts` to na razie stub (`createSolanaEscrow()` odrzuca każdą operację); prawdziwą implementację dostarcza osoba B.

## Struktura

```
index.ts                wejście: polyfille, potem registerRootComponent(App)
polyfills.ts            getRandomValues i Buffer dla @solana/web3.js
App.tsx                 fonty, SafeArea, provider
src/config.ts           opcje startowe demo (konto, onboarding, saldo, tryb QR)
src/AppProvider.tsx     silnik demo: maszyna stanów, terminy, mock transakcji, kurs zł, view modele
src/theme.ts            tokeny kolorów i fontów (ds/tokens)
src/ui.tsx              prymitywy: Txt, Label, Btn, Chip, Notice, Photo, Header, Field…
src/Root.tsx            przełączanie ekranów
src/screens/*.tsx       ekrany i arkusze (zakup, potwierdzenie, transakcja, filtry, menu demo)
```

## Co jest mockiem i gdzie to podmienić

Zgodnie z granicami modułów z CLAUDE.md §6:

| Mock w `AppProvider.tsx` | Docelowo |
|---|---|
| `tx()` – etapy wysyłanie → sieć → potwierdzenie, błędy | `app/src/solana/` (`purchase`, `markShipped`, `acceptDelivery`, `openDispute`, `settleExpired`…), sukces po `confirmed` |
| `PROG_FAIL` / `errCode()` – zdania po polsku dla kodów programu | ten sam słownik, kody z `errors.rs` (numery 6000–6006 są propozycją) |
| `oracle()` – werdykt po `aiDelay` s | event `DealStatusChanged` + `report.json` z wyrocznią |
| `initial()` / `genItems()` – 100 ogłoszeń | `fetchDeals()` (`getProgramAccounts` + `metadata.json`) |
| ekran `Camera` – symulacja nagrywania i wykrywania QR | `app/src/media/` (`expo-camera` / `vision-camera`), `qrMode` = wynik spike'a |
| `fetchRate()` – CoinGecko co 30 s, fallback na kurs przykładowy | bez zmian albo własny endpoint; kwoty w zł zawsze „orientacyjnie” |
| menu „Demo” (konto, czas sieci, sceny, awarie) | ukryte menu deweloperskie, tylko devnet |

Silnik ma `// @ts-nocheck` – to port 1:1 z prototypu, żeby zachować identyczne zachowanie. Ekrany są typowane luźno (`any`).

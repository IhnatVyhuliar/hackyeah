# Sellsor – aplikacja React Native (Expo)

Eksport prototypu `Sellsor App v4`: tryb ciemny, jeden telefon, 100 ogłoszeń z wyszukiwarką i filtrami, przeliczanie SOL → zł na żywo (CoinGecko), menu demo.

## Uruchomienie

```bash
bash setup.sh          # tworzy sellsor-app/ na aktualnym Expo SDK i instaluje zależności
cd sellsor-app
npx expo start         # Expo Go na telefonie albo emulator
```

Ręcznie: `npx create-expo-app@latest --template blank-typescript`, skopiuj `App.tsx`, `app.json`, `src/`, potem `npx expo install expo-font expo-status-bar react-native-svg react-native-safe-area-context @expo-google-fonts/space-grotesk @expo-google-fonts/jetbrains-mono lucide-react-native`.

## Struktura

```
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

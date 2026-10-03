# Interfejs aplikacji — specyfikacja UI

Ten dokument opisuje wygląd i zachowanie aplikacji mobilnej (`app/`). Zawiera zasady, słownik, system wizualny, komponenty, cykl każdej operacji, każdy ekran ze stanami i tekstami oraz macierz „Co teraz?” dla każdego statusu. Uzupełnia `CLAUDE.md` §6 i zadania O2–O4 w `docs/zadania/`.

- **Kto czyta:** O2, O3, O4 (implementacja), O6 (zrzuty do slajdów, choreografia demo).
- **Teksty w cudzysłowach „…”** to gotowe napisy do UI. Można je skracać, ale nie wolno dodawać żargonu ani obietnic (§2).
- **Priorytety:** domyślnie P0. P1 = do K4, P2 = jeśli zostanie czas (zestawienie w §12).
- **Proporcje:** regulamin mówi wprost, że interfejs może być surowy i że design nie jest oceniany. Wartość tego dokumentu to czytelny przepływ, teksty, stany i choreografia demo. Przed K4 nie dopieszczamy wyglądu (cienie, animacje, ikony aplikacji).
- Pieniądze, terminy i uprawnienia egzekwuje program (`CLAUDE.md` §2). UI tylko je pokazuje.

---

## 1. Zasady

1. **Mówimy językiem Vinted, nie blockchaina.** Użytkownik widzi cenę, paczkę, termin i „środki zabezpieczone w umowie”. Nie widzi podpisów, kont ani hashy.
2. **Każdy ekran transakcji odpowiada na cztery pytania:**
   - Gdzie są teraz pieniądze?
   - Kto ma ruch?
   - Do kiedy?
   - Co się stanie, jeśli nikt nic nie zrobi?

   Czwarte pytanie jest najważniejsze. Odpowiedź na nie mówi, że po terminie reguła zadziała bez niczyjej zgody. To jest moment „pośrednik znika”, który według kryteriów oceny waży 30%. Wszystkie cztery odpowiedzi daje karta „Co teraz?” (§7).
3. **Zgoda przed każdą nieodwracalną operacją.** Portfel jest wbudowany i podpisuje w tle, więc nie ma okna podpisu, jakie pokazuje Phantom. Jego rolę przejmuje `ConfirmSheet` (§5.2). Mówi, co się stanie, ile SOL, dokąd trafią środki i czego nie da się cofnąć. Akceptacja arbitra przy zakupie musi być widoczna dla człowieka, a nie tylko zapisana w argumentach instrukcji.
4. **Sukces dopiero po potwierdzeniu sieci.** Przy pieniądzach nie stosujemy optimistic UI, czyli nie pokazujemy sukcesu, zanim sieć go potwierdzi. Najpierw widać stan pośredni („Zapisuję w umowie…”), a sukces dopiero po `confirmed`. Komunikat błędu nigdy nie sugeruje, że pieniądze zniknęły (§5.3).
5. **Zasady oceny nagrań znane przed nagraniem.** `decide()` traktuje słabe albo ucięte nagranie jako argument przeciw jego autorowi. Użytkownik dowiaduje się tego przed nagraniem, a nie dopiero z werdyktu (§5.6).
6. **Nie obiecujemy więcej, niż robi kod** (§2.2). Jury porównuje teksty z repozytorium.
7. **Czytelne z projektora.** Demo idzie przez `scrcpy` na rzutnik. Dlatego:
   - tekst ma min. 14 pt (treść 16 pt), a kwoty i statusy są duże;
   - kontrast jest wysoki, a aplikacja działa tylko w trybie jasnym;
   - telefony demo różnią się kolorem roli (§3, §11).
8. **UI nie pilnuje reguł.** Ukrywa przyciski niedozwolonych akcji, ale terminy i role liczy z konta `Deal` i z czasu sieci (§5.4). Ostatnie słowo ma program. Nie dodajemy reguł, których nie ma w `CLAUDE.md` §4.
9. **Surowo, ale spójnie.** `StyleSheet` + wspólny `theme`, bez bibliotek UI i bez nowych natywnych zależności (wyjątki do uzgodnienia w §13).

---

## 2. Słownik i uczciwość tekstów

### 2.1 Słownik

Trzy osoby robią różne ekrany, więc wszystkie piszą tym samym słownikiem.

| Pojęcie techniczne | Tekst w UI |
|---|---|
| escrow w koncie `Deal`, PDA, smart contract | „umowa”, „środki zabezpieczone w umowie” |
| transakcja on-chain, sygnatura | „Potwierdzone ✓” + dyskretny link „Zobacz w Solana Explorer” |
| podpisz, zatwierdź transakcję | czasownik z akcji: „Zapłać”, „Nadaj paczkę”, „Przekaż środki” |
| lamport | nigdy; zawsze SOL z jednostką |
| arbiter, wyrocznia, oracle | „Weryfikator AI” (strona umowy), „ocena” (proces) |
| werdykt `Buyer` / `Seller` | „Reklamacja uznana” / „Reklamacja odrzucona” |
| `qr_commitment`, `qr_secret` | niewidoczne; użytkownik widzi „kartę z kodem do włożenia do paczki” i „Kod zgodny ✓” |
| hash pliku | niewidoczny; użytkownik widzi „zgodny z zapisem ✓” |
| `settle_expired` | „Odbierz środki”, „Przejdź do zwrotu”, „Zamknij sprawę po terminie” (§7.2) |
| airdrop, faucet | „Doładuj testowe SOL” |
| blockhash expired, RPC, 429 | „Operacja nie doszła do skutku”, „Sieć nie odpowiada” (§9) |
| deal | „transakcja” (w sensie zakupu) albo nazwa przedmiotu |

- Zwracamy się do użytkownika per „Ty”, wielką literą („Twoje”, „do Ciebie”), krótko i konkretnie.
- Etykiety statusów bierzemy z `STATUS_LABELS_PL`, a krótkie etykiety na osi przebiegu z `STATUS_SHORT_PL` (§4). Obie listy są w shared i mają po jednym wpisie na każdy status programu.

### 2.2 Czego nie obiecujemy

| Nie piszemy | Dlaczego | Piszemy zamiast tego |
|---|---|---|
| „gwarantowane”, „w 100% bezpieczne” | system ma rezydualne zaufanie: jeden klucz weryfikatora i pliki w Supabase (`CLAUDE.md` §12) | „środki zabezpieczone w umowie” |
| „niezależny weryfikator”, „niezależna ocena AI” | weryfikatora uruchamia nasz zespół; pytanie „niezależny od kogo?” nie ma dobrej odpowiedzi | „Weryfikator AI”, „według jawnych zasad” + kto go uruchamia (`RulesSheet`, §8) |
| „automatycznie” o rozliczeniu po terminie | program sam niczego nie uruchamia; po terminie ktoś musi wywołać rozliczenie, ale może to być każdy | „bez niczyjej zgody”, „jednym kliknięciem – może to zrobić każdy” |
| „zasad nikt nie zmieni” | na devnecie program można aktualizować (upgrade authority) | „zasady są zapisane w umowie i jednakowe dla wszystkich” |
| cena w zł jako pewna kwota | program nie zna kursu, bo nie ma wyroczni cenowej (np. Pyth) | „≈ 42 zł (orientacyjnie)”, zawsze obok kwoty w SOL (P1) |
| nic o widoczności nagrań | bucket jest publiczny, a ścieżki da się wyprowadzić z adresu transakcji | ostrzeżenie przed nagraniem (§5.6) i w `ConfirmSheet` reklamacji |

---

## 3. System wizualny

Plik `app/src/ui/theme.ts` (O4, do 03:00).

### Kolory

Kolor główny to morski (teal). Ma kojarzyć się z bezpieczeństwem płatności, a nie z kryptowalutami, więc unikamy fioletów i neonowych gradientów.

| Token | Wartość | Użycie |
|---|---|---|
| `bg` | `#FFFFFF` | tło ekranów |
| `surface` | `#F4F5F7` | karty, pola formularzy, szkielety |
| `border` | `#E2E5E9` | obramowania, separatory |
| `text` | `#14171A` | tekst główny |
| `textMuted` | `#5F6B76` | opisy, podpisy, terminy |
| `primary` / `onPrimary` | `#0F766E` / `#FFFFFF` | główne przyciski, aktywna zakładka, „środki w umowie” |
| `success` / `successBg` | `#15803D` / `#DCFCE7` | zgodność ✓, zakończone, wypłata |
| `warning` / `warningBg` | `#B45309` / `#FEF3C7` | spór, zwrot, lista wad, termin < 2 min |
| `danger` / `dangerBg` | `#B91C1C` / `#FEE2E2` | błędy, „Reklamuję”, nagrywanie |
| `info` / `infoBg` | `#1D4ED8` / `#DBEAFE` | w toku, wskazówki |
| `seller` | `#C2410C` | wyłącznie pasek roli „Sprzedający” |
| `buyer` | `#4338CA` | wyłącznie pasek roli „Kupujący” |

- Kolorów ról nie używamy nigdzie poza paskiem roli, żeby nie myliły się ze statusami.
- Tryb jasny jest wymuszony przez `"userInterfaceStyle": "light"` w `app.json`.

### Typografia (font systemowy)

| Styl | Rozmiar / grubość | Użycie |
|---|---|---|
| `display` | 32 / 700 | saldo, kwota na ekranie sukcesu, ostatnia minuta odliczania (§7.2) |
| `title` | 24 / 700 | tytuł ekranu, cena w ogłoszeniu |
| `heading` | 18 / 600 | nagłówki sekcji, karta „Co teraz?”, cena na kaflu |
| `body` | 16 / 400 | treść |
| `small` | 14 / 400 | podpisy, terminy, link do Explorera |

- Nic mniejszego niż 14 (rzutnik).
- Numery przesyłek i adresy piszemy monospace: `Platform.select({ ios: "Menlo", android: "monospace" })`.
- Liczniki mają `fontVariant: ["tabular-nums"]`, żeby cyfry nie skakały.

### Odstępy i kształty

- Skala odstępów: 4, 8, 12, 16, 24, 32. Margines ekranu: 16.
- Promień zaokrąglenia: 12 (karty, przyciski, pola), 999 (chipy, plakietki).
- Przycisk: wysokość 52, pełna szerokość, tekst 16/600. Cel dotyku min. 48×48, także dla linków.
- Bez cieni. Karta to `surface` + `border` 1 px.

### Ikony

Używamy `@expo/vector-icons` (Ionicons). Są w szablonie Expo i działają w Expo Go. Emoji w interfejsie nie stosujemy; wyjątkiem jest znak ✓ w komunikatach zgodności. Na szkicach symbole (🔒, ⏱) zastępują Ionicons.

### Formaty (`app/src/ui/format.ts`, O4)

| Co | Reguła | Przykład |
|---|---|---|
| kwota | `formatSol(lamports)`: przecinek dziesiętny, bez zbędnych zer, maks. 4 miejsca, liczone na BigInt (bez floatów) | „0,05 SOL”, „1,2345 SOL” |
| kwota w zł (P1) | `formatPlnApprox(lamports)` ze stałej `SOL_PLN_APPROX` (kurs + data); zawsze z „≈”, nigdy bez SOL obok | „≈ 42 zł” |
| termin dziś | godzina | „do 14:35” |
| termin w inny dzień | dzień, skrót miesiąca, godzina | „do 6 paź, 14:35” |
| odliczanie | < 1 h: `mm:ss`; < 24 h: „2 h 15 min”; dłużej: „3 dni” | „zostało 08:12” |
| adres | 4 znaki + … + 4 znaki, dotknięcie kopiuje | „7xKX…9fA2” |
| długość nagrania | `m:ss` | „1:12” |
| rozmiar pliku | MB bez miejsc po przecinku | „38 MB” |
| reguły umowy | `TIMEOUTS` po ludzku | „10 min”, „3 dni” |

Pole ceny przyjmuje zarówno „0,05”, jak i „0.05”, bo polska klawiatura ma przecinek. Typ klawiatury: `decimal-pad`.

---

## 4. Komponenty wspólne

| Komponent | Właściciel | Opis |
|---|---|---|
| `Screen` | O4 | SafeArea + ScrollView + margines 16 + opcjonalne `onRefresh` (pull-to-refresh) + opcjonalny przyklejony dolny pasek na główny przycisk |
| `Button` | O4 | warianty `primary`, `secondary` (obrys), `danger` (czerwony obrys), `link`; `loading` (spinner w miejscu tekstu i blokada podwójnego kliknięcia); `disabled` z opcjonalnym podpisem dlaczego |
| `Card` | O4 | `surface` + `border`, promień 12, padding 16; opcjonalny nagłówek sekcji nad kartą (`small`, wersaliki, `textMuted`) |
| `Notice` | O4 | ramka z ikoną w wariantach `info`, `success`, `warning`, `danger`; tytuł, tekst, opcjonalny przycisk |
| `StatusBadge` | O4 | chip z etykietą statusu; kolor według tabeli niżej |
| `Countdown` | O4 | „do 14:35 · zostało 08:12” według `networkNow()` (§5.4), odświeżany co 1 s; poniżej 2 min w kolorze `warning`; po terminie „Termin minął” |
| `ExplorerLink` | O4 | wiersz o wysokości 48 i pełnej szerokości, tekst „Zobacz w Solana Explorer ↗” (`small`, `textMuted`); dyskretny dla użytkownika, łatwy do trafienia na scenie; przyjmuje `signature` albo `address` |
| `ConfirmSheet` | O4 | zgoda przed nieodwracalną operacją (§5.2) |
| `TxProgress` | O4 | kroki operacji z paskiem postępu wysyłania i dwoma rodzajami błędów (§5.3) |
| `SuccessView` | O4 | duży znak ✓, „Potwierdzone”, opcjonalna kwota (`display`), tekst, główny przycisk, `ExplorerLink` zawsze w tym samym miejscu pod przyciskiem |
| `BalanceGuard` | O4 | ostrzeżenie o braku środków na opłatę sieci z przyciskiem „Doładuj” na miejscu (§5.3) |
| `RoleBanner` | O4 | pasek pod nagłówkiem ekranów transakcji: „Jesteś sprzedającym” (`seller`), „Jesteś kupującym” (`buyer`) albo „Podgląd – nie jesteś stroną” (neutralny) |
| `DemoIdentityStrip` | O4 | cienki pasek na górze **każdego** ekranu z rolą i nazwą telefonu demo, np. „SPRZEDAJĄCY · Ania”; ustawiany w `/dev` (§6.13) |
| `RulesSheet` | O4 | „Jak działa ocena reklamacji”: zasady `decide()` po polsku i informacja, kto uruchamia weryfikatora (§8) |
| `NextStepCard` | O4 | karta „Co teraz?” (§7) |
| `Timeline` | O4 | przebieg + możliwe dalsze kroki (§6.6) |
| `VerdictCard` | O4 | decyzja weryfikatora ze ścieżką reguły (§8) |
| `DealRow` | O2 (O3 importuje) | wiersz na listach Sprzedaże i Zakupy (§6.4) |
| `RecordingChecklist` | O2 (O3 importuje) | lista „co musi być widać na nagraniu” + ramka „Jak oceniane są nagrania” (§5.6) |
| `ListingCard` | O3 | kafel na ekranie Przeglądaj |
| `QrCard`, `printQrCard` | O2 | karta QR do druku (już w zadaniach O2) |

Kolory `StatusBadge`:

| Ton | Statusy |
|---|---|
| neutralny (`surface` / `textMuted`) | `Listed`, `Cancelled` |
| `info` | `Paid`, `Shipped` |
| `warning` | `Disputed`, `ReturnRequested`, `Returning` |
| `success` | `Completed`, `Refunded` |

Logika, z której korzystają komponenty:

- **`app/src/ui/nextStep.ts` (O4)**
  - Czysta funkcja `nextStep(deal: DealView, me: string, networkNowSec: number)`.
  - Zwraca `{ role, funds, mover, title, deadline?, action?, ifNobodyActs, settle?: { label, unlocked, beneficiary } }` według macierzy z §7.
  - Korzystają z niej Szczegóły transakcji i listy O2/O3. Jedno źródło tekstów daje te same komunikaty na każdym ekranie.
- **`app/src/solana/clock.ts` (O4):** `networkNow()`, czyli czas sieci (§5.4).
- **`STATUS_SHORT_PL` w `packages/shared` (O4):**

  | Status | Etykieta |
  |---|---|
  | `Listed` | Wystawione |
  | `Paid` | Opłacone |
  | `Shipped` | W drodze |
  | `Disputed` | Reklamacja |
  | `ReturnRequested` | Reklamacja uznana |
  | `Returning` | Zwrot w drodze |
  | `Completed` | Zakończone |
  | `Refunded` | Środki zwrócone |
  | `Cancelled` | Anulowane |

---

## 5. Wzorce wspólne

### 5.1 Nawigacja

| Zakładka | Ikona (Ionicons) | Trasa | Plakietka (P1) |
|---|---|---|---|
| Przeglądaj | `search` | `(tabs)/index` | — |
| Wystaw | `add-circle` | `(tabs)/sell` | — |
| Sprzedaże | `pricetag` | `(tabs)/sales` | liczba pozycji „Wymaga działania” |
| Zakupy | `bag-handle` | `(tabs)/purchases` | liczba pozycji „Wymaga działania” |
| Portfel | `wallet` | `(tabs)/wallet` | czerwona kropka, gdy saldo nie wystarcza na opłatę |

Ekrany poza zakładkami otwierają się na stosie, z nagłówkiem i strzałką wstecz: `listing/[deal]`, `deal/[deal]`, `seller/[deal]/*`, `buyer/[deal]/*`, `dev`. `DemoIdentityStrip` (jeśli ustawiony) jest w root layoucie nad wszystkim.

### 5.2 Zgoda przed nieodwracalną operacją (`ConfirmSheet`)

```
┌─ Potwierdź zakup ────────────
│ Bluza Nike z kapturem · M
│
│ CO SIĘ STANIE
│ Zapłacisz do umowy. Środki poczekają
│ na Twoją decyzję po otwarciu paczki.
│
│ Kwota          0,05 SOL   ≈ 42 zł
│ Opłata sieci   ułamek grosza
│ Dokąd          do umowy, nie do sprzedającego
│
│ CZEGO NIE DA SIĘ COFNĄĆ
│ Nie wycofasz płatności sam. Środki wrócą
│ do Ciebie tylko według zasad umowy: gdy
│ sprzedający nie nada paczki w terminie
│ albo gdy po reklamacji odeślesz paczkę.
│
│ [        Zapłać 0,05 SOL         ]
│              Anuluj
└──────────────────────────────
```

Każdy arkusz ma cztery stałe sekcje: **co się stanie**, **kwota**, **dokąd trafią środki** i **czego nie da się cofnąć**. Główny przycisk nazywa skutek, np. „Zapłać 0,05 SOL”, a nie samo „OK”.

| Operacja | Co się stanie | Kwota → dokąd | Czego nie da się cofnąć | Przycisk |
|---|---|---|---|---|
| Zakup (§6.2) | „Zapłacisz do umowy. Środki poczekają na Twoją decyzję po otwarciu paczki.” + zasady umowy i akceptacja weryfikatora | cena → do umowy | „Nie wycofasz płatności sam…” (jak na szkicu) | „Zapłać 0,05 SOL” |
| „Wszystko OK” (§6.8) | „Potwierdzasz, że paczka jest w porządku.” | cena → do sprzedającego | „Nie złożysz już reklamacji.” | „Przekaż 0,05 SOL sprzedającemu” |
| Reklamacja (§6.9) | „Wysyłasz nagranie i opis do oceny.” | środki zostają w umowie | „Nagrania i opisu nie zmienisz ani nie wycofasz. Nagranie będzie dostępne pod publicznym linkiem.” | „Wyślij reklamację” |
| Potwierdź zwrot (§6.11) | „Potwierdzasz, że paczka zwrotna dotarła.” | cena → do kupującego | „Nie zakwestionujesz już zwrotu.” | „Oddaj 0,05 SOL kupującemu” |
| Rozliczenie po terminie przez kogoś, komu środki się nie należą (§7.2) | „Rozliczasz umowę po terminie, według jej zasad.” | cena → do strony z tabeli §7.2 | „Tego nie da się cofnąć.” | etykieta z §7.2 |

Bez arkusza:

- **Wystaw:** koszt wystawienia jest widoczny nad przyciskiem (§6.3).
- **Nadaj paczkę i Odeślij paczkę:** nie przesuwają pieniędzy, a krok z numerem przesyłki jest podsumowaniem.
- **Doładuj.**
- **„Odbierz środki” wciskane przez stronę, której środki się należą:** jedno kliknięcie to sedno demo (§7.2).
- **Anuluj ogłoszenie:** wystarczy zwykły `Alert` „Anulować? Ogłoszenia nie da się przywrócić.”

### 5.3 Cykl operacji: saldo → plik → umowa

Operacja z nagraniem (nadanie, reklamacja, odesłanie) ma dwie fazy, które mogą zawieść z różnych powodów. Plik może się nie wysłać przez internet albo Supabase. Zapis w umowie może się nie udać przez sieć Solana. `TxProgress` pokazuje obie fazy osobno:

```
✓ Sprawdzam nagranie
◌ Wysyłam nagranie   ▓▓▓▓▓▓░░░░  23 / 38 MB
○ Zapisuję w umowie
```

**Saldo (`BalanceGuard`)**

Każda czynność kosztuje opłatę sieci. Użytkownik z zerowym saldem nie zrobi nic, nawet nie potwierdzi odbioru paczki. Dlatego „Doładuj testowe SOL” jest warunkiem działania całego przepływu, a nie dodatkiem.

- Progi:
  - każda czynność: `MIN_FEE_BALANCE` = 0,001 SOL (pojedyncza opłata to ok. 0,000005 SOL, reszta to zapas);
  - Wystaw: depozyt konta (`getMinimumBalanceForRentExemption`) + opłata;
  - Kup: cena + 0,001 SOL.
- Saldo poniżej progu daje `Notice danger` w miejscu przycisku akcji: „Masz za mało środków na opłatę sieci. Bez tego nie potwierdzisz odbioru ani nie złożysz reklamacji.” Obok przycisk „Doładuj testowe SOL”, który działa na miejscu, bez przechodzenia do Portfela. Przycisk akcji jest nieaktywny.
- Saldo równe 0 daje dodatkowo pasek na górze Przeglądaj i Portfela: „Twój portfel jest pusty. Doładuj testowe SOL, żeby kupować i sprzedawać.”
- Po doładowaniu saldo odświeża się samo, a przycisk akcji się odblokowuje.

**Plik (upload)**

- Przed startem, gdy plik ma powyżej 25 MB: „Nagranie ma 38 MB. Na wolnym internecie wysyłanie potrwa dłużej – najlepiej użyj stabilnego Wi-Fi albo LTE.”
- W trakcie widać pasek postępu z MB i procentami. `uploadFile(path, uri, contentType, onProgress)` (O4); postęp daje `createUploadTask` z `expo-file-system/legacy`, co trzeba potwierdzić w spike'u.
- Ekran nie gaśnie w trakcie wysyłania (§13). Wyjście z ekranu pyta: „Przerwać wysyłanie? Nagranie zostanie na telefonie.”
- Gdy przez 20 s nie ma postępu: „Wysyłanie stoi. Sprawdź internet.” + „Spróbuj ponownie” (plik wysyłamy od początku).

**Zapis w umowie (potwierdzenie sieci)**

| Faza | Tekst w `TxProgress` | Uwagi |
|---|---|---|
| przygotowanie i podpis | „Zapisuję w umowie…” | lokalnie, < 1 s |
| wysłano, czekamy | „Czekam na potwierdzenie sieci (zwykle kilka sekund)…” | sloty co ok. 250–400 ms, ale potwierdzenie nie jest natychmiastowe |
| ponad 15 s | „Trwa to dłużej niż zwykle…” | — |
| `confirmed` | ✓ i `SuccessView` „Potwierdzone” | **dopiero teraz** pokazujemy sukces; nie używamy poziomu `processed` |
| wygasło (blockhash, rzędu minuty) | najpierw `fetchDeal`: jeśli status się zmienił, pokazujemy sukces; jeśli nie, „Operacja nie doszła do skutku. Nic się nie zmieniło – środki są tam, gdzie były.” + „Spróbuj ponownie” | ponowienie buduje nową operację ze świeżym blockhashem |

**Dwa rodzaje awarii**

| Gdzie | Komunikat | Co jest bezpieczne | Przycisk |
|---|---|---|---|
| plik (internet, Supabase) | „Nie udało się wysłać nagrania. Sprawdź internet.” | „Nagranie jest zapisane na telefonie. W umowie nic się nie zmieniło.” | „Spróbuj ponownie” (wysyła plik od nowa) |
| umowa (sieć Solana) | „Nagranie jest wysłane, ale nie udało się go zapisać w umowie.” | „Środki są tam, gdzie były.” | „Spróbuj ponownie” (tylko zapis w umowie) |

**Po udanym uploadzie „Nagraj ponownie” znika.** Pliki w storage są niezmienne (`upsert: false`), więc ponawiamy już tylko zapis w umowie z tym samym hashem. Gdyby hash w umowie nie zgadzał się z plikiem, spór przegrałby autor nagrania.

### 5.4 Czas sieci

Program liczy terminy według `Clock::unix_timestamp`, czyli czasu sieci, a nie zegara telefonu. Różnica może wynosić od kilku do kilkunastu sekund.

- `app/src/solana/clock.ts` (O4):
  - czyta konto zegara sieci (`SYSVAR_CLOCK_PUBKEY`; `unix_timestamp` to i64 little-endian od bajtu 32);
  - na ekranie transakcji robi to w tym samym zapytaniu co odczyt umowy: `getMultipleAccountsInfo([deal, SYSVAR_CLOCK_PUBKEY])`;
  - `networkNow()` = ostatni odczyt + czas, który upłynął na telefonie od tego odczytu.
- Każdy `Countdown`, odblokowanie przycisku po terminie i ukrywanie akcji stron liczymy z `networkNow()`.
- Przycisk rozliczenia odblokowuje się przy `networkNow() ≥ termin + 2 s`. Lepiej, żeby pojawił się chwilę później, niż żeby kliknięcie zwróciło błąd na scenie. Gdy telefon pokazuje już 00:00, a sieć jeszcze nie: „Sprawdzam termin w sieci…”.
- Przy nagraniach (nadanie, otwarcie, odesłanie): gdy do terminu zostało mniej niż 3 min, przed startem pokazujemy „Zostało mniej niż 3 min. Możesz nie zdążyć z nagraniem i wysłaniem.”

### 5.5 Przepływy wieloetapowe

Dotyczy ekranów Spakuj i nadaj, Nagraj otwarcie oraz Odeślij paczkę.

- Pod nagłówkiem: `RoleBanner` i pasek „Krok 2 z 4”.
- Na każdym kroku pasek terminu: `Countdown` + jedno zdanie o tym, co się stanie po terminie.
- Po sukcesie `router.replace("/deal/[deal]")`, żeby „wstecz” nie wracało do kamery.
- „Wstecz” w trakcie nagrywania pyta: „Przerwać nagrywanie? Nagranie zostanie usunięte.”

### 5.6 Wzorzec ekranu nagrywania

Dotyczy O2 i O3; kamerę dostarcza `Recorder` z `app/src/media` (O4).

**1. Przed nagraniem** (`RecordingChecklist`)

- Lista punktów, które muszą być widoczne (konkretne listy w §6.7, §6.8, §6.10).
- Ramka „Jak oceniane są nagrania”. Zasady trzeba znać, zanim zacznie się nagrywać:
  - „Nagranie musi być ciągłe – bez cięć i pauz.”
  - kupujący: „Zacznij od zamkniętej paczki. Karta z kodem ma się pojawić dopiero po otwarciu.”
  - sprzedający: „Musi być widać ubranie, wkładaną kartę, zaklejenie i etykietę.”
  - „Słabe, ucięte albo zasłonięte nagranie działa przeciw jego autorowi. Tak liczy jawna reguła oceny.” + link „Zobacz zasady oceny ›” (`RulesSheet`)
  - „Jeśli nagranie trafi do oceny, będzie dostępne pod publicznym linkiem. Nie pokazuj twarzy ani dokumentów. Adres na etykiecie możesz zasłonić, ale numer przesyłki musi być czytelny.”
- Przycisk „Rozumiem, nagrywam”.

**2. Nagrywanie** (pełny ekran z nakładkami)

```
┌──────────────────────────────
│ ● 0:42  ▓▓▓▓▓▓░░░░░░░░  2:00        ← pasek limitu 2 min
│                  [Szukam karty…]    ← pastylka kodu, tylko u kupującego
│    ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│    │    paczka w kadrze     │       ← ramka kadru: przerywana,
│    └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘          półprzezroczysta
│ Pokaż etykietę z numerem            ← podpowiedź: bieżący punkt listy,
│ INP 6123 4567 8901                     dotknięcie przełącza na następny
│               ( ■ )                 ← stop, 72 px, czerwony
└──────────────────────────────
```

- Czerwona kropka, licznik i pasek limitu są zawsze widoczne. Od 1:45 mają kolor `warning`, a po 2:00 nagranie zatrzymuje się samo.
- Ramka kadru tylko podpowiada; nie wymuszamy jej i nie analizujemy obrazu.
- Ekran nie może zgasnąć w trakcie nagrania (`useKeepAwake`, §13).

**3. Po nagraniu**

- Podsumowanie „Nagranie 1:12 · 38 MB”, przyciski „Nagraj ponownie” (obrys) i „Dalej” (główny).
- Podgląd z odtwarzaniem to P2, bo wymaga `expo-video`.
- Plik przenosimy z cache do `documentDirectory`, żeby system nie usunął go przed decyzją.

---

## 6. Ekrany

Szkice mają szerokość telefonu. Napisy w szkicach są skrócone; pełne teksty są w punktach pod szkicem.

### 6.1 Przeglądaj — `(tabs)/index.tsx` (O3)

```
┌─ Przeglądaj ─────────────────
│ unboxproof
│ Używane ubrania. Pieniądze czekają
│ w umowie, nie u pośrednika.
│ ┃ Twój portfel jest pusty. [Doładuj]   ← tylko przy saldzie 0
│
│ ┌────────────┐ ┌────────────┐
│ │  [zdjęcie] │ │  [zdjęcie] │
│ │ 0,05 SOL   │ │ 0,12 SOL   │
│ │ Bluza Nike │ │ Kurtka jea…│
│ │ M · B.dobry│ │ L · Dobry  │
│ └────────────┘ └────────────┘
└──────────────────────────────
```

- Siatka w 2 kolumnach (`FlatList numColumns={2}`). Kafel `ListingCard` zawiera:
  - kwadratowe zdjęcie (pierwsze z `photos`);
  - cenę (`heading`);
  - tytuł w jednej linii z wielokropkiem;
  - „rozmiar · stan” (`small`, `textMuted`).
- Własne ogłoszenia mają plakietkę „Twoje” w rogu zdjęcia.
- Ogłoszenia z niezgodnym `listing_hash` są ukryte (ostrzeżenie w konsoli).
- Kolejność: najnowsze na górze (`deal_id` malejąco).
- Odświeżanie: pull-to-refresh i przy każdym wejściu na zakładkę.
- Stany (§10):
  - **ładowanie:** 4 szare kafle, a po 5 s dopisek „Wczytywanie trwa dłużej niż zwykle…”;
  - **pusto:** „Na razie nic tu nie ma.” + przycisk „Wystaw coś jako pierwszy”;
  - **błąd:** `Notice danger` „Nie udało się pobrać ogłoszeń. Sieć testowa bywa przeciążona.” + „Spróbuj ponownie”.
- Dotknięcie kafla otwiera `listing/[deal]`.

### 6.2 Szczegóły ogłoszenia — `listing/[deal].tsx` (O3)

```
┌─ ← ──────────────────────────
│ [   zdjęcie 1/3, przewijane   ]
│            • ○ ○
│ 0,05 SOL   ≈ 42 zł
│ Bluza Nike z kapturem
│ (M) (Nike) (Bardzo dobry)
│
│ ┃ Wady zgłoszone przez sprzedającego
│ ┃ • mała plama na mankiecie
│ ┃ • sprane logo
│
│ Opis
│ Noszona jeden sezon…
│
│ ✓ Opis zapisany w umowie – sprzedający
│   nie może go zmienić
│
│ JAK CHRONIONA JEST PŁATNOŚĆ
│ 🔒 Płacisz do umowy, nie sprzedającemu…
│ 🎥 Paczkę otwierasz, nagrywając…
│ ⚖  Reklamację ocenia Weryfikator AI…
│
│ Sprzedający  7xKX…9fA2
├──────────────────────────────
│ [      Kup za 0,05 SOL      ]
└──────────────────────────────
```

**Treść**

- Zdjęcia: poziomy `ScrollView` z `pagingEnabled` i kropkami pod spodem.
- Kwota w zł (P1) jest zawsze obok SOL, z „≈”.
- Wady są zawsze nad opisem, w `Notice warning` z listą. Pusta lista daje `Notice success` „Sprzedający zaznaczył: brak wad.”
- „✓ Opis zapisany w umowie – sprzedający nie może go zmienić” pokazujemy po sprawdzeniu `listing_hash`.
- Karta „Jak chroniona jest płatność” (ikony `lock-closed`, `videocam`, `scale`):
  - „Płacisz do umowy, nie sprzedającemu. Środki czekają, aż potwierdzisz odbiór.”
  - „Paczkę otwierasz, nagrywając w aplikacji. Jeśli coś jest nie tak, zgłaszasz reklamację z nagraniem.”
  - „Reklamację ocenia Weryfikator AI według jawnych zasad, na podstawie nagrań obu stron. Zasady i terminy są zapisane w umowie i jednakowe dla wszystkich.” + link „Zobacz zasady oceny ›”

**Dolny przycisk**

| Sytuacja | Co widać |
|---|---|
| normalnie | „Kup za 0,05 SOL” |
| własne ogłoszenie | „To Twoje ogłoszenie” + „Zarządzaj” (otwiera `deal/[deal]`, tam jest „Anuluj ogłoszenie”) |
| za mało środków | `BalanceGuard`: „Masz 0,02 SOL, a potrzebujesz 0,051 SOL (cena + opłata sieci).” + „Doładuj testowe SOL” |
| status inny niż `Listed` | nieaktywny „Już sprzedane” |
| opis niezgodny z zapisem | brak przycisku, `Notice danger` „Opis nie zgadza się z zapisem w umowie. Nie kupuj.” |

**Potwierdzenie zakupu** (`ConfirmSheet`, §5.2)

Pod sekcjami ze szkicu w §5.2 arkusz ma jeszcze:

```
│ ZASADY TEJ UMOWY
│ • sprzedający nadaje w ciągu 10 min
│ • po nadaniu masz 60 min na nagranie
│   otwarcia i decyzję
│ • jeśli zgłosisz reklamację, oceni ją
│   Weryfikator AI (9ZzQ…k2Pm) według
│   jawnych zasad. Kupując, akceptujesz
│   tego weryfikatora.  Zobacz zasady ›
```

- Terminy bierzemy z `TIMEOUTS` w shared i formatujemy po ludzku. Na produkcji te same ekrany pokażą „3 dni” i „7 dni” bez zmian w kodzie.
- Adres weryfikatora to `ORACLE_PUBKEY` z shared, ten sam, który trafia do `expected_arbiter`. Zdanie „Kupując, akceptujesz tego weryfikatora” jest ludzkim odpowiednikiem tego argumentu. Bez niego akceptacja arbitra byłaby tylko udawaniem zgody.
- `TxProgress`: „Zabezpieczam środki w umowie…” → „Czekam na potwierdzenie sieci…”.
- Sukces (`SuccessView`):
  - tytuł „Kupione”, kwota „0,05 SOL zabezpieczone w umowie”;
  - tekst „Sprzedający ma czas do 14:35 na nadanie paczki. Jeśli nie zdąży, odbierzesz środki jednym kliknięciem, bez niczyjej zgody.”;
  - przycisk „Przejdź do zakupu”, który robi `router.replace("/deal/[deal]")`.

### 6.3 Wystaw — `(tabs)/sell.tsx` (O2)

```
┌─ Wystaw ubranie ─────────────
│ ┌────┐┌────┐┌────┐┌────┐
│ │ +  ││img ││img ││    │   1–4 zdjęcia, tylko aparat
│ │Zrób││ ✕  ││ ✕  ││    │
│ └────┘└────┘└────┘└────┘
│ Tytuł    [Bluza Nike z kapturem   ]
│ Marka    [Nike                    ]
│ Rozmiar  (XS)(S)(M)(L)(XL)(XXL)(Inny)
│ Stan     (Nowy z metką)(Bardzo dobry)
│          (Dobry)(Zadowalający)
│ Opis     [                        ]
│
│ Wady
│ Wypisz wszystko, co widać…
│ ( ) Brak wad   (•) Ma wady
│ [mała plama na mankiecie       ✕]
│ + Dodaj wadę
│
│ Cena     [0,05                 SOL]
│ Kupujący płaci dokładnie tyle.
│ Bez prowizji platformy.
│
│ Koszt wystawienia: ok. 0,0055 SOL
│ (opłata sieci za zapis umowy)
│ ⓘ Po wystawieniu opisu nie da się zmienić.
├──────────────────────────────
│ [      Wystaw ogłoszenie      ]
└──────────────────────────────
```

**Formularz**

- Zdjęcia:
  - pierwsze jest okładką;
  - ✕ usuwa zdjęcie;
  - kafel „+” znika po dodaniu czwartego.
- Rozmiar i stan wybiera się chipami. „Inny” rozmiar otwiera pole tekstowe. Wartości zapisujemy po polsku tak, jak je widać, bo trafiają do `metadata.json` i do promptu weryfikatora.
- **Wady to wybór obowiązkowy.**
  - Na starcie żadna opcja nie jest zaznaczona.
  - „Ma wady” wymaga co najmniej jednej linijki.
  - Podpowiedź pod nagłówkiem: „Wypisz wszystko, co widać: plamy, dziury, przetarcia, zapach. Nieujawniona wada to najczęstszy powód uznanej reklamacji.”
- **Koszt wystawienia** liczymy z `getMinimumBalanceForRentExemption(rozmiar Deal)` + opłaty. To uczciwa informacja zamiast „tylko ułamek grosza” (§13, pkt 5). `BalanceGuard` sprawdza, czy saldo go pokrywa.
- Walidacja po „Wystaw” przewija do pierwszego błędu i pokazuje czerwony komunikat pod polem:
  - „Dodaj co najmniej jedno zdjęcie”;
  - „Podaj cenę większą od zera”;
  - „Zaznacz, czy ubranie ma wady”.

**Operacja**

- `TxProgress`: „Wysyłam zdjęcia (2/3)…” → „Zapisuję opis…” → „Wystawiam ogłoszenie…” → „Czekam na potwierdzenie sieci…”.
- Sukces: „Ogłoszenie wystawione” + „Zobacz ogłoszenie” (otwiera `listing/[deal]`) + „Wystaw kolejne” (czyści formularz).
- Błąd po uploadzie: formularz się blokuje, bo pliki są już w storage, a „Spróbuj ponownie” ponawia sam zapis w umowie z tym samym `dealId`.

### 6.4 Moje sprzedaże — `(tabs)/sales.tsx` (O2) i 6.5 Moje zakupy — `(tabs)/purchases.tsx` (O3)

Oba ekrany mają ten sam układ i ten sam komponent `DealRow`.

```
┌─ Sprzedaże ──────────────────
│ WYMAGA DZIAŁANIA (1)
│ ┌────────────────────────────
│ │ [img] Bluza Nike · 0,05 SOL
│ │       [Opłacone – czeka na wysyłkę]
│ │       Twój ruch: nadaj do 14:35 · 08:12
│ │       [     Spakuj i nadaj     ]
│ └────────────────────────────
│ W TOKU
│ [img] Kurtka jeans · 0,12 SOL
│       [W drodze]
│       Ruch kupującego: do 15:20
│ WYSTAWIONE
│ [img] Sweter · 0,03 SOL  [Wystawione]
│ ZAKOŃCZONE
│ …
└──────────────────────────────
```

- Sekcje:
  - **„Wymaga działania”**: mój ruch albo termin minął i środki należą się mnie;
  - **„W toku”**;
  - **„Wystawione”** (tylko w Sprzedażach);
  - **„Zakończone”**: `Completed`, `Refunded`, `Cancelled` (zwinięte to P1).
- Wiersz zawiera miniaturę, tytuł, cenę, `StatusBadge` i linijkę z `nextStep()`: kto ma ruch + `Countdown`.
- W sekcji „Wymaga działania” przycisk akcji jest w samym wierszu. Dotknięcie reszty wiersza otwiera `deal/[deal]`.
- Odświeżanie: pull-to-refresh i przy wejściu na zakładkę; co 10 s, gdy ekran jest aktywny (P1).
- **Pusto:**
  - Sprzedaże: „Nie masz jeszcze ogłoszeń.” + „Wystaw pierwsze”;
  - Zakupy: „Nie masz jeszcze zakupów.” + „Przeglądaj ogłoszenia”.

Przyciski w wierszu:

| Lista | Status | Przycisk |
|---|---|---|
| Sprzedaże | `Paid` | „Spakuj i nadaj” → `seller/[deal]/pack` |
| Sprzedaże | `Returning` | „Potwierdź zwrot” → `seller/[deal]/confirm-return` |
| Zakupy | `Shipped` | „Nagraj otwarcie” → `buyer/[deal]/unbox` |
| Zakupy | `ReturnRequested` | „Odeślij paczkę” → `buyer/[deal]/return` |
| obie | termin minął, środki należą się mnie | „Odbierz środki” → `deal/[deal]` (przycisk jest tam; logiki nie dublujemy) |

### 6.6 Szczegóły transakcji — `deal/[deal].tsx` (O4)

To centrum aplikacji: wszystkie listy prowadzą tutaj, a stąd przyciski prowadzą do ekranów z kamerą. Rolę ustalamy tak:

- `me == seller` → sprzedający;
- `me == buyer` → kupujący;
- inaczej obserwator: widzi wszystko, ale może tylko rozliczyć umowę po terminie.

```
┌─ ← Transakcja ───────────────
│ ███ Jesteś kupującym ████████  ← RoleBanner (kolor buyer)
│ [img] Bluza Nike z kapturem
│       0,05 SOL   [W drodze]
│
│ CO TERAZ?
│ ┌────────────────────────────
│ │ 🔒 0,05 SOL zabezpieczone w umowie
│ │ Twój ruch: nagraj otwarcie paczki
│ │ ⏱ do 15:20 · zostało 47:12
│ │ [      Nagraj otwarcie      ]
│ │ ─────────────────────────────
│ │ Jeśli nikt nic nie zrobi: po 15:20
│ │ sprzedający może odebrać środki
│ │ bez Twojej zgody.
│ └────────────────────────────
│
│ PRZEBIEG
│ ✓ Wystawione
│ ✓ Opłacone
│ ● W drodze · od 14:20
│ MOŻLIWE DALSZE KROKI
│ → Ty: „Wszystko OK” → Zakończone
│ → Ty: reklamacja → Reklamacja
│ → po 15:20, każdy → Zakończone
│
│ DOWODY
│ Opis ogłoszenia      ✓ zgodny z zapisem
│ Nagranie pakowania   Otwórz ↗
│ Numer przesyłki      INP 6123 4567 8901
│
│ STRONY
│ Sprzedający   7xKX…9fA2
│ Kupujący      3aBc…77Qe (Ty)
│ Weryfikator   9ZzQ…k2Pm
│
│ Zobacz w Solana Explorer ↗
└──────────────────────────────
```

Sekcje od góry:

1. **`RoleBanner`** i nagłówek: miniatura, tytuł, cena, `StatusBadge`.
2. **Co teraz?** `NextStepCard` według macierzy z §7. Odpowiada na cztery pytania z §1 i zawiera `BalanceGuard`, jeśli mam ruch, a saldo nie wystarcza. W stanach końcowych karta staje się podsumowaniem, np. „Zakończone. 0,05 SOL trafiło do sprzedającego.”
3. **Decyzja weryfikatora** (`VerdictCard`, §8). Widoczna, gdy był spór.
4. **Przebieg** (`Timeline`). Odwzorowuje maszynę stanów z `CLAUDE.md` §4 jeden do jednego. Nie upraszczamy rozgałęzień (spór, zwrot), bo juror porównuje UI z kodem.
   - **Kroki przebyte:** etykiety z `STATUS_SHORT_PL`, ✓ dla przeszłych i ● z „od 14:20” (`status_changed_at`) dla bieżącego. Konto nie przechowuje historii, więc ścieżkę odtwarzamy z pól:

     | Status | Pokazany jako przebyty, gdy |
     |---|---|
     | `Listed` | zawsze |
     | `Paid` | `buyer ≠ default` |
     | `Shipped` | `packing_video_hash ≠ 0` |
     | `Disputed` | `complaint_hash ≠ 0` |
     | `ReturnRequested` | `complaint_hash ≠ 0`, `verdict ≠ Seller` i status ≠ `Disputed` |
     | `Returning` | `return_video_hash ≠ 0` |
     | `Completed` / `Refunded` / `Cancelled` | to jest bieżący status |

   - **Jak doszło do kroku**, gdy da się to odtworzyć:
     - `Refunded` bez nadania → „po terminie nadania”;
     - `ReturnRequested` bez werdyktu → „po terminie oceny”;
     - `Completed` z werdyktem `Seller` → „decyzja weryfikatora”.
   - **P1: historia z eventów.** Eventy `DealStatusChanged` (`getSignaturesForAddress` dla konta + logi transakcji) dają przy każdym kroku datę, sposób przejścia (akcja strony, decyzja weryfikatora, „po terminie”) i własny link do Explorera. To najmocniej pokazuje jury, że każdy krok jest potwierdzony w sieci.
   - **Możliwe dalsze kroki:** wszystkie wyjścia z bieżącego statusu według `CLAUDE.md` §4 i tabeli `settle_expired`, z informacją, kto je wykonuje:

     | Status | Możliwe dalsze kroki |
     |---|---|
     | `Listed` | kupujący płaci → Opłacone; sprzedający anuluje → Anulowane |
     | `Paid` | sprzedający nadaje → W drodze; po terminie, każdy → Środki zwrócone |
     | `Shipped` | kupujący: „Wszystko OK” → Zakończone; kupujący: reklamacja → Reklamacja; po terminie, każdy → Zakończone |
     | `Disputed` | weryfikator odrzuca → Zakończone; weryfikator uznaje → Reklamacja uznana; po terminie, każdy → Reklamacja uznana |
     | `ReturnRequested` | kupujący odsyła → Zwrot w drodze; po terminie, każdy → Zakończone |
     | `Returning` | sprzedający potwierdza → Środki zwrócone; po terminie, każdy → Środki zwrócone |

5. **Dowody.** Puste wiersze są ukryte.

   | Wiersz | Źródło | Akcja |
   |---|---|---|
   | Opis ogłoszenia | `metadata.json` | „✓ zgodny z zapisem” po sprawdzeniu `listing_hash` |
   | Nagranie pakowania | `deals/<deal>/packing.mp4` | „Otwórz ↗” (`Linking.openURL`, odtwarza przeglądarka) |
   | Numer przesyłki | `tracking_number` | dotknięcie kopiuje |
   | Nagranie otwarcia | `unboxing.mp4` (tylko przy reklamacji) | „Otwórz ↗” |
   | Reklamacja | `complaint.json` | kategoria i opis w treści |
   | Nagranie i numer zwrotu | `return-packing.mp4`, `return_tracking_number` | jak wyżej |

   Telefon nie hashuje nagrań, bo każde ma do 60 MB. Robi to weryfikator, a jego raport mówi, czy pliki się zgadzają.
6. **Strony:** sprzedający, kupujący i weryfikator jako skrócone adresy, z dopiskiem „(Ty)”; dotknięcie kopiuje.
7. **Stopka:** `ExplorerLink` do ostatniej operacji (`getSignaturesForAddress(deal, { limit: 1 })`) i do konta umowy.

Odświeżanie:

- co 3–5 s, gdy ekran jest aktywny (`useFocusEffect`): umowa i zegar sieci w jednym zapytaniu (§5.4);
- natychmiast po każdej akcji;
- P1: gdy status zmieni się w tle (np. przyjdzie werdykt), karta „Co teraz?” krótko się podświetla.

### 6.7 Spakuj i nadaj — `seller/[deal]/pack.tsx` (O2)

Kroki: **1 Karta → 2 Instrukcja → 3 Nagranie → 4 Numer przesyłki → wysyłka**.

Na każdym kroku pasek terminu: „Nadaj do 14:35 (zostało 08:12). Potem kupujący może odebrać środki bez Twojej zgody.”

**Krok 1. Karta z kodem**

```
┌─ ← Spakuj i nadaj   Krok 1 z 4
│ ███ Jesteś sprzedającym ███████
│ ┌────────────────────────────
│ │  [podgląd karty QR z linią zgięcia]
│ └────────────────────────────
│ Wydrukuj kartę, złóż ją na pół kodem
│ do środka i włóż do paczki. Kupujący
│ zeskanuje ją przy otwieraniu.
│ [ Drukuj kartę ]  [ Zapisz PDF ]
│ ⓘ Karta musi być w paczce: bez niej
│   kupujący nie potwierdzi odbioru.
├──────────────────────────────
│ [   Karta wydrukowana – dalej   ]
└──────────────────────────────
```

- Sekret generujemy i zapisujemy w `secure-store` przy wejściu na ekran.
- Jeśli sekret już istnieje, używamy go i pokazujemy „Ta karta jest już wygenerowana – możesz ją wydrukować ponownie”.

**Krok 2. Instrukcja** (`RecordingChecklist` + ramka zasad z §5.6)

- „Pokaż ubranie ze wszystkich stron.”
- „Pokaż z bliska wady z opisu:” i pod spodem `defects` z `metadata.json`. To chroni sprzedającego w sporze.
- „Pokaż złożoną kartę (kodem do środka) i włóż ją do paczki.”
- „Zaklej paczkę taśmą.”
- „Pokaż etykietę przewoźnika z czytelnym numerem przesyłki. Adres możesz zasłonić.”

**Krok 3. Nagranie** według wzorca z §5.6. Podpowiedzi to punkty z listy.

**Krok 4. Numer przesyłki**

- Pole tekstowe: wielkie litery, monospace, maks. 32 znaki, licznik „12/32”.
- Podpowiedź: „Ten sam numer, który widać na etykiecie w nagraniu.”
- Podsumowanie przed wysłaniem: „Nagranie 1:12 · 38 MB · numer INP 6123…”.
- Przycisk „Nadaj paczkę”.

**Operacja**

- `TxProgress` (§5.3): „Sprawdzam nagranie…” → „Wysyłam nagranie…” (pasek MB) → „Zapisuję nadanie w umowie…” → „Czekam na potwierdzenie sieci…”.
- Sukces: „Paczka w drodze” · „Środki czekają w umowie na decyzję kupującego. Kupujący ma czas do 15:35.” · przycisk „Wróć do transakcji”.

### 6.8 Nagraj otwarcie — `buyer/[deal]/unbox.tsx` (O3)

**Ten ekran pokazujemy na żywo** (transakcja A w `CLAUDE.md` §11).

Kroki: **1 Instrukcja → 2 Nagranie z wykrywaniem kodu → (2a skan kodu, jeśli nie wykryto) → 3 Decyzja**.

Na każdym kroku pasek terminu: „Zdecyduj do 15:20 (zostało 47:12). Potem sprzedający może odebrać środki bez Twojej zgody.”

**Krok 1. Instrukcja** (`RecordingChecklist` + ramka zasad z §5.6)

- „Zacznij od zamkniętej paczki – pokaż ją ze wszystkich stron.”
- „Pokaż etykietę. Numer powinien się zgadzać: **INP 6123 4567 8901**” (z `tracking_number`).
- „Otwieraj w kadrze, bez przerw.”
- „Pokaż kartę z kodem – aplikacja sama ją rozpozna.”
- „Pokaż całe ubranie, z bliska każdą wadę.”
- `Notice info`: „Nagranie zostaje na Twoim telefonie. Wyślemy je tylko, jeśli zgłosisz reklamację.”

**Krok 2. Nagranie** według wzorca z §5.6, z pastylką kodu u góry:

| Stan | Pastylka |
|---|---|
| szukanie | szara: „Szukam karty z kodem…” |
| kod zgodny | zielona: „Kod zgodny ✓” (zostaje do końca nagrania) |
| kod z innej paczki | czerwona przez 3 s: „To kod z innej paczki”; potem szukamy dalej |
| karta zwrotu (`UNBOX1R`) | czerwona przez 3 s: „To karta zwrotu, nie wysyłki” |

- Wykrycie kodu **nie** zatrzymuje nagrania.
- Zgodność sprawdzamy lokalnie: `shipCommitment(deal, secret)` porównujemy z `deal.qrCommitment`.

**Krok 2a. Skan po nagraniu.** Pokazujemy go, gdy kod nie został wykryty w trakcie albo gdy spike pokazał, że skan podczas nagrywania nie działa.

- Ekran „Zeskanuj kartę z kodem” z `QrScanner` i tymi samymi komunikatami co pastylka.
- Brak karty: `Notice warning` „Bez karty z kodem nie możesz ani potwierdzić odbioru, ani złożyć reklamacji. Jeśli karty nie ma w paczce, po 15:20 sprzedający może odebrać środki.”
- To otwarta kwestia nr 1 z `docs/zadania/README.md`: mówimy uczciwie i niczego nie obiecujemy.

**Krok 3. Decyzja**

```
┌─ ← Otwarcie paczki   Krok 3 z 3
│ ███ Jesteś kupującym ██████████
│ ✓ Kod zgodny
│ ✓ Nagranie zapisane (1:12)
│
│ Co chcesz zrobić?
│ ┌────────────────────────────
│ │ ✓ Wszystko OK                   ← primary, duży
│ │ 0,05 SOL trafi do sprzedającego.
│ │ Tego nie da się cofnąć.
│ │ Nagranie zostaje tylko u Ciebie.
│ └────────────────────────────
│ ┌────────────────────────────
│ │ ! Reklamuję                     ← czerwony obrys
│ │ Wyślesz nagranie i opis problemu.
│ │ Reklamację oceni Weryfikator AI.
│ └────────────────────────────
│ ⏱ Zdecyduj do 15:20 · zostało 47:12
│ Potem sprzedający może odebrać środki
│ bez Twojej zgody.
└──────────────────────────────
```

- „Wszystko OK”:
  1. `ConfirmSheet` (§5.2), przycisk „Przekaż 0,05 SOL sprzedającemu”;
  2. `TxProgress` „Przekazuję środki sprzedającemu…” → „Czekam na potwierdzenie sieci…”;
  3. `SuccessView` „Potwierdzone” · „0,05 SOL przekazane sprzedającemu”.
- „Reklamuję” otwiera `buyer/[deal]/complaint`.
- Sekret i plik nagrania przeżywają restart aplikacji. Jeśli przy ponownym wejściu jest zapisane nagranie, od razu pokazujemy krok 3.

### 6.9 Reklamacja — `buyer/[deal]/complaint.tsx` (O3)

```
┌─ ← Zgłoś reklamację ─────────
│ ███ Jesteś kupującym ██████████
│ Co jest nie tak?
│ ( ) Wada nieujawniona w opisie
│ ( ) Niezgodny z opisem (rozmiar, marka, kolor)
│ ( ) Inny przedmiot
│ ( ) Brak przedmiotu
│
│ Opisz problem
│ [Na lewym rękawie jest plama, której
│  nie było w opisie. Widać ją w 0:45.]
│ Napisz, w której chwili nagrania
│ widać problem.
│
│ DOŁĄCZYMY
│ • Twoje nagranie otwarcia (1:12 · 38 MB)
│ • nagranie pakowania sprzedającego
│ • opis ogłoszenia z listą wad
│
│ CO DALEJ
│ 1. Weryfikator AI oceni oba nagrania
│    według jawnych zasad.  Zobacz zasady ›
│ 2. Jeśli uzna reklamację, odeślesz
│    paczkę, a po jej odbiorze środki
│    wrócą do Ciebie.
│ 3. Jeśli nie zdąży do 15:40, każdy może
│    przekazać sprawę do zwrotu – wtedy
│    też odeślesz paczkę i odzyskasz środki.
├──────────────────────────────
│ [      Wyślij reklamację      ]
└──────────────────────────────
```

- Kategorie i etykiety pochodzą z `COMPLAINT_LABELS_PL`. Lista na szkicu to propozycja dla O4.
- Opis jest wymagany (min. 10 znaków).
- Termin w punkcie 3 to „teraz + `ORACLE_TIMEOUT`”, czyli przybliżenie. Dokładny termin pokaże ekran transakcji.
- „Wyślij reklamację” otwiera `ConfirmSheet` (§5.2) z informacją o publicznym linku do nagrania.
- `TxProgress`: „Sprawdzam nagranie…” → „Wysyłam nagranie…” (pasek MB) → „Wysyłam opis…” → „Zgłaszam reklamację w umowie…” → „Czekam na potwierdzenie sieci…”.
- Po sukcesie `router.replace("/deal/[deal]")`, gdzie od razu widać czekanie na decyzję (§8).

### 6.10 Odeślij paczkę — `buyer/[deal]/return.tsx` (O3)

Przebiega jak Spakuj i nadaj (§6.7), tylko role są odwrócone.

- **Krok 1:** karta `UNBOX1R` z `QrCard` (O2) i tekst „Wydrukuj kartę zwrotu, złóż ją kodem do środka i włóż do paczki. Sprzedający zeskanuje ją, gdy paczka do niego dotrze.”
- **Krok 2:** lista do nagrania (z ramką zasad z §5.6):
  - ubranie ze wszystkich stron, z wadą z reklamacji;
  - złożona karta zwrotu wkładana do środka;
  - zaklejenie;
  - etykieta z czytelnym numerem (adres można zasłonić).
- **Krok 3:** nagranie. **Krok 4:** numer przesyłki zwrotnej.
- Pasek terminu: „Odeślij do 15:50. Potem sprzedający może odebrać środki bez Twojej zgody.”
- `TxProgress`: „Sprawdzam nagranie…” → „Wysyłam nagranie…” (pasek MB) → „Zapisuję zwrot w umowie…” → „Czekam na potwierdzenie sieci…”.
- Sukces: „Zwrot w drodze” · „Gdy sprzedający potwierdzi odbiór, 0,05 SOL wróci do Ciebie. Jeśli nie potwierdzi do 16:00, odbierzesz środki jednym kliknięciem.”

### 6.11 Potwierdź zwrot — `seller/[deal]/confirm-return.tsx` (O2)

```
┌─ ← Potwierdź zwrot ──────────
│ ███ Jesteś sprzedającym ███████
│ Gdy paczka zwrotna dotrze, otwórz ją
│ i zeskanuj kartę z kodem zwrotu.
│
│ Numer przesyłki zwrotnej
│ INP 9988 7766 5544
│ ⏱ do 16:00 · zostało 09:30
│ Jeśli nie potwierdzisz, po tym terminie
│ kupujący może odebrać środki bez
│ Twojej zgody.
├──────────────────────────────
│ [        Skanuj kartę         ]
└──────────────────────────────
```

Skan (`QrScanner` na pełnym ekranie) ma trzy wyniki:

- **kod zgodny:** `Notice success` „Kod zgodny ✓” i przycisk „Potwierdź zwrot”, który otwiera `ConfirmSheet` (§5.2) z przyciskiem „Oddaj 0,05 SOL kupującemu”;
- **kod z innej paczki:** „To nie jest karta z tej paczki.” + „Skanuj ponownie”;
- **karta wysyłki (`UNBOX1`):** „To karta z pierwszej wysyłki, nie zwrotu.”

Po potwierdzeniu: `TxProgress` „Oddaję środki kupującemu…” → „Czekam na potwierdzenie sieci…”, potem `SuccessView` „Zwrot zakończony” · „0,05 SOL wróciło do kupującego”.

### 6.12 Portfel — `(tabs)/wallet.tsx` (O4)

```
┌─ Portfel ────────────────────
│ ┌────────────────────────────
│ │ Saldo
│ │ 0,8421 SOL      ≈ 700 zł
│ │ [Sieć testowa – środki bez wartości]
│ └────────────────────────────
│ W umowach: 0,05 SOL (1 zakup)     ← P1
│
│ [    Doładuj testowe SOL    ]
│
│ Twój adres
│ 7xKX…9fA2               [Kopiuj]
│
│ ⓘ Klucz portfela jest zapisany tylko
│   na tym telefonie. Jeśli usuniesz
│   aplikację albo zgubisz telefon,
│   stracisz dostęp do środków.
│ Zobacz w Solana Explorer ↗
└──────────────────────────────
```

- Saldo odświeżamy przy wejściu na ekran i gestem pull-to-refresh.
- Saldo równe 0 lub poniżej `MIN_FEE_BALANCE`:
  - „Doładuj testowe SOL” staje się przyciskiem `primary` na samej górze;
  - pod nim `Notice warning`: „Bez środków na opłatę sieci nie zrobisz nic w aplikacji – nawet nie potwierdzisz odbioru paczki.”
- „W umowach” (P1) to suma cen moich zakupów w statusach od `Paid` do `Returning`. Pokazuje, że środki są zabezpieczone, a nie zniknęły.
- „Doładuj” korzysta z jednokrokowego `TxProgress`. Błąd: „Nie udało się pobrać testowych środków (limit sieci testowej). Poproś zespół o przelew.”
- Notka o kluczu to uczciwe ograniczenie wbudowanego portfela. W pitchu jako następny krok podajemy odzyskiwanie konta, np. przez passkeys albo MPC (`CLAUDE.md` §12).
- Długie przytrzymanie adresu otwiera `/dev`.

### 6.13 Menu deweloperskie — `dev.tsx` (O4)

- Czerwony pasek: „Tylko devnet. Nie wpisuj prawdziwych kluczy.”
- Import klucza: pole base58, przyciski „Wklej” i „Importuj”, potwierdzenie „Obecny portfel zostanie zastąpiony.”
- **Tożsamość telefonu demo:** rola (Sprzedający / Kupujący / brak) i nazwa (np. „Ania”) zapisane w `secure-store`. Włącza `DemoIdentityStrip` na wszystkich ekranach (§11).
- Podgląd: RPC, `PROGRAM_ID`, `ORACLE_PUBKEY`, `TIMEOUTS`, czas sieci i różnica względem zegara telefonu (do synchronizacji demo), wersja aplikacji.

---

## 7. Macierz „Co teraz?”

Teksty dla `nextStep()`. Karta zawsze odpowiada na cztery pytania w tej samej kolejności:

```
┌────────────────────────────
│ 🔒 0,05 SOL zabezpieczone w umowie     ← gdzie są pieniądze
│ Ruch sprzedającego: nadanie paczki     ← kto ma ruch
│ ⏱ do 14:35 · zostało 08:12             ← do kiedy
│ [ przycisk akcji, jeśli to mój ruch ]
│ ─────────────────────────────
│ Jeśli sprzedający nie nada do 14:35,   ← co się stanie, jeśli nikt
│ odbierzesz środki bez niczyjej zgody.     nic nie zrobi
│ [ 🔒 Odbierz środki · za 08:12 ]       ← zablokowany przycisk rozliczenia,
└────────────────────────────              tylko dla tego, komu należą się środki
```

- `{termin}` to `status_changed_at + TIMEOUTS[status]`, porównywany z `networkNow()`.
- „Gdzie są pieniądze”:

  | Status | Tekst |
  |---|---|
  | `Listed` | „Ogłoszenie czeka na kupującego” |
  | od `Paid` do `Returning` | „{cena} zabezpieczone w umowie” |
  | `Completed` | „{cena} przekazane sprzedającemu” |
  | `Refunded` | „{cena} zwrócone kupującemu” |
  | `Cancelled` | „Ogłoszenie anulowane” |

- „Kto ma ruch”: „Twój ruch: …” albo „Ruch {sprzedającego / kupującego / weryfikatora}: …”.
- Obserwator, czyli ktoś, kto nie jest ani sprzedającym, ani kupującym, widzi teksty w trzeciej osobie. Nie ma żadnej akcji poza rozliczeniem po terminie.

### 7.1 Przed terminem

| Status | Rola | Kto ma ruch | Przycisk | Jeśli nikt nic nie zrobi | Zablokowany przycisk rozliczenia |
|---|---|---|---|---|---|
| `Listed` | sprzedający | „Czekamy na kupującego” | „Anuluj ogłoszenie” (obrys) | — | — |
| `Listed` | inni | „Na sprzedaż” | „Zobacz ogłoszenie” | — | — |
| `Paid` | sprzedający | „Twój ruch: spakuj i nadaj paczkę” | „Spakuj i nadaj” | „Po {termin} kupujący może odebrać środki bez Twojej zgody.” | — |
| `Paid` | kupujący | „Ruch sprzedającego: nadanie paczki” | — | „Jeśli sprzedający nie nada do {termin}, odbierzesz środki bez niczyjej zgody.” | „Odbierz środki · za {odliczanie}” |
| `Shipped` | kupujący | „Twój ruch: nagraj otwarcie paczki” | „Nagraj otwarcie” | „Po {termin} sprzedający może odebrać środki bez Twojej zgody. Bez nagrania nie ma reklamacji.” | — |
| `Shipped` | sprzedający | „Ruch kupującego: otwarcie i decyzja” | — | „Jeśli kupujący się nie odezwie, po {termin} odbierzesz środki jednym kliknięciem.” | „Odbierz środki · za {odliczanie}” |
| `Disputed` | obie strony | „Ruch weryfikatora: ocena reklamacji” | — | „Jeśli weryfikator nie zdąży do {termin}, każdy może przekazać sprawę do zwrotu: kupujący odeśle paczkę i odzyska środki.” | „Przejdź do zwrotu · za {odliczanie}” |
| `ReturnRequested` | kupujący | „Twój ruch: odeślij paczkę” | „Odeślij paczkę” | „Po {termin} sprzedający może odebrać środki bez Twojej zgody.” | — |
| `ReturnRequested` | sprzedający | „Ruch kupującego: odesłanie paczki” | — | „Jeśli kupujący nie odeśle do {termin}, odbierzesz środki jednym kliknięciem.” | „Odbierz środki · za {odliczanie}” |
| `Returning` | sprzedający | „Twój ruch: potwierdź odbiór zwrotu” | „Potwierdź zwrot” | „Po {termin} kupujący może odebrać środki bez Twojego potwierdzenia.” | — |
| `Returning` | kupujący | „Ruch sprzedającego: potwierdzenie zwrotu” | — | „Jeśli sprzedający nie potwierdzi do {termin}, odbierzesz środki jednym kliknięciem.” | „Odbierz środki · za {odliczanie}” |
| `Completed` | wszyscy | „Zakończone” | — | — | — |
| `Refunded` | wszyscy | „Środki zwrócone” | — | — | — |
| `Cancelled` | wszyscy | „Ogłoszenie anulowane” | — | — | — |

Zablokowany przycisk rozliczenia ma obrys, jest wyszarzony i ma ikonę `lock-closed`. Widać go już przed terminem, żeby uprawniony wiedział, że po terminie nie musi nikogo prosić o zgodę.

### 7.2 Po terminie, czyli moment „pośrednik znika”

Na Vinted, gdy sprzedający zniknie, piszesz do supportu i czekasz. Tutaj po terminie przycisk po prostu się odblokowuje, a jedno kliknięcie rozlicza umowę bez niczyjej zgody. W demo to bohater sceny: ok. 15 sekund, które realizują kryterium „związek z wyzwaniem” (30%).

**Sekwencja na ekranie**

1. **Ostatnia minuta:** odliczanie na zablokowanym przycisku powiększa się do `display` (32 pt), np. „00:12”.
2. **00:00 na telefonie:** „Sprawdzam termin w sieci…” (zwykle 1–5 s, §5.4).
3. **`networkNow() ≥ termin + 2 s`:**
   - przycisk staje się aktywny (`primary`, ikona `lock-open`);
   - karta dostaje obramowanie `primary`;
   - pojawia się tekst: „Termin minął. Umowa rozlicza środki według zasad, które obie strony zaakceptowały. Nikt nie musi się na to zgadzać – może to zrobić każdy.”
4. **Kliknięcie:** strona, której należą się środki, nie dostaje arkusza zgody. Ktoś inny dostaje `ConfirmSheet`. Potem `TxProgress` „Zapisuję w umowie…” → „Czekam na potwierdzenie sieci…”.
5. **Sukces:** `SuccessView` „Środki wróciły do Ciebie” albo „Środki trafiły do Ciebie”, kwota „+0,05 SOL” (`display`, `success`) i `ExplorerLink`. Ten kadr idzie na slajd.

**Etykiety przycisku**

| Status | Przycisk dla strony, której należą się środki | Przycisk dla pozostałych | Skutek |
|---|---|---|---|
| `Paid` | kupujący: „Odbierz środki” | „Zwróć środki kupującemu” | `Refunded` |
| `Shipped` | sprzedający: „Odbierz środki” | „Przekaż środki sprzedającemu” | `Completed` |
| `Disputed` | — | wszyscy: „Przejdź do zwrotu” | `ReturnRequested` (bez przelewu; zaczyna się termin na odesłanie) |
| `ReturnRequested` | sprzedający: „Odbierz środki” | „Przekaż środki sprzedającemu” | `Completed` |
| `Returning` | kupujący: „Odbierz środki” | „Zwróć środki kupującemu” | `Refunded` |

Tytuł karty po terminie: „Zamknij sprawę po terminie”.

**Przypadki brzegowe**

- `DeadlineNotReached` mimo odczytu zegara sieci: „Sieć jeszcze nie widzi upływu terminu. Spróbuj za kilka sekund.” (P1: automatyczne ponowienie po 5 s).
- Ktoś inny (np. automat weryfikatora) może rozliczyć umowę pierwszy. Wtedy przychodzi `InvalidStatus`: odświeżamy ekran i pokazujemy nowy stan, bez komunikatu o błędzie.

---

## 8. Decyzja weryfikatora (`VerdictCard`, O4)

Werdykt wylicza deterministyczna funkcja `decide()`, a model AI tylko wypełnia raport. UI ma pokazać właśnie to. Nie piszemy „AI zdecydowało”, tylko pokazujemy sprawdzone warunki, ich wyniki i regułę, która z nich wynika. Takiej przejrzystości platforma ze zwykłym supportem nie oferuje.

### Czekanie (`Disputed`)

```
┌────────────────────────────
│ ◌ Weryfikator AI ocenia reklamację
│ Porównuje nagranie pakowania, nagranie
│ otwarcia i opis ogłoszenia. Zwykle trwa
│ to 1–2 minuty. Wynik pojawi się tutaj sam.
│ ⏱ do 15:40 · zostało 09:12
│ ─────────────────────────────
│ JAK ZAPADA DECYZJA
│ 1. Sprawdzamy, czy pliki są zgodne
│    z zapisem w umowie.
│ 2. AI ocenia nagrania punkt po punkcie.
│ 3. Jawna reguła wylicza decyzję z tych
│    punktów. AI nie wybiera strony.
│ Weryfikator może wskazać tylko kupującego
│ albo sprzedającego. Nie może przekazać
│ środków nikomu innemu.
│ Zobacz zasady oceny ›
└────────────────────────────
```

### Wynik (`verdict ≠ None`)

Pobieramy `deals/<deal>/report.json` i sprawdzamy, czy `sha256 == report_hash`.

```
┌────────────────────────────
│ Reklamacja uznana
│ Odeślij paczkę do 15:50, a środki
│ wrócą do Ciebie.
│
│ JAK WYLICZONO DECYZJĘ
│ 0. Pliki zgodne z zapisem       tak ✓
│ 1. Nagranie otwarcia            tak ✓
│    wiarygodne
│ 2. Paczka taka sama jak nadana  tak ✓
│ 3. Przedmiot zgodny z           nie ✕  ← rozstrzyga
│    ogłoszeniem, bez
│    nieujawnionych wad
│ → Reklamacja uznana
│ ✓ Decyzja zgodna z jawną regułą
│
│ Nieujawnione uszkodzenie: plama na
│ lewym rękawie (0:42, 1:05)
│
│ Uzasadnienie
│ „Na nagraniu otwarcia w 0:42 widać…”
│
│ Szczegóły oceny AI (11 punktów)  ▾
│
│ ✓ Raport zgodny z zapisem
│ Zobacz raport ↗   Zobacz zasady oceny ›
│ Zobacz w Solana Explorer ↗
└────────────────────────────
```

**Nagłówek i skutek**

- Nagłówek to „Reklamacja uznana” (`Buyer`) albo „Reklamacja odrzucona” (`Seller`). Kolor jest neutralny (`primary`), bez „wygrałeś/przegrałeś”, bo ten sam ekran oglądają obie strony.
- Zdanie pod nagłówkiem zależy od roli:

  | Werdykt | Kupujący | Sprzedający |
  |---|---|---|
  | `Buyer` | „Odeślij paczkę do {termin}, a środki wrócą do Ciebie.” | „Kupujący odeśle paczkę. Po odbiorze potwierdź zwrot.” |
  | `Seller` | „Środki trafiły do sprzedającego.” | „Środki trafiły do Ciebie.” |

**Jak wyliczono decyzję** (ścieżka przez `decide()`, `CLAUDE.md` §5)

| Krok | Warunek | Tekst | Gdy nie spełniony |
|---|---|---|---|
| 0 | pliki zgodne z hashami w umowie (`evidence`) | „Pliki zgodne z zapisem” | przegrywa autor pliku, bez oceny AI |
| 1 | `buyerOk`: ciągłe, od zamkniętej paczki, kod przy otwarciu, dobra jakość | „Nagranie otwarcia wiarygodne” | → odrzucona |
| 2 | `sellerOk && !package_matches_shipping_recording` | „Paczka taka sama jak nadana” | → odrzucona; przy słabym nagraniu pakowania: „nie sprawdzano – nagranie pakowania słabej jakości (działa przeciw sprzedającemu)” |
| 3 | `item_matches_listing && !undisclosed_damage.present` | „Przedmiot zgodny z ogłoszeniem, bez nieujawnionych wad” | → uznana |
| — | wszystkie powyższe spełnione | „Brak podstaw do reklamacji” | → odrzucona |

- Krok, który rozstrzygnął, jest wyróżniony („← rozstrzyga”). Kroków po nim nie pokazujemy.
- Ścieżkę liczy `explainDecision(report)`, czyli ta sama reguła co `decide()`. Gdy wynik zgadza się z `verdict` w umowie, pokazujemy „✓ Decyzja zgodna z jawną regułą” (§13, pkt 7).

**Szczegóły oceny AI** (rozwijane)

Wszystkie 11 pól raportu w trzech grupach. ✓ oznacza wynik korzystny dla autora nagrania albo zgodność.

| Pole raportu | Tekst |
|---|---|
| `buyer_recording.continuous` | „Nagranie otwarcia: bez przerw” |
| `buyer_recording.starts_with_sealed_package` | „zaczyna się od zamkniętej paczki” |
| `buyer_recording.qr_revealed_on_opening` | „karta z kodem widoczna dopiero po otwarciu” |
| `buyer_recording.quality` | „jakość: dobra / słaba” |
| `seller_recording.item_clearly_visible` | „Nagranie pakowania: przedmiot dobrze widoczny” |
| `seller_recording.qr_card_packed` | „karta z kodem włożona do paczki” |
| `seller_recording.package_sealed_and_labeled` | „paczka zaklejona i oznaczona etykietą” |
| `seller_recording.quality` | „jakość: dobra / słaba” |
| `package_matches_shipping_recording` | „Porównanie: paczka zgodna z nadaną” |
| `item_matches_listing` | „przedmiot zgodny z ogłoszeniem” |
| `undisclosed_damage.present` | „brak nieujawnionych uszkodzeń” (✕, gdy `true`) |

`reasoning` i `notes` są po polsku (wymaga tego prompt O5). Cytujemy je bez skracania. Znaczniki czasu z `undisclosed_damage.timestamps` pokazujemy obok opisu uszkodzenia.

**Przypadki szczególne**

- **Raport niezgodny z zapisem albo niedostępny:** `Notice warning` „Nie udało się sprawdzić raportu. Decyzja zapisana w umowie: reklamacja uznana.” Werdykt bierzemy z konta, nie z pliku.
- **Decyzja bez oceny AI** (krok 0): „Decyzja bez oceny AI: nagranie {sprzedającego/kupującego} nie zgadza się z zapisem w umowie.”
- **Brak werdyktu, a status `ReturnRequested` po sporze:** „Weryfikator nie odpowiedział w terminie, więc sprawa przeszła do zwrotu.”

**Linki**

- „Zobacz raport ↗” otwiera `report.json` w przeglądarce (przydatne dla jury).
- `ExplorerLink` prowadzi do ostatniej operacji. Zaraz po werdykcie jest to `resolve_dispute`; P1: stały link do tej operacji z eventów.

### `RulesSheet`: „Jak działa ocena reklamacji”

Arkusz otwierany linkiem „Zobacz zasady oceny ›” z zakupu, z nagrywania, z reklamacji i z werdyktu:

1. „Jeśli plik nie zgadza się z zapisem w umowie, przegrywa ten, kto go dostarczył.”
2. „Jeśli nagranie otwarcia jest ucięte, nie zaczyna się od zamkniętej paczki, karta z kodem pojawia się przed otwarciem albo jakość jest słaba – reklamacja zostaje odrzucona.”
3. „Jeśli nagranie pakowania jest dobre, a otwierana paczka różni się od nadanej – reklamacja zostaje odrzucona.”
4. „Jeśli przedmiot nie zgadza się z ogłoszeniem albo ma wadę spoza listy wad – reklamacja zostaje uznana: kupujący odsyła paczkę i odzyskuje środki.”
5. „W pozostałych przypadkach reklamacja zostaje odrzucona.”

Pod listą:

- „AI tylko ocenia powyższe punkty. Decyzję wylicza ta reguła; jej kod jest publiczny.”
- „Weryfikatora uruchamia zespół unboxproof. Jego adres jest zapisany w umowie od wystawienia ogłoszenia. Może wskazać tylko kupującego albo sprzedającego i tylko przed terminem oceny.”
- „Jeśli ocena nie zapadnie w terminie, każdy może przekazać sprawę do zwrotu.”

---

## 9. Błędy i komunikaty

Mapowanie robi `app/src/solana/actions.ts` (O4):

- błędy programu rozpoznajemy po nazwie (`AnchorError.error.errorCode.code`) i po numerze (6000 + indeks błędu w IDL; np. `0x1771` to 6001);
- osobno obsługujemy błędy System Programu (za mało środków) i sieci.

Nazwy pochodzą z propozycji w `docs/zadania/1-program.md`; wiążące jest IDL.

**Na ekranie nigdy nie pojawia się** kod szesnastkowy (`0x1771`), `custom program error`, logi programu ani stack trace. Pełny błąd idzie do konsoli. Surowy kod na rzutniku to porażka komunikacyjna przed jury.

| Błąd | Komunikat | Zachowanie UI |
|---|---|---|
| `InvalidStatus` | brak; przy zakupie „Ktoś kupił to przed Tobą.” | odśwież i pokaż aktualny stan |
| `Unauthorized` | „Tę czynność może wykonać tylko druga strona.” | — |
| `DeadlinePassed` | zależnie od czynności (tabela niżej) | odśwież; pojawi się karta z §7.2 |
| `DeadlineNotReached` | „Sieć jeszcze nie widzi upływu terminu. Spróbuj za kilka sekund.” | P1: ponów automatycznie po 5 s |
| `InvalidPrice` | „Cena musi być większa od zera.” | — |
| `SameParty` | „Nie możesz kupić własnego ogłoszenia.” | — |
| `ListingHashMismatch` | „Opis ogłoszenia nie zgadza się z zapisem. Odśwież ogłoszenie.” | — |
| `ArbiterMismatch` | „To ogłoszenie ma innego weryfikatora niż ten, którego używa aplikacja. Nie kupuj.” | — |
| `QrMismatch` | „Kod z karty nie pasuje do tej paczki.” | — |
| `StringTooLong` | „Numer przesyłki może mieć maks. 32 znaki.” | — |
| za mało SOL | „Za mało środków na tę czynność.” | `BalanceGuard` z „Doładuj” na miejscu |
| operacja wygasła albo nie przyszło potwierdzenie | „Sieć nie potwierdziła operacji na czas. Sprawdzam, czy się udała…” | §5.3: najpierw `fetchDeal`, potem sukces albo „Operacja nie doszła do skutku. Nic się nie zmieniło – środki są tam, gdzie były.” |
| 429, brak internetu | „Sieć nie odpowiada. Sprawdź internet i spróbuj ponownie.” | — |
| upload: plik już istnieje (409) | brak | ponowienie z tym samym plikiem (hash zapisany lokalnie po uploadzie) traktujemy jak sukces; w przeciwnym razie „To nagranie zostało już wysłane wcześniej.” |
| upload: nie udało się | §5.3, „Dwa rodzaje awarii” | — |
| upload: plik za duży | „Nagranie jest za duże. Nagraj krótsze.” | wróć do nagrywania |
| brak dostępu do aparatu | „Bez dostępu do aparatu nie nagrasz paczki.” | przycisk „Otwórz ustawienia” (`Linking.openSettings()`) |
| nieznany | „Coś poszło nie tak. Spróbuj ponownie.” | szczegóły w konsoli; P1: „Pokaż szczegóły” dla zespołu |

`DeadlinePassed` mówi, który termin minął i co z tego wynika:

| Czynność | Komunikat |
|---|---|
| nadanie (`mark_shipped`) | „Termin nadania minął – kupujący może odebrać środki.” |
| „Wszystko OK” / reklamacja | „Termin na decyzję minął – sprzedający może odebrać środki.” |
| odesłanie (`mark_returned`) | „Termin odesłania minął – sprzedający może odebrać środki.” |

Komunikat mówi, co się stało i co zrobić dalej, a przy pieniądzach także to, gdzie są teraz środki.

---

## 10. Ładowanie i puste stany

Publiczny devnet ma limity zapytań, więc wolne ładowanie i błędy zdarzą się na pewno, nie tylko w teorii.

- Listy pokazują szkielety (szare prostokąty) zamiast spinnera.
- Po 5 s ładowania: dopisek „Wczytywanie trwa dłużej niż zwykle…”.
- Po 20 s: stan błędu z „Spróbuj ponownie”.
- Szczegóły transakcji przy pierwszym wczytaniu pokazują spinner z tekstem „Wczytuję transakcję…”. Kolejne odświeżenia dzieją się w tle i nie powodują migania; nieudane odświeżenie w tle zostawia ostatnie dane.
- P1: przy nieudanym odświeżeniu dopisek „Dane sprzed 1 min”.
- Przy błędzie 429 kolejne odświeżenia w tle zwalniają (5 s → 10 s → 20 s).
- Zdjęcia mają tło `surface`, dopóki się nie załadują.
- Pusty stan zawsze ma jedno zdanie i jedną akcję.

---

## 11. Demo i projektor

**Telefony**

- Maksymalna jasność, tryb „nie przeszkadzać”, domyślny rozmiar czcionki systemowej.
- **Widownia musi od razu wiedzieć, czyj ekran ogląda.** Telefon sprzedającego ma ustawioną w `/dev` tożsamość „SPRZEDAJĄCY · {imię}” (pasek `seller` na każdym ekranie), a telefon kupującego „KUPUJĄCY · {imię}” (pasek `buyer`). Ekrany transakcji mają dodatkowo `RoleBanner`.
- `ExplorerLink` jest na każdym `SuccessView` w tym samym miejscu, jako wiersz o wysokości 48, żeby na scenie trafić w niego bez szukania.

**Kolejność ekranów na scenie** (`CLAUDE.md` §11)

- **Transakcja A:** Nagraj otwarcie → Decyzja → Reklamacja → Szczegóły transakcji (czekanie, potem werdykt pojawia się sam) → „Jak wyliczono decyzję” → Explorer.
- **Transakcja B:** Wystaw → Kup (arkusz zgody z weryfikatorem) → … → „Wszystko OK” → „Potwierdzone” → Explorer.
- **„Pośrednik znika”:** karta z §7.2 → odliczanie → odblokowanie → „Odbierz środki” → „+0,05 SOL” → Explorer.

**Choreografia a zegar** (O6 z osobą od UI)

Terminy w trybie `demo` to 10–60 min, a program liczy je według czasu sieci, więc scenariusz trzeba zgrać z zegarem.

| Element | Kiedy przygotować | Uwagi |
|---|---|---|
| transakcja A (`Shipped`) | 20–55 min przed występem | `UNBOX_TIMEOUT` = 60 min; przygotowana za wcześnie przepadnie |
| „pośrednik znika” (`Paid`) | zakup ok. 9 min przed planowanym momentem | `SHIP_TIMEOUT` = 10 min, więc widownia zobaczy ostatnią minutę odliczania. Jeśli się spóźnimy, przycisk będzie już aktywny, co też działa |
| automat wyroczni | wyłączony dla tych transakcji | §13, pkt 1 |
| zegar | przed wyjściem `scripts/status.ts` i `/dev` pokazują terminy według czasu sieci | różnica telefon–sieć widoczna w `/dev` |
| czekanie na werdykt (≤ 2 min) | — | prezenter otwiera „Zobacz zasady oceny” (`RulesSheet`) i omawia regułę, zanim przyjdzie wynik |

---

## 12. Priorytety

| P0 (do K3/K4) | P1 (do K4) | P2 |
|---|---|---|
| `theme`, `format`, `Screen`, `Button`, `Card`, `Notice`, `StatusBadge`, `Countdown`, `ExplorerLink`, `SuccessView` | historia kroków z eventów (data, sposób, link do Explorera) | podgląd nagrania (`expo-video`) |
| `ConfirmSheet` dla operacji z §5.2 | kwoty w zł „≈” | haptyka przy wykryciu kodu (`expo-haptics`) |
| `TxProgress`: pasek postępu wysyłania, fazy potwierdzenia, dwa rodzaje awarii | plakietki na zakładkach | animacje zmian statusu |
| `BalanceGuard` i „Doładuj” na miejscu | „W umowach” w Portfelu | ekran powitalny „jak to działa” (3 plansze) |
| `networkNow()` z zegara sieci | auto-ponowienie przy `DeadlineNotReached` | pełny diagram maszyny stanów w aplikacji |
| `NextStepCard` z całą macierzą §7, w tym zablokowany przycisk i sekwencja z §7.2 | odświeżanie list co 10 s, zwinięte „Zakończone”, „Dane sprzed 1 min” | |
| `Timeline` z możliwymi dalszymi krokami | podświetlenie karty „Co teraz?” po zmianie w tle | |
| `VerdictCard`: czekanie, „Jak wyliczono decyzję”, szczegóły, „Raport zgodny z zapisem ✓”; `RulesSheet` | | |
| `RoleBanner`, `DemoIdentityStrip` | | |
| ramka zasad nagrań i nakładki kamery (pasek limitu, ramka kadru, pastylka kodu) | | |
| wszystkie ekrany z §6 w podstawowej formie, komunikaty błędów z §9 (bez surowych kodów) | | |

---

## 13. Otwarte kwestie (do decyzji zespołu)

1. **Automat wyroczni a moment „pośrednik znika”.**
   - Problem: wyrocznia co ok. 5 s woła `settle_expired` dla przeterminowanych transakcji (`CLAUDE.md` §5). Transakcję przygotowaną skryptem `stage.ts paid-expired` automat rozliczy, zanim kupujący na scenie kliknie „Odbierz środki”.
   - Propozycja: wyłącznik automatu w env wyroczni (np. `CRANK=off`) na czas prezentacji albo pomijanie statusu `Paid`.
   - Decydują O5 i O6.
2. **Wynik spike'a kamery** rozstrzyga, czy pastylka „Kod zgodny ✓” działa w trakcie nagrania, czy zostaje tylko krok 2a. UI z §6.8 obsługuje oba warianty.
3. **Ekran nie może zgasnąć w trakcie 2-minutowego nagrania ani wysyłania.** Proponujemy `useKeepAwake()` z `expo-keep-awake`. Moduł jest w Expo Go i nie wymaga dev builda, ale to nowa zależność, więc potrzebna jest zgoda zespołu.
4. **Paczka bez karty QR** (`docs/zadania/README.md`, otwarte kwestie, pkt 1). Do czasu decyzji UI pokazuje uczciwy komunikat z §6.8.
5. **Koszt wystawienia.**
   - Konto `Deal` ma ok. 660 bajtów, więc sprzedający przy `create_listing` blokuje na nim ok. 0,0055 SOL depozytu. Program nie ma instrukcji zamknięcia konta, więc ten depozyt nie wraca.
   - Ekran Wystaw pokazuje ten koszt (§6.3), ale pitch w `CLAUDE.md` §1 mówi „tylko opłata sieci (ułamek grosza)”.
   - Opcje:
     - (a) poprawić pitch;
     - (b) dodać instrukcję zamykającą konto po statusie końcowym i oddającą depozyt sprzedającemu. To zmiana IDL, więc decyduje O1.
6. **Listy wartości w shared** (O4): `COMPLAINT_LABELS_PL` (propozycja w §6.9), opcje stanu ubrania (§6.3), `STATUS_SHORT_PL` (§4).
7. **`decide()` we wspólnym pakiecie.**
   - Propozycja: O5 pisze `decide()` i `explainDecision()` w `packages/shared`, a wyrocznia je importuje. Aplikacja pokazuje wtedy ścieżkę reguły tym samym kodem, który wydał werdykt, i może wyświetlić „✓ Decyzja zgodna z jawną regułą”.
   - To zmiana układu plików z `CLAUDE.md` §5/§7, więc potrzebna jest zgoda O5.
   - Bez tej zmiany `VerdictCard` pokazuje tylko szczegóły oceny i werdykt z umowy, bez ścieżki.
8. **Nagrania są publiczne.**
   - Bucket jest publiczny, a ścieżki `deals/<deal>/…` da się wyprowadzić z adresu transakcji. Na etykiecie widać dane odbiorcy.
   - UI ostrzega przed nagraniem i pozwala zasłonić adres (§5.6). Weryfikatorowi wystarcza numer przesyłki.
   - Na jury: on-chain są tylko hashe; prywatny bucket z podpisanymi linkami to następny krok.
9. **Słowo „niezależna” przy ocenie AI.** Nie używamy go (§2.2), bo weryfikatora uruchamiamy my. Jeśli zespół chce je mieć w pitchu, to tylko razem z odpowiedzią, kto uruchamia weryfikatora i dlaczego to ograniczone zaufanie (kworum i TEE w następnych krokach).
10. **Kurs SOL→zł** (P1): stała `SOL_PLN_APPROX` z datą w `app/src/ui/format.ts` albo rezygnujemy z kwot w zł. Pobieranie kursu na żywo to zbędna zależność zewnętrzna.
11. **Tarcie nagrywania.** Nagrywanie otwarcia każdej paczki to wysiłek, którego kupujący na Vinted nie ponosi. To cena za brak pośrednika. O6 nazywa ten kompromis w pitchu wprost, zanim zrobi to jury (dopisane do `CLAUDE.md` §12).

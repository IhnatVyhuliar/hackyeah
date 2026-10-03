# Osoba 6: pitch, demo i zgłoszenie

## Rola i cel
Odpowiadasz za to, co jury zobaczy i przeczyta, oraz za to, żeby demo na żywo się udało:
- README (EN) i uzasadnienie projektowe;
- slajdy (PDF, maks. 10), wideo (maks. 3 min), nagranie zapasowe;
- portfele demo, rekwizyty, skrypty stagingu, scenariusz demo i próby;
- **zgłoszenie na HackTribe do 21:00**.

Pilnujesz też wymagań sponsora: na końcu tego pliku jest lista kontrolna z regulaminu i opisu wyzwania.

## Twoje pliki
`README.md`, `docs/**` (poza `docs/zadania/`; `docs/spiki.md` piszą wszyscy), `scripts/**`, `scripts/keys/` (w `.gitignore`).

**Nie dotykasz:** `app/`, `programs/`, `oracle/`, `packages/shared`.

## Przeczytaj najpierw
Cały `CLAUDE.md`, szczególnie §1 (wymagania, uzasadnienie), §4 (maszyna stanów, `settle_expired`), §11 (demo), §12 (FAQ i ograniczenia). Oba PDF-y sponsora w root repo. `docs/zadania/README.md` (otwarte kwestie: to pytania, które może zadać jury).

## Stack i setup
Node 24 + TS (`tsx`) w skryptach, `@anchor-lang/core` ^1.1.2, `@solana/web3.js` 1.99.0, IDL i helpery z `@unbox/shared`. Solana CLI (dev container albo lokalnie) do przelewów. `scrcpy` do pokazania ekranu telefonu na projektorze i nagrywania.

**K0, przed 23:00 (tylko przygotowanie):**
- Portfel zespołu zasilony devnet SOL (faucet.solana.com z logowaniem GitHub; kilka osób = więcej SOL). Rozdaj: deployer O1, wyrocznia O5, portfele demo.
- Rekwizyty: ubranie z plamą (albo białe ubranie + marker/kawa), drugie bez wad, 2–3 kartony, taśma, wydrukowane „etykiety przewoźnika” z numerami, dostęp do drukarki.
- Sprawdź **aktualny** cennik „Ochrony Kupujących” Vinted (kwota stała + procent; zapisz URL i datę). Bez źródła nie podajemy liczby.
- Ustal, kiedy są prezentacje finalistów (Discord HackYeah). Od tego zależy staging transakcji A (`UNBOX_TIMEOUT` = 60 min).

## Zadania

### P0. Portfele i skrypty (do 10:00)
- [ ] `scripts/demo-wallets.ts`: generuje keypairy sprzedającego i kupującego demo do `scripts/keys/` i wypisuje klucze base58 do importu w ukrytym menu aplikacji (O4).
- [ ] `scripts/fund.ts`: dopełnia salda (sprzedający, kupujący, wyrocznia) z portfela zespołu do zadanej kwoty.
- [ ] `scripts/seed.ts`: kilka ogłoszeń od sprzedającego demo (zdjęcia + `metadata.json` w storage, `create_listing`), żeby Przeglądaj nie było puste.
- [ ] `scripts/stage.ts`:
  - `paid-expired`: wystawienie + zakup kluczami demo ≥ 10 min przed demo → status `Paid` po `SHIP_TIMEOUT`. To moment „pośrednik znika”: kupujący klika „Odbierz środki”.
  - `dispute`: spór na devnecie do testów O5 (pliki z fixtures).
- [ ] `scripts/status.ts <deal>`: czytelny wydruk konta `Deal` + linki do Explorera.

### P0. Treść (szkice do 14:00, gotowe do K5 19:00)
- [ ] `docs/uzasadnienie.md` (PL, wchodzi do opisu na HackTribe; wersja EN w README):
  - relacja finansowa: kupujący płaci nieznajomemu za używane ubranie;
  - pośrednik dziś: platforma; cennik ze źródłem; ręczny support; reguły, których strony nie widzą;
  - co się zmienia po jego usunięciu (§1 „Uzasadnienie projektowe”);
  - użytkownik docelowy nazwany wprost;
  - dlaczego portfel wbudowany zamiast Wallet Adaptera (użytkownik spoza krypto, świadomy wybór);
  - dlaczego AI nie jest nowym pośrednikiem: binarny werdykt z `decide()` w kodzie, arbiter nie może przesunąć środków, milczenie ma skutek w programie.
- [ ] `docs/qa-jury.md`:
  - 5 pytań z opisu wyzwania (§12) z odnośnikami do linii w programie (mapa od O1);
  - trudne pytania: „czy AI to nie nowy pośrednik?”, „co jeśli AI się pomyli?”, „co, gdy sprzedający nie włoży karty QR?” (otwarte kwestie, pkt 1), „nagrania a RODO” (on-chain tylko hashe), „czy możecie zmienić program po deployu?” (upgrade authority, `--final`), „dlaczego nie Wallet Adapter?”, „kto płaci za AI?” (koszt od O5).
- [ ] `README.md` (EN, jury go czyta):
  - co to jest i dla kogo;
  - jak działa (diagram mermaid maszyny stanów z §4);
  - **where the intermediary disappears** (linki do plików i linii od O1);
  - `PROGRAM_ID`, linki do Explorera z demo (happy path, spór, `settle_expired`);
  - mapa repo, jak uruchomić każdą część, stack;
  - uczciwe ograniczenia i następne kroki (§12);
  - linki do wideo i slajdów.
- [ ] **Slajdy** (≤ 10, PDF):
  1. tytuł + zespół;
  2. problem (opłata, nieprzejrzyste spory);
  3. użytkownik docelowy;
  4. jak to działa (wystaw → kup → nagraj pakowanie → nagraj otwarcie);
  5. gdzie znika pośrednik (maszyna stanów + fragment kodu);
  6. wąska wyrocznia (`decide()`, binarny werdykt, timeout);
  7. demo (zrzuty + Explorer);
  8. zaufanie i ograniczenia;
  9. potencjał (koszt reklamacji vs opłata platformy, InPost, USDC);
  10. następne kroki + linki.

### P0. Demo (scenariusz do 14:00, próby 16:00–18:00)
- [ ] `docs/demo.md`: scenariusz minuta po minucie według §11 (kto trzyma który telefon, która paczka, kiedy otwieramy Explorer). Zawiera:
  - **transakcję A** (spór z plamą): przygotowana w aplikacji na telefonie sprzedającego (prawdziwe nagranie pakowania) **mniej niż 60 min przed występem**;
  - **transakcję B** (happy path na żywo);
  - **moment „pośrednik znika”** (`stage.ts paid-expired`).
- [ ] Lista kontrolna przed wyjściem:
  - salda portfeli, hotspot, wyrocznia działa (laptop + logi);
  - Explorer otwarty w kartach, karty QR i paczki gotowe;
  - `scrcpy` na projektorze, nagranie zapasowe pod ręką.
- [ ] Plan awaryjny: co mówimy i co pokazujemy, gdy padnie devnet, RPC, Gemini albo telefon. Regulamin: mówimy wprost, co nie działa i dlaczego.
- [ ] **2 pełne próby** (16:00–18:00) na dwóch telefonach przez hotspot, ze stoperem.

### P0. Wideo i zgłoszenie
- [ ] Nagranie zapasowe całego demo (`scrcpy --record`) do K5.
- [ ] Wideo ≤ 3 min (problem → demo → gdzie znika pośrednik), **publiczny link**, sprawdzony w trybie incognito, do K5 19:00.
- [ ] **Zgłoszenie na HackTribe do 21:00 (K6):**
  - tytuł, nazwa zespołu, lista członków (1–6);
  - szczegółowy opis z uzasadnieniem projektowym (PL albo EN);
  - PDF slajdów, link do wideo;
  - **publiczne** repo (sprawdź widoczność `github.com/IhnatVyhuliar/hackyeah` w trybie incognito);
  - opcjonalnie zrzuty ekranu.
- [ ] Po wysłaniu: info na kanale, że po 23:00 nic nie pushujemy na `main` (zmiany po terminie są nieważne, regulamin pkt 13).

## Lista kontrolna wymagań sponsora (sprawdzasz przed K6)
| Wymaganie (źródło) | Gdzie u nas | ✓ |
|---|---|---|
| Rozwiązanie działa na Solanie, devnet wystarczy (opis wyzwania §5) | `PROGRAM_ID` w README, linki do Explorera | ☐ |
| Logika zastępująca pośrednika jest w programie on-chain (§5) | `programs/unbox_escrow`, mapa linii od O1 | ☐ |
| Co najmniej jeden pełny scenariusz od wejścia użytkownika do zakończonej transakcji (§3) | transakcja B | ☐ |
| Widać moment, w którym pośrednik przestaje być potrzebny (§3) | `settle_expired` na scenie + werdykt w sporze | ☐ |
| Działa na żywo, nagranie tylko jako zapas (§3, §6) | próby + nagranie zapasowe | ☐ |
| Użytkownik docelowy nazwany wprost (§3) | README, slajd 3, opis | ☐ |
| Uzasadnienie projektowe: relacja, pośrednik, co się zmienia (§3, §4) | `docs/uzasadnienie.md`, opis | ☐ |
| Potwierdzona transakcja w eksploratorze na demo (§6) | Explorer w kartach | ☐ |
| Dwa przygotowane portfele dla dwóch stron (§6) | telefony demo zasilone | ☐ |
| Odpowiedzi na 5 pytań jury (§6) | `docs/qa-jury.md` | ☐ |
| Czytelne README „co gdzie leży” (§6) | `README.md` | ☐ |
| Tytuł, nazwa zespołu, lista członków 1–6 (regulamin pkt 5) | formularz HackTribe | ☐ |
| Opis, PDF ≤ 10 slajdów, wideo ≤ 3 min (publiczny link), repo (opis §4, regulamin pkt 5) | HackTribe | ☐ |
| Praca w oknie sob 23:00 – ndz 23:00 (regulamin pkt 5, 13) | historia commitów | ☐ |

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| SOL dla deployera, wyroczni, portfeli demo | O1, O5, telefony | K0 |
| rekwizyty | O5 (fixtures), demo | 04:00 |
| skrypty `fund`, `seed`, `stage`, `status` | wszyscy | 10:00 |
| scenariusz demo + próby | zespół | 14:00, 16:00–18:00 |
| README, slajdy, wideo, nagranie zapasowe | jury | K5 19:00 |
| zgłoszenie | HackTribe | K6 21:00 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| `PROGRAM_ID`, IDL, mapa linii programu | O1 | K1, 14:00 |
| `@unbox/shared` | O4 | 01:00 |
| koszt jednej reklamacji | O5 | 17:00 |
| działające E2E | O2, O3, O4, O5 | K3, K4 |

## Pułapki
- Faucet ma limity: zasilaj wcześnie, nie rób airdropów w trakcie demo.
- Nie obiecuj w slajdach ani w README niczego, czego nie ma w kodzie. Jury porównuje repo z demo.
- Transakcja A wygasa po 60 min od nadania (`UNBOX_TIMEOUT`, `demo`). Za wcześnie przygotowana = przepadnie.
- Klucze demo i portfela zespołu nigdy w gicie (`scripts/keys/`).
- Cennik Vinted tylko ze źródłem i datą.

## Prompt startowy do Claude Code
```
Pracujesz w repo unboxproof (HackYeah 2026). Przeczytaj cały CLAUDE.md, docs/zadania/README.md
i docs/zadania/6-pitch-demo.md. Jesteś Osobą 6: pitch, demo i zgłoszenie. Edytujesz README.md, docs/ (poza docs/zadania/)
i scripts/. Skrypty: Node 24 + tsx, @anchor-lang/core i @solana/web3.js 1.99.0, IDL z @unbox/shared, klucze w scripts/keys/
(poza gitem). Zacznij od scripts/demo-wallets.ts, fund.ts, status.ts, potem seed.ts i stage.ts (paid-expired).
Potem docs/uzasadnienie.md, docs/qa-jury.md, docs/demo.md i README.md (EN) z linkami do linii programu od Osoby 1.
Nie opisuj funkcji, których nie ma w kodzie.
```

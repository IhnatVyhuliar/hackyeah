# Osoba 3: AI, czyli weryfikacja nagrań pakowania i otwarcia

## Rola i cel
Budujesz serwis, który ogląda dwa nagrania (pakowanie u sprzedającego i otwarcie przy paczkomacie) i zwraca **pomiary**:
- czy plomba QR się zgadza i jest nienaruszona;
- czy nagranie jest ciągłe, czyli paczka cały czas w kadrze, bez cięć i przerw (wykrycie podmiany);
- czy to ta sama paczka;
- czy w środku jest ten sam przedmiot;
- czy przedmiot ma nieujawnione wady;
- czy spełnia testy dodatkowe sprzedającego (np. „pokaż metkę z rozmiarem M”).

**Twój serwis nigdy nie decyduje o pieniądzach.** Nie zwraca „wypłać” ani „zwróć”. Decyzję liczy program on-chain z Twoich pomiarów i progów zapisanych przy wpłacie (KONTRAKT §3). To ważny argument przed jury: AI jest „termometrem”, a nie sędzią.

Pracujesz **samodzielnie, bez backendu**: najpierw CLI na własnych nagraniach, potem HTTP API. Serwer Osoby 4 podłączy się do Ciebie ok. H+8–H+12.

## Twoje foldery
- `/ai`: kod, testy, Dockerfile, `ai/samples/README.md` z opisem nagrań i oczekiwanymi wynikami.
- Nagrania `.mp4` na wspólnym dysku zespołu (nie w git; `ai/samples/*.mp4` w `.gitignore`).

**Nie dotykasz:** niczego poza `/ai`.

## Przeczytaj najpierw
`CLAUDE.md`, `docs/KONTRAKT.md`: §3 (jak program używa Twoich pomiarów), §6 (format plomby), §7 (`VerificationReport`, `Measurements`: kształt Twojej odpowiedzi), §9.4 (jak aplikacja nagrywa i jakie wysyła `markers`), §10 (endpointy i **definicje pomiarów**), §11 (plomby demo i 5 nagrań).

## Stack i setup
Python 3.11+, FastAPI + uvicorn, `python-multipart`, `opencv-python-headless`, `zxing-cpp` (odczyt QR, odporniejszy niż samo OpenCV), `numpy`, `pydantic` v2, `anthropic` (Claude vision), `httpx`, `typer` (CLI), `pytest`. Systemowo: `ffmpeg` i `ffprobe`.

```bash
cd hackyeah/ai
python -m venv .venv && source .venv/bin/activate     # albo uv
pip install fastapi "uvicorn[standard]" python-multipart opencv-python-headless zxing-cpp numpy pydantic anthropic httpx typer pytest
export ANTHROPIC_API_KEY=...   # albo `ant auth login`
uvicorn sellsol_ai.api:app --port 8000 --reload
```
Zainstaluj zależności zanim zaczniesz pracę na miejscu, bo sieć na wydarzeniu bywa wolna. **Przed pisaniem kodu wywołania Claude uruchom w Claude Code skill `claude-api`.** Ma aktualne szczegóły API (structured outputs, obrazy, effort, obsługa `refusal`).

Układ:
```
ai/sellsol_ai/
  config.py        # env: ANTHROPIC_API_KEY, AI_MODEL (domyślnie claude-opus-5-5), AI_DATA_DIR, PUBLIC_BASE_URL
  schemas.py       # Pydantic = KONTRAKT §7 (alias_generator=to_camel, serializacja by_alias → JSON w camelCase)
  video.py         # ffprobe (czas trwania, znaczniki czasu klatek), próbkowanie klatek
  qr.py            # zxing-cpp: dekodowanie, bbox, oś czasu plomby
  continuity.py    # cięcia, dziury w czasie, luki widoczności plomby → recordingValid
  vision.py        # jedno wywołanie Claude (structured output) → VisionAssessment
  fallback.py      # podobieństwo histogramów HSV, gdy brak klucza albo błąd LLM
  refs.py          # klatki referencyjne pakowania: AI_DATA_DIR/refs/<order_id>/
  analyze.py       # analyze_packing(), analyze_unboxing() → VerificationReport
  api.py           # FastAPI
  cli.py           # typer: analyze, eval
ai/tests/  ai/samples/README.md  ai/Dockerfile
```

## Zadania

### P0. Nagrania testowe (do H+4, wszyscy na nie czekają)
- [ ] W H0 umów się z Osobą 1, jaki przedmiot nagrywacie (np. kurtka jeansowa = oferta `l-kurtka-levis`). Zrób 3 zdjęcia „ofertowe” tego przedmiotu i oddaj je Osobie 1 (fixtures).
- [ ] Plomby 01 i 02 z KONTRAKT §11: wydrukowane od Osoby 1 (H+2) albo wygeneruj sam z treści `SELLSOL1|<orderId>|<nonce>` (np. `qrencode`). Rozmiar min. 5×5 cm, przyklejone taśmą.
- [ ] Nagraj telefonem (720p, 30 fps, 20–45 s, dobre światło) 5 plików z §11:
  - `packing_ok`: pokaż przedmiot ze wszystkich stron → włóż do pudełka → zaklej → naklej plombę 01 → pokaż zaklejoną paczkę z plombą;
  - `unboxing_ok`: pokaż nienaruszoną plombę 01 → otwórz, nie wyjmując paczki z kadru → wyjmij i pokaż przedmiot + metkę „M”;
  - `unboxing_defect`: jak `ok`, ale pokaż „wadę” (np. kawałek taśmy udający plamę albo przyczepioną dziurę);
  - `unboxing_swap`: inna paczka z plombą 02 albo inny przedmiot w środku;
  - `unboxing_invalid`: paczka wychodzi z kadru na > 2 s albo nagranie z cięciem.
- [ ] Do każdego pliku `markers.json` (ms od startu: `sealShownMs`, `openStartMs`, `productShownMs`, `defectShownMs`), bo w aplikacji wyśle je przycisk kroku.
- [ ] `ai/samples/README.md`: tabela plik → plomba → oczekiwane pomiary (z §11).

### P0. Część deterministyczna: CLI (do M1 = H+6)
- [ ] `video.py`: ffprobe (czas trwania, `pts` klatek) → dziury w znacznikach czasu > 500 ms (`continuity.timestampGaps`). Próbkowanie 2 fps przy 480p, gęściej (6 fps) w oknie ±3 s wokół `sealShownMs`.
- [ ] `qr.py`: dekodowanie zxing-cpp na każdej próbce. Oś czasu: `firstSeenMs`, `lastSeenSealedMs` (ostatnie odczytanie przed `openStartMs`), lista odczytanych treści.
  - `seal.detected` = odczytano jakąkolwiek plombę;
  - `seal.payloadMatch` = odczytano `expected_qr`;
  - `qrMatch` = `payloadMatch` i brak innej treści `SELLSOL1|…`.
- [ ] `continuity.py`:
  - cięcia przez różnicę histogramów sąsiednich klatek (próg dobrany na nagraniach) → `sceneCutsMs`;
  - `maxSealGapMs` = najdłuższa przerwa w odczycie plomby w fazie zaklejonej (od pierwszego odczytu do `openStartMs`);
  - `recordingValid` według definicji z KONTRAKT §10;
  - `issues` jako zdania po polsku („Paczka poza kadrem przez 3,4 s (12,0–15,4 s)”).
- [ ] `cli.py analyze --kind packing|unboxing --video X --order-id … --expected-qr … --markers markers.json [--listing-photos a.jpg,b.jpg] [--extra-tests tests.json]` → wypisuje `VerificationReport` JSON.

**Akceptacja M1:** na 5 nagraniach `recordingValid`, `qrMatch`, `seal.*` i `continuity.*` zgadzają się z tabelą w `samples/README.md`.

### P0. Claude vision (H+6–H+10)
- [ ] `vision.py`: **jedno** wywołanie na analizę, model z `AI_MODEL` (domyślnie `claude-opus-5-5`). Python SDK `anthropic`: `client.messages.parse(model=..., max_tokens=..., messages=[...], output_format=VisionAssessment)` → `response.parsed_output`.
- [ ] Obrazy jako bloki `{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": ...}}`, dłuższy bok ≤ 1024 px, łącznie ≤ 12. Każdy poprzedzony etykietą tekstową, np. „Zdjęcie oferty 1”, „Pakowanie: przedmiot t=12,0 s”, „Pakowanie: zaklejona paczka t=31,5 s”, „Otwarcie: zaklejona paczka t=2,1 s”, „Otwarcie: przedmiot t=24,0 s”.
- [ ] Dobór klatek: produkt wokół `productShownMs` (3 klatki), zaklejona paczka (koniec pakowania i początek otwarcia), wada wokół `defectShownMs`, metka i testy dodatkowe.
- [ ] `VisionAssessment` (Pydantic): `seal_intact: bool`, `seal_note`, `package_score: int 0–100`, `package_note`, `product_visible: bool`, `match_score: int 0–100`, `match_note`, `defects: list[{label, severity: minor|major, frame_label, confidence}]`, `extra_tests: list[{test_id, passed, note}]`, `summary_pl`.
- [ ] Prompt systemowy: „Jesteś modułem pomiarowym weryfikacji przesyłek. Zwracasz wyłącznie obserwacje i oceny liczbowe, nie decydujesz, kto dostaje pieniądze. Wady już ujawnione w opisie i stanie oferty nie są nowymi wadami. Notatki po polsku.” Do promptu dodaj `listing_description`, stan oferty i listę testów.
- [ ] Mapowanie na `measurements` według KONTRAKT §10 (`defectFound` = wada `major` z `confidence ≥ 0.6`, `testsPassed` = wszystkie testy zaliczone albo brak testów).
- [ ] Raport pakowania: `packingOk` według §10 (brak cięć i dziur, plomba odczytana i zgodna, `productVisible`), `measurements = null`. Raport otwarcia: `packingOk = null`, `measurements` bez `weightDiffG` (dokłada go serwer z danych paczkomatu).
- [ ] Obsługa błędów: `stop_reason == "refusal"`, timeout, brak klucza → `fallback.py` (HSV dla `packageScore` i `matchScore`, `sealIntact = qrMatch`, `defects = []`) i `engine.llm = null` + zdanie w `reasons`.
- [ ] Audyt: zapisz zapytanie (bez obrazów, tylko etykiety i hasze klatek) i surową odpowiedź do `AI_DATA_DIR/audit/<order_id>-<kind>.json`. Przydaje się przy pytaniach „a jeśli AI się pomyli?”.

### P0. HTTP API (do H+8, adres dla Osoby 4)
- [ ] Endpointy z KONTRAKT §10: `GET /health`, `POST /v1/analyze/packing`, `POST /v1/analyze/unboxing`, `GET /v1/keyframes/{order_id}/{name}.jpg`.
- [ ] `listing_photos` to lista URL-i: pobierz je przez `httpx` (timeout 10 s). W CLI to ścieżki lokalne.
- [ ] Pakowanie zapisuje klatki referencyjne w `refs/<order_id>/`. Otwarcie ich używa, a gdy ich brak, pobiera `packing_video_url` i analizuje ponownie.
- [ ] `videoSha256` liczysz sam z otrzymanego pliku. Serwer porównuje go ze swoim.
- [ ] `keyframes` mają URL-e absolutne (`PUBLIC_BASE_URL`). Serwer je kopiuje.
- [ ] Wydajność: < 30 s na 60 s wideo (zmierz i wpisz do `engine.processingMs`).

### P1. Strojenie i eval (H+10–H+14)
- [ ] `cli.py eval`: przechodzi 5 nagrań, wypisuje tabelę „zmierzone vs oczekiwane”, kod wyjścia ≠ 0 przy rozbieżności.
- [ ] Dostrój progi (różnica histogramów, luka 2 s, rozdzielczość) tak, żeby `eval` był zielony 3 razy z rzędu. Zwróć uwagę na niedeterminizm LLM.
- [ ] Dodaj 1–2 nagrania „trudne” (słabe światło, ręka zasłania plombę na 1 s): mają przejść jako ważne.

### P1. Uruchomienie dla zespołu (do H+12)
- [ ] `ai/Dockerfile` (python-slim + ffmpeg). Uruchom na laptopie. Osoba 4 wystawi go tunelem albo na hostingu.
- [ ] `ai/README.md`: jak uruchomić, zmienne env, przykład `curl`.

### P2. Jeśli zostanie czas
- [ ] Kontrola wagi z paczkomatu w raporcie (jeśli serwer prześle wagi).
- [ ] Detekcja „to samo pudełko” po kolorze taśmy i krawędziach (OpenCV) jako drugi sygnał obok Claude.
- [ ] Podgląd raportu jako prosta strona HTML (`GET /v1/report/{order_id}`) do pokazania jury.

## Co dostarczasz i co konsumujesz
| Dostarczasz | Komu | Kiedy |
|---|---|---|
| 3 zdjęcia ofertowe przedmiotu | O1 | H+2 |
| 5 nagrań + `markers.json` + oczekiwane wyniki | wszyscy | H+4 |
| CLI `analyze` (część deterministyczna) | wszyscy (M1) | H+6 |
| serwis HTTP pod adresem + przykładowy `curl` | O4 | H+8 |
| `eval` zielony, Dockerfile | O4 | H+12 |

| Konsumujesz | Od kogo | Kiedy |
|---|---|---|
| wydrukowane plomby (albo generujesz sam) | O1 | H+2 |
| typy `VerificationReport` (masz je w KONTRAKT §7) | O4 | H+1 |

## Jak testować samodzielnie
- `python -m sellsol_ai.cli analyze …` i `python -m sellsol_ai.cli eval` na swoich nagraniach.
- `pytest` dla `qr.py` i `continuity.py` (np. syntetyczne wideo z OpenCV: klatki z QR i bez).
- Walidacja kształtu JSON: porównaj z przykładem `reports.json` od Osoby 1 albo schematami zod (Osoba 4 może uruchomić `VerificationReportSchema.parse` na Twoim wyniku).

## Definition of Done
- [ ] `POST /v1/analyze/unboxing` na 5 nagraniach daje pomiary zgodne z tabelą, poniżej 30 s.
- [ ] Bez `ANTHROPIC_API_KEY` serwis dalej działa (fallback), a raport to zaznacza.
- [ ] Odpowiedź przechodzi walidację `VerificationReportSchema` z `@sellsol/shared`.
- [ ] Nigdzie w odpowiedzi nie ma „wypłać/zwróć”, tylko pomiary, `reasons` i keyframe'y.

## Pułapki
- QR z daleka i pod kątem słabo się czyta. Na nagraniach trzymaj plombę blisko na 1–2 s przy `sealShownMs`. Aplikacja ma przycisk kroku właśnie po to.
- Nie wysyłaj do Claude dziesiątek klatek: koszt i czas. Wystarczy kilka dobrze wybranych.
- Klucze JSON w camelCase (zgodnie z §7), nie snake_case: ustaw aliasy w Pydantic.
- Nie zapisuj nagrań w git. Nie wysyłaj ich nigdzie poza Claude i własnym dyskiem.
- Model domyślny `claude-opus-5-5`. Zmiana na inny tylko decyzją zespołu (zmienna `AI_MODEL`).

## Prompt startowy do Claude Code
```
Pracujesz w repo SellSol (hackathon, 24 h). Przeczytaj CLAUDE.md, docs/KONTRAKT.md (§3, §6, §7, §9.4, §10, §11)
i docs/zadania/3-ai-weryfikacja.md. Jesteś Osobą 3: serwis AI w /ai (Python 3.11, FastAPI, OpenCV, zxing-cpp, anthropic).
Serwis zwraca wyłącznie pomiary (VerificationReport z §7, JSON w camelCase), nigdy decyzji o pieniądzach.
Zacznij od schemas.py (Pydantic 1:1 z §7), potem video.py, qr.py, continuity.py i CLI `analyze` na nagraniach z ai/samples.
Dopiero gdy część deterministyczna przechodzi na 5 nagraniach, dodaj vision.py (jedno wywołanie Claude, structured output,
model z env AI_MODEL, domyślnie claude-opus-5-5; przed pisaniem użyj skilla claude-api) i fallback bez klucza.
Na końcu FastAPI z endpointami z §10 i CLI `eval`.
```

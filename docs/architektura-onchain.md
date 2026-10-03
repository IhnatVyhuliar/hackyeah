# Logika pośrednika on-chain: audyt KONTRAKTU i propozycje zmian

Wymaganie organizatorów (nadrzędne): *„The logic that replaces the intermediary must live in the on-chain program. If your backend enforces the transaction terms, the intermediary has not disappeared; it has simply become you.”*

Status: **propozycja do ustalenia z zespołem** (Osoba 4 → wszyscy, zwłaszcza Osoba 2). Po akceptacji punkty P1–P5 trafią do `KONTRAKT.md` commitem `contract:`.

## 1. Co już jest zgodne

| Wymaganie | Gdzie w KONTRAKCIE | Uwagi |
|---|---|---|
| Utworzenie escrow i depozyt do PDA programu | §5.2 `fund_escrow`, §5.3 | Konto `Escrow` (PDA `["escrow", order_id]`) jest jednocześnie vaultem: lamporty leżą na koncie należącym do programu |
| Zapis warunków | `terms_hash`, `amount`, `thresholds`, okna w `Escrow` | Sprzedający akceptuje je w `commit_shipment` (`expected_amount`, `expected_terms_hash`) |
| Autoryzacja ról | §5.2 kolumna „Podpisuje”, §5.2 `address = escrow.<pole>` | Patrz P2: preferujemy `has_one` |
| Status i ochrona przed ponownym rozliczeniem | `EscrowStatus`, każda instrukcja wymaga konkretnego statusu | `Released`/`Refunded` są terminalne → `InvalidStatus` |
| Warunki wypłaty i zwrotu | §3 liczone w `submit_verdict` i `claim_timeout` | Weryfikator podaje pomiary, a nie „verified=true” |
| Terminy | `ship_window`/`open_window` to **długości**; terminy liczy program | Klient nie podaje znacznika czasu. Patrz P1 |
| Serwer nie decyduje o pieniądzach | §9.5, `server/src` | W trybie `CHAIN=devnet` serwer tylko buduje niepodpisane transakcje, czyta konto i wysyła pomiary. `evaluateVerdict`/`fakeChain` z `@sellsol/shared` są używane wyłącznie przez `CHAIN=mock`; `timeoutOutcome` służy tylko jako wstępne sprawdzenie (UX) przed `claim_timeout`, które i tak egzekwuje program |

## 2. Konflikt: pkt 4 („program musi zweryfikować wszystko, co jest potrzebne do decyzji”)

Programu nie da się zmusić do obejrzenia nagrania. **Ten model nie spełnia dosłownie pkt 4** i mówimy to wprost.

### Model zaufania

| Kto | Co dostarcza | Czemu ufamy | Czego NIE robi |
|---|---|---|---|
| Wyrocznia (serwer z kluczem `escrow.verifier`) | surowe pomiary z nagrania: `recording_valid`, `qr_match`, `seal_intact`, `package_score`, `match_score`, `defect_found`, `tests_passed`, oraz `weight_diff_g` ze zdarzeń paczkomatu (dziś mock) | **zaufane źródło pomiarów**: poprawność pomiarów zależy od serwisu AI i uczciwości operatora klucza | nie wysyła werdyktu (`verified=true`, „wypłać”, „zwróć”), nie wybiera odbiorcy, nie podaje kwoty ani czasu |
| Kupujący | hasz nagrania otwarcia w `open_claim` (`unboxing_video_hash`), on-chain przed pomiarami | podpis kupującego | — |
| Program `sellsol_escrow` | decyzja release/refund | kod on-chain, jawny i niezmienny w trakcie transakcji | — |

Przepływ decyzji:
1. Kupujący zapisuje on-chain hasz nagrania otwarcia (`open_claim`). Plik leży publicznie pod `/media/<sha256>`, a każdy może sprawdzić, że jego sha256 zgadza się z haszem w escrow.
2. Wyrocznia wysyła `submit_verdict(measurements)` dla nagrania o tym haszu. Dziś powiązanie z haszem sprawdza serwer; P4 przenosi to sprawdzenie do programu.
3. Program sam stosuje progi `thresholds` zapisane w escrow w chwili `fund` (zaakceptowane przez sprzedającego w `commit_shipment`), liczy tabelę §3 i sam przelewa środki zwycięzcy. Termin `verdict_deadline` sprawdza z `Clock`.

Uprawnienia weryfikatora są ograniczone przez program:
- może wskazać tylko kupującego albo sprzedającego, a środki nigdy nie trafią do niego;
- opłata nie zależy od wyniku;
- jeśli weryfikator zniknie, `VerifierTimeout` zwraca środki kupującemu;
- pomiary i hasze zostają on-chain jako publiczny dowód, a nagranie można pobrać spod `/media/<sha256>` i sprawdzić hasz.

Proponujemy przenieść do programu to, co **da się** sprawdzić on-chain (P3, P4), a resztę opisać uczciwie jako wyrocznię w README i decku.

## 3. Propozycje zmian (do akceptacji)

**P1. Czas wyłącznie z `Clock::get()?.unix_timestamp`.** Dopisać to wprost w §5.2. Żadna instrukcja nie przyjmuje znacznika czasu. Okna są długościami, sprawdzanymi względem `Config` (min/max).

**P2. Ograniczenia Anchor zamiast ręcznych sprawdzeń.**
- `#[account(mut, seeds = [b"escrow", escrow.order_id.as_ref()], bump = escrow.bump, has_one = buyer, has_one = seller, has_one = fee_wallet)]`;
- `has_one = verifier` w `submit_verdict`;
- `Signer` dla `buyer`/`seller`/`verifier`;
- `seeds = [b"config"], bump = config.bump` dla `Config`.
Zapisać w §5.2.

**P3. Zgodność plomby z commitmentem sprawdzana przez program.** Nowy argument `open_claim(unboxing_video_hash, seal_nonce: [u8;16])`. Program liczy `sha256("SELLSOL1|" + uuid(order_id) + "|" + hex(nonce))`, porównuje z `seal_hash` zapisanym przez sprzedającego w `commit_shipment` i zapisuje wynik w escrow (`seal_verified`). W `submit_verdict` zamiast `m.qr_match` używa `escrow.seal_verified && m.qr_match`. Kupujący i tak skanuje plombę przy paczkomacie, więc aplikacja ma nonce.

Co to daje, a czego nie:
- Program sam sprawdza, że podany nonce **pasuje do commitmentu** sprzedającego. To jest zgodność danych, a nie dowód, skąd pochodzą.
- Program **nie potwierdza autentyczności skanu**. Nie wie, czy nonce odczytano z fizycznej plomby przy paczkomacie, czy zdobyto inaczej (np. zdjęcie QR w transporcie, §13). Autentyczność dalej zależy od źródła danych: nagrania ocenianego przez wyrocznię (`qr_match`, `seal_intact`) i w przyszłości od attestacji urządzenia albo paczkomatu.
- Zysk: wyrocznia nie może sama „uznać” zgodności plomby, gdy nonce nie pasuje. Jeden składnik `transit_ok` przestaje zależeć wyłącznie od wyroczni.
Dotyczy: O2 (program, wektor testowy z §6), O1 (aplikacja przekazuje nonce ze skanu), O4 (SDK, `tx/prepare`). Koszt: ok. 30 min. Wektor: `sealHash` z §6.

**P4. Werdykt powiązany z dowodem.** `submit_verdict(m, unboxing_video_hash)` z warunkiem `== escrow.unboxing_video_hash`, inaczej `EvidenceMismatch`. Wyrocznia nie może przysłać pomiarów dla innego nagrania niż to, które kupujący zatwierdził on-chain.

**P5. Inwarianty wypłaty w programie.**
- wypłata `amount - fee` i `fee` dokładnie z `escrow.amount`; żadna instrukcja nie przyjmuje kwoty wypłaty;
- po wypłacie saldo PDA ≥ rent-exempt minimum;
- `checked_sub`/`checked_add`.

## 4. Testy negatywne programu (Osoba 2, `/program/tests`)

| Wymaganie | Przypadek testowy | Oczekiwany błąd |
|---|---|---|
| obca osoba release/refund | `confirm_receipt` podpisany przez sprzedającego albo trzeci klucz; `seller_decline` przez kupującego; `submit_verdict` przez inny klucz niż `escrow.verifier` | `Unauthorized` / `UnauthorizedVerifier` / `ConstraintHasOne` |
| zły PDA/vault | konto escrow innego `order_id`; konto spoza programu podstawione jako escrow; zły `config` | `ConstraintSeeds` / `AccountOwnedByWrongProgram` |
| settlement dwa razy | po `Released` kolejno: `confirm_receipt`, `submit_verdict`, `claim_timeout`, `seller_decline` | `InvalidStatus` |
| release przed warunkiem | `submit_verdict` w `Shipped` (bez `open_claim`); `confirm_receipt` w `Funded` | `InvalidStatus` |
| refund przed/po terminie | `claim_timeout` w `Funded` przed `ship_deadline` → błąd, po terminie → `ShipTimeout`; `open_claim` po `open_deadline`; `submit_verdict` po `verdict_deadline`; `commit_shipment` po `ship_deadline` | `DeadlineNotReached` / `DeadlinePassed` |
| sfałszowany czas/dane | brak argumentu czasu (test, że deadline liczy się z `Clock`, przez warp zegara w Surfpool albo bankrun); wyniki > 100; okna poza `Config`; zerowe hasze; `expected_amount`/`expected_terms_hash` ≠ zapisane | `InvalidScore` / `InvalidWindow` / `EmptyHash` / `AmountMismatch` / `TermsMismatch` |
| niezgodny buyer/seller | `buyer == seller` w `fund`; podstawione konto odbiorcy (`seller`/`buyer`/`fee_wallet` ≠ zapisane w escrow) | `SameParty` / `ConstraintHasOne` (`ConstraintAddress`) |
| wypłata większej kwoty | sprawdzenie sald po każdym rozliczeniu: zwycięzca `+ (amount - fee)`, `fee_wallet` `+ fee`, PDA zostaje z rentem; brak instrukcji z kwotą wypłaty | asercje sald |

## 5. Co zostaje w TypeScript (tylko klient, serializacja, UX)

- `types`, `schemas`, `helpers` w `@sellsol/shared`: kształt danych, walidacja wejścia, hasze i PDA do budowy transakcji.
- `evaluateVerdict`, `timeoutOutcome` i `fakeChain`: kopia tabeli §3 do trybów mock i podglądu. Nie są używane do rozliczeń na devnecie.
- `deriveStatus`: etykieta dla UI. Terminalny stan on-chain zawsze wygrywa.

# Osoba A: aplikacja ↔ server — plan wdrożenia

> **Dla agenta:** WYMAGANY SUB-SKILL: superpowers:subagent-driven-development (zalecany) albo superpowers:executing-plans. Kroki mają checkboxy (`- [ ]`).

**Cel:** prototyp `Front-end/sellsor-rn` staje się prawdziwą aplikacją w `app/` (pnpm workspace). Dane bierze z REST `server/`, nagrania wysyła do `server/` `/media`, a każdą operację na pieniądzach wykonuje przez interfejs `Escrow`.

**Architektura:** `AppProvider.tsx` zostaje silnikiem widoku (`dv()`/`vm()` bez większych zmian). Pod spodem:
- `app/src/api/` (REST);
- `app/src/data/fromServer.ts` (JSON serwera → kształt pozycji, którego używa prototyp);
- `app/src/escrow/` (wybór implementacji `Escrow`);
- `app/src/media/` (kamera, hash, upload, karta QR).

Przez cały dzień pracujesz na serwerze w trybie `PAYMENTS=demo` z własną implementacją `DemoEscrow`. Implementację łańcuchową (`app/src/solana/`) pisze osoba B; podpinacie ją w punkcie I1.

**Stack:** Expo (aktualne SDK, Expo Go), React Native, TypeScript, pnpm workspace, `@unbox/shared`, `server/` (Rust, axum) w trybie demo.

**Spec:** `CLAUDE.md` (§3 przepływ, §6 aplikacja), `server/README.md` (endpointy i kody błędów), `docs/ui.md` (teksty i stany), `Front-end/sellsor-rn/README.md` (co jest mockiem).

**Drugi plan (osoba B):** `docs/superpowers/plans/2026-10-04-b-escrow-chain.md`. Nie edytujesz plików z jego listy.

## Global Constraints

- UI po polsku, kod, identyfikatory i commity po angielsku. W UI nie piszemy „transakcja on-chain”, „podpis”, „lamport”, „PDA”.
- Kolejność zawsze ta sama: **najpierw upload, potem `escrow.*`, potem (tylko `mode === 'solana'`) `POST /api/chain/sync/{deal}`, na końcu odświeżenie**. Błąd sync połykasz, bo odczyt i tak dociągnie stan.
- Aplikacja nigdy nie jest jedynym strażnikiem reguły. Ukrycie przycisku jest w porządku, ale decyzję podejmuje serwer (demo) albo program (solana).
- Nagrania: tylko z kamery w aplikacji, 720p, maks. 120 s, bez galerii.
- Nowe natywne zależności tylko te z listy w A1 (wszystkie działają w Expo Go).
- `pnpm install` tylko na hoście, nie w dev containerze.
- Nie commitujesz `.env`, kluczy ani tokenów.
- Commituj małymi kawałkami. Przed pushem `git pull --rebase`. Nigdy force-push na `main`.

## Podział plików z osobą B (nie wchodzicie sobie w drogę)

| Twoje (A) | Osoby B (nie edytujesz) |
|---|---|
| `app/**` poza `app/src/solana/**` | `app/src/solana/**` (Ty tworzysz tylko stub `index.ts` w A1, potem należy do B) |
| `server/src/**` poza `server/src/solana/**` (wyjątek: B0 dopisuje `application/json` w `allowed_mime`) | `server/src/solana/**`, `programs/**`, `tests/**`, `cli/**`, `oracle/**` |
| `packages/shared/src/{types,schemas,constants,helpers,dealMachine}.ts` + ich testy | `packages/shared/src/escrow.ts`, `packages/shared/idl/**`, `packages/shared/package.json` |
| `app/package.json`, `app/.env.example`, `app/README.md` | `CLAUDE.md` (decyzje dopisuje B; swoje zgłoś B) |

## Kontrakt `Escrow` (tworzy go B w zadaniu B0, ok. 02:15)

Plik `packages/shared/src/escrow.ts`, eksportowany z `@unbox/shared`. Jest zamrożony: zmiana tylko za zgodą obu osób, osobnym commitem.

```ts
export interface DealKey { id: string; deal: string | null }     // id = id ogłoszenia/transakcji na serwerze; deal = PDA (onchain.deal), null w demo
export interface PublishArgs { listingId: string; deal: string; dealId: number; priceLamports: number;
  listingHash: Hex32; metadataUri: string; arbiter: string; programId: string }   // = JSON z POST /api/listings/{id}/publish
export interface TxResult { signature: string | null; explorerUrl: string | null }
export interface QrCard { kind: 'ship' | 'return'; payload: string; commitment: Hex32 }
export type EscrowErrorCode = 'InvalidStatus' | 'Unauthorized' | 'DeadlinePassed' | 'DeadlineNotReached'
  | 'ListingMismatch' | 'ArbiterMismatch' | 'QrMismatch' | 'InsufficientFunds' | 'Network' | 'Rejected';
export class EscrowError extends Error { readonly code: EscrowErrorCode }      // message po polsku, gotowy do UI
export const isEscrowError = (e: unknown): e is EscrowError => …;
export interface ComplaintInput { category: ComplaintCategory; description: string }
export interface Escrow {
  readonly mode: 'solana' | 'demo';
  walletAddress(): Promise<string | null>;
  networkNow(): Promise<Unix>;
  requestTestSol(): Promise<TxResult>;
  createListing(a: PublishArgs): Promise<TxResult>;
  cancelListing(k: DealKey): Promise<TxResult>;
  purchase(k: DealKey): Promise<TxResult>;
  newQrCard(kind: 'ship' | 'return', k: DealKey): Promise<QrCard>;
  markShipped(k: DealKey, i: { qrCommitment: Hex32; packingVideoSha256: Hex32; trackingNumber: string }): Promise<TxResult>;
  acceptDelivery(k: DealKey, qrPayload: string): Promise<TxResult>;
  openDispute(k: DealKey, i: { qrPayload: string; unboxingVideoSha256: Hex32; complaint: ComplaintInput; complaintSha256: Hex32 }): Promise<TxResult>;
  markReturned(k: DealKey, i: { returnQrCommitment: Hex32; returnVideoSha256: Hex32; trackingNumber: string }): Promise<TxResult>;
  confirmReturn(k: DealKey, returnQrPayload: string): Promise<TxResult>;
  settleExpired(k: DealKey): Promise<TxResult>;
}
```

Payload QR jest dla Ciebie nieprzezroczysty. Drukujesz `card.payload`, a zeskanowany tekst przekazujesz bez zmian do `acceptDelivery`, `openDispute` albo `confirmReturn`. Format (demo: `UNBOX1:<id>:<hex>`, solana: base58) zna tylko implementacja.

**Env aplikacji** (`app/.env.example`, A1):

```
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000   # IP laptopa w LAN, nie localhost
EXPO_PUBLIC_PAYMENTS=demo                      # demo | solana
EXPO_PUBLIC_RPC_URL=https://api.devnet.solana.com
EXPO_PUBLIC_ORACLE_PUBKEY=                     # klucz wyroczni (arbiter), od osoby B
```

**Punkty integracji z B:**
- **I1 (~11:00):** Twoje A5 + B6 → `EXPO_PUBLIC_PAYMENTS=solana`, serwer bez `PAYMENTS=demo`, happy path na 2 telefonach na devnecie.
- **I2 (~15:00):** A7 + B7/B8 → spór i zwrot na devnecie z wyrocznią.

## Review Focus

1. **Telefon nie widzi serwera** (`localhost` albo zły IP w `EXPO_PUBLIC_API_URL`) → `ApiError` z kodem `NETWORK` i polskim zdaniem z adresem, a w UI stan błędu z „Spróbuj ponownie” zamiast pustej listy. Test: A2 `client.test.ts`.
2. **Operacja przeszła, ale `chain/sync` padł** → UI pokazuje sukces, a polling dociąga status. Test: A5 `flow.test.ts`.
3. **Upload zerwany** → `escrow.*` nie jest wołane, nagranie zostaje na telefonie i można ponowić. Test: A5 `flow.test.ts`.
4. **Druga strona zmieniła status chwilę wcześniej** albo jest ponowienie po błędzie sieci → `InvalidStatus` → „Stan umowy już się zmienił”. „Spróbuj ponownie” najpierw odświeża dane i nie powtarza akcji, jeśli status już nie pasuje. Test: A3 smoke (podwójne `accept`) + A5 `flow.test.ts`.
5. **Portfel niepodpięty** (`PUT /api/me/wallet-address` nie przeszedł albo 409, bo adres jest zajęty) w trybie solana → „Kup” zablokowane z wyjaśnieniem, bo serwer nie przypisze zakupu do konta. Test: A4 `fromServer.test.ts` (`canBuy`).

---

### Task A1: aplikacja w `app/` jako pakiet workspace (do 02:30)

**Pliki:**
- Przenieś: `Front-end/sellsor-rn/` → `app/` (`git mv`, żeby zachować historię).
- Utwórz: `app/package.json`, `app/tsconfig.json`, `app/index.ts`, `app/polyfills.ts`, `app/.env.example`, `app/src/solana/index.ts` (stub).
- Usuń: `app/setup.sh` (zastępuje go workspace).
- Zmień: `app/README.md`.

**Interfejsy:**
- Produkuje: `pnpm --filter app start`; stub `createSolanaEscrow(): Escrow` w `app/src/solana/index.ts` (od B0 osoby B, potem własność B).

- [ ] **Krok 1: przenieś prototyp**

```bash
git pull --rebase
git mv Front-end/sellsor-rn app
git rm -q app/setup.sh
```

- [ ] **Krok 2: weź `package.json`, `tsconfig.json` i `index.ts` z aktualnego szablonu Expo**

```bash
cd "$(mktemp -d)" && npx create-expo-app@latest expo-tmp --template blank-typescript --no-install --yes
cp expo-tmp/package.json expo-tmp/tsconfig.json expo-tmp/index.ts ~/code/htdocs/hackyeah/app/
```

W `app/package.json` ustaw `"name": "app"` i `"private": true`, zostaw `"main": "index.ts"` i skrypty `start`/`android`/`ios` z szablonu. Dopisz:

```json
"scripts": { "typecheck": "tsc --noEmit" },
"dependencies": { "@unbox/shared": "workspace:*" }
```

(scal z istniejącymi sekcjami, nie zastępuj ich).

- [ ] **Krok 3: polyfille jako pierwszy moduł**

`app/polyfills.ts`:

```ts
// Must run before anything imports @solana/web3.js (getRandomValues, Buffer).
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
```

`app/index.ts`:

```ts
import './polyfills';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
```

(osobny plik, bo przypisanie w `index.ts` wykonałoby się dopiero po zaimportowaniu `App`).

- [ ] **Krok 4: zależności (Twoje + osoby B, żeby B nie dotykało `package.json`)**

```bash
cd ~/code/htdocs/hackyeah
pnpm --filter app exec npx expo install expo-font expo-status-bar react-native-svg react-native-safe-area-context \
  @expo-google-fonts/space-grotesk @expo-google-fonts/jetbrains-mono lucide-react-native \
  expo-camera expo-file-system expo-print expo-crypto expo-secure-store react-native-get-random-values
pnpm --filter app add @solana/web3.js@1.99.0 @anchor-lang/core@1.1.2 buffer @noble/hashes qrcode react-native-qrcode-svg
pnpm --filter app add -D @types/qrcode
pnpm install
```

Wersje web3/anchor wymuszają też root `pnpm.overrides`. Sprawdź `pnpm why @solana/web3.js`: w drzewie ma być jedna wersja 1.99.0.

- [ ] **Krok 5: `.env.example` i stub implementacji łańcuchowej**

`app/.env.example`: dokładnie cztery zmienne z sekcji „Env aplikacji” wyżej.

`app/src/solana/index.ts` (wymaga B0 na `main`; jeśli `escrow.ts` jeszcze nie istnieje, zrób ten krok na początku A3):

```ts
// Stub until person B lands the real implementation; owned by person B from now on.
import { EscrowError, type Escrow } from '@unbox/shared';

export function createSolanaEscrow(): Escrow {
  const off = async (): Promise<never> => {
    throw new EscrowError('Rejected', 'Płatności w sieci nie są jeszcze podłączone. Uruchom aplikację z EXPO_PUBLIC_PAYMENTS=demo.');
  };
  return {
    mode: 'solana', walletAddress: async () => null, networkNow: async () => Math.floor(Date.now() / 1000),
    requestTestSol: off, createListing: off, cancelListing: off, purchase: off, newQrCard: off, markShipped: off,
    acceptDelivery: off, openDispute: off, markReturned: off, confirmReturn: off, settleExpired: off,
  };
}
```

- [ ] **Krok 6: uruchom**

```bash
pnpm --filter app typecheck      # prototyp ma @ts-nocheck w AppProvider, reszta luźno typowana: ma przejść
pnpm --filter app start          # Expo Go na telefonie: prototyp działa jak przed przeniesieniem
```

Oczekiwane: ekran powitalny prototypu na telefonie, brak czerwonego ekranu. Jeśli Metro nie widzi `@unbox/shared`, sprawdź, czy root `.npmrc` ma `node-linker=hoisted` i czy `pnpm install` szedł z roota.

- [ ] **Krok 7: README i commit**

W `app/README.md` podmień sekcję „Uruchomienie” na `pnpm install` (root), `cp app/.env.example app/.env`, `pnpm --filter app start`.

```bash
git add app Front-end pnpm-lock.yaml
git commit -m "chore(app): move the Sellsor prototype into the app workspace package"
git push
```

Daj znać osobie B, że `app/` jest na `main` (B robi wtedy spike `@anchor-lang/core` na telefonie).

---

### Task A2: typy API w shared i klient REST (do 04:00)

**Pliki:**
- Zmień: `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/shared.test.ts`.
- Utwórz: `app/src/api/client.ts`, `app/src/api/index.ts`, `app/src/api/client.test.ts`, `app/scripts/api-smoke.ts`.

**Interfejsy:**
- Produkuje:
  - `ApiError { status: number; code: string; message: string }` (kody serwera + `NETWORK`);
  - `api.get/post/put<T>(path, body?)`, `setToken(t)`, `mediaUrl(sha)`;
  - `login(email, password) → { token, user }`, `me()`, `linkWallet(address)`;
  - `listings()`, `myListings()`, `listing(id)`, `createListing(input)`, `publishListing(id) → PublishArgs`;
  - `deals(role)`, `deal(id)`, `wallet()`, `categories()`;
  - `uploadFile(uri, mimeType, name) → MediaUpload`, `chainSync(deal)`.

- [ ] **Krok 1: test, który wymusza nowe typy**

Dopisz w `packages/shared/src/shared.test.ts`:

```ts
import { ListingSchema, WalletSchema } from './schemas';

describe('kształt API w trybie solana', () => {
  it('ogłoszenie w SOL z polem onchain i portfel z adresem', () => {
    const base = { id: 'l-1', sellerId: 'u-ania', seller: { id: 'u-ania', name: 'Ania' }, title: 't', description: 'd',
      categoryId: 'c', condition: 'dobry', brand: 'b', size: 'M', defects: [], photos: [], priceMinor: 60_000_000,
      currency: 'SOL', status: 'Listed', createdAt: 1, updatedAt: 1,
      onchain: { deal: '4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw', dealId: 1, sellerWallet: 'x', listingHash: 'ab'.repeat(32),
        metadataUri: 'http://x/api/listings/l-1/metadata.json', published: true } };
    expect(ListingSchema.parse(base).onchain?.published).toBe(true);
    expect(WalletSchema.parse({ balanceMinor: 1, currency: 'SOL', heldMinor: 0, ledger: [], address: 'x' }).address).toBe('x');
  });
});
```

Uruchom `pnpm --filter @unbox/shared test`. Oczekiwane: FAIL (`currency: 'SOL'` odrzucone, brak `onchain`).

- [ ] **Krok 2: typy i schematy 1:1 z `server/src/model.rs`**

W `types.ts`:
- `Currency = 'PLN' | 'SOL'`;
- `User.walletAddress?: string`;
- `Listing.onchain?: OnChainListing`, `Deal.onchain?: OnChainDeal`, `Wallet.address?: string`;
- nowe:

  ```ts
  export interface OnChainListing { deal: string; dealId: number; sellerWallet: string; listingHash: Hex32; metadataUri: string; published: boolean }
  export interface ChainTx { status: DealStatus; at: Unix; signature: string | null; explorerUrl: string | null }
  export interface OnChainDeal { deal: string; sellerWallet: string; buyerWallet: string; priceLamports: number; transactions: ChainTx[] }
  ```

W `schemas.ts`:
- `CurrencySchema = z.enum(['PLN', 'SOL'])`;
- `onchain: OnChainListingSchema.optional()` w `ListingSchema`, analogicznie w deal;
- `address: z.string().optional()` w `WalletSchema`;
- `walletAddress: z.string().optional()` w `UserSchema`.

`CURRENCY` w `constants.ts` zostaw (tryb demo). Uruchom `pnpm --filter @unbox/shared test && pnpm --filter @unbox/shared typecheck && pnpm test:contract`. Oczekiwane: PASS (contract-test jedzie w trybie demo, PLN dalej przechodzi).

- [ ] **Krok 3: test klienta (Review Focus 1)**

`app/src/api/client.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createApi } from './client';

test('unreachable server gives a NETWORK ApiError with the address in Polish', async () => {
  const api = createApi('http://127.0.0.1:9');            // port 9: nothing listens
  await assert.rejects(api.get('/api/health'), (e: unknown) =>
    e instanceof ApiError && e.code === 'NETWORK' && e.message.includes('127.0.0.1:9'));
});
```

Uruchom `node --import tsx --test app/src/api/*.test.ts`. Oczekiwane: FAIL (brak modułu).

- [ ] **Krok 4: klient**

`app/src/api/client.ts`:

```ts
// REST client for server/. Error shape: { error: { code, message } } with a Polish message.
import type { MediaUpload } from '@unbox/shared';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApi(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '');
  let token: string | null = null;

  async function request<T>(method: string, path: string, body?: unknown, form?: FormData, extra: Record<string, string> = {}): Promise<T> {
    const headers: Record<string, string> = { ...extra };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(base + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    } catch {
      throw new ApiError(0, 'NETWORK', `Brak połączenia z serwerem ${base}. Sprawdź Wi-Fi i adres EXPO_PUBLIC_API_URL.`);
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'INTERNAL', json?.error?.message ?? `Serwer odpowiedział ${res.status}.`);
    return json as T;
  }

  return {
    base,
    setToken: (t: string | null) => { token = t; },
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, body ?? {}, undefined, headers),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    /** Multipart upload of a local file (React Native: { uri, name, type }). */
    uploadFile: (uri: string, mimeType: string, name: string) => {
      const form = new FormData();
      form.append('file', { uri, name, type: mimeType } as unknown as Blob);
      return request<MediaUpload>('POST', '/api/media', undefined, form);
    },
    /** Same upload from Node scripts (Blob instead of a file uri). */
    uploadBlob: (blob: Blob, name: string) => {
      const form = new FormData();
      form.append('file', blob, name);
      return request<MediaUpload>('POST', '/api/media', undefined, form);
    },
    mediaUrl: (sha: string) => `${base}/media/${sha}`,
  };
}

export type Api = ReturnType<typeof createApi>;
export const api = createApi(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000');
```

`app/src/api/index.ts` dostarcza typowane funkcje domenowe:

```ts
import type { Category, Deal, Listing, PublishArgs, User, Wallet } from '@unbox/shared';
import { api } from './client';

export { api, ApiError } from './client';
export const login = async (email: string, password: string) => {
  const r = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
  api.setToken(r.token);
  return r;
};
export const me = () => api.get<User>('/api/me');
export const linkWallet = (address: string) => api.put<User>('/api/me/wallet-address', { address });
export const categories = () => api.get<Category[]>('/api/categories');
export const listings = () => api.get<Listing[]>('/api/listings');
export const myListings = () => api.get<Listing[]>('/api/me/listings');
export const createListing = (input: unknown) => api.post<Listing>('/api/listings', input);
export const publishListing = (id: string) => api.post<PublishArgs>(`/api/listings/${id}/publish`);
export const deals = (role: 'buyer' | 'seller') => api.get<Deal[]>(`/api/deals?role=${role}`);
export const deal = (id: string) => api.get<Deal>(`/api/deals/${id}`);
export const wallet = () => api.get<Wallet>('/api/me/wallet');
export const chainSync = (dealPda: string) => api.post<unknown>(`/api/chain/sync/${dealPda}`);
```

- [ ] **Krok 5: test i smoke na żywym serwerze**

```bash
node --import tsx --test app/src/api/*.test.ts                   # PASS
PAYMENTS=demo AI=mock ENABLE_DEV_CLOCK=1 pnpm dev:server          # osobny terminal (albo w dev containerze)
```

`app/scripts/api-smoke.ts`: loguje `bartek@demo.pl` / `demo1234`, wypisuje liczbę `listings()`, `wallet().balanceMinor` i `deals('buyer').length`, a na końcu woła `api.get('/api/nie-ma')` i sprawdza, że rzuca `ApiError` z `NOT_FOUND`. Uruchom `EXPO_PUBLIC_API_URL=http://localhost:4000 node --import tsx app/scripts/api-smoke.ts`. Oczekiwane: trzy liczby i `ok`.

- [ ] **Krok 6: commit**

```bash
git add packages/shared/src app/src/api app/scripts/api-smoke.ts
git commit -m "feat(app): REST client for server/ and SOL-mode API types in shared"
```

---

### Task A3: `DemoEscrow` i wybór implementacji (do 05:00)

**Pliki:**
- Utwórz: `app/src/escrow/demo.ts`, `app/src/escrow/index.ts`, `app/scripts/demo-escrow-smoke.ts`.

**Interfejsy:**
- Konsumuje: `Escrow`, `EscrowError` (B0), `createQr`, `parseQrPayload` z `@unbox/shared`, `api` (A2).
- Produkuje: `createDemoEscrow(a?: Api): Escrow`; `escrow: Escrow` (singleton) w `app/src/escrow/index.ts`.

- [ ] **Krok 1: smoke, który przechodzi całą maszynę stanów przez `Escrow`**

`app/scripts/demo-escrow-smoke.ts` (uruchamiany na serwerze `PAYMENTS=demo AI=mock ENABLE_DEV_CLOCK=1`, po `cargo run -- seed-reset`):

```ts
import assert from 'node:assert/strict';
import { isEscrowError } from '@unbox/shared';
import { createApi } from '../src/api/client';
import { createDemoEscrow } from '../src/escrow/demo';

const URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
async function as(email: string) {
  const a = createApi(URL);
  const r = await a.post<{ token: string }>('/api/auth/login', { email, password: 'demo1234' });
  a.setToken(r.token);
  return { api: a, escrow: createDemoEscrow(a) };
}
const fakeSha = async (a: ReturnType<typeof createApi>) =>
  (await a.uploadBlob(new Blob([crypto.getRandomValues(new Uint8Array(64))], { type: 'video/mp4' }), 'v.mp4')).sha256;
```

Scenariusze, każdy z `assert`:
1. **Happy path:** `bartek.escrow.purchase({ id: 'l-kurtka-levis', deal: null })`, następnie `card = await ania.escrow.newQrCard('ship', k)` i `ania.escrow.markShipped(k, { qrCommitment: card.commitment, packingVideoSha256: await fakeSha(ania.api), trackingNumber: 'INP1' })`. Potem `bartek.escrow.acceptDelivery(k, card.payload)` i sprawdzenie, że `GET /api/deals/l-kurtka-levis` ma status `Completed`.
2. **Review Focus 4:** drugie `acceptDelivery` na tym samym deal → `isEscrowError(e) && e.code === 'InvalidStatus'`.
3. **Zły QR:** karta zwrotu (`newQrCard('return', k)`) w `acceptDelivery` → `QrMismatch`, a status bez zmian.
4. **Spór:** drugie ogłoszenie, kupujący z `createDemoEscrow(api, { scenario: 'defect' })`, potem `openDispute(k, { qrPayload, unboxingVideoSha256, complaint: { category: 'damaged', description: 'Plama na rękawie' }, complaintSha256: 'ab'.repeat(32) })`. Czekaj w pętli (co 1 s, maks. 15 s), aż `deal.status === 'ReturnRequested'`. Mock AI bez nagłówka `X-Demo-Scenario` zwraca dobry raport → `SELLER` → `Completed`; `defect` daje plamę → `BUYER`. Dalej `markReturned` i `confirmReturn` z kartą zwrotu → `Refunded`. Dodatkowo trzecie ogłoszenie bez scenariusza → `Completed`.
5. **Po terminie:** kolejne ogłoszenie kupione (seed ma 3, więc najpierw `cargo run -- seed-reset` albo wystaw nowe przez `POST /api/listings`), `POST /api/dev/clock { advanceSecs: 700 }`, `settleExpired` → `Refunded`.

Uruchom `node --import tsx app/scripts/demo-escrow-smoke.ts`. Oczekiwane: FAIL (brak `demo.ts`).

- [ ] **Krok 2: implementacja**

`app/src/escrow/demo.ts`:

```ts
// Escrow over the PAYMENTS=demo REST actions: development without the chain and the offline fallback demo.
import { EscrowError, createQr, parseQrPayload, type DealKey, type Escrow, type EscrowErrorCode, type TxResult } from '@unbox/shared';
import { api as defaultApi, ApiError, type Api } from '../api/client';

const NONE: TxResult = { signature: null, explorerUrl: null };
const CODES: Record<string, EscrowErrorCode> = {
  INVALID_STATE: 'InvalidStatus', DEADLINE_PASSED: 'DeadlinePassed', DEADLINE_NOT_REACHED: 'DeadlineNotReached',
  QR_MISMATCH: 'QrMismatch', INSUFFICIENT_FUNDS: 'InsufficientFunds', FORBIDDEN: 'Unauthorized', NETWORK: 'Network',
};

function secretOf(kind: 'ship' | 'return', k: DealKey, payload: string): string {
  const p = parseQrPayload(payload);
  if (!p || p.kind !== kind || p.dealId !== k.id) {
    throw new EscrowError('QrMismatch', 'Kod z karty nie pasuje do tej przesyłki. Zeskanuj kartę z tej paczki.');
  }
  return p.secret;
}

/** `scenario` = mock AI scenario for disputes (server AI=mock): 'defect' → BUYER, none → SELLER. Dev menu only. */
export function createDemoEscrow(a: Api = defaultApi, opts: { scenario?: string } = {}): Escrow {
  const call = async (path: string, body?: unknown, headers?: Record<string, string>): Promise<TxResult> => {
    try {
      await a.post(path, body, headers);
      return NONE;
    } catch (e) {
      if (e instanceof ApiError) throw new EscrowError(CODES[e.code] ?? 'Rejected', e.message);
      throw e;
    }
  };
  return {
    mode: 'demo',
    walletAddress: async () => null,
    networkNow: async () => Math.floor(Date.now() / 1000),
    requestTestSol: async () => { throw new EscrowError('Rejected', 'W trybie demo saldo startowe ustawia serwer.'); },
    createListing: async () => NONE,
    cancelListing: (k) => call(`/api/listings/${k.id}/cancel`),
    purchase: (k) => call(`/api/listings/${k.id}/purchase`),
    newQrCard: async (kind, k) => {
      const q = createQr(kind, k.id);
      return { kind, payload: q.payload, commitment: q.commitment };
    },
    markShipped: (k, i) => call(`/api/deals/${k.id}/ship`, i),
    acceptDelivery: async (k, payload) => call(`/api/deals/${k.id}/accept`, { qrSecret: secretOf('ship', k, payload) }),
    openDispute: async (k, i) => call(`/api/deals/${k.id}/dispute`, {
      qrSecret: secretOf('ship', k, i.qrPayload), unboxingVideoSha256: i.unboxingVideoSha256, complaint: i.complaint,
    }, opts.scenario ? { 'X-Demo-Scenario': opts.scenario } : undefined),
    markReturned: (k, i) => call(`/api/deals/${k.id}/return`, {
      returnQrCommitment: i.returnQrCommitment, returnVideoSha256: i.returnVideoSha256, returnTrackingNumber: i.trackingNumber,
    }),
    confirmReturn: async (k, payload) => call(`/api/deals/${k.id}/confirm-return`, { returnQrSecret: secretOf('return', k, payload) }),
    settleExpired: (k) => call(`/api/deals/${k.id}/settle`),
  };
}
```

`app/src/escrow/index.ts`:

```ts
import type { Escrow } from '@unbox/shared';
import { createSolanaEscrow } from '../solana';
import { createDemoEscrow } from './demo';

// `let` + live binding: the dev menu can swap the demo AI scenario without restarting the app.
export let escrow: Escrow = process.env.EXPO_PUBLIC_PAYMENTS === 'solana' ? createSolanaEscrow() : createDemoEscrow();
export function setDemoScenario(scenario: string | undefined) {
  if (escrow.mode === 'demo') escrow = createDemoEscrow(undefined, { scenario });
}
```

- [ ] **Krok 3:** `node --import tsx app/scripts/demo-escrow-smoke.ts`. Oczekiwane: 5 × `ok`, w tym `InvalidStatus` i `QrMismatch` z kroku 1.

- [ ] **Krok 4: commit**

```bash
git add app/src/escrow app/scripts/demo-escrow-smoke.ts
git commit -m "feat(app): DemoEscrow over the demo REST actions and the Escrow switch"
```

---

### Task A4: dane z serwera w `AppProvider` + logowanie (do 08:00, K2)

**Pliki:**
- Utwórz: `app/src/data/fromServer.ts`, `app/src/data/fromServer.test.ts`, `app/src/session.ts`.
- Zmień: `app/src/AppProvider.tsx`, `app/src/screens/Onboarding.tsx`, `app/src/screens/Overlays.tsx` (`RoleStrip`, `DevSheet`), `app/src/config.ts`.

**Interfejsy:**
- Konsumuje: `api` (A2), `escrow` (A3).
- Produkuje:
  - `fromListing(l, cats): Item`, `fromDeal(d, cats): Item`, `toUnits(minor, currency): number`, `canBuy(me, mode): { ok: boolean; reason: string }`;
  - stan `AppProvider`: `me: User`, `deals: Item[]`, `wallet: Wallet`, `refresh(): Promise<void>`.

- [ ] **Krok 1: test adaptera**

`app/src/data/fromServer.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Deal, Listing, User } from '@unbox/shared';
import { canBuy, fromDeal, fromListing, toUnits } from './fromServer';

const listing: Listing = { id: 'l-kurtka-levis', sellerId: 'u-ania', seller: { id: 'u-ania', name: 'Ania' }, title: 'Kurtka',
  description: 'Opis', categoryId: 'c-kurtki', condition: 'jak_nowy', brand: "Levi's", size: 'M', defects: ['Przetarcie'],
  photos: [{ url: 'http://x/media/aa', sha256: 'aa'.repeat(32) }], priceMinor: 60_000_000, currency: 'SOL', status: 'Listed',
  createdAt: 100, updatedAt: 100 };

test('listing maps to a Listed item priced in SOL', () => {
  const it = fromListing(listing, { 'c-kurtki': 'Kurtki' });
  assert.deepEqual([it.status, it.price, it.cond, it.cat, it.flaws, it.key], ['Listed', 0.06, 'Bardzo dobry', 'Kurtki', ['Przetarcie'], { id: 'l-kurtka-levis', deal: null }]);
  assert.equal(toUnits(12_345, 'PLN'), 123.45);
});

test('deal keeps deadline from the server, signatures per status and the PDA', () => {
  const d = { id: 'l-kurtka-levis', listing: { ...listing, v: 1 }, listingHash: 'ab'.repeat(32), sellerId: 'u-ania',
    seller: { id: 'u-ania', name: 'Ania' }, buyerId: 'u-bartek', buyer: { id: 'u-bartek', name: 'Bartek' }, status: 'ReturnRequested',
    statusChangedAt: 500, deadlineAt: 1100, payment: { status: 'secured', amountMinor: 60_000_000, currency: 'SOL', securedAt: 200, settledAt: null },
    qrCommitment: null, packingVideoSha256: null, trackingNumber: 'INP1', unboxingVideoSha256: null, complaint: null, complaintHash: null,
    analysis: null, verdict: null, returnQrCommitment: null, returnVideoSha256: null, returnTrackingNumber: null, closeReason: null,
    timeline: [{ at: 200, type: 'paid', label: 'Opłacone' }, { at: 500, type: 'return_requested', label: 'x' }], createdAt: 200,
    onchain: { deal: 'PDA111', sellerWallet: 's', buyerWallet: 'b', priceLamports: 60_000_000,
      transactions: [{ status: 'Paid', at: 200, signature: 'sig-paid', explorerUrl: null }] } } as unknown as Deal;
  const it = fromDeal(d, {});
  assert.deepEqual([it.deadlineAt, it.key, it.buyer, it.buyerName], [1100, { id: 'l-kurtka-levis', deal: 'PDA111' }, 'u-bartek', 'Bartek']);
  assert.deepEqual(it.events.map((e) => [e.st, e.sig]), [['Listed', null], ['Paid', 'sig-paid'], ['ReturnRequested', null]]);
  assert.equal(it.noVerdict, true);   // ReturnRequested without a verdict = the oracle stayed silent
});

test('Review Focus 5: no linked wallet blocks buying in solana mode only', () => {
  const me = { id: 'u-bartek', email: 'b', name: 'B', createdAt: 1 } as User;
  assert.equal(canBuy(me, 'solana').ok, false);
  assert.match(canBuy(me, 'solana').reason, /portfel/i);
  assert.equal(canBuy(me, 'demo').ok, true);
  assert.equal(canBuy({ ...me, walletAddress: 'x' }, 'solana').ok, true);
});
```

Uruchom `node --import tsx --test app/src/data/*.test.ts`. Oczekiwane: FAIL.

- [ ] **Krok 2: adapter**

`app/src/data/fromServer.ts`:

```ts
// Server JSON → the item shape AppProvider's dv()/vm() were written against (see the prototype's initial()).
import type { Deal, DealKey, Listing, User } from '@unbox/shared';

export type Status = 'Listed' | 'Paid' | 'Shipped' | 'Disputed' | 'ReturnRequested' | 'Returning' | 'Completed' | 'Refunded' | 'Cancelled';
export interface ItemEvent { st: Status; label: string; at: number; sig: string | null }
export interface Item {
  id: string; key: DealKey; no: string; title: string; brand: string; size: string; cond: string; cat: string;
  price: number; currency: string; desc: string; flaws: string[]; photos: string[];
  seller: string; sellerName: string; buyer: string | null; buyerName: string;
  status: Status; changedAt: number; deadlineAt: number | null; events: ItemEvent[]; listingHash: string; pda: string | null;
  tracking?: string; packHash?: string; qrCommit?: string; unboxHash?: string; complaintHash?: string;
  complaint?: { cat: string; text: string }; verdict?: 'Seller' | 'Buyer'; reportHash?: string; analysis?: Deal['analysis'];
  returnTracking?: string; retQr?: string; retVideo?: string; noVerdict?: boolean;
}

const COND: Record<string, string> = { nowy: 'Nowy z metką', jak_nowy: 'Bardzo dobry', dobry: 'Dobry', widoczne_slady: 'Używany' };
const KIND: Record<string, Status> = { paid: 'Paid', shipped: 'Shipped', disputed: 'Disputed', return_requested: 'ReturnRequested',
  returning: 'Returning', completed: 'Completed', refunded: 'Refunded' };
const opt = (v: string | null | undefined) => v ?? undefined;

export const toUnits = (minor: number, currency: string) => (currency === 'SOL' ? minor / 1e9 : minor / 100);

export function fromListing(l: Listing, cats: Record<string, string>): Item {
  return {
    id: l.id, key: { id: l.id, deal: l.onchain?.deal ?? null }, no: l.id.slice(-4).toUpperCase(), title: l.title, brand: l.brand,
    size: l.size, cond: COND[l.condition] ?? l.condition, cat: cats[l.categoryId] ?? 'Inne', price: toUnits(l.priceMinor, l.currency),
    currency: l.currency, desc: l.description, flaws: l.defects, photos: l.photos.map((p) => p.url),
    seller: l.sellerId, sellerName: l.seller.name, buyer: null, buyerName: '',
    status: l.status === 'Cancelled' ? 'Cancelled' : 'Listed', changedAt: l.updatedAt, deadlineAt: null,
    events: [{ st: 'Listed', label: '', at: l.createdAt, sig: null }],
    listingHash: l.onchain?.listingHash ?? '', pda: l.onchain?.deal ?? null,
  };
}

export function fromDeal(d: Deal, cats: Record<string, string>): Item {
  const sigs = new Map((d.onchain?.transactions ?? []).map((t) => [t.status as string, t.signature]));
  const events: ItemEvent[] = [{ st: 'Listed', label: '', at: d.createdAt, sig: null }];
  for (const e of d.timeline) {
    const st = KIND[e.type];
    if (st) events.push({ st, label: e.label, at: e.at, sig: sigs.get(st) ?? null });
  }
  const l = d.listing;
  return {
    id: d.id, key: { id: d.id, deal: d.onchain?.deal ?? null }, no: d.id.slice(-4).toUpperCase(), title: l.title, brand: l.brand,
    size: l.size, cond: COND[l.condition] ?? l.condition, cat: cats[(l as any).categoryId] ?? 'Inne',
    price: toUnits(d.payment.amountMinor, d.payment.currency), currency: d.payment.currency, desc: l.description,
    flaws: l.defects, photos: l.photos.map((p) => p.url),
    seller: d.sellerId, sellerName: d.seller.name, buyer: d.buyerId, buyerName: d.buyer.name,
    status: d.status, changedAt: d.statusChangedAt, deadlineAt: d.deadlineAt, events, listingHash: d.listingHash,
    pda: d.onchain?.deal ?? null, tracking: opt(d.trackingNumber), packHash: opt(d.packingVideoSha256), qrCommit: opt(d.qrCommitment),
    unboxHash: opt(d.unboxingVideoSha256), complaintHash: opt(d.complaintHash),
    complaint: d.complaint ? { cat: d.complaint.category, text: d.complaint.description } : undefined,
    verdict: d.verdict === 'SELLER' ? 'Seller' : d.verdict === 'BUYER' ? 'Buyer' : undefined,
    reportHash: opt(d.analysis?.reportHash), analysis: d.analysis,
    returnTracking: opt(d.returnTrackingNumber), retQr: opt(d.returnQrCommitment), retVideo: opt(d.returnVideoSha256),
    noVerdict: d.status === 'ReturnRequested' && !d.verdict,
  };
}

export function canBuy(me: User, mode: 'solana' | 'demo'): { ok: boolean; reason: string } {
  if (mode === 'solana' && !me.walletAddress) {
    return { ok: false, reason: 'Twój portfel nie jest jeszcze połączony z kontem. Otwórz Portfel i spróbuj ponownie.' };
  }
  return { ok: true, reason: '' };
}
```

Uruchom testy. Oczekiwane: PASS.

- [ ] **Krok 3: sesja i logowanie**

`app/src/session.ts`: `signIn(email, password)` robi `login`, potem `escrow.walletAddress()`. Jeśli adres nie jest `null` i różni się od `user.walletAddress`, woła `linkWallet(address)`. Przy 409 zwraca `user` z `walletLinkError` (tekst z serwera), żeby UI mogło go pokazać (Review Focus 5).

W `Onboarding.tsx` zastąp kroki „Tworzymy portfel” formularzem e-mail + hasło i trzema przyciskami szybkiego logowania: `ania@demo.pl` (sprzedająca), `bartek@demo.pl` (kupujący), `celina@demo.pl`, wszystkie z hasłem `demo1234`. Po sukcesie pokaż `OnbReady` (adres portfela albo „tryb demo”).

- [ ] **Krok 4: `AppProvider` czyta serwer**

Zmiany w `app/src/AppProvider.tsx` (reszta silnika zostaje):
1. `initial()`: `deals: []`, `balances`/`history` z `wallet`, `me: null`. Usuń `genItems()`, stałe `USERS`, `PHONES`, `ROLE` i seed ośmiu transakcji.
2. **Jedno konto:** `phones` ma jeden klucz `'me'`, a `useP()` zwraca `phones.me`. `switchTo`, `RoleStrip` i przełącznik kont w `DevSheet` zamień na „Wyloguj i zaloguj jako…”. Kolor paska roli: sprzedający (`#FFB547`), gdy aktywna zakładka to „Sprzedaże”, w przeciwnym razie kupujący (`#9945FF`).
3. `refresh()` równolegle pobiera `listings()`, `myListings()`, `deals('buyer')`, `deals('seller')`, `wallet()` i (raz) `categories()`. `state.deals` to pozycje z `fromDeal` plus `fromListing` dla ogłoszeń bez transakcji (deal z tym samym `id` wygrywa). Polling co 3 s w `componentDidMount`, `clearInterval` w `componentWillUnmount`. Przy `ApiError` ustaw `feed: 'error'` i zapisz komunikat (Review Focus 1); przycisk „Spróbuj ponownie” w `Browse` woła `refresh()`.
4. `now()` zwraca `Math.floor(Date.now() / 1000) + this.skew`, gdzie `skew = (await escrow.networkNow()) - Date.now()/1000` liczone co 30 s (termin „liczy go sieć, nie telefon”).
5. W `dv(d, me)`:
   - `me` to `this.state.me.id`;
   - `USERS[d.seller].name` → `d.sellerName`, `USERS[d.buyer].name` → `d.buyerName`;
   - `deadline = d.deadlineAt`;
   - `ARBITER` → `process.env.EXPO_PUBLIC_ORACLE_PUBKEY ?? 'tryb demo'`;
   - `EXPL(lastSig)` → link do sygnatury albo, gdy jej brak i jest `d.pda`, `https://explorer.solana.com/address/${d.pda}?cluster=devnet`, w przeciwnym razie ukryj link;
   - kwoty: `priceText` z `d.currency` (SOL: `toFixed(3) + ' SOL'`; PLN: `formatPln` z shared, bez przeliczania na zł).
6. W `vm()`: przycisk „Kup” jest `disabled`, gdy `!canBuy(me, escrow.mode).ok`, a pod nim `Notice` z `reason`.

- [ ] **Krok 5: sprawdź na telefonie**

Serwer demo, `EXPO_PUBLIC_PAYMENTS=demo`. Zaloguj `bartek@demo.pl`: w Przeglądaj są 3 ogłoszenia z seeda. Zakup przez `app/scripts/demo-escrow-smoke.ts` (scenariusz 1) w ciągu 3 s pokazuje się w „Transakcje” z odliczaniem. Wyłącz serwer: Przeglądaj pokazuje błąd z adresem i „Spróbuj ponownie”.

- [ ] **Krok 6: commit**

```bash
git add app/src
git commit -m "feat(app): listings, deals and wallet from server/ with sign-in; one account per phone"
```

---

### Task A5: akcje przez `Escrow` (do 10:00)

**Pliki:**
- Utwórz: `app/src/flow.ts`, `app/src/flow.test.ts`.
- Zmień: `app/src/AppProvider.tsx` (`tx`, `buy`, `publish`, `cancel`, `submitPack`, `accept`, `complain`, `confirmReturn`, `settle`, `faucet`; usuń `oracle()`, `takeFail`, `FAIL_OPTS` i sceny), `app/src/screens/Overlays.tsx` (`TxSheet`, `DevSheet`), `app/src/screens/Sell.tsx`.

**Interfejsy:**
- Konsumuje: `escrow` (A3), `api` (A2), `refresh()` (A4).
- Produkuje: `perform(act, { sync, refresh }) → Promise<TxResult>`, `explain(e) → { title, text, code, retryable }`.

- [ ] **Krok 1: test przepływu (Review Focus 2, 3 i 4)**

`app/src/flow.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EscrowError } from '@unbox/shared';
import { ApiError } from './api/client';
import { explain, perform } from './flow';

const ok = { signature: 'sig', explorerUrl: 'https://explorer.solana.com/tx/sig?cluster=devnet' };

test('a failed sync does not turn a successful action into a failure', async () => {
  let refreshed = 0;
  const r = await perform(async () => ok, { sync: async () => { throw new Error('502'); }, refresh: async () => { refreshed++; } });
  assert.deepEqual([r, refreshed], [ok, 1]);
});

test('a failed upload stops before the escrow call', async () => {
  let called = 0;
  const act = async () => {
    await Promise.reject(new ApiError(0, 'NETWORK', 'Brak połączenia'));   // the upload step inside the action
    called++;
    return ok;
  };
  await assert.rejects(perform(act, { refresh: async () => {} }));
  assert.equal(called, 0);
});

test('errors become Polish copy; a status race is not retryable', () => {
  assert.equal(explain(new EscrowError('InvalidStatus', 'x')).title, 'Stan umowy już się zmienił');
  assert.equal(explain(new EscrowError('InvalidStatus', 'x')).retryable, false);
  assert.equal(explain(new EscrowError('QrMismatch', 'Kod nie pasuje')).retryable, true);
  assert.equal(explain(new ApiError(0, 'NETWORK', 'Brak połączenia z serwerem')).retryable, true);
});
```

Uruchom `node --import tsx --test app/src/flow.test.ts`. Oczekiwane: FAIL.

- [ ] **Krok 2: `flow.ts`**

```ts
// One user action: (upload inside act) → escrow call → optional chain sync → refresh. CLAUDE.md §6 order.
import { isEscrowError, type TxResult } from '@unbox/shared';
import { ApiError } from './api/client';

export async function perform(
  act: () => Promise<TxResult>,
  o: { sync?: () => Promise<unknown>; refresh: () => Promise<void> },
): Promise<TxResult> {
  const r = await act();
  if (o.sync) await o.sync().catch(() => undefined);   // the chain is the truth; polling catches up
  await o.refresh().catch(() => undefined);
  return r;
}

const TITLES: Record<string, [string, boolean]> = {
  InvalidStatus: ['Stan umowy już się zmienił', false],
  DeadlinePassed: ['Termin na tę czynność minął', false],
  DeadlineNotReached: ['Termin jeszcze nie minął według sieci', true],
  QrMismatch: ['Kod z karty nie pasuje do tej umowy', true],
  ListingMismatch: ['Ogłoszenie nie zgadza się z umową', false],
  ArbiterMismatch: ['Weryfikator nie zgadza się z umową', false],
  InsufficientFunds: ['Brak salda', false],
  Unauthorized: ['Ta czynność należy do drugiej strony', false],
  Network: ['Nie udało się – spróbuj ponownie', true],
  Rejected: ['Operacja odrzucona', false],
};

export function explain(e: unknown): { title: string; text: string; code: string; retryable: boolean } {
  if (isEscrowError(e)) {
    const [title, retryable] = TITLES[e.code] ?? ['Operacja odrzucona', false];
    return { title, text: e.message, code: e.code, retryable };
  }
  if (e instanceof ApiError) {
    return { title: e.code === 'NETWORK' ? 'Brak połączenia z serwerem' : 'Serwer odrzucił operację', text: e.message, code: e.code, retryable: e.code === 'NETWORK' || e.status >= 500 };
  }
  return { title: 'Coś poszło nie tak', text: String((e as Error)?.message ?? e), code: '', retryable: true };
}
```

Uruchom test. Oczekiwane: PASS.

- [ ] **Krok 3: `tx()` w `AppProvider`**

Zastąp ciało `tx(k, cfg)`. Zostaw UI arkusza (`phase: 'run' | 'ok' | 'fail'`), ale zamiast `cfg.mutate` i timerów:

```ts
async tx(k, cfg) {
  this.pending[k] = cfg;
  this.setPh(k, { tx: { title: cfg.title, upload: !!cfg.upload, mb: 0, start: Date.now(), phase: 'run' }, sheet: null });
  try {
    const r = await perform(cfg.run, {
      sync: escrow.mode === 'solana' && cfg.dealPda ? () => chainSync(cfg.dealPda) : undefined,
      refresh: () => this.refresh(),
    });
    this.setPh(k, P => ({ tx: { ...P.tx, phase: 'ok', okTitle: cfg.ok[0], okText: cfg.ok[1], href: r.explorerUrl } }));
    cfg.after?.();
  } catch (e) {
    const x = explain(e);
    if (x.code === 'InvalidStatus' || x.code === 'DeadlinePassed') await this.refresh().catch(() => {});
    this.fail(k, x.title, x.text, x.code, x.retryable);
  }
}
```

„Spróbuj ponownie” (`retry`) najpierw woła `await this.refresh()`. Jeśli `cfg.guard` istnieje, a status pozycji ≠ `cfg.guard.status`, pokazuje „Stan umowy już się zmienił” zamiast ponowienia (Review Focus 4). `notify()` w jednej aplikacji nie ma już odbiorcy: usuń wywołania; drugą stronę informuje polling. `TxSheet` pokazuje „Zobacz w Solana Explorer”, gdy `tx.href`.

- [ ] **Krok 4: każda akcja z `run`**

Wspólnie: `const d = this.deal(id)`, `dealPda: d.pda`, `guard: { id, status: d.status }`.

| Akcja | `run` |
|---|---|
| `buy(k, id)` | `() => escrow.purchase(d.key)` |
| `cancel(k, id)` | `() => escrow.cancelListing(d.key)` |
| `accept(k, id)` | `() => escrow.acceptDelivery(d.key, this.state.phones.me.scan.payload)` (payload z A6) |
| `settle(k, id)` | `() => escrow.settleExpired(d.key)` |
| `faucet(k)` | `() => escrow.requestTestSol()` |
| `submitPack(k, id)` (ship) | `async () => { const v = await uploadRecording(P.rec.uri); return escrow.markShipped(d.key, { qrCommitment: P.pack.card.commitment, packingVideoSha256: v, trackingNumber: P.pack.tracking }); }` |
| `submitPack(k, id)` (return) | jak wyżej z `markReturned(d.key, { returnQrCommitment, returnVideoSha256, trackingNumber })` |
| `confirmReturn(k, id)` | `() => escrow.confirmReturn(d.key, P.scan.payload)` |
| `complain(k, id)` | w A7 |

`publish(k)` (Sell):

```ts
run: async () => {
  const photos = await Promise.all(P.form.photos.map((uri) => uploadPhoto(uri)));   // A6; may be []
  const l = await createListing({ title, description, categoryId, condition, brand, size, defects, photos, priceMinor });
  if (escrow.mode !== 'solana') return { signature: null, explorerUrl: null };
  const args = await publishListing(l.id);
  this.pending[k].dealPda = args.deal;               // so tx() syncs this new deal
  return escrow.createListing(args);
}
```

`priceMinor`: w solana lamporty (`Math.round(parseFloat(price) * 1e9)`, maks. 100 000 000), w demo grosze. Walutę rozpoznajesz po `escrow.mode`. Kategoria to `categoryId` z listy `categories()`, a stan formularza mapujesz odwrotnie do `COND`.

`openPack(k, id, mode)` dodatkowo woła `escrow.newQrCard(mode === 'return' ? 'return' : 'ship', d.key)` i zapisuje kartę w `pack.card`.

- [ ] **Krok 5: dwa telefony, tryb demo, happy path**

1. Telefon 1: `ania`, telefon 2: `bartek`.
2. Bartek kupuje. U Ani w ≤ 3 s pojawia się „Spakuj i nadaj”.
3. Ania nadaje (nagranie i karta z A6; do tego czasu `uploadRecording` może wgrywać plik testowy z `expo-file-system`).
4. Bartek przyjmuje paczkę. Ania widzi „Zakończone – środki u sprzedającego”.

Na koniec „Odbierz środki” po `POST /api/dev/clock`.

- [ ] **Krok 6: commit**

```bash
git add app/src
git commit -m "feat(app): every money action goes through Escrow with sync and refresh"
```

---

### Task A6: nagrywanie, skan QR, hash, upload, karta do druku (do 12:00)

**Pliki:**
- Utwórz: `app/src/media/hash.ts`, `app/src/media/upload.ts`, `app/src/media/Recorder.tsx`, `app/src/media/QrScanner.tsx`, `app/src/media/qrCard.ts`.
- Zmień: `app/src/screens/Recording.tsx` (`Camera` → `Recorder`, skan po nagraniu), `app/src/AppProvider.tsx` (`startRec`, `stopRec`, `startScan`), `app/src/screens/Recording.tsx` `Pack` (QR na ekranie + „Drukuj kartę”).

**Interfejsy:**
- Produkuje:
  - `hashFile(uri) → Promise<Hex32>`;
  - `uploadRecording(uri) → Promise<Hex32>`, `uploadPhoto(uri) → Promise<{ url, sha256 }>`, `uploadJson(text) → Promise<Hex32>`;
  - `<Recorder onDone={(uri, qrPayload | null) => …} />`, `<QrScanner onScan={(payload) => …} />`;
  - `printCard(card: QrCard, title)`.

- [ ] **Krok 1: hash kawałkami, zgodny z serwerem**

`app/src/media/hash.ts`:

```ts
// sha256 of a local file in 1 MiB chunks: a 2-min video never sits in JS memory as one string.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { File } from 'expo-file-system';

const CHUNK = 1 << 20;

export async function hashFile(uri: string): Promise<string> {
  const h = sha256.create();
  const handle = new File(uri).open();
  try {
    for (;;) {
      const bytes = handle.readBytes(CHUNK);
      if (bytes.length === 0) break;
      h.update(bytes);
    }
  } finally {
    handle.close();
  }
  return bytesToHex(h.digest());
}
```

API `File`/`FileHandle` jest w `expo-file-system` od SDK 54. Jeśli w Twoim SDK się różni, użyj `expo-file-system/legacy` `readAsStringAsync(uri, { encoding: 'base64', position, length })` + dekodowanie base64.

- [ ] **Krok 2: upload z porównaniem hasha (najpierw upload, potem transakcja)**

`app/src/media/upload.ts`:

```ts
import { File, Paths } from 'expo-file-system';
import { api, ApiError } from '../api';
import { hashFile } from './hash';

async function uploadVerified(uri: string, mime: string, name: string): Promise<string> {
  const local = await hashFile(uri);
  const res = await api.uploadFile(uri, mime, name);
  if (res.sha256 !== local) throw new ApiError(0, 'NETWORK', 'Plik dotarł uszkodzony. Nagranie jest na telefonie – spróbuj wysłać ponownie.');
  return local;
}

export const uploadRecording = (uri: string) => uploadVerified(uri, 'video/mp4', 'recording.mp4');
export const uploadPhoto = async (uri: string) => {
  const sha256 = await uploadVerified(uri, 'image/jpeg', 'photo.jpg');
  return { url: api.mediaUrl(sha256), sha256 };
};
/** Exact bytes of `text` go to /media; the returned hash is what goes on-chain. */
export async function uploadJson(text: string): Promise<string> {
  const f = new File(Paths.cache, `upload-${Date.now()}.json`);
  f.write(text);
  return uploadVerified(f.uri, 'application/json', 'data.json');
}
```

`application/json` w `/media` dodaje osoba B w B0 (jedna linia w `allowed_mime`). Jeśli serwer zwraca „Niedozwolony typ pliku: application/json”, zrób `git pull`.

- [ ] **Krok 3: `Recorder` i `QrScanner`** (`expo-camera`, Expo Go)

`Recorder.tsx`:
- `CameraView` z `mode="video"`, `videoQuality="720p"`, `mute`;
- przycisk start/stop woła `ref.current.recordAsync({ maxDuration: 120 })` / `stopRecording()`;
- `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}` i `onBarcodeScanned` zapisuje pierwszy payload zaczynający się od `UNBOX1` w ref;
- `onDone(video.uri, payload | null)`;
- uprawnienia: `useCameraPermissions()` + `useMicrophonePermissions()` (Android wymaga ich nawet przy `mute`), z ekranem prośby po polsku.

`QrScanner.tsx`: sam `CameraView` z `onBarcodeScanned` dla fallbacku po nagraniu i dla skanu karty zwrotu u sprzedającego.

W `stopRec`: gdy `payload === null` przy `unboxing`, przejdź na ekran skanu (stan `scan`), tak jak prototyp robi w `qrMode 'Skan po nagraniu'`. Wynik zapisz w `phones.me.scan.payload`.

Jeśli skan w trakcie nagrywania nie działa na telefonie demo, zostaw sam fallback i dopisz wynik do `docs/spiki.md`.

- [ ] **Krok 4: karta QR na ekranie i do druku**

W `Pack` zamiast ikony: `<QRCode value={K.card.payload} size={96} />` (`react-native-qrcode-svg`). `app/src/media/qrCard.ts`:

```ts
import * as Print from 'expo-print';
import QR from 'qrcode';
import type { QrCard } from '@unbox/shared';

export async function printCard(card: QrCard, title: string) {
  const svg = await QR.toString(card.payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  const head = card.kind === 'return' ? 'Karta zwrotu' : 'Karta paczki';
  await Print.printAsync({ html: `<html><body style="font-family:sans-serif;text-align:center">
    <h2>${head}</h2><div style="width:70mm;margin:auto">${svg}</div><p>${title}</p>
    <p style="font-size:10px">Złóż kartę na pół, kodem do środka. Nie pokazuj kodu na nagraniu pakowania.</p></body></html>` });
}
```

- [ ] **Krok 5: telefon**
  - nagranie 20 s → upload → `sha256` z serwera = `hashFile` (log w konsoli Metro);
  - wydrukowana (albo zapisana do PDF) karta skanuje się w `QrScanner`, a payload trafia do `acceptDelivery`;
  - 2-minutowe nagranie hashuje się bez crasha; czas zapisz w `docs/spiki.md`.

- [ ] **Krok 6: commit**

```bash
git add app/src docs/spiki.md
git commit -m "feat(app): in-app recording, QR scan, chunked hash and verified upload to server media"
```

---

### Task A7: reklamacja, werdykt, zwrot, menu deweloperskie (do 14:00)

**Pliki:**
- Zmień: `app/src/AppProvider.tsx` (`complain`, sekcja `V` w `vm()`), `app/src/screens/Verdict.tsx`, `app/src/screens/Overlays.tsx` (`DevSheet`).
- Utwórz: `app/src/data/verdict.ts`, `app/src/data/verdict.test.ts`.

**Interfejsy:**
- Konsumuje: `uploadRecording`, `uploadJson` (A6), `escrow.openDispute` (kontrakt), `deal.analysis` z serwera.
- Produkuje: `verdictView(item) → { title, rows: { label, ok }[], reasoning, byEvidence: boolean }`.

- [ ] **Krok 1: test widoku werdyktu (także `report == null`)**

`app/src/data/verdict.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verdictView } from './verdict';

const report = { buyer_recording: { continuous: true, starts_with_sealed_package: true, qr_revealed_on_opening: true, quality: 'good', notes: '' },
  seller_recording: { item_clearly_visible: true, qr_card_packed: true, package_sealed_and_labeled: true, quality: 'good', notes: '' },
  package_matches_shipping_recording: true, item_matches_listing: true,
  undisclosed_damage: { present: true, description: 'Plama na rękawie', timestamps: ['00:41'] }, reasoning: 'Plama nie była na liście wad.' };

test('verdict shows the decide() path, not "AI decided"', () => {
  const v = verdictView({ verdict: 'Buyer', analysis: { report, reportHash: 'ab'.repeat(32) } } as any);
  assert.equal(v.title, 'Reklamacja uznana');
  assert.ok(v.rows.some((r) => r.label.includes('Nieujawniona wada') && r.ok === false));
  assert.equal(v.reasoning, 'Plama nie była na liście wad.');
});

test('a verdict decided by missing or mismatched files has no model report', () => {
  const v = verdictView({ verdict: 'Seller', analysis: { report: null, reportHash: 'cd'.repeat(32) } } as any);
  assert.equal(v.byEvidence, true);
  assert.match(v.reasoning, /plik/i);
});
```

- [ ] **Krok 2: `verdict.ts`**

Wiersze odpowiadają kolejnym warunkom `decide()` z `CLAUDE.md` §5:
1. nagranie otwarcia: ciągłe, od zamkniętej paczki, QR po otwarciu, dobra jakość;
2. nagranie pakowania: dobra jakość, ubranie widoczne, karta włożona;
3. paczka zgodna z nadaną;
4. przedmiot zgodny z opisem;
5. „Nieujawniona wada”.

`title`: `Buyer` → „Reklamacja uznana”, `Seller` → „Reklamacja odrzucona”. Gdy `report === null`: `byEvidence: true`, `rows: []`, `reasoning: 'Rozstrzygnięte bez oceny nagrań: brakował plik albo jego treść nie zgadzała się z zapisem w umowie.'`. Uruchom test: PASS. Podłącz w `vm()` pod `V` (ekran `Verdict.tsx`). Dodaj wiersz „Raport zgodny z zapisem” z `reportHash` (skrót) i linkiem `api.mediaUrl(reportHash)`.

- [ ] **Krok 3: `complain` z nagraniem i `complaint.json`**

```ts
complain(k, id) {
  const d = this.deal(id), P = this.state.phones.me, c = P.decide;
  this.tx(k, { kind: 'qr', title: 'Wysyłamy reklamację…', upload: true, guard: { id, status: 'Shipped' }, dealPda: d.pda,
    run: async () => {
      const unboxingVideoSha256 = await uploadRecording(P.rec.uri);
      const complaint = { category: c.cat, description: c.text };
      const complaintSha256 = await uploadJson(JSON.stringify({ v: 1, ...complaint, created_at: Math.floor(Date.now() / 1000) }));
      return escrow.openDispute(d.key, { qrPayload: P.scan.payload, unboxingVideoSha256, complaint, complaintSha256 });
    },
    ok: ['Reklamacja zgłoszona', 'AI porówna oba nagrania z opisem. Środki zostają w umowie do czasu oceny.'] });
}
```

Kategorie formularza (`CATS` w prototypie) mapuj na `ComplaintCategory` z shared:

| Kategoria w prototypie | `ComplaintCategory` |
|---|---|
| Nieujawniona wada | `not_as_described` |
| Inny przedmiot | `wrong_item` |
| Zły rozmiar | `not_as_described` |
| Uszkodzenie | `damaged` |

Etykiety bierz z `COMPLAINT_LABELS_PL`.

- [ ] **Krok 4: menu deweloperskie**
  - konto: wyloguj i szybkie logowanie (ania, bartek, celina);
  - tryb demo: „Przesuń czas o 11 min” → `POST /api/dev/clock { advanceSecs: 660 }`, potem `refresh()`;
  - tryb demo: „Wynik oceny AI” (`ok` → odrzucona, `defect` → uznana). `app/src/escrow/index.ts` wystawia `setDemoScenario(s)`, które odtwarza `escrow` przez `createDemoEscrow(api, { scenario: s })`; w trybie solana opcja jest ukryta;
  - podgląd `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_PAYMENTS`, adres portfela;
  - napis „tylko devnet”.

- [ ] **Krok 5: dwa telefony, tryb demo, spór i zwrot**
  1. U Bartka w menu deweloperskim „Wynik oceny AI: defect”.
  2. Bartek nagrywa otwarcie i reklamuje.
  3. Werdykt mocka pojawia się po ok. 3 s (`MOCK_AI_DELAY_MS`), ekran pokazuje ścieżkę reguły.
  4. `BUYER` → Bartek pakuje zwrot z kartą zwrotu → Ania skanuje → `Refunded`.

  Powtórz ze scenariuszem `ok` → `SELLER` → `Completed`.

- [ ] **Krok 6: commit**

```bash
git add app/src
git commit -m "feat(app): complaint with video and complaint.json, verdict with the decide() path, return flow"
```

---

### I1 i I2: z osobą B

- [ ] **I1 (~11:00):**
  1. B ma `app/src/solana/index.ts` z prawdziwym `createSolanaEscrow()`.
  2. Serwer: `ARBITER_PUBKEY=<od B> PUBLIC_BASE_URL=http://<IP LAN>:4000 pnpm dev:server` (tryb solana, nowa baza: `DATA_DIR=server/data-devnet`).
  3. `app/.env`: `EXPO_PUBLIC_PAYMENTS=solana`, `EXPO_PUBLIC_ORACLE_PUBKEY=<od B>`.
  4. Na obu telefonach: logowanie → portfel podpięty → „Doładuj testowe SOL” albo przelew od B.
  5. Ania wystawia, Bartek kupuje, Ania nadaje, Bartek przyjmuje. Każdy krok ma link do Explorera.
- [ ] **I2 (~15:00):** wyrocznia B uruchomiona, spór na devnecie → `resolve_dispute` w Explorerze → werdykt w aplikacji → zwrot → `Refunded`.
- [ ] Błąd w kontrakcie (np. brakujące pole) zgłaszasz B. Nie naprawiasz go w `app/src/solana/` ani w `escrow.ts`.

## Definition of Done

- [ ] `pnpm --filter @unbox/shared test`, `node --import tsx --test app/src/**/*.test.ts` i `pnpm --filter app typecheck` zielone.
- [ ] `app/scripts/demo-escrow-smoke.ts` zielony na serwerze demo.
- [ ] Na 2 telefonach w trybie demo: happy path, spór → zwrot, „Odbierz środki” po terminie.
- [ ] Po I1/I2 to samo w trybie solana na devnecie.
- [ ] Żaden plik poza `app/src/solana/` nie importuje `@solana/web3.js` ani `@anchor-lang/core`.

## Prompt startowy dla agenta osoby A

```
Pracujesz w repo unboxproof (HackYeah 2026). Przeczytaj CLAUDE.md (§2, §3, §6), server/README.md
i docs/superpowers/plans/2026-10-04-a-app-server.md. Jesteś osobą A: aplikacja ↔ server.
Realizuj zadania A1–A7 po kolei, z testami i commitami z planu. Nie edytujesz plików osoby B
(app/src/solana/** poza stubem z A1, server/src/solana/**, programs/, tests/, oracle/, cli/,
packages/shared/src/escrow.ts). Pracujesz na serwerze PAYMENTS=demo AI=mock ENABLE_DEV_CLOCK=1.
Gdy czegoś brakuje w kontrakcie Escrow, zatrzymaj się i powiedz mi, nie zmieniaj go sam.
```

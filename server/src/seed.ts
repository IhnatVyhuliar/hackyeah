// Seed z packages/shared/fixtures (Osoba 1). Zamówień z fixtures NIE seedujemy (są tylko dla mocka w aplikacji).
// Dopóki fixtures nie ma, używamy minimalnych danych zgodnych z KONTRAKT §11.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  type Category, CategorySchema, DEFAULT_THRESHOLDS, DEFAULT_WINDOWS, type Listing, ListingSchema, nowUnix,
  type Seal, sealHash, sealPayload, shortCode, type User, UserSchema,
} from '@sellsol/shared';
import { z } from 'zod';
import { hashPassword } from './auth';
import { config, paths } from './config';
import { docs, resetDb, users } from './db';

const fx = (name: string) => path.join(config.fixturesDir, name);
function readFixture<T>(name: string, schema: z.ZodType<T>): T | null {
  if (!fs.existsSync(fx(name))) return null;
  return schema.parse(JSON.parse(fs.readFileSync(fx(name), 'utf8')));
}

const demoAddress = (label: string) => Keypair.fromSeed(sha256(utf8ToBytes(`sellsol-demo:${label}`))).publicKey.toBase58();

const FALLBACK_USERS: User[] = [
  { id: 'u-ania', email: 'ania@demo.pl', name: 'Ania Kowalska', walletAddress: process.env.DEMO_SELLER_ADDRESS ?? demoAddress('seller'), createdAt: 0 },
  { id: 'u-bartek', email: 'bartek@demo.pl', name: 'Bartek Nowak', walletAddress: process.env.DEMO_BUYER_ADDRESS ?? demoAddress('buyer'), createdAt: 0 },
];

const FALLBACK_CATEGORIES: Category[] = [
  ['odziez-damska', 'Odzież damska', '👗'], ['odziez-meska', 'Odzież męska', '👔'], ['buty', 'Buty', '👟'],
  ['dodatki', 'Torebki i dodatki', '👜'], ['dzieci', 'Dla dzieci', '🧸'], ['elektronika', 'Elektronika', '📱'],
].map(([slug, name, icon]) => ({ id: slug, slug, name, icon }));

function fallbackListings(seller: User): Listing[] {
  const base = {
    sellerId: seller.id, seller: { id: seller.id, name: seller.name, walletAddress: seller.walletAddress },
    photos: [] as string[], thresholds: DEFAULT_THRESHOLDS, windows: DEFAULT_WINDOWS,
    status: 'active' as const, createdAt: nowUnix(),
  };
  return [
    { ...base, id: 'l-kurtka-levis', title: "Kurtka jeansowa Levi's, rozmiar M", description: 'Klasyczna kurtka, noszona kilka razy.',
      categoryId: 'odziez-meska', condition: 'dobry', size: 'M', brand: "Levi's", priceLamports: '200000000', pricePln: 120,
      declaredWeightG: 900, dimensionsCm: { l: 40, w: 30, h: 8 },
      extraTests: [{ id: 't1', description: 'Pokaż metkę z rozmiarem M' }] },
    { ...base, id: 'l-sukienka-zara', title: 'Sukienka letnia Zara, rozmiar S', description: 'Lekka, w kwiaty.',
      categoryId: 'odziez-damska', condition: 'jak_nowy', size: 'S', brand: 'Zara', priceLamports: '100000000', pricePln: 60,
      declaredWeightG: 300, dimensionsCm: { l: 30, w: 20, h: 4 }, extraTests: [] },
  ];
}

const SealPoolSchema = z.array(z.object({
  orderId: z.uuid(), nonce: z.string().regex(/^[0-9a-f]{32}$/),
  qrPayload: z.string().optional(), shortCode: z.string().optional(), sealHash: z.string().optional(),
}));

// Nonce'y z KONTRAKT §11 (plomby 01–10).
const POOL_NONCES = ['db5d2cfddd7dd2af2dac6cb188a93966', '410d1fd00fe42083fa47d3745909769d', 'dafba90492deb44092736088c080bc1d',
  '3f8d7e3f431e504fbbb46276c2ae3bbf', '51ffa4b490d9fbe616b79654d96a0a39', '1ce6a14a065d1c69d257f6c20d53d7e5',
  '06079e592df8730a2c220a067c7842da', '9c52b15e5dda0cb602638132f3a4fad4', '8ce0e9e3d523049cf65df578c62b1cb5',
  'c6dab28837a857b76f40387b0a04a42e'];

export interface PoolSeal { orderId: string; seal: Required<Seal> }

/** Pula plomb demo; sealHash zawsze liczony, a nie przepisywany z pliku. */
export function loadSealPool(): PoolSeal[] {
  const raw = readFixture('seal-pool.json', SealPoolSchema)
    ?? POOL_NONCES.map((nonce, i) => ({ orderId: `5e115e11-de00-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`, nonce }));
  return raw.map(({ orderId, nonce }) => {
    const qrPayload = sealPayload(orderId, nonce);
    return { orderId, seal: { qrPayload, sealHash: sealHash(qrPayload), shortCode: shortCode(nonce) } };
  });
}

export async function seed({ reset = false } = {}) {
  if (reset) resetDb();
  if (users.byId('u-ania') && !reset) return;   // już zaseedowane

  const fxUsers = readFixture('users.json', z.array(UserSchema)) ?? FALLBACK_USERS;
  const pass = await hashPassword('demo1234');
  for (const u of fxUsers) if (!users.byId(u.id)) users.insert({ ...u, createdAt: u.createdAt || nowUnix() }, pass);

  for (const c of readFixture('categories.json', z.array(CategorySchema)) ?? FALLBACK_CATEGORIES) docs.put('category', c.id, c);

  const seller = users.byId('u-ania')!;
  for (const l of readFixture('listings.json', z.array(ListingSchema)) ?? fallbackListings(seller)) docs.put('listing', l.id, l);

  const photos = fx('photos');
  if (fs.existsSync(photos)) for (const f of fs.readdirSync(photos)) fs.copyFileSync(path.join(photos, f), path.join(paths.files, f));
  console.log(`[seed] ${fxUsers.length} użytkowników, ${docs.list('category').length} kategorii, ${docs.list('listing').length} ofert`
    + (fs.existsSync(config.fixturesDir) ? ' (fixtures)' : ' (dane awaryjne: brak packages/shared/fixtures)'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await seed({ reset: process.argv.includes('--reset') });
}

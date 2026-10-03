// Dane startowe (deterministyczne id). Oddzielone od stanu runtime: seed działa tylko na pustej bazie
// albo z flagą --reset; restart serwera niczego nie zmienia.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Category, DEMO_START_BALANCE_MINOR, type Listing, type User } from '@unbox/shared';
import { hashPassword } from './auth';
import { now } from './clock';
import { docs, resetDb, tx, users } from './db';
import { topUp } from './wallet';

export const DEMO_PASSWORD = 'demo1234';

const DEMO_USERS: Omit<User, 'createdAt'>[] = [
  { id: 'u-ania', email: 'ania@demo.pl', name: 'Ania Kowalska' },     // sprzedająca
  { id: 'u-bartek', email: 'bartek@demo.pl', name: 'Bartek Nowak' },  // kupujący
  { id: 'u-celina', email: 'celina@demo.pl', name: 'Celina Wiśniewska' },
];

const CATEGORIES: Category[] = [
  ['odziez-damska', 'Odzież damska', '👗'], ['odziez-meska', 'Odzież męska', '👔'], ['buty', 'Buty', '👟'],
  ['dodatki', 'Torebki i dodatki', '👜'], ['dzieci', 'Dla dzieci', '🧸'], ['inne', 'Inne', '📦'],
].map(([slug, name, icon]) => ({ id: slug, slug, name, icon }));

function demoListings(t: number): Listing[] {
  const seller = { id: 'u-ania', name: 'Ania Kowalska' };
  const base = { sellerId: seller.id, seller, photos: [], currency: 'PLN' as const, status: 'Listed' as const, createdAt: t, updatedAt: t };
  return [
    { ...base, id: 'l-kurtka-levis', title: "Kurtka jeansowa Levi's", description: 'Klasyczna kurtka, noszona kilka razy.',
      categoryId: 'odziez-meska', condition: 'dobry', brand: "Levi's", size: 'M', defects: ['Lekkie przetarcie na lewym mankiecie'],
      priceMinor: 12_000 },
    { ...base, id: 'l-sukienka-zara', title: 'Sukienka letnia Zara', description: 'Lekka, w kwiaty.',
      categoryId: 'odziez-damska', condition: 'jak_nowy', brand: 'Zara', size: 'S', defects: [], priceMinor: 6_000 },
    { ...base, id: 'l-sneakersy-nike', title: 'Sneakersy Nike Air Max', description: 'Rozmiar 42, oryginalne pudełko.',
      categoryId: 'buty', condition: 'widoczne_slady', brand: 'Nike', size: '42', defects: ['Zabrudzona podeszwa'], priceMinor: 18_000 },
  ];
}

export async function registerUser(u: Omit<User, 'createdAt'>, password: string): Promise<User> {
  const user: User = { ...u, email: u.email.toLowerCase(), createdAt: now() };
  const hash = await hashPassword(password);
  tx(() => {
    users.insert(user, hash);
    topUp(user.id, DEMO_START_BALANCE_MINOR);
  });
  return user;
}

export async function seed({ reset = false } = {}) {
  if (reset) resetDb();
  if (users.byId('u-ania')) return;
  for (const u of DEMO_USERS) await registerUser(u, DEMO_PASSWORD);
  for (const c of CATEGORIES) docs.put('category', c.id, c);
  for (const l of demoListings(now())) docs.put('listing', l.id, l);
  console.log(`[seed] ${DEMO_USERS.length} użytkowników, ${CATEGORIES.length} kategorii, ${docs.list('listing').length} ogłoszeń`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await seed({ reset: process.argv.includes('--reset') });
}

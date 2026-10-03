// Demo-płatności: wewnętrzna księga (ledger) w backendzie. Bez zewnętrznego operatora.
// Saldo użytkownika = suma jego wpisów. Środki kupującego są "zabezpieczone" od zakupu do rozliczenia.
import { randomUUID } from 'node:crypto';
import { CURRENCY, type Deal, type LedgerEntry, type LedgerType, type Wallet } from '@unbox/shared';
import { now } from './clock';
import { db, docs } from './db';
import { ApiErr } from './errors';

function insert(userId: string, dealId: string | null, type: LedgerType, amountMinor: number, label: string) {
  db.prepare('INSERT INTO ledger (id, user_id, deal_id, type, amount_minor, label, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), userId, dealId, type, amountMinor, label, now());
}

export function balanceOf(userId: string): number {
  const r = db.prepare('SELECT COALESCE(SUM(amount_minor), 0) AS s FROM ledger WHERE user_id = ?').get(userId) as { s: number };
  return Number(r.s);
}

export const topUp = (userId: string, amountMinor: number, label = 'Środki startowe (demo)') =>
  insert(userId, null, 'topup', amountMinor, label);

/** Zakup: pobiera cenę z salda kupującego i zabezpiecza ją do rozliczenia transakcji. */
export function secure(deal: Deal) {
  const amount = deal.payment.amountMinor;
  if (balanceOf(deal.buyerId) < amount) throw new ApiErr('INSUFFICIENT_FUNDS', 'Za mało środków na saldzie');
  insert(deal.buyerId, deal.id, 'secure', -amount, `Zabezpieczono płatność: ${deal.listing.title}`);
}

/** Rozliczenie (raz na transakcję; unikalny indeks w bazie blokuje drugie). */
export function settle(deal: Deal, effect: 'release' | 'refund') {
  const amount = deal.payment.amountMinor;
  if (effect === 'release') insert(deal.sellerId, deal.id, 'release', amount, `Wypłata za: ${deal.listing.title}`);
  else insert(deal.buyerId, deal.id, 'refund', amount, `Zwrot za: ${deal.listing.title}`);
}

export function walletOf(userId: string): Wallet {
  const ledger = (db.prepare('SELECT id, deal_id, type, amount_minor, label, at FROM ledger WHERE user_id = ? ORDER BY at DESC, rowid DESC')
    .all(userId) as { id: string; deal_id: string | null; type: LedgerType; amount_minor: number; label: string; at: number }[])
    .map((r): LedgerEntry => ({ id: r.id, dealId: r.deal_id, type: r.type, amountMinor: Number(r.amount_minor), at: Number(r.at), label: r.label }));
  const heldMinor = docs.list('deal')
    .filter((d) => d.buyerId === userId && d.payment.status === 'secured')
    .reduce((s, d) => s + d.payment.amountMinor, 0);
  return { balanceMinor: balanceOf(userId), currency: CURRENCY, heldMinor, ledger };
}

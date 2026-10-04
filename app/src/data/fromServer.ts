// Server JSON → the item shape AppProvider's dv()/vm() were written against (the prototype's deals[]).
import { parsePln, type Analysis, type Currency, type Deal, type DealKey, type Listing, type User } from '@unbox/shared';

export type Status = 'Listed' | 'Paid' | 'Shipped' | 'Disputed' | 'ReturnRequested' | 'Returning' | 'Completed' | 'Refunded' | 'Cancelled';
export interface ItemEvent { st: Status; label: string; at: number; sig: string | null; href: string | null }
export interface Item {
  id: string; key: DealKey; no: string; title: string; brand: string; size: string; cond: string; cat: string;
  price: number; currency: Currency; desc: string; flaws: string[]; photos: string[];
  seller: string; sellerName: string; sellerWallet?: string; buyer: string | null; buyerName: string;
  status: Status; changedAt: number; deadlineAt: number | null; events: ItemEvent[]; listingHash: string; pda: string | null;
  published: boolean;
  tracking?: string; packHash?: string; qrCommit?: string; unboxHash?: string; complaintHash?: string;
  complaint?: { cat: string; text: string }; verdict?: 'Seller' | 'Buyer'; reportHash?: string; analysis?: Analysis | null;
  returnTracking?: string; retQr?: string; retVideo?: string; noVerdict?: boolean;
}

export const COND: Record<string, string> = { nowy: 'Nowy z metką', jak_nowy: 'Bardzo dobry', dobry: 'Dobry', widoczne_slady: 'Używany' };
// Demo-mode (server ledger) and solana-mode (mirrored program) timeline types.
const KIND: Record<string, Status> = {
  paid: 'Paid', shipped: 'Shipped', disputed: 'Disputed', return_requested: 'ReturnRequested', returning: 'Returning',
  completed: 'Completed', refunded: 'Refunded',
  accepted: 'Completed', resolved_seller: 'Completed', resolved_buyer: 'ReturnRequested', returned: 'Returning', return_confirmed: 'Refunded',
};
/** Where settle_expired takes each timed status (CLAUDE.md §4). */
export const SETTLE: Record<string, Status> = {
  Paid: 'Refunded', Shipped: 'Completed', Disputed: 'ReturnRequested', ReturnRequested: 'Completed', Returning: 'Refunded',
};
const opt = (v: string | null | undefined) => v ?? undefined;
const statusOf = (type: string): Status | undefined =>
  type.startsWith('expired_') ? SETTLE[type.slice('expired_'.length)] : KIND[type];

export const toUnits = (minor: number, currency: string) => (currency === 'SOL' ? minor / 1e9 : minor / 100);

export function money(units: number, currency: string): string {
  if (currency === 'SOL') return `${units.toFixed(3)} SOL`;
  const [i, d] = units.toFixed(2).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${d} zł`;
}

/** Price field → minor units: lamports (max 0.1 SOL, the server cap) or grosze. */
export function parsePrice(text: string, currency: Currency): { minor: number } | { error: string } {
  const t = text.trim().replace(',', '.');
  if (currency === 'PLN') {
    const m = parsePln(text);
    return m && m > 0 ? { minor: m } : { error: 'Podaj cenę w złotych, np. 120 albo 49,99.' };
  }
  if (!/^\d+(\.\d{1,9})?$/.test(t)) return { error: 'Podaj cenę w SOL, np. 0,05.' };
  const minor = Math.round(parseFloat(t) * 1e9);
  if (minor <= 0) return { error: 'Cena musi być większa od zera.' };
  if (minor > 100_000_000) return { error: 'Cena może wynosić maks. 0,1 SOL (limit sieci testowej w tej wersji).' };
  return { minor };
}

export function fromListing(l: Listing, cats: Record<string, string>): Item {
  const pda = l.onchain?.deal ?? null;
  return {
    id: l.id, key: { id: l.id, deal: pda }, no: l.id.slice(-4).toUpperCase(), title: l.title, brand: l.brand,
    size: l.size, cond: COND[l.condition] ?? l.condition, cat: cats[l.categoryId] ?? 'Inne', price: toUnits(l.priceMinor, l.currency),
    currency: l.currency, desc: l.description, flaws: l.defects, photos: l.photos.map((p) => p.url),
    seller: l.sellerId, sellerName: l.seller.name, sellerWallet: l.onchain?.sellerWallet, buyer: null, buyerName: '',
    status: l.status === 'Cancelled' ? 'Cancelled' : 'Listed', changedAt: l.updatedAt, deadlineAt: null,
    events: [{ st: 'Listed', label: '', at: l.createdAt, sig: null, href: null }],
    listingHash: l.onchain?.listingHash ?? '', pda,
    published: l.currency === 'PLN' ? true : !!l.onchain?.published,
  };
}

export function fromDeal(d: Deal, cats: Record<string, string>, categoryId?: string): Item {
  const txs = new Map<string, { sig: string | null; href: string | null }>();
  for (const t of d.onchain?.transactions ?? []) {
    if (!txs.has(t.status)) txs.set(t.status, { sig: t.signature, href: t.explorerUrl });
  }
  const events: ItemEvent[] = [{ st: 'Listed', label: '', at: d.createdAt, sig: null, href: null }];
  for (const e of d.timeline) {
    const st = statusOf(e.type);
    if (st) events.push({ st, label: e.label, at: e.at, sig: txs.get(st)?.sig ?? null, href: txs.get(st)?.href ?? null });
  }
  const l = d.listing;
  return {
    id: d.id, key: { id: d.id, deal: d.onchain?.deal ?? null }, no: d.id.slice(-4).toUpperCase(), title: l.title, brand: l.brand,
    size: l.size, cond: COND[l.condition] ?? l.condition, cat: (categoryId && cats[categoryId]) || 'Inne',
    price: toUnits(d.payment.amountMinor, d.payment.currency), currency: d.payment.currency, desc: l.description,
    flaws: l.defects, photos: l.photos.map((p) => p.url),
    seller: d.sellerId, sellerName: d.seller.name, sellerWallet: d.onchain?.sellerWallet, buyer: d.buyerId, buyerName: d.buyer.name,
    status: d.status, changedAt: d.statusChangedAt, deadlineAt: d.deadlineAt, events, listingHash: d.listingHash,
    pda: d.onchain?.deal ?? null, published: true,
    tracking: opt(d.trackingNumber), packHash: opt(d.packingVideoSha256), qrCommit: opt(d.qrCommitment),
    unboxHash: opt(d.unboxingVideoSha256), complaintHash: opt(d.complaintHash),
    complaint: d.complaint ? { cat: d.complaint.category, text: d.complaint.description } : undefined,
    verdict: d.verdict === 'SELLER' ? 'Seller' : d.verdict === 'BUYER' ? 'Buyer' : undefined,
    reportHash: opt(d.analysis?.reportHash), analysis: d.analysis,
    returnTracking: opt(d.returnTrackingNumber), retQr: opt(d.returnQrCommitment), retVideo: opt(d.returnVideoSha256),
    noVerdict: d.status === 'ReturnRequested' && !d.verdict,
  };
}

/** The app hides "Kup" when the server could not tie this wallet to the account; the program decides the rest. */
export function canBuy(me: User, mode: 'solana' | 'demo', linkError?: string | null): { ok: boolean; reason: string } {
  if (mode !== 'solana') return { ok: true, reason: '' };
  if (linkError) return { ok: false, reason: linkError };
  if (!me.walletAddress) {
    return { ok: false, reason: 'Twój portfel nie jest jeszcze połączony z kontem. Otwórz Portfel i spróbuj ponownie.' };
  }
  return { ok: true, reason: '' };
}

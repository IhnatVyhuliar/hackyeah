import type { ComplaintCategory, DealStatus } from './types';

export const CURRENCY = 'PLN' as const;
export const POLL_MS = 2000;
export const PORTS = { server: 4000, oracle: 8000, metro: 8081 } as const;
export const DEMO_START_BALANCE_MINOR = 100_000;   // 1000 zł na start dla kont demo

/** Etykiety statusów (CLAUDE.md §6). */
export const STATUS_LABELS_PL: Record<DealStatus, string> = {
  Listed: 'Wystawione',
  Paid: 'Opłacone – czeka na wysyłkę',
  Shipped: 'W drodze',
  Disputed: 'Reklamacja – trwa ocena',
  ReturnRequested: 'Reklamacja uznana – odeślij paczkę',
  Returning: 'Zwrot w drodze',
  Completed: 'Zakończone – środki u sprzedającego',
  Refunded: 'Środki zwrócone kupującemu',
  Cancelled: 'Anulowane',
};

export const COMPLAINT_LABELS_PL: Record<ComplaintCategory, string> = {
  damaged: 'Uszkodzony przedmiot',
  not_as_described: 'Niezgodny z opisem',
  wrong_item: 'Inny przedmiot',
  missing_item: 'Brak przedmiotu w paczce',
  other: 'Inny problem',
};

export type TimedStatus = 'Paid' | 'Shipped' | 'Disputed' | 'ReturnRequested' | 'Returning';
export type Timeouts = Record<TimedStatus, number>;   // sekundy

/** Terminy (CLAUDE.md §4). Wersja demo jest domyślna na hackathonie. */
export const TIMEOUTS_DEMO: Timeouts = {
  Paid: 10 * 60, Shipped: 60 * 60, Disputed: 10 * 60, ReturnRequested: 10 * 60, Returning: 10 * 60,
};
export const TIMEOUTS_PROD: Timeouts = {
  Paid: 3 * 86400, Shipped: 7 * 86400, Disputed: 86400, ReturnRequested: 3 * 86400, Returning: 7 * 86400,
};

export const QR_PREFIX_SHIP = 'UNBOX1';
export const QR_PREFIX_RETURN = 'UNBOX1R';

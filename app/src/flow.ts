// One user action: (upload inside act) → escrow call → optional chain sync → refresh. CLAUDE.md §6 order.
import { isEscrowError, type TxResult } from '@unbox/shared';
import { ApiError } from './api/client';

export type Stage = 'chain' | 'sync';

export async function perform(
  act: () => Promise<TxResult>,
  o: { sync?: () => Promise<unknown>; refresh: () => Promise<void>; onStage?: (s: Stage) => void },
): Promise<TxResult> {
  o.onStage?.('chain');
  const r = await act();
  o.onStage?.('sync');
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
    return { title: e.code === 'NETWORK' ? 'Brak połączenia z serwerem' : 'Serwer odrzucił operację', text: e.message, code: e.code,
      retryable: e.code === 'NETWORK' || e.status >= 500 };
  }
  return { title: 'Coś poszło nie tak', text: String((e as Error)?.message ?? e), code: '', retryable: true };
}

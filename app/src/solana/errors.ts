// Anchor / web3 errors → EscrowError with Polish copy (no "transaction", "signature", "lamport").
import { EscrowError, type EscrowErrorCode } from '@unbox/shared';

const PROGRAM: Record<string, [EscrowErrorCode, string]> = {
  InvalidStatus: ['InvalidStatus', 'Ktoś wykonał ruch w tej umowie chwilę wcześniej. Pokazujemy aktualny stan.'],
  Unauthorized: ['Unauthorized', 'Tę czynność może wykonać tylko druga strona umowy.'],
  DeadlinePassed: ['DeadlinePassed', 'Umowa przyjmuje tę czynność tylko przed terminem. Po terminie wykona regułę sama – środki nie przepadły.'],
  DeadlineNotReached: ['DeadlineNotReached', 'Zegar telefonu wyprzedza czas sieci o kilka sekund. Spróbuj za chwilę – nic nie zostało pobrane.'],
  ListingHashMismatch: ['ListingMismatch', 'Opis albo zdjęcia różnią się od zapisanych w umowie, więc umowa odrzuciła zakup. Środki nie zostały pobrane.'],
  ArbiterMismatch: ['ArbiterMismatch', 'Weryfikator w umowie jest inny niż ten, któremu ufa aplikacja. Środki nie zostały pobrane.'],
  QrMismatch: ['QrMismatch', 'Karta pochodzi z innej paczki. Umowa jest bez zmian – zeskanuj kartę z tej przesyłki.'],
  SameParty: ['Rejected', 'Nie możesz kupić własnego ogłoszenia.'],
};

export function toEscrowError(e: unknown): EscrowError {
  if (e instanceof EscrowError) return e;
  const x = e as { error?: { errorCode?: { code?: string } }; logs?: string[]; message?: string; name?: string };
  const code = x?.error?.errorCode?.code;
  if (code) {
    const [c, msg] = PROGRAM[code] ?? ['Rejected', `Umowa odrzuciła operację (${code}). Nic nie zostało pobrane.`];
    return new EscrowError(c, msg);
  }
  const text = `${x?.message ?? ''} ${(x?.logs ?? []).join(' ')}`;
  if (/insufficient lamports|no record of a prior credit|insufficient funds/i.test(text)) {
    return new EscrowError('InsufficientFunds', 'Za mało SOL na tę operację (cena i opłata sieci). Doładuj testowe SOL.');
  }
  if (/BlockheightExceeded|TransactionExpired|Blockhash not found|Network request failed|fetch failed|timed? ?out|ECONN/i.test(`${x?.name ?? ''} ${text}`)) {
    return new EscrowError('Network', 'Sieć nie potwierdziła operacji na czas. Odśwież stan umowy, zanim spróbujesz ponownie.');
  }
  return new EscrowError('Rejected', `Operacja nie powiodła się: ${x?.message ?? String(e)}`);
}

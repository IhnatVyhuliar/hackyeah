// Anchor / web3 errors → EscrowError with Polish copy (no "transaction", "signature", "lamport").
import { EscrowError, isEscrowError, type EscrowErrorCode } from '@unbox/shared';

// The deployed program is older than the app (e.g. dispute and return not upgraded on devnet yet).
const OUTDATED = 'Umowa w sieci nie obsługuje jeszcze tej czynności (program wymaga aktualizacji). Nic nie zostało pobrane.';

const PROGRAM: Record<string, [EscrowErrorCode, string]> = {
  InvalidStatus: ['InvalidStatus', 'Ktoś wykonał ruch w tej umowie chwilę wcześniej. Pokazujemy aktualny stan.'],
  Unauthorized: ['Unauthorized', 'Tę czynność może wykonać tylko druga strona umowy.'],
  DeadlinePassed: ['DeadlinePassed', 'Umowa przyjmuje tę czynność tylko przed terminem. Po terminie każdy może domknąć umowę według jej reguł – środki nie przepadły.'],
  DeadlineNotReached: ['DeadlineNotReached', 'Zegar telefonu wyprzedza czas sieci o kilka sekund. Spróbuj za chwilę – nic nie zostało pobrane.'],
  ListingHashMismatch: ['ListingMismatch', 'Opis albo zdjęcia różnią się od zapisanych w umowie, więc umowa odrzuciła zakup. Środki nie zostały pobrane.'],
  ArbiterMismatch: ['ArbiterMismatch', 'Weryfikator w umowie jest inny niż ten, któremu ufa aplikacja. Środki nie zostały pobrane.'],
  QrMismatch: ['QrMismatch', 'Karta pochodzi z innej paczki. Umowa jest bez zmian – zeskanuj kartę z tej przesyłki.'],
  SameParty: ['Rejected', 'Nie możesz kupić własnego ogłoszenia.'],
  StringTooLong: ['Rejected', 'Numer przesyłki musi mieć od 1 do 32 znaków.'],
  EmptyText: ['Rejected', 'Numer przesyłki musi mieć od 1 do 32 znaków.'],
  EmptyHash: ['Rejected', 'Brakuje nagrania albo jego odcisku. Nagraj film jeszcze raz.'],
  NotImplemented: ['Rejected', OUTDATED],
  InstructionFallbackNotFound: ['Rejected', OUTDATED],
};

export function toEscrowError(e: unknown): EscrowError {
  if (isEscrowError(e)) return e;
  const x = e as { error?: { errorCode?: { code?: string } }; logs?: string[]; message?: string; name?: string };
  const code = x?.error?.errorCode?.code;
  if (code) {
    const [c, msg] = PROGRAM[code] ?? ['Rejected', 'Umowa odrzuciła tę operację. Nic nie zostało pobrane.'];
    const err = new EscrowError(c, msg);
    Object.defineProperty(err, 'cause', { value: e, enumerable: false });
    return err;
  }
  const text = `${x?.message ?? ''} ${(x?.logs ?? []).join(' ')}`;
  if (/InstructionFallbackNotFound|Error Code: NotImplemented/.test(text)) return new EscrowError('Rejected', OUTDATED);
  if (/insufficient lamports|no record of a prior credit|insufficient funds/i.test(text)) {
    return new EscrowError('InsufficientFunds', 'Za mało SOL na tę operację (cena i opłata sieci). Doładuj testowe SOL.');
  }
  if (/BlockheightExceeded|TransactionExpired|Blockhash not found|Network request failed|fetch failed|timed? ?out|ECONN/i.test(`${x?.name ?? ''} ${text}`)) {
    return new EscrowError('Network', 'Sieć nie potwierdziła operacji na czas. Odśwież stan umowy, zanim spróbujesz ponownie.');
  }
  const err = new EscrowError('Rejected', 'Operacja nie powiodła się. Odśwież stan umowy i spróbuj ponownie.');
  Object.defineProperty(err, 'cause', { value: e, enumerable: false });   // raw error for debugging only
  return err;
}

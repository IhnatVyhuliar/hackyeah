import type { ErrorCode } from '@unbox/shared';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'HASH_MISMATCH';

/** Komunikaty dla UI, gdy serwer nie podał własnego (serwer zwraca komunikaty po polsku). */
const FALLBACK_PL: Record<ClientErrorCode, string> = {
  UNAUTHORIZED: 'Zaloguj się ponownie',
  FORBIDDEN: 'Nie masz uprawnień do tej akcji',
  NOT_FOUND: 'Nie znaleziono',
  VALIDATION: 'Sprawdź wprowadzone dane',
  INVALID_STATE: 'Ta akcja nie jest teraz możliwa',
  DEADLINE_PASSED: 'Termin na tę akcję minął',
  DEADLINE_NOT_REACHED: 'Termin jeszcze nie minął',
  QR_MISMATCH: 'Kod QR nie pasuje do tej przesyłki',
  INSUFFICIENT_FUNDS: 'Za mało środków na saldzie',
  AI_ERROR: 'Ocena reklamacji chwilowo niedostępna',
  INTERNAL: 'Błąd serwera, spróbuj ponownie',
  NETWORK: 'Brak połączenia z serwerem',
  TIMEOUT: 'Serwer nie odpowiada, spróbuj ponownie',
  INVALID_RESPONSE: 'Nieoczekiwana odpowiedź serwera',
  HASH_MISMATCH: 'Plik uszkodził się podczas wysyłania, spróbuj ponownie',
};

const BY_STATUS: Record<number, ClientErrorCode> = {
  400: 'VALIDATION', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'INVALID_STATE', 413: 'VALIDATION',
};

export class ApiClientError extends Error {
  /** `message` jest gotowy do pokazania użytkownikowi (po polsku). */
  constructor(public code: ClientErrorCode, message: string, public status: number | null = null) {
    super(message);
    this.name = 'ApiClientError';
  }
  /** Czy warto pozwolić użytkownikowi ponowić (sieć, timeout, błąd serwera). */
  get retryable() {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT' || this.code === 'INTERNAL' || this.code === 'AI_ERROR';
  }
}

export function errorFrom(status: number, body: unknown): ApiClientError {
  const e = (body as { error?: { code?: string; message?: string } } | null)?.error;
  const code = (e?.code && e.code in FALLBACK_PL ? e.code : BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION')) as ClientErrorCode;
  return new ApiClientError(code, e?.message || FALLBACK_PL[code], status);
}

export const clientError = (code: ClientErrorCode, message?: string) => new ApiClientError(code, message ?? FALLBACK_PL[code]);

/** Komunikat dla użytkownika z dowolnego błędu. */
export const userMessage = (e: unknown) => (e instanceof ApiClientError ? e.message : FALLBACK_PL.INTERNAL);

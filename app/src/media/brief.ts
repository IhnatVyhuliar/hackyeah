// What each recording must show (the oracle judges against this; CLAUDE.md §3).
export type RecMode = 'unboxing' | 'packing' | 'return';

export const SHOW: Record<RecMode, string[]> = {
  unboxing: ['Zamknięta paczka: etykieta i taśma', 'Otwarcie bez przerw', 'Karta z kodem, gdy tylko ją zobaczysz', 'Całe ubranie z obu stron'],
  packing: ['Ubranie z obu stron, także wady z listy', 'Karta z kodem włożona do środka', 'Zaklejenie paczki', 'Etykieta z numerem przesyłki'],
  return: ['Odsyłane ubranie z obu stron', 'Nowa karta zwrotu włożona do środka', 'Zaklejenie paczki', 'Etykieta z numerem przesyłki'],
};
export const LIMIT_S = 120;
export const MIN_S = 3;
export const QR_PREFIX = 'UNBOX1';

export const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

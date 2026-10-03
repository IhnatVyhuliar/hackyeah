// Jedyne źródło czasu backendu (terminy transakcji). Przesunięcie działa tylko w trybie testowym.
import { nowUnix, type Unix } from '@unbox/shared';
import { config } from './config';

let offsetSecs = 0;

export const now = (): Unix => nowUnix() + offsetSecs;

/** TEST-ONLY. Rzuca, jeśli zegar testowy jest wyłączony (np. NODE_ENV=production). */
export function advanceClock(secs: number): Unix {
  if (!config.devClock) throw new Error('Zegar testowy jest wyłączony');
  offsetSecs += secs;
  return now();
}

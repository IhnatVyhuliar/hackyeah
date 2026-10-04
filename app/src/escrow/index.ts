// The one Escrow the screens use: SolanaEscrow (app/src/solana) or DemoEscrow, chosen by EXPO_PUBLIC_PAYMENTS.
import type { Escrow } from '@unbox/shared';
import { createSolanaEscrow } from '../solana';
import { createDemoEscrow } from './demo';

export const PAYMENTS: 'solana' | 'demo' = process.env.EXPO_PUBLIC_PAYMENTS === 'solana' ? 'solana' : 'demo';

// `let` + live binding: the dev menu can swap the demo AI scenario without restarting the app.
export let escrow: Escrow = PAYMENTS === 'solana' ? createSolanaEscrow() : createDemoEscrow();
export let demoScenario: string | undefined;

export function setDemoScenario(scenario: string | undefined) {
  if (escrow.mode !== 'demo') return;
  demoScenario = scenario;
  escrow = createDemoEscrow(undefined, { scenario });
}

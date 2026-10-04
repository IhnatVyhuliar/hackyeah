// Stub until person B lands the real implementation; owned by person B from now on.
import { EscrowError, type Escrow } from '@unbox/shared';

export function createSolanaEscrow(): Escrow {
  const off = async (): Promise<never> => {
    throw new EscrowError('Rejected', 'Płatności w sieci nie są jeszcze podłączone. Uruchom aplikację z EXPO_PUBLIC_PAYMENTS=demo.');
  };
  return {
    mode: 'solana', walletAddress: async () => null, networkNow: async () => Math.floor(Date.now() / 1000),
    requestTestSol: off, createListing: off, cancelListing: off, purchase: off, newQrCard: off, markShipped: off,
    acceptDelivery: off, openDispute: off, markReturned: off, confirmReturn: off, settleExpired: off,
  };
}

// CHAIN=mock: symulacja programu przez fakeChain z @sellsol/shared. Tylko do dev i contract-testu.
import { randomBytes } from 'node:crypto';
import { applyAction, DEFAULT_FAKE_CONFIG, type EscrowState, type FakeAction, nowUnix, type Order,
  type TxAction } from '@sellsol/shared';
import { config } from '../config';
import { docs } from '../db';
import { ApiErr } from '../errors';
import type { ChainAdapter, PrepareExtra } from './types';

let clockOffsetSecs = 0;
/** TEST-ONLY: przesuwa czas symulowanego łańcucha (POST /api/dev/clock, tylko CHAIN=mock). */
export const advanceMockClock = (secs: number) => {
  if (config.chain !== 'mock') throw new Error('advanceMockClock: tylko CHAIN=mock');
  clockOffsetSecs += secs;
  return nowUnix() + clockOffsetSecs;
};
const chainNow = () => nowUnix() + clockOffsetSecs;

const pending = new Map<string, FakeAction>();   // `${orderId}:${action}` → instrukcja z prepare
const verifier = config.verifier?.publicKey.toBase58() ?? DEFAULT_FAKE_CONFIG.verifier;
const fakeConfig = { ...DEFAULT_FAKE_CONFIG, verifier };

const load = (orderId: string) => docs.get('mock_escrow', orderId) as EscrowState | null;

function apply(orderId: string, a: FakeAction) {
  const { state } = applyAction(load(orderId), a, chainNow(), fakeConfig);
  docs.put('mock_escrow', orderId, state);
  return state;
}

function buildAction(order: Order, action: TxAction, wallet: string, extra?: PrepareExtra): FakeAction {
  switch (action) {
    case 'fund':
      return { action, signer: wallet, orderId: order.id, buyer: order.buyerWallet, seller: order.sellerWallet,
               amountLamports: order.amountLamports, termsHash: order.termsHash,
               thresholds: order.thresholds, windows: order.windows };
    case 'commit_shipment':
      return { action, signer: wallet, expectedAmountLamports: order.amountLamports,
               expectedTermsHash: order.termsHash, sealHash: order.seal!.sealHash,
               packingVideoHash: order.packingVideoHash! };
    case 'open_claim':
      return { action, signer: wallet, unboxingVideoHash: extra!.unboxingVideoHash! };
    case 'seller_decline': case 'confirm_receipt': case 'claim_timeout':
      return { action, signer: wallet };
    case 'submit_verdict':
      throw new ApiErr('FORBIDDEN', 'submit_verdict wysyła tylko serwer (wyrocznia)');
  }
}

export const mockChain: ChainAdapter = {
  kind: 'mock',
  programId: config.programId,
  cluster: 'mock',
  async prepare(order, action, wallet, extra) {
    pending.set(`${order.id}:${action}`, buildAction(order, action, wallet, extra));
    return { action, txBase64: 'MOCK', programId: config.programId, cluster: 'mock' };
  },
  async confirmAndRead(order, action, signature) {
    if (!signature.startsWith('MOCK')) throw new ApiErr('TX_NOT_CONFIRMED', 'W trybie mock podpis musi zaczynać się od MOCK');
    const a = pending.get(`${order.id}:${action}`);
    if (!a) throw new ApiErr('TX_NOT_CONFIRMED', 'Brak przygotowanej transakcji (wywołaj tx/prepare)');
    pending.delete(`${order.id}:${action}`);
    return apply(order.id, a);
  },
  async read(orderId) {
    return load(orderId);
  },
  async submitVerdict(orderId, measurements) {
    apply(orderId, { action: 'submit_verdict', signer: verifier, measurements });
    return `MOCK${randomBytes(16).toString('hex')}`;
  },
  async claimTimeout(orderId) {
    apply(orderId, { action: 'claim_timeout' });
    return `MOCK${randomBytes(16).toString('hex')}`;
  },
  async now() {
    return chainNow();
  },
  async health() {
    return true;
  },
};

import type { Cluster, EscrowState, Hex32, Measurements, Order, PreparedTx, TxAction, Unix } from '@sellsol/shared';

/** Dane z off-chain potrzebne do zbudowania instrukcji (hasze liczone przez serwer). */
export interface PrepareExtra { unboxingVideoHash?: Hex32 }

/**
 * Adapter łańcucha. Serwer NIE decyduje o pieniądzach: buduje niepodpisane transakcje,
 * czyta stan konta i (jako wyrocznia) wysyła pomiary. Wynik liczy program.
 */
export interface ChainAdapter {
  kind: 'mock' | 'devnet';
  programId: string;
  cluster: Cluster;
  /** Niepodpisana transakcja dla użytkownika (feePayer = wallet). */
  prepare(order: Order, action: TxAction, wallet: string, extra?: PrepareExtra): Promise<PreparedTx>;
  /** Czeka na potwierdzenie podpisu i czyta konto escrow. Nie ufa klientowi: liczy się stan konta. */
  confirmAndRead(order: Order, action: TxAction, signature: string): Promise<EscrowState | null>;
  read(orderId: string): Promise<EscrowState | null>;
  /** Wysyła pomiary kluczem weryfikatora; zwraca podpis. */
  submitVerdict(orderId: string, m: Measurements): Promise<string>;
  /** claim_timeout kluczem serwera (cranker); zwraca podpis. */
  claimTimeout(orderId: string): Promise<string>;
  /** Czas łańcucha (do podglądu i wstępnych warunków; program i tak sprawdza Clock). */
  now(): Promise<Unix>;
  health(): Promise<boolean>;
}

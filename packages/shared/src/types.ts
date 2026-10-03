// 1:1 z docs/KONTRAKT.md §7. Zmiany tylko przez procedurę "Zmiana kontraktu" (CLAUDE.md).

export type Lamports = string;   // u64 jako string dziesiętny
export type Unix = number;       // sekundy
export type Hex32 = string;      // 64 znaki hex lowercase
export type Base58 = string;
export type Role = 'buyer' | 'seller';
export type Cluster = 'devnet' | 'localnet' | 'mock';

export interface User { id: string; email: string; name: string; walletAddress: Base58 | null; createdAt: Unix }
export interface Category { id: string; slug: string; name: string; icon: string }
export type Condition = 'nowy' | 'jak_nowy' | 'dobry' | 'widoczne_slady';
export interface ExtraTest { id: string; description: string }            // np. "Pokaż metkę z rozmiarem M"
export interface Thresholds { minMatchScore: number; minPackageScore: number; weightTolG: number }
export interface Windows { shipWindowSecs: number; openWindowSecs: number }

export interface Listing {
  id: string; sellerId: string;
  seller: { id: string; name: string; walletAddress: Base58 | null };
  title: string; description: string; categoryId: string; condition: Condition;
  size?: string; brand?: string;
  priceLamports: Lamports; pricePln: number;                 // pricePln poglądowo (stały kurs demo)
  photos: string[];                                          // URL-e albo require() w mocku
  declaredWeightG: number; dimensionsCm: { l: number; w: number; h: number };
  extraTests: ExtraTest[]; thresholds: Thresholds; windows: Windows;
  status: 'active' | 'reserved' | 'sold'; createdAt: Unix;
}
export type CreateListingInput = Omit<Listing, 'id' | 'sellerId' | 'seller' | 'status' | 'createdAt' | 'pricePln'>;

export type OrderStatus = 'awaiting_payment' | 'funded' | 'packing_review' | 'ready_to_ship'
  | 'shipped' | 'delivered' | 'unboxing_review' | 'verifying' | 'released' | 'refunded';
export type ChainStatus = 'none' | 'Funded' | 'Shipped' | 'Verifying' | 'Released' | 'Refunded';
export type TxAction = 'fund' | 'seller_decline' | 'commit_shipment' | 'confirm_receipt'
  | 'open_claim' | 'claim_timeout' | 'submit_verdict';           // submit_verdict wysyła tylko serwer
export type OutcomeReason = 'BuyerConfirmed' | 'VerifiedOk' | 'RecordingInvalid' | 'TransitBroken'
  | 'ItemMismatch' | 'ShipTimeout' | 'OpenTimeout' | 'VerifierTimeout' | 'SellerDeclined';
export type DemoScenario = 'ok' | 'defect' | 'swap' | 'invalid_recording';

export interface Measurements {
  recordingValid: boolean; qrMatch: boolean; sealIntact: boolean;
  packageScore: number; weightDiffG: number; matchScore: number;
  defectFound: boolean; testsPassed: boolean;
}
export interface Seal { qrPayload?: string; sealHash: Hex32; shortCode: string }   // qrPayload tylko dla sprzedającego
export interface Markers { sealShownMs?: number; openStartMs?: number; productShownMs?: number; defectShownMs?: number }
export interface LockerEvent { type: 'dropped_off' | 'ready_for_pickup'; lockerId: string; weightG: number; at: Unix }
export interface TxRef { action: TxAction; signature: string; explorerUrl: string; at: Unix }
export interface TimelineEvent { at: Unix; type: string; label: string; txSignature?: string }  // label po polsku

export interface Order {
  id: string;                                   // UUID = order_id w programie
  listing: Listing; buyerId: string; sellerId: string;
  buyerWallet: Base58; sellerWallet: Base58; amountLamports: Lamports;
  escrowPda: Base58; programId: Base58; cluster: Cluster;
  status: OrderStatus; chainStatus: ChainStatus;
  termsHash: Hex32; thresholds: Thresholds; windows: Windows;
  shipDeadline: Unix | null; openDeadline: Unix | null; verdictDeadline: Unix | null;
  seal: Seal | null;
  packingVideoHash: Hex32 | null; unboxingVideoHash: Hex32 | null;
  packingVerificationId: string | null; unboxingVerificationId: string | null;
  lockerEvents: LockerEvent[];
  measurements: Measurements | null; outcomeReason: OutcomeReason | null;
  txs: TxRef[]; timeline: TimelineEvent[]; createdAt: Unix;
}

export interface Keyframe { ms: number; url: string; label: string }
export interface Defect { label: string; severity: 'minor' | 'major'; frameMs: number; confidence: number }
export interface ExtraTestResult { testId: string; passed: boolean; note: string; frameMs?: number }
export interface VerificationReport {
  kind: 'packing' | 'unboxing'; orderId: string; videoSha256: Hex32; durationMs: number;
  seal: { detected: boolean; payloadMatch: boolean; firstSeenMs: number | null;
          lastSeenSealedMs: number | null; intact: boolean | null };
  continuity: { ok: boolean; sceneCutsMs: number[]; timestampGaps: { fromMs: number; toMs: number }[];
                maxSealGapMs: number; issues: string[] };
  productVisible: boolean;
  defects: Defect[]; extraTests: ExtraTestResult[];
  recordingValid: boolean;
  packingOk: boolean | null;                                   // tylko packing
  measurements: Omit<Measurements, 'weightDiffG'> | null;      // tylko unboxing; weightDiffG dokłada serwer
  keyframes: Keyframe[]; reasons: string[];                    // reasons po polsku
  engine: { version: string; llm: string | null; processingMs: number };
}
export interface Verification {
  id: string; orderId: string; kind: 'packing' | 'unboxing';
  status: 'processing' | 'done' | 'failed'; report: VerificationReport | null;
  error?: string; createdAt: Unix;
}

export interface EscrowState {                                 // odczyt konta przez SDK
  orderId: string; buyer: Base58; seller: Base58; verifier: Base58; feeWallet: Base58; feeBps: number;
  amountLamports: Lamports; termsHash: Hex32; thresholds: Thresholds;
  windows: Windows & { verdictWindowSecs: number };
  status: Exclude<ChainStatus, 'none'>; createdAt: Unix;
  shipDeadline: Unix; openDeadline: Unix | null; verdictDeadline: Unix | null;
  sealHash: Hex32 | null; packingVideoHash: Hex32 | null; unboxingVideoHash: Hex32 | null;
  measurements: Measurements | null; reason: OutcomeReason | null; resolvedAt: Unix | null;
}
export interface ConfigBounds { minShipWindow: number; maxShipWindow: number; minOpenWindow: number;
                                maxOpenWindow: number; verdictWindow: number }
export interface ConfigState extends ConfigBounds { admin: Base58; verifier: Base58; feeBps: number; feeWallet: Base58 }

export interface LocalFile { uri: string; name: string; mimeType: string }
export interface UploadResult { url: string; sha256: Hex32; size: number; mimeType: string }
export interface PreparedTx { action: TxAction; txBase64: string; programId: Base58; cluster: Cluster }
export interface ApiError { error: { code: ErrorCode; message: string } }
export type ErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'INVALID_STATE'
  | 'RECORDING_INVALID' | 'TX_NOT_CONFIRMED' | 'CHAIN_ERROR' | 'AI_ERROR';

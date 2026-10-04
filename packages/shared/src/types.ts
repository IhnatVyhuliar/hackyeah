// Model domenowy sklepu (bez blockchaina). Backend jest źródłem prawdy dla stanu transakcji.

export type Unix = number;          // sekundy
export type Hex32 = string;         // 64 znaki hex lowercase (sha256)
export type Minor = number;         // kwota w groszach (int)
export type Currency = 'PLN' | 'SOL';   // PLN = PAYMENTS=demo (grosze), SOL = PAYMENTS=solana (lamporty)
export type Role = 'buyer' | 'seller';

export interface User { id: string; email: string; name: string; createdAt: Unix; walletAddress?: string }
export interface Category { id: string; slug: string; name: string; icon: string }
export type Condition = 'nowy' | 'jak_nowy' | 'dobry' | 'widoczne_slady';

export interface Photo { url: string; sha256: Hex32 }

export type ListingStatus = 'Listed' | 'Sold' | 'Cancelled';
export interface Listing {
  id: string;                        // = id transakcji (jedna transakcja na ogłoszenie)
  sellerId: string; seller: { id: string; name: string };
  title: string; description: string; categoryId: string; condition: Condition;
  brand: string; size: string;
  defects: string[];                 // lista ujawnionych wad
  photos: Photo[];
  priceMinor: Minor; currency: Currency;
  status: ListingStatus;
  createdAt: Unix; updatedAt: Unix;
  onchain?: OnChainListing;          // tylko PAYMENTS=solana, po POST /api/listings/{id}/publish
}
/** Argumenty create_listing zamrożone przez serwer; `published` = konto Deal istnieje on-chain. */
export interface OnChainListing {
  deal: string; dealId: number; sellerWallet: string; listingHash: Hex32; metadataUri: string; published: boolean;
}
export interface CreateListingInput {
  title: string; description: string; categoryId: string; condition: Condition;
  brand: string; size: string; defects: string[]; photos: Photo[]; priceMinor: Minor;
}
export type UpdateListingInput = Partial<CreateListingInput>;

/** Treść ogłoszenia zamrożona przy zakupie; `listingHash` = sha256(canonicalJson(ListingMetadata)). */
export interface ListingMetadata {
  v: 1; title: string; description: string; brand: string; size: string; condition: Condition;
  defects: string[]; photos: { url: string; sha256: Hex32 }[]; priceMinor: Minor; currency: Currency;
}

export type DealStatus = 'Listed' | 'Paid' | 'Shipped' | 'Disputed' | 'ReturnRequested' | 'Returning'
  | 'Completed' | 'Refunded' | 'Cancelled';

export type PaymentStatus = 'secured' | 'released' | 'refunded';
export interface Payment {
  status: PaymentStatus; amountMinor: Minor; currency: Currency;
  securedAt: Unix; settledAt: Unix | null;
}

export type ComplaintCategory = 'damaged' | 'not_as_described' | 'wrong_item' | 'missing_item' | 'other';
export interface Complaint { v: 1; category: ComplaintCategory; description: string; created_at: Unix }

/** Raport wyroczni (kształt z CLAUDE.md §5). Model wypełnia pola; werdykt liczy decide(). */
export interface OracleReport {
  buyer_recording: { continuous: boolean; starts_with_sealed_package: boolean; qr_revealed_on_opening: boolean;
                     quality: 'good' | 'poor'; notes: string };
  seller_recording: { item_clearly_visible: boolean; qr_card_packed: boolean; package_sealed_and_labeled: boolean;
                      quality: 'good' | 'poor'; notes: string };
  package_matches_shipping_recording: boolean;
  item_matches_listing: boolean;
  undisclosed_damage: { present: boolean; description: string; timestamps: string[] };
  reasoning: string;
}
export type Verdict = 'SELLER' | 'BUYER';

export interface Analysis {
  status: 'pending' | 'done' | 'failed';
  attempts: number;
  error: string | null;
  report: OracleReport | null;
  reportHash: Hex32 | null;          // sha256(canonicalJson(report))
  model: string | null; promptVersion: string | null;
  verdict: Verdict | null;           // decide(report), liczone w backendzie
  updatedAt: Unix;
}

export type CloseReason = 'accepted' | 'verdict_seller' | 'return_confirmed' | 'ship_timeout' | 'unbox_timeout'
  | 'return_ship_timeout' | 'return_confirm_timeout';

export interface TimelineEvent { at: Unix; type: string; label: string }   // label po polsku

export interface Deal {
  id: string;                        // = listing.id
  listing: ListingMetadata; listingHash: Hex32;
  sellerId: string; seller: { id: string; name: string };
  buyerId: string; buyer: { id: string; name: string };
  status: Exclude<DealStatus, 'Listed' | 'Cancelled'>;
  statusChangedAt: Unix;
  deadlineAt: Unix | null;           // statusChangedAt + TIMEOUTS[status]; null w stanach końcowych
  payment: Payment;
  qrCommitment: Hex32 | null; packingVideoSha256: Hex32 | null; trackingNumber: string | null;
  unboxingVideoSha256: Hex32 | null; complaint: Complaint | null; complaintHash: Hex32 | null;
  analysis: Analysis | null; verdict: Verdict | null;
  returnQrCommitment: Hex32 | null; returnVideoSha256: Hex32 | null; returnTrackingNumber: string | null;
  closeReason: CloseReason | null;
  timeline: TimelineEvent[];
  createdAt: Unix;
  onchain?: OnChainDeal;             // tylko PAYMENTS=solana: odbicie konta Deal
}
/** Potwierdzona zmiana statusu w programie (sygnatura z łańcucha). */
export interface ChainTx { status: DealStatus; at: Unix; signature: string | null; explorerUrl: string | null }
export interface OnChainDeal {
  deal: string; sellerWallet: string; buyerWallet: string; priceLamports: number; transactions: ChainTx[];
}

export interface MediaUpload { sha256: Hex32; url: string; size: number; mimeType: string }

export type LedgerType = 'topup' | 'secure' | 'release' | 'refund';
export interface LedgerEntry { id: string; dealId: string | null; type: LedgerType; amountMinor: Minor; at: Unix; label: string }
export interface Wallet { balanceMinor: Minor; currency: Currency; heldMinor: Minor; ledger: LedgerEntry[]; address?: string }

export interface ApiError { error: { code: ErrorCode; message: string } }
export type ErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'INVALID_STATE'
  | 'DEADLINE_PASSED' | 'DEADLINE_NOT_REACHED' | 'QR_MISMATCH' | 'INSUFFICIENT_FUNDS' | 'AI_ERROR' | 'UPSTREAM' | 'INTERNAL';

// Schematy zod 1:1 z types.ts (walidacja wejścia/wyjścia API i raportu wyroczni).
import { z } from 'zod';
import type * as T from './types';

export const UnixSchema = z.int().nonnegative();
export const Hex32Schema = z.string().regex(/^[0-9a-f]{64}$/, '64 znaki hex lowercase');
export const MinorSchema = z.int().min(0).max(100_000_000);
export const CurrencySchema = z.literal('PLN');
export const RoleSchema = z.enum(['buyer', 'seller']);

export const UserSchema = z.object({ id: z.string(), email: z.string(), name: z.string(), createdAt: UnixSchema });
export const CategorySchema = z.object({ id: z.string(), slug: z.string(), name: z.string(), icon: z.string() });
export const ConditionSchema = z.enum(['nowy', 'jak_nowy', 'dobry', 'widoczne_slady']);
export const PhotoSchema = z.object({ url: z.string(), sha256: Hex32Schema });
const Party = z.object({ id: z.string(), name: z.string() });

export const ListingStatusSchema = z.enum(['Listed', 'Sold', 'Cancelled']);
export const ListingSchema = z.object({
  id: z.string(), sellerId: z.string(), seller: Party,
  title: z.string(), description: z.string(), categoryId: z.string(), condition: ConditionSchema,
  brand: z.string(), size: z.string(), defects: z.array(z.string()), photos: z.array(PhotoSchema),
  priceMinor: MinorSchema, currency: CurrencySchema, status: ListingStatusSchema,
  createdAt: UnixSchema, updatedAt: UnixSchema,
});
export const CreateListingInputSchema = z.object({
  title: z.string().trim().min(3).max(120), description: z.string().max(4000),
  categoryId: z.string(), condition: ConditionSchema,
  brand: z.string().max(60), size: z.string().max(30),
  defects: z.array(z.string().max(300)).max(20), photos: z.array(PhotoSchema).max(10),
  priceMinor: MinorSchema.min(1),
});
export const UpdateListingInputSchema = CreateListingInputSchema.partial();

export const ListingMetadataSchema = z.object({
  v: z.literal(1), title: z.string(), description: z.string(), brand: z.string(), size: z.string(),
  condition: ConditionSchema, defects: z.array(z.string()), photos: z.array(PhotoSchema),
  priceMinor: MinorSchema, currency: CurrencySchema,
});

export const DealStatusSchema = z.enum(['Listed', 'Paid', 'Shipped', 'Disputed', 'ReturnRequested', 'Returning',
  'Completed', 'Refunded', 'Cancelled']);
export const PaymentSchema = z.object({
  status: z.enum(['secured', 'released', 'refunded']), amountMinor: MinorSchema, currency: CurrencySchema,
  securedAt: UnixSchema, settledAt: UnixSchema.nullable(),
});
export const ComplaintCategorySchema = z.enum(['damaged', 'not_as_described', 'wrong_item', 'missing_item', 'other']);
export const ComplaintSchema = z.object({
  v: z.literal(1), category: ComplaintCategorySchema, description: z.string().max(2000), created_at: UnixSchema,
});

const Quality = z.enum(['good', 'poor']);
export const OracleReportSchema = z.object({
  buyer_recording: z.object({
    continuous: z.boolean(), starts_with_sealed_package: z.boolean(), qr_revealed_on_opening: z.boolean(),
    quality: Quality, notes: z.string(),
  }),
  seller_recording: z.object({
    item_clearly_visible: z.boolean(), qr_card_packed: z.boolean(), package_sealed_and_labeled: z.boolean(),
    quality: Quality, notes: z.string(),
  }),
  package_matches_shipping_recording: z.boolean(),
  item_matches_listing: z.boolean(),
  undisclosed_damage: z.object({ present: z.boolean(), description: z.string(), timestamps: z.array(z.string()) }),
  reasoning: z.string(),
});
export const VerdictSchema = z.enum(['SELLER', 'BUYER']);
export const AnalysisSchema = z.object({
  status: z.enum(['pending', 'done', 'failed']), attempts: z.int().nonnegative(), error: z.string().nullable(),
  report: OracleReportSchema.nullable(), reportHash: Hex32Schema.nullable(),
  model: z.string().nullable(), promptVersion: z.string().nullable(), verdict: VerdictSchema.nullable(),
  updatedAt: UnixSchema,
});
export const CloseReasonSchema = z.enum(['accepted', 'verdict_seller', 'return_confirmed', 'ship_timeout', 'unbox_timeout',
  'return_ship_timeout', 'return_confirm_timeout']);
export const TimelineEventSchema = z.object({ at: UnixSchema, type: z.string(), label: z.string() });

export const DealSchema = z.object({
  id: z.string(), listing: ListingMetadataSchema, listingHash: Hex32Schema,
  sellerId: z.string(), seller: Party, buyerId: z.string(), buyer: Party,
  status: z.enum(['Paid', 'Shipped', 'Disputed', 'ReturnRequested', 'Returning', 'Completed', 'Refunded']),
  statusChangedAt: UnixSchema, deadlineAt: UnixSchema.nullable(),
  payment: PaymentSchema,
  qrCommitment: Hex32Schema.nullable(), packingVideoSha256: Hex32Schema.nullable(), trackingNumber: z.string().nullable(),
  unboxingVideoSha256: Hex32Schema.nullable(), complaint: ComplaintSchema.nullable(), complaintHash: Hex32Schema.nullable(),
  analysis: AnalysisSchema.nullable(), verdict: VerdictSchema.nullable(),
  returnQrCommitment: Hex32Schema.nullable(), returnVideoSha256: Hex32Schema.nullable(), returnTrackingNumber: z.string().nullable(),
  closeReason: CloseReasonSchema.nullable(),
  timeline: z.array(TimelineEventSchema), createdAt: UnixSchema,
});

export const MediaUploadSchema = z.object({ sha256: Hex32Schema, url: z.string(), size: z.int().nonnegative(), mimeType: z.string() });
export const LedgerEntrySchema = z.object({
  id: z.string(), dealId: z.string().nullable(), type: z.enum(['topup', 'secure', 'release', 'refund']),
  amountMinor: z.int(), at: UnixSchema, label: z.string(),
});
export const WalletSchema = z.object({
  balanceMinor: z.int(), currency: CurrencySchema, heldMinor: z.int().nonnegative(), ledger: z.array(LedgerEntrySchema),
});

export const ErrorCodeSchema = z.enum(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'INVALID_STATE',
  'DEADLINE_PASSED', 'DEADLINE_NOT_REACHED', 'QR_MISMATCH', 'INSUFFICIENT_FUNDS', 'AI_ERROR', 'INTERNAL']);
export const ApiErrorSchema = z.object({ error: z.object({ code: ErrorCodeSchema, message: z.string() }) });

// ---------- body akcji (API) ----------
const Tracking = z.string().trim().min(3).max(32);
export const ShipBodySchema = z.object({ qrCommitment: Hex32Schema, packingVideoSha256: Hex32Schema, trackingNumber: Tracking });
export const AcceptBodySchema = z.object({ qrSecret: Hex32Schema });
export const DisputeBodySchema = z.object({
  qrSecret: Hex32Schema, unboxingVideoSha256: Hex32Schema,
  complaint: z.object({ category: ComplaintCategorySchema, description: z.string().trim().min(3).max(2000) }),
});
export const ReturnBodySchema = z.object({ returnQrCommitment: Hex32Schema, returnVideoSha256: Hex32Schema, returnTrackingNumber: Tracking });
export const ConfirmReturnBodySchema = z.object({ returnQrSecret: Hex32Schema });

// ---------- odpowiedzi złożone ----------
export const AuthResponseSchema = z.object({ token: z.string(), user: UserSchema });
export const HealthSchema = z.object({ ok: z.boolean(), ai: z.string(), timeouts: z.enum(['demo', 'prod']), version: z.string() });

// ---------- kontrakt backend ↔ wyrocznia (POST {AI_URL}/v1/disputes/analyze) ----------
const EvidenceFile = z.object({ url: z.string(), sha256: Hex32Schema });
/** Żądanie oceny reklamacji. Wyrocznia pobiera pliki z URL-i i sprawdza ich sha256. */
export const OracleRequestSchema = z.object({
  deal_id: z.string(),
  listing: ListingMetadataSchema,           // treść ogłoszenia zamrożona przy zakupie (z listą wad i zdjęciami)
  listing_hash: Hex32Schema,
  tracking_number: z.string().nullable(),
  packing_video: EvidenceFile,
  unboxing_video: EvidenceFile,
  complaint: ComplaintSchema,
});
export type OracleRequest = z.infer<typeof OracleRequestSchema>;

/** Odpowiedź wyroczni: raport (pomiary) + metadane + hasze plików, które faktycznie oceniła. Bez werdyktu. */
export const OracleResponseSchema = z.object({
  report: OracleReportSchema,
  model: z.string(), prompt_version: z.string(),
  evidence: z.object({ packing_video_sha256: Hex32Schema, unboxing_video_sha256: Hex32Schema }),
});
export type OracleResponse = z.infer<typeof OracleResponseSchema>;

// Kontrola zgodności schematów z typami: błąd kompilacji, jeśli się rozjadą.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertSame = <_ extends true>() => {};
assertSame<Same<z.infer<typeof UserSchema>, T.User>>();
assertSame<Same<z.infer<typeof ListingSchema>, T.Listing>>();
assertSame<Same<z.infer<typeof CreateListingInputSchema>, T.CreateListingInput>>();
assertSame<Same<z.infer<typeof ListingMetadataSchema>, T.ListingMetadata>>();
assertSame<Same<z.infer<typeof DealSchema>, T.Deal>>();
assertSame<Same<z.infer<typeof OracleReportSchema>, T.OracleReport>>();
assertSame<Same<z.infer<typeof AnalysisSchema>, T.Analysis>>();
assertSame<Same<z.infer<typeof ComplaintSchema>, T.Complaint>>();
assertSame<Same<z.infer<typeof MediaUploadSchema>, T.MediaUpload>>();
assertSame<Same<z.infer<typeof WalletSchema>, T.Wallet>>();
assertSame<Same<z.infer<typeof ApiErrorSchema>, T.ApiError>>();

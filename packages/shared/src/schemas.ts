// Schematy zod 1:1 z types.ts (KONTRAKT §7). Nazwa = typ + "Schema".
// To warstwa klienta i serializacji. Nie jest źródłem prawdy dla wyniku escrow: o pieniądzach decyduje program.
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import type * as T from './types';

export const U64_MAX = 18446744073709551615n;

export const LamportsSchema = z.string()
  .regex(/^(0|[1-9]\d*)$/, 'lamporty jako string dziesiętny')
  .refine((v) => !/^\d+$/.test(v) || BigInt(v) <= U64_MAX, 'lamporty poza zakresem u64');
/** Czas jako dane klienta i do wyświetlania. Rozliczenia liczy program z Clock::get(). */
export const UnixSchema = z.int().nonnegative();
export const Hex32Schema = z.string().regex(/^[0-9a-f]{64}$/, '64 znaki hex lowercase');
export const Base58Schema = z.string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'adres base58')
  .refine((v) => { try { new PublicKey(v); return true; } catch { return false; } }, 'niepoprawny klucz Solany');
export const RoleSchema = z.enum(['buyer', 'seller']);
export const ClusterSchema = z.enum(['devnet', 'localnet', 'mock']);
const Score = z.number().int().min(0).max(100);

export const UserSchema = z.object({
  id: z.string(), email: z.string(), name: z.string(),
  walletAddress: Base58Schema.nullable(), createdAt: UnixSchema,
});
export const CategorySchema = z.object({ id: z.string(), slug: z.string(), name: z.string(), icon: z.string() });
export const ConditionSchema = z.enum(['nowy', 'jak_nowy', 'dobry', 'widoczne_slady']);
export const ExtraTestSchema = z.object({ id: z.string(), description: z.string() });
export const ThresholdsSchema = z.object({
  minMatchScore: Score, minPackageScore: Score, weightTolG: z.number().int().min(0).max(65535),
});
export const WindowsSchema = z.object({
  shipWindowSecs: z.number().int().positive(), openWindowSecs: z.number().int().positive(),
});

export const ListingSchema = z.object({
  id: z.string(), sellerId: z.string(),
  seller: z.object({ id: z.string(), name: z.string(), walletAddress: Base58Schema.nullable() }),
  title: z.string(), description: z.string(), categoryId: z.string(), condition: ConditionSchema,
  size: z.string().optional(), brand: z.string().optional(),
  priceLamports: LamportsSchema, pricePln: z.number(),
  photos: z.array(z.string()),
  declaredWeightG: z.number().int().nonnegative(),
  dimensionsCm: z.object({ l: z.number(), w: z.number(), h: z.number() }),
  extraTests: z.array(ExtraTestSchema), thresholds: ThresholdsSchema, windows: WindowsSchema,
  status: z.enum(['active', 'reserved', 'sold']), createdAt: UnixSchema,
});
export const CreateListingInputSchema = ListingSchema.omit({
  id: true, sellerId: true, seller: true, status: true, createdAt: true, pricePln: true,
});
/** Wejście POST /listings: brak thresholds/windows → wartości domyślne (KONTRAKT §8). */
export const CreateListingBodySchema = CreateListingInputSchema.extend({
  thresholds: ThresholdsSchema.optional(), windows: WindowsSchema.optional(),
  extraTests: z.array(ExtraTestSchema).optional().default([]),
  photos: z.array(z.string()).optional().default([]),
});

export const OrderStatusSchema = z.enum(['awaiting_payment', 'funded', 'packing_review', 'ready_to_ship',
  'shipped', 'delivered', 'unboxing_review', 'verifying', 'released', 'refunded']);
export const ChainStatusSchema = z.enum(['none', 'Funded', 'Shipped', 'Verifying', 'Released', 'Refunded']);
export const TxActionSchema = z.enum(['fund', 'seller_decline', 'commit_shipment', 'confirm_receipt',
  'open_claim', 'claim_timeout', 'submit_verdict']);
export const OutcomeReasonSchema = z.enum(['BuyerConfirmed', 'VerifiedOk', 'RecordingInvalid', 'TransitBroken',
  'ItemMismatch', 'ShipTimeout', 'OpenTimeout', 'VerifierTimeout', 'SellerDeclined']);
export const DemoScenarioSchema = z.enum(['ok', 'defect', 'swap', 'invalid_recording']);

export const MeasurementsSchema = z.object({
  recordingValid: z.boolean(), qrMatch: z.boolean(), sealIntact: z.boolean(),
  packageScore: Score, weightDiffG: z.number().int().min(0).max(65535), matchScore: Score,
  defectFound: z.boolean(), testsPassed: z.boolean(),
});
export const SealSchema = z.object({ qrPayload: z.string().optional(), sealHash: Hex32Schema, shortCode: z.string() });
export const MarkersSchema = z.object({
  sealShownMs: z.number().optional(), openStartMs: z.number().optional(),
  productShownMs: z.number().optional(), defectShownMs: z.number().optional(),
});
export const LockerEventTypeSchema = z.enum(['dropped_off', 'ready_for_pickup']);
export const LockerEventSchema = z.object({
  type: LockerEventTypeSchema, lockerId: z.string(), weightG: z.number().int().nonnegative(), at: UnixSchema,
});
export const TxRefSchema = z.object({
  action: TxActionSchema, signature: z.string(), explorerUrl: z.string(), at: UnixSchema,
});
export const TimelineEventSchema = z.object({
  at: UnixSchema, type: z.string(), label: z.string(), txSignature: z.string().optional(),
});

export const OrderSchema = z.object({
  id: z.uuid(),
  listing: ListingSchema, buyerId: z.string(), sellerId: z.string(),
  buyerWallet: Base58Schema, sellerWallet: Base58Schema, amountLamports: LamportsSchema,
  escrowPda: Base58Schema, programId: Base58Schema, cluster: ClusterSchema,
  status: OrderStatusSchema, chainStatus: ChainStatusSchema,
  termsHash: Hex32Schema, thresholds: ThresholdsSchema, windows: WindowsSchema,
  shipDeadline: UnixSchema.nullable(), openDeadline: UnixSchema.nullable(), verdictDeadline: UnixSchema.nullable(),
  seal: SealSchema.nullable(),
  packingVideoHash: Hex32Schema.nullable(), unboxingVideoHash: Hex32Schema.nullable(),
  packingVerificationId: z.string().nullable(), unboxingVerificationId: z.string().nullable(),
  lockerEvents: z.array(LockerEventSchema),
  measurements: MeasurementsSchema.nullable(), outcomeReason: OutcomeReasonSchema.nullable(),
  txs: z.array(TxRefSchema), timeline: z.array(TimelineEventSchema), createdAt: UnixSchema,
});

export const KeyframeSchema = z.object({ ms: z.number(), url: z.string(), label: z.string() });
export const DefectSchema = z.object({
  label: z.string(), severity: z.enum(['minor', 'major']), frameMs: z.number(), confidence: z.number().min(0).max(1),
});
export const ExtraTestResultSchema = z.object({
  testId: z.string(), passed: z.boolean(), note: z.string(), frameMs: z.number().optional(),
});
export const VerificationReportSchema = z.object({
  kind: z.enum(['packing', 'unboxing']), orderId: z.string(), videoSha256: Hex32Schema, durationMs: z.number(),
  seal: z.object({
    detected: z.boolean(), payloadMatch: z.boolean(), firstSeenMs: z.number().nullable(),
    lastSeenSealedMs: z.number().nullable(), intact: z.boolean().nullable(),
  }),
  continuity: z.object({
    ok: z.boolean(), sceneCutsMs: z.array(z.number()),
    timestampGaps: z.array(z.object({ fromMs: z.number(), toMs: z.number() })),
    maxSealGapMs: z.number(), issues: z.array(z.string()),
  }),
  productVisible: z.boolean(),
  defects: z.array(DefectSchema), extraTests: z.array(ExtraTestResultSchema),
  recordingValid: z.boolean(),
  packingOk: z.boolean().nullable(),
  measurements: MeasurementsSchema.omit({ weightDiffG: true }).nullable(),
  keyframes: z.array(KeyframeSchema), reasons: z.array(z.string()),
  engine: z.object({ version: z.string(), llm: z.string().nullable(), processingMs: z.number() }),
});
export const VerificationSchema = z.object({
  id: z.string(), orderId: z.string(), kind: z.enum(['packing', 'unboxing']),
  status: z.enum(['processing', 'done', 'failed']), report: VerificationReportSchema.nullable(),
  error: z.string().optional(), createdAt: UnixSchema,
});

export const EscrowStateSchema = z.object({
  orderId: z.string(), buyer: Base58Schema, seller: Base58Schema, verifier: Base58Schema,
  feeWallet: Base58Schema, feeBps: z.number().int(),
  amountLamports: LamportsSchema, termsHash: Hex32Schema, thresholds: ThresholdsSchema,
  windows: WindowsSchema.extend({ verdictWindowSecs: z.number().int() }),
  status: z.enum(['Funded', 'Shipped', 'Verifying', 'Released', 'Refunded']), createdAt: UnixSchema,
  shipDeadline: UnixSchema, openDeadline: UnixSchema.nullable(), verdictDeadline: UnixSchema.nullable(),
  sealHash: Hex32Schema.nullable(), packingVideoHash: Hex32Schema.nullable(), unboxingVideoHash: Hex32Schema.nullable(),
  measurements: MeasurementsSchema.nullable(), reason: OutcomeReasonSchema.nullable(), resolvedAt: UnixSchema.nullable(),
});
export const ConfigBoundsSchema = z.object({
  minShipWindow: z.number().int(), maxShipWindow: z.number().int(), minOpenWindow: z.number().int(),
  maxOpenWindow: z.number().int(), verdictWindow: z.number().int(),
});
export const ConfigStateSchema = ConfigBoundsSchema.extend({
  admin: Base58Schema, verifier: Base58Schema, feeBps: z.number().int(), feeWallet: Base58Schema,
});

export const LocalFileSchema = z.object({ uri: z.string(), name: z.string(), mimeType: z.string() });
export const UploadResultSchema = z.object({
  url: z.string(), sha256: Hex32Schema, size: z.number().int().nonnegative(), mimeType: z.string(),
});
export const PreparedTxSchema = z.object({
  action: TxActionSchema, txBase64: z.string().min(1), programId: Base58Schema, cluster: ClusterSchema,
});
export const ErrorCodeSchema = z.enum(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'INVALID_STATE',
  'RECORDING_INVALID', 'TX_NOT_CONFIRMED', 'CHAIN_ERROR', 'AI_ERROR']);
export const ApiErrorSchema = z.object({ error: z.object({ code: ErrorCodeSchema, message: z.string() }) });

// Odpowiedzi złożone z §8
export const AuthResponseSchema = z.object({ token: z.string(), user: UserSchema });
export const VideoUploadResponseSchema = z.object({ verificationId: z.string(), videoSha256: Hex32Schema });
export const HealthSchema = z.object({
  ok: z.boolean(), chain: z.string(), ai: z.string(), programId: Base58Schema, cluster: ClusterSchema,
});

// Kontrola zgodności schematów z typami: błąd kompilacji, jeśli się rozjadą.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertSame = <_ extends true>() => {};
assertSame<Same<z.infer<typeof UserSchema>, T.User>>();
assertSame<Same<z.infer<typeof ListingSchema>, T.Listing>>();
assertSame<Same<z.infer<typeof CreateListingInputSchema>, T.CreateListingInput>>();
assertSame<Same<z.infer<typeof OrderSchema>, T.Order>>();
assertSame<Same<z.infer<typeof MeasurementsSchema>, T.Measurements>>();
assertSame<Same<z.infer<typeof VerificationReportSchema>, T.VerificationReport>>();
assertSame<Same<z.infer<typeof VerificationSchema>, T.Verification>>();
assertSame<Same<z.infer<typeof EscrowStateSchema>, T.EscrowState>>();
assertSame<Same<z.infer<typeof ConfigStateSchema>, T.ConfigState>>();
assertSame<Same<z.infer<typeof PreparedTxSchema>, T.PreparedTx>>();
assertSame<Same<z.infer<typeof UploadResultSchema>, T.UploadResult>>();
assertSame<Same<z.infer<typeof ApiErrorSchema>, T.ApiError>>();
assertSame<Same<z.infer<typeof SealSchema>, T.Seal>>();
assertSame<Same<z.infer<typeof LockerEventSchema>, T.LockerEvent>>();

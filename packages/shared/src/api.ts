// KONTRAKT §9.1. Implementacje: MockApiClient i HttpApiClient (Osoba 1, /app).
import type {
  Base58, Category, CreateListingInput, DemoScenario, Hex32, Listing, LocalFile, LockerEvent,
  Markers, Order, PreparedTx, Role, Seal, TxAction, UploadResult, User, Verification,
} from './types';

export interface ApiClient {
  setToken(token: string | null): void;
  register(i: { email: string; password: string; name: string }): Promise<{ token: string; user: User }>;
  login(i: { email: string; password: string }): Promise<{ token: string; user: User }>;
  me(): Promise<User>;
  updateMe(i: { walletAddress: Base58 }): Promise<User>;
  categories(): Promise<Category[]>;
  listings(q?: { categoryId?: string; q?: string }): Promise<Listing[]>;
  listing(id: string): Promise<Listing>;
  createListing(i: CreateListingInput): Promise<Listing>;
  upload(file: LocalFile): Promise<UploadResult>;
  createOrder(i: { listingId: string }): Promise<Order>;
  orders(q: { role: Role }): Promise<Order[]>;
  order(id: string): Promise<Order>;
  prepareTx(orderId: string, i: { action: TxAction }): Promise<PreparedTx>;
  submitTx(orderId: string, i: { action: TxAction; signature: string }): Promise<Order>;
  createSeal(orderId: string): Promise<Seal>;
  uploadPackingVideo(orderId: string, video: LocalFile, markers: Markers,
                     opts?: { onProgress?: (p: number) => void }): Promise<{ verificationId: string; videoSha256: Hex32 }>;
  lockerEvent(orderId: string, i: { type: LockerEvent['type']; lockerId: string; weightG: number }): Promise<Order>;
  uploadUnboxingVideo(orderId: string, video: LocalFile, markers: Markers,
                      opts?: { onProgress?: (p: number) => void; scenario?: DemoScenario }): Promise<{ verificationId: string; videoSha256: Hex32 }>;
  verification(id: string): Promise<Verification>;
}

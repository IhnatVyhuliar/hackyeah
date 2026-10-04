// Typed server/ endpoints used by the app (contract: server/README.md, server/src/routes.rs).
import type { Category, Deal, Listing, PublishArgs, User, Wallet } from '@unbox/shared';
import { api } from './client';

export { api, ApiError, createApi, type Api } from './client';

export const login = async (email: string, password: string) => {
  const r = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
  api.setToken(r.token);
  return r;
};
export const me = () => api.get<User>('/api/me');
export const linkWallet = (address: string) => api.put<User>('/api/me/wallet-address', { address });
export const categories = () => api.get<Category[]>('/api/categories');
export const listings = () => api.get<Listing[]>('/api/listings');
export const myListings = () => api.get<Listing[]>('/api/me/listings');
export const createListing = (input: unknown) => api.post<Listing>('/api/listings', input);
export const publishListing = (id: string) => api.post<PublishArgs>(`/api/listings/${id}/publish`);
/** Cancels a listing that never reached the program (demo, or solana before publish). */
export const cancelListingRest = (id: string) => api.post<Listing>(`/api/listings/${id}/cancel`);
export const deals = (role: 'buyer' | 'seller') => api.get<Deal[]>(`/api/deals?role=${role}`);
export const deal = (id: string) => api.get<Deal>(`/api/deals/${id}`);
export const wallet = () => api.get<Wallet>('/api/me/wallet');
export const chainSync = (dealPda: string) => api.post<unknown>(`/api/chain/sync/${dealPda}`);
/** Test-only server clock (ENABLE_DEV_CLOCK=1); advanceSecs 0 just reads it. */
export const devClock = (advanceSecs: number) => api.post<{ now: number }>('/api/dev/clock', { advanceSecs });

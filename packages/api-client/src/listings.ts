import { z } from 'zod';
import {
  CategorySchema, type CreateListingInput, DealSchema, ListingSchema, type UpdateListingInput,
} from '@unbox/shared';
import type { Http } from './http';

export const listingsApi = (http: Http) => ({
  categories: () => http.request(z.array(CategorySchema), 'GET', '/api/categories', { auth: false }),
  /** Ogłoszenia dostępne do kupienia (status Listed). */
  list: (q: { q?: string; categoryId?: string; sellerId?: string } = {}) =>
    http.request(z.array(ListingSchema), 'GET', '/api/listings', { query: q, auth: false }),
  get: (id: string) => http.request(ListingSchema, 'GET', `/api/listings/${encodeURIComponent(id)}`, { auth: false }),
  /** Moje ogłoszenia (także sprzedane i anulowane). */
  mine: () => http.request(z.array(ListingSchema), 'GET', '/api/me/listings'),
  /** `photos`: wynik media.upload() dla każdego zdjęcia ({ url, sha256 }). */
  create: (i: CreateListingInput) => http.request(ListingSchema, 'POST', '/api/listings', { body: i }),
  update: (id: string, i: UpdateListingInput) => http.request(ListingSchema, 'PATCH', `/api/listings/${encodeURIComponent(id)}`, { body: i }),
  cancel: (id: string) => http.request(ListingSchema, 'POST', `/api/listings/${encodeURIComponent(id)}/cancel`),
  /** Zakup: zabezpiecza cenę z salda i tworzy transakcję (Deal, status Paid). */
  purchase: (id: string) => http.request(DealSchema, 'POST', `/api/listings/${encodeURIComponent(id)}/purchase`),
});

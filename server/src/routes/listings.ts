import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  CategorySchema, CreateListingInputSchema, CURRENCY, DealSchema, type Listing, ListingSchema, type Photo,
  UpdateListingInputSchema,
} from '@unbox/shared';
import { type AuthEnv, requireAuth } from '../auth';
import { now } from '../clock';
import { config } from '../config';
import { docs, media, tx } from '../db';
import { purchase } from '../deals';
import { ApiErr, parse, send } from '../errors';

export const listingRoutes = new Hono<AuthEnv>();

function getListing(id: string): Listing {
  const l = docs.get('listing', id);
  if (!l) throw new ApiErr('NOT_FOUND', 'Nie ma takiego ogłoszenia');
  return l;
}

/** Zdjęcia muszą być wcześniej wgrane przez tego użytkownika (POST /api/media); URL ustala serwer. */
function checkPhotos(photos: Photo[], userId: string): Photo[] {
  return photos.map((p) => {
    const m = media.get(p.sha256);
    if (!m || m.uploaderId !== userId || !m.mimeType.startsWith('image/'))
      throw new ApiErr('VALIDATION', `Zdjęcie ${p.sha256.slice(0, 8)}… nie zostało wgrane przez Ciebie`);
    return { sha256: p.sha256, url: `${config.publicBaseUrl}/media/${p.sha256}` };
  });
}

function checkCategory(id: string | undefined) {
  if (id !== undefined && !docs.get('category', id)) throw new ApiErr('VALIDATION', 'Nieznana kategoria');
}

listingRoutes.get('/categories', (c) => send(c, z.array(CategorySchema), docs.list('category')));

listingRoutes.get('/listings', (c) => {
  const { categoryId, q, sellerId } = c.req.query();
  const needle = q?.toLowerCase().trim();
  const list = docs.list('listing').filter((l) => l.status === 'Listed'
    && (!categoryId || l.categoryId === categoryId)
    && (!sellerId || l.sellerId === sellerId)
    && (!needle || `${l.title} ${l.description} ${l.brand}`.toLowerCase().includes(needle)))
    .sort((a, b) => b.createdAt - a.createdAt);
  return send(c, z.array(ListingSchema), list);
});

listingRoutes.get('/listings/:id', (c) => send(c, ListingSchema, getListing(c.req.param('id'))));

/** Wszystkie ogłoszenia zalogowanego sprzedającego (także sprzedane i anulowane). */
listingRoutes.get('/me/listings', requireAuth, (c) => {
  const me = c.get('user').id;
  return send(c, z.array(ListingSchema), docs.list('listing').filter((l) => l.sellerId === me).sort((a, b) => b.createdAt - a.createdAt));
});

listingRoutes.post('/listings', requireAuth, async (c) => {
  const user = c.get('user');
  const i = parse(CreateListingInputSchema, await c.req.json());
  checkCategory(i.categoryId);
  const t = now();
  const listing: Listing = {
    ...i, photos: checkPhotos(i.photos, user.id),
    id: `l-${randomUUID()}`, sellerId: user.id, seller: { id: user.id, name: user.name },
    currency: CURRENCY, status: 'Listed', createdAt: t, updatedAt: t,
  };
  docs.put('listing', listing.id, listing);
  return send(c, ListingSchema, listing, 201);
});

/** Edycja tylko przed zakupem (po zakupie treść jest zamrożona w transakcji). */
listingRoutes.patch('/listings/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const i = parse(UpdateListingInputSchema, await c.req.json());
  checkCategory(i.categoryId);
  const updated = tx(() => {
    const l = getListing(c.req.param('id'));
    if (l.sellerId !== user.id) throw new ApiErr('FORBIDDEN', 'To nie Twoje ogłoszenie');
    if (l.status !== 'Listed') throw new ApiErr('INVALID_STATE', 'Ogłoszenia nie można już edytować');
    const next: Listing = { ...l, ...i, photos: i.photos ? checkPhotos(i.photos, user.id) : l.photos, updatedAt: now() };
    return docs.put('listing', l.id, next);
  });
  return send(c, ListingSchema, updated);
});

listingRoutes.post('/listings/:id/cancel', requireAuth, (c) => {
  const user = c.get('user');
  const updated = tx(() => {
    const l = getListing(c.req.param('id'));
    if (l.sellerId !== user.id) throw new ApiErr('FORBIDDEN', 'To nie Twoje ogłoszenie');
    if (l.status !== 'Listed') throw new ApiErr('INVALID_STATE', 'Można anulować tylko niekupione ogłoszenie');
    return docs.put('listing', l.id, { ...l, status: 'Cancelled', updatedAt: now() });
  });
  return send(c, ListingSchema, updated);
});

/** Zakup: zabezpiecza płatność z salda demo i tworzy transakcję (status Paid). */
listingRoutes.post('/listings/:id/purchase', requireAuth, (c) =>
  send(c, DealSchema, purchase(c.req.param('id'), c.get('user')), 201));

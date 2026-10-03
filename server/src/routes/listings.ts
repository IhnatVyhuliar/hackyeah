import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  CategorySchema, CreateListingBodySchema, DEFAULT_THRESHOLDS, DEFAULT_WINDOWS, LAMPORTS_PER_SOL, type Listing,
  ListingSchema, nowUnix, SOL_PLN_DEMO_RATE,
} from '@sellsol/shared';
import { type AuthEnv, requireAuth } from '../auth';
import { docs } from '../db';
import { ApiErr, parse, send } from '../errors';

export const listingRoutes = new Hono<AuthEnv>();

const pricePln = (lamports: string) => Math.round((Number(lamports) / LAMPORTS_PER_SOL) * SOL_PLN_DEMO_RATE * 100) / 100;

listingRoutes.get('/categories', (c) => send(c, z.array(CategorySchema), docs.list('category')));

listingRoutes.get('/listings', (c) => {
  const { categoryId, q } = c.req.query();
  const needle = q?.toLowerCase().trim();
  const list = docs.list('listing').filter((l) => l.status === 'active'
    && (!categoryId || l.categoryId === categoryId)
    && (!needle || `${l.title} ${l.description} ${l.brand ?? ''}`.toLowerCase().includes(needle)))
    .sort((a, b) => b.createdAt - a.createdAt);
  return send(c, z.array(ListingSchema), list);
});

listingRoutes.get('/listings/:id', (c) => {
  const l = docs.get('listing', c.req.param('id'));
  if (!l) throw new ApiErr('NOT_FOUND', 'Nie ma takiej oferty');
  return send(c, ListingSchema, l);
});

listingRoutes.post('/listings', requireAuth, async (c) => {
  const user = c.get('user');
  const i = parse(CreateListingBodySchema, await c.req.json());
  if (!docs.get('category', i.categoryId)) throw new ApiErr('VALIDATION', 'Nieznana kategoria');
  const listing: Listing = {
    ...i,
    id: `l-${randomUUID()}`, sellerId: user.id,
    seller: { id: user.id, name: user.name, walletAddress: user.walletAddress },
    thresholds: i.thresholds ?? DEFAULT_THRESHOLDS, windows: i.windows ?? DEFAULT_WINDOWS,
    pricePln: pricePln(i.priceLamports), status: 'active', createdAt: nowUnix(),
  };
  docs.put('listing', listing.id, listing);
  return send(c, ListingSchema, listing, 201);
});

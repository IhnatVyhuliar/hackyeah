// Transakcje. Funkcje niskiego poziomu 1:1 z endpointami; przepływy z nagraniem są w flows.ts.
import { z } from 'zod';
import { type ComplaintCategory, DealSchema, type Hex32, type Role } from '@unbox/shared';
import type { Http } from './http';

const path = (id: string, action = '') => `/api/deals/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;

export const dealsApi = (http: Http) => ({
  /** Moje zakupy (`buyer`) albo sprzedaże (`seller`). */
  list: (role: Role) => http.request(z.array(DealSchema), 'GET', '/api/deals', { query: { role } }),
  get: (id: string) => http.request(DealSchema, 'GET', path(id)),
  ship: (id: string, i: { qrCommitment: Hex32; packingVideoSha256: Hex32; trackingNumber: string }) =>
    http.request(DealSchema, 'POST', path(id, 'ship'), { body: i }),
  accept: (id: string, i: { qrSecret: Hex32 }) => http.request(DealSchema, 'POST', path(id, 'accept'), { body: i }),
  /** `demoScenario`: tylko backend z AI=mock (demo i testy), np. 'defect'. */
  dispute: (id: string, i: { qrSecret: Hex32; unboxingVideoSha256: Hex32; complaint: { category: ComplaintCategory; description: string } },
            opts: { demoScenario?: string } = {}) =>
    http.request(DealSchema, 'POST', path(id, 'dispute'), { body: i, headers: opts.demoScenario ? { 'X-Demo-Scenario': opts.demoScenario } : undefined }),
  markReturned: (id: string, i: { returnQrCommitment: Hex32; returnVideoSha256: Hex32; returnTrackingNumber: string }) =>
    http.request(DealSchema, 'POST', path(id, 'return'), { body: i }),
  confirmReturn: (id: string, i: { returnQrSecret: Hex32 }) => http.request(DealSchema, 'POST', path(id, 'confirm-return'), { body: i }),
  /** „Odbierz środki” po terminie (backend domyka też sam). */
  settle: (id: string) => http.request(DealSchema, 'POST', path(id, 'settle')),
});

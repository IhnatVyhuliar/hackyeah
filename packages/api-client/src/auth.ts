import { AuthResponseSchema, HealthSchema, UserSchema, WalletSchema } from '@unbox/shared';
import type { Http } from './http';

export const authApi = (http: Http) => ({
  async register(i: { email: string; password: string; name: string }) {
    const r = await http.request(AuthResponseSchema, 'POST', '/api/auth/register', { body: i, auth: false });
    await http.tokens.set(r.token);
    return r.user;
  },
  async login(i: { email: string; password: string }) {
    const r = await http.request(AuthResponseSchema, 'POST', '/api/auth/login', { body: i, auth: false });
    await http.tokens.set(r.token);
    return r.user;
  },
  logout: () => http.tokens.set(null),
  isLoggedIn: async () => !!(await http.tokens.get()),
  me: () => http.request(UserSchema, 'GET', '/api/me'),
  /** Saldo demo sklepu: dostępne środki, zabezpieczone w zakupach, historia. */
  wallet: () => http.request(WalletSchema, 'GET', '/api/me/wallet'),
  health: () => http.request(HealthSchema, 'GET', '/api/health', { auth: false }),
});

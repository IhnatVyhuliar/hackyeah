// Sign-in, session restore and wallet linking. One account per device (CLAUDE.md §13, 04.10).
import type { User } from '@unbox/shared';
import { ApiError, api, linkWallet, login, me } from './api';
import { linkWalletIfNeeded } from './data/walletLink';
import { escrow } from './escrow';
import { kv } from './kv';

const TOKEN = 'unbox.session.v1';

export interface Session { user: User; walletLinkError: string | null }

const link = (user: User) =>
  linkWalletIfNeeded(user, { mode: escrow.mode, walletAddress: () => escrow.walletAddress(), link: linkWallet });

export async function signIn(email: string, password: string): Promise<Session> {
  const r = await login(email.trim().toLowerCase(), password);
  await kv.set(TOKEN, r.token);
  return link(r.user);
}

/** The saved session, or null when there is none or the server no longer accepts the token. */
export async function restore(): Promise<Session | null> {
  const token = await kv.get(TOKEN).catch(() => null);
  if (!token) return null;
  api.setToken(token);
  try {
    return await link(await me());
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await signOut();
      return null;
    }
    throw e;
  }
}

export async function signOut(): Promise<void> {
  api.setToken(null);
  await kv.del(TOKEN).catch(() => undefined);
}

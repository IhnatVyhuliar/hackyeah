// Ties the in-app wallet to the server account (PUT /api/me/wallet-address) so the server can attribute
// on-chain purchases to it. A failure is returned as a message: the UI blocks buying instead of crashing.
import type { User } from '@unbox/shared';

export interface LinkDeps {
  mode: 'solana' | 'demo';
  walletAddress: () => Promise<string | null>;
  link: (address: string) => Promise<User>;
}

export async function linkWalletIfNeeded(user: User, d: LinkDeps): Promise<{ user: User; walletLinkError: string | null }> {
  if (d.mode !== 'solana') return { user, walletLinkError: null };
  try {
    const address = await d.walletAddress();
    if (!address || address === user.walletAddress) return { user, walletLinkError: null };
    return { user: await d.link(address), walletLinkError: null };
  } catch (e) {
    return { user, walletLinkError: (e as Error)?.message || 'Nie udało się połączyć portfela z kontem.' };
  }
}

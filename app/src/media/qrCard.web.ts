// Browser: open the card in a new tab instead of window.print(), whose dialog blocks the page (and test automation).
// Print it from that tab with Ctrl+P.
import type { QrCard } from '@unbox/shared';
import { cardHtml } from './qrCard.shared';

export async function printCard(card: QrCard, title: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(await cardHtml(card, title));
  w.document.close();
}

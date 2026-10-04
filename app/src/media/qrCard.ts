// Print the one-time card through the system print dialog (or save it as PDF).
import * as Print from 'expo-print';
import type { QrCard } from '@unbox/shared';
import { cardHtml } from './qrCard.shared';

export async function printCard(card: QrCard, title: string) {
  await Print.printAsync({ html: await cardHtml(card, title) });
}

// HTML of the printed one-time card: the QR goes inside the parcel, folded, code facing in.
import QR from 'qrcode';
import type { QrCard } from '@unbox/shared';

export async function cardHtml(card: QrCard, title: string): Promise<string> {
  const svg = await QR.toString(card.payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  const head = card.kind === 'return' ? 'Karta zwrotu' : 'Karta paczki';
  return `<html><head><meta charset="utf-8"><title>${head}</title></head><body style="font-family:sans-serif;text-align:center">
    <h2>${head}</h2><div style="width:70mm;margin:auto">${svg}</div><p>${title.replace(/</g, '&lt;')}</p>
    <p style="font-size:10px">Złóż kartę na pół, kodem do środka. Nie pokazuj kodu na nagraniu pakowania.</p></body></html>`;
}

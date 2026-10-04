import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OracleReport } from '@unbox/shared';
import { verdictView } from './verdict';

const report: OracleReport = {
  buyer_recording: { continuous: true, starts_with_sealed_package: true, qr_revealed_on_opening: true, quality: 'good', notes: '' },
  seller_recording: { item_clearly_visible: true, qr_card_packed: true, package_sealed_and_labeled: true, quality: 'good', notes: '' },
  package_matches_shipping_recording: true, item_matches_listing: true,
  undisclosed_damage: { present: true, description: 'Plama na rękawie', timestamps: ['00:41'] }, reasoning: 'Plama nie była na liście wad.',
};

test('verdict shows the decide() path, not "AI decided"', () => {
  const v = verdictView({ verdict: 'Buyer', analysis: { report, reportHash: 'ab'.repeat(32) } } as any);
  assert.equal(v.title, 'Reklamacja uznana');
  const damage = v.rows.find((r) => r.label.includes('Nieujawniona wada'));
  assert.deepEqual([damage?.ok, damage?.detail], [false, 'Plama na rękawie · 00:41']);
  assert.equal(v.rows.length, 5);
  assert.equal(v.reasoning, 'Plama nie była na liście wad.');
  assert.equal(v.byEvidence, false);
});

test('a weak buyer recording is the failing row and the seller wins', () => {
  const poor = { ...report, buyer_recording: { ...report.buyer_recording, quality: 'poor' as const }, undisclosed_damage: { present: false, description: '', timestamps: [] } };
  const v = verdictView({ verdict: 'Seller', analysis: { report: poor, reportHash: 'cd'.repeat(32) } } as any);
  assert.equal(v.title, 'Reklamacja odrzucona');
  assert.equal(v.rows[0].ok, false);
});

test('a verdict decided by missing or mismatched files has no model report', () => {
  const v = verdictView({ verdict: 'Seller', analysis: { report: null, reportHash: 'cd'.repeat(32) } } as any);
  assert.equal(v.byEvidence, true);
  assert.deepEqual(v.rows, []);
  assert.match(v.reasoning, /plik/i);
});

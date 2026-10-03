import { describe, expect, it } from 'vitest';
import { Base58Schema, LamportsSchema, UnixSchema } from './schemas';

describe('schematy prymitywów', () => {
  it('LamportsSchema: 0..u64::MAX, bez wiodących zer', () => {
    expect(LamportsSchema.safeParse('0').success).toBe(true);
    expect(LamportsSchema.safeParse('18446744073709551615').success).toBe(true);
    expect(LamportsSchema.safeParse('18446744073709551616').success).toBe(false);
    expect(LamportsSchema.safeParse('-1').success).toBe(false);
    expect(LamportsSchema.safeParse('01').success).toBe(false);
    expect(LamportsSchema.safeParse('1.5').success).toBe(false);
  });
  it('UnixSchema: bezpieczna liczba całkowita', () => {
    expect(UnixSchema.safeParse(1_759_525_200).success).toBe(true);
    expect(UnixSchema.safeParse(2 ** 53).success).toBe(false);
    expect(UnixSchema.safeParse(1.5).success).toBe(false);
  });
  it('Base58Schema: prawdziwy klucz Solany', () => {
    expect(Base58Schema.safeParse('11111111111111111111111111111111').success).toBe(true);
    expect(Base58Schema.safeParse('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi').success).toBe(true);
    expect(Base58Schema.safeParse('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz').success).toBe(false); // > 32 bajty
    expect(Base58Schema.safeParse('0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl').success).toBe(false);
  });
});

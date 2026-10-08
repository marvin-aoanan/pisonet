import { formatPeso } from './currency';

describe('formatPeso', () => {
  it('adds thousands separators and keeps two decimal places', () => {
    expect(formatPeso(19730.5)).toBe('₱19,730.50');
    expect(formatPeso(-19730.5, { signed: true })).toBe('-₱19,730.50');
    expect(formatPeso(0)).toBe('₱0.00');
  });
});

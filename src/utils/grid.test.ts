import { describe, expect, it } from 'vitest';
import { getGridColumns, getGridRows } from './grid';

describe('grid helpers', () => {
  it('maps cell counts to balanced columns', () => {
    expect(getGridColumns(1)).toBe(1);
    expect(getGridColumns(4)).toBe(2);
    expect(getGridColumns(9)).toBe(3);
    expect(getGridColumns(16)).toBe(4);
    expect(getGridColumns(25)).toBe(5);
    expect(getGridColumns(36)).toBe(6);
  });

  it('calculates rows from columns', () => {
    expect(getGridRows(0)).toBe(1);
    expect(getGridRows(1)).toBe(1);
    expect(getGridRows(5)).toBe(2);
    expect(getGridRows(10)).toBe(3);
  });
});

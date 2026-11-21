import { describe, expect, it } from 'vitest';
import {
  formatBlogDate,
  formatCreatedAt,
  formatEuro,
  formatIsoDate,
  formatListDate,
  formatPercent,
  formatPeriod,
  formatPeriodRange,
  formatRowDate,
  formatSignedEuro,
} from './format';

type IsoInput = string | null | undefined;

const MAX_VALUE_DIGITS = `17976931348623157${'0'.repeat(292)}`;
const MAX_VALUE_GROUPED = `179.769.313.486.231.570${'.000'.repeat(97)}`;

const MISSING_AMOUNTS = [
  null,
  undefined,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

const UNEXPECTED_VALUES: [string, object | number | symbol][] = [
  ['an object', { date: '2024-05-23' }],
  ['an array', ['2024-01-01']],
  ['a number', 20240523],
  ['a symbol', Symbol('2024-05-23')],
];

function itRejectsMissingAndUnexpectedValues(format: (iso: IsoInput) => string): void {
  it.each([null, undefined, ''])('returns an empty string for %o', (value) => {
    expect(format(value)).toBe('');
  });

  it.each(UNEXPECTED_VALUES)('returns an empty string for %s', (_label, value) => {
    expect(format(value as unknown as string)).toBe('');
  });

  it.each(['not a date', '2024-13-01'])('returns the malformed string %o unchanged', (value) => {
    expect(format(value)).toBe(value);
  });
}

describe('formatEuro', () => {
  it.each([
    [3412.95, '€ 3.412,95'],
    [900, '€ 900,00'],
    [42, '€ 42,00'],
    [9.66, '€ 9,66'],
    [0, '€ 0,00'],
    [1234567.5, '€ 1.234.567,50'],
    [-12.5, '€ -12,50'],
    [1.005, '€ 1,01'],
    [999.995, '€ 1.000,00'],
    [0.1 + 0.2, '€ 0,30'],
    [-0.001, '€ 0,00'],
    [-0, '€ 0,00'],
    [10000000000000.01, '€ 10.000.000.000.000,01'],
    [Number.MIN_VALUE, '€ 0,00'],
    [Number.MAX_VALUE, `€ ${MAX_VALUE_GROUPED},00`],
    [-Number.MAX_VALUE, `€ -${MAX_VALUE_GROUPED},00`],
  ])('formats euros with dot thousands and comma decimals: %s -> %s', (value, expected) => {
    expect(formatEuro(value)).toBe(expected);
  });

  it.each(MISSING_AMOUNTS)('returns an empty string for %s', (value) => {
    expect(formatEuro(value)).toBe('');
  });

  it('separates the euro sign with an ASCII space', () => {
    expect(formatEuro(42).charCodeAt(1)).toBe(32);
  });
});

describe('formatSignedEuro', () => {
  it.each([
    [1000, '€ +1.000,00'],
    [3412.95, '€ +3.412,95'],
    [0.005, '€ +0,01'],
    [0.004, '€ 0,00'],
    [0, '€ 0,00'],
    [-12.5, '€ -12,50'],
    [10000000000000.01, '€ +10.000.000.000.000,01'],
    [Number.MAX_VALUE, `€ +${MAX_VALUE_GROUPED},00`],
  ])('formats euros with a plus sign when positive: %s -> %s', (value, expected) => {
    expect(formatSignedEuro(value)).toBe(expected);
  });

  it.each(MISSING_AMOUNTS)('returns an empty string for %s', (value) => {
    expect(formatSignedEuro(value)).toBe('');
  });
});

describe('formatPercent', () => {
  it.each([
    [69.93, '69.93%'],
    [25.64, '25.64%'],
    [3.88, '3.88%'],
    [0.55, '0.55%'],
    [5.88, '5.88%'],
    [100, '100.00%'],
    [11.11, '11.11%'],
    [1234.5, '1234.50%'],
    [0.5, '0.50%'],
    [-12.345, '-12.35%'],
    [-0.001, '0.00%'],
    [Number.MAX_VALUE, `${MAX_VALUE_DIGITS}.00%`],
  ])('formats two dot decimals with a percent sign: %s -> %s', (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });

  it.each(MISSING_AMOUNTS)('returns an empty string for %s', (value) => {
    expect(formatPercent(value)).toBe('');
  });
});

describe('formatListDate', () => {
  it.each([
    ['2024-03-28', '28.03.2024'],
    ['2024-04-05', '5.04.2024'],
    ['2024-04-01T09:00:00', '1.04.2024'],
    ['2024-01-01', '1.01.2024'],
    ['2024-01-01T00:00:00', '1.01.2024'],
    ['2024-12-31T23:59:59', '31.12.2024'],
  ])('formats d.MM.yyyy: %s -> %s', (iso, expected) => {
    expect(formatListDate(iso)).toBe(expected);
  });

  itRejectsMissingAndUnexpectedValues(formatListDate);
});

describe('formatRowDate', () => {
  it.each([
    ['2024-05-21', '21 May 2024'],
    ['2024-04-02T09:00:00', '2 Apr 2024'],
    ['2024-09-01', '1 Sep 2024'],
    ['2024-01-01', '1 Jan 2024'],
    ['2024-01-01T00:00:00', '1 Jan 2024'],
    ['2024-12-31T23:59:59', '31 Dec 2024'],
  ])('formats d MMM yyyy: %s -> %s', (iso, expected) => {
    expect(formatRowDate(iso)).toBe(expected);
  });

  itRejectsMissingAndUnexpectedValues(formatRowDate);
});

describe('formatIsoDate', () => {
  it.each([
    ['2024-05-21T00:00:00', '2024-05-21'],
    ['2024-04-02', '2024-04-02'],
    ['2024-01-01', '2024-01-01'],
    ['2024-01-01T00:00:00', '2024-01-01'],
    ['2024-12-31T23:59:59.999', '2024-12-31'],
  ])('formats yyyy-MM-dd: %s -> %s', (iso, expected) => {
    expect(formatIsoDate(iso)).toBe(expected);
  });

  itRejectsMissingAndUnexpectedValues(formatIsoDate);
});

describe('formatCreatedAt', () => {
  it.each([
    ['2024-05-23T15:18:38', '23 May 2024 15:18:38'],
    ['2024-03-02T09:05:07.123', '2 March 2024 9:05:07'],
    ['2024-05-23 15:18', '23 May 2024 15:18:00'],
    ['2024-01-01', '1 January 2024 0:00:00'],
    ['2024-01-01T00:00:00', '1 January 2024 0:00:00'],
    ['2024-12-31T23:59:59', '31 December 2024 23:59:59'],
  ])('formats d MMMM yyyy H:mm:ss: %s -> %s', (iso, expected) => {
    expect(formatCreatedAt(iso)).toBe(expected);
  });

  itRejectsMissingAndUnexpectedValues(formatCreatedAt);
});

describe('formatPeriod', () => {
  it.each([
    ['2024-01-01', 'January 01'],
    ['2024-02-29', 'February 29'],
    ['2024-03-31', 'March 31'],
    ['2024-04-30', 'April 30'],
    ['2024-05-01', 'May 01'],
    ['2024-06-15', 'June 15'],
    ['2024-07-04', 'July 04'],
    ['2024-08-09', 'August 09'],
    ['2024-09-10', 'September 10'],
    ['2024-10-31', 'October 31'],
    ['2024-11-11', 'November 11'],
    ['2024-12-31', 'December 31'],
    ['2024-01-01T00:00:00', 'January 01'],
    ['2024-12-31T23:59:59', 'December 31'],
  ])('formats MMMM dd: %s -> %s', (iso, expected) => {
    expect(formatPeriod(iso)).toBe(expected);
  });

  itRejectsMissingAndUnexpectedValues(formatPeriod);
});

describe('formatPeriodRange', () => {
  it.each([
    ['2024-04-01', '2024-04-30', 'April 01 - April 30'],
    ['2024-05-01', '2024-05-31', 'May 01 - May 31'],
    ['2024-12-01T00:00:00', '2024-12-31T23:59:59', 'December 01 - December 31'],
  ])('formats MMMM dd - MMMM dd: %s to %s -> %s', (from, to, expected) => {
    expect(formatPeriodRange(from, to)).toBe(expected);
  });

  it.each<[IsoInput, IsoInput]>([
    [null, '2024-04-30'],
    ['2024-05-01', null],
    ['2024-04-01', undefined],
    ['', '2024-04-30'],
    ['2024-04-01', ''],
  ])('returns an empty string for %o to %o', (from, to) => {
    expect(formatPeriodRange(from, to)).toBe('');
  });

  it.each(UNEXPECTED_VALUES)('returns an empty string when either side is %s', (_label, value) => {
    const unexpected = value as unknown as string;
    expect(formatPeriodRange(unexpected, '2024-04-30')).toBe('');
    expect(formatPeriodRange('2024-04-01', unexpected)).toBe('');
  });
});

describe('formatBlogDate', () => {
  it.each([
    ['2024-03-16T10:00:00', '16 March 2024'],
    ['2024-03-07', '7 March 2024'],
    ['2024-01-01', '1 January 2024'],
    ['2024-01-01T00:00:00', '1 January 2024'],
    ['2024-12-31T23:59:59', '31 December 2024'],
  ])('formats d MMMM yyyy: %s -> %s', (iso, expected) => {
    expect(formatBlogDate(iso)).toBe(expected);
  });

  itRejectsMissingAndUnexpectedValues(formatBlogDate);
});

// Formatted by hand, not with the Intl or Date APIs, so output never varies with locale or time zone.

type Amount = number | null | undefined;
type IsoValue = string | null | undefined;

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function isFiniteAmount(value: Amount): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundedCents(value: number): bigint {
  const [mantissa, exponent = '0'] = String(Math.abs(value)).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = whole + fraction;
  const scale = Number(exponent) + 2 - fraction.length;
  if (scale >= 0) {
    return BigInt(digits) * 10n ** BigInt(scale);
  }
  const padded = digits.padStart(1 - scale, '0');
  const halfUp = padded.charAt(padded.length + scale) >= '5' ? 1n : 0n;
  return BigInt(padded.slice(0, scale)) + halfUp;
}

function minusSign(value: number, cents: bigint): string {
  return value < 0 && cents > 0n ? '-' : '';
}

function units(cents: bigint): string {
  return String(cents / 100n);
}

function decimals(cents: bigint): string {
  return pad(Number(cents % 100n));
}

function groupedEuros(cents: bigint): string {
  return `${units(cents).replace(THOUSANDS, '.')},${decimals(cents)}`;
}

export function formatEuro(value: Amount): string {
  if (!isFiniteAmount(value)) {
    return '';
  }
  const cents = roundedCents(value);
  return `€ ${minusSign(value, cents)}${groupedEuros(cents)}`;
}

export function formatSignedEuro(value: Amount): string {
  if (isFiniteAmount(value) && value > 0) {
    const cents = roundedCents(value);
    if (cents > 0n) {
      return `€ +${groupedEuros(cents)}`;
    }
  }
  return formatEuro(value);
}

export function formatPercent(value: Amount): string {
  if (!isFiniteAmount(value)) {
    return '';
  }
  const cents = roundedCents(value);
  return `${minusSign(value, cents)}${units(cents)}.${decimals(cents)}%`;
}

function parseIso(value: string): DateParts | null {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  const parts: DateParts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
  return parts.month >= 1 && parts.month <= MONTHS.length ? parts : null;
}

function formatIso(value: IsoValue, render: (parts: DateParts) => string): string {
  if (typeof value !== 'string' || value === '') {
    return '';
  }
  const parts = parseIso(value);
  return parts ? render(parts) : value;
}

function monthName({ month }: DateParts): string {
  return MONTHS[month - 1] ?? '';
}

function shortMonthName(parts: DateParts): string {
  return monthName(parts).slice(0, 3);
}

export function formatListDate(iso: IsoValue): string {
  return formatIso(iso, (p) => `${p.day}.${pad(p.month)}.${pad(p.year, 4)}`);
}

export function formatRowDate(iso: IsoValue): string {
  return formatIso(iso, (p) => `${p.day} ${shortMonthName(p)} ${pad(p.year, 4)}`);
}

export function formatIsoDate(iso: IsoValue): string {
  return formatIso(iso, (p) => `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`);
}

export function formatCreatedAt(iso: IsoValue): string {
  return formatIso(
    iso,
    (p) => `${p.day} ${monthName(p)} ${pad(p.year, 4)} ${p.hour}:${pad(p.minute)}:${pad(p.second)}`,
  );
}

export function formatPeriod(iso: IsoValue): string {
  return formatIso(iso, (p) => `${monthName(p)} ${pad(p.day)}`);
}

export function formatPeriodRange(from: IsoValue, to: IsoValue): string {
  const start = formatPeriod(from);
  const end = formatPeriod(to);
  return start && end ? `${start} - ${end}` : '';
}

export function formatBlogDate(iso: IsoValue): string {
  return formatIso(iso, (p) => `${p.day} ${monthName(p)} ${pad(p.year, 4)}`);
}

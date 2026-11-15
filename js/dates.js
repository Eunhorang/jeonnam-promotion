// 날짜는 'YYYY-MM-DD' 문자열로 다룬다. 시간대 영향을 피하려고 UTC 날짜 번호로 계산한다.

const DAY = 86400000;

export function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; // taste-skill-ignore: 날짜 문자열
}

export function parse(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return { y, m, d };
}

export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parse(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function toNum(s) {
  const { y, m, d } = parse(s);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

export function fromNum(n) {
  const t = new Date(n * DAY);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function addDays(s, n) {
  return fromNum(toNum(s) + n);
}

export function addMonths(s, k) {
  const { y, m, d } = parse(s);
  const total = m - 1 + k;
  const yy = y + Math.floor(total / 12);
  const mm = ((total % 12) + 12) % 12 + 1;
  return iso(yy, mm, Math.min(d, daysInMonth(yy, mm)));
}

export const minDate = (a, b) => (a < b ? a : b);
export const maxDate = (a, b) => (a > b ? a : b);

// 양 끝을 모두 넣은 기간의 개월·일 (예: 2008-03-01~2009-01-19 → 10개월 19일)
export function span(start, end) {
  if (!start || !end || end < start) return { months: 0, days: 0 };
  const after = addDays(end, 1);
  const S = parse(start);
  const E = parse(after);
  let months = (E.y - S.y) * 12 + (E.m - S.m);
  if (E.d < S.d) months -= 1;
  let anchor = addMonths(start, months);
  while (anchor > after && months > 0) {
    months -= 1;
    anchor = addMonths(start, months);
  }
  return { months, days: toNum(after) - toNum(anchor) };
}

// 기간을 [from, to] 안으로 자른다. 겹치지 않으면 null.
export function clip(start, end, from, to) {
  const s = from ? maxDate(start, from) : start;
  const e = to ? minDate(end, to) : end;
  return e >= s ? { start: s, end: e } : null;
}

// 기간 길이를 '30일=1개월' 기준 일수로 (용량 나누기용)
export function spanDays30(sp) {
  return sp.months * 30 + sp.days;
}

export function fromDays30(n) {
  const months = Math.floor(n / 30 + 1e-9);
  return { months, days: Math.round(n - months * 30) };
}

export function fmtSpan(sp) {
  if (!sp) return '';
  const y = Math.floor(sp.months / 12);
  const m = sp.months % 12;
  const parts = [];
  if (y) parts.push(`${y}년`);
  if (m) parts.push(`${m}개월`);
  if (sp.days) parts.push(`${sp.days}일`);
  return parts.length ? parts.join(' ') : '0일';
}

export function fmtDate(s) {
  if (!isDate(s)) return '';
  const { y, m, d } = parse(s);
  return `${y}. ${m}. ${d}.`;
}

// 학년도: 3월 1일~이듬해 2월 말
export function schoolYearOf(s) {
  const { y, m } = parse(s);
  return m >= 3 ? y : y - 1;
}

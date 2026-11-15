// 화면에 쓰는 작은 도우미: 숫자·날짜 표시, HTML 이스케이프, 입력 칸 만들기
import * as D from './dates.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// 점수: 0은 회색으로, 소수 자리는 고정
export function fx(x, dp = 3) {
  const v = Number(x) || 0;
  const s = (Math.round(v * 10 ** dp) / 10 ** dp).toFixed(dp);
  return Math.abs(v) < 1e-9 ? `<span class="zero">${s}</span>` : s;
}
export const f3 = (x) => fx(x, 3);
export const f4 = (x) => fx(x, 4);

// 상한: 영역은 정수, 가산점은 소수 둘째 자리
export function capText(cap, dp = 2) {
  return Number.isInteger(cap) && dp === 0 ? String(cap) : Number(cap).toFixed(dp);
}

export function pct(v, cap) {
  if (!cap) return 0;
  return Math.max(0, Math.min(100, (v / cap) * 100));
}

// 상한까지 채운 정도를 2px 막대로
export function bar(v, cap, label) {
  const p = pct(v, cap);
  return `<span class="bar" role="img" aria-label="${esc(label || '')} 상한의 ${Math.round(p)}%"><i style="width:${p.toFixed(1)}%"></i></span>`;
}

export function span(sp) {
  if (!sp) return '';
  return D.fmtSpan(sp);
}

export const date = (s) => D.fmtDate(s);

export function dash() {
  return '<span class="zero">–</span>';
}

/* ───── 입력 칸 ─────
   b: { path } 이면 state의 그 자리, { list, id, field } 이면 목록 안 한 항목의 칸 */
function bindAttrs(b) {
  if (b.list) return `data-list="${esc(b.list)}" data-id="${esc(b.id)}" data-field="${esc(b.field)}"`;
  return `data-bind="${esc(b.path)}"`;
}

function fieldId(b) {
  return b.list ? `f-${b.list.replace(/\W/g, '')}-${b.id}-${b.field}` : `f-${b.path.replace(/\W/g, '-')}`;
}

// 표 안의 칸: 큰 화면에선 머리줄이 이름을 대신하고, 휴대폰에선 칸 위에 이름이 보인다.
export function cell(label, control, cls = '') {
  return `<label class="cell ${cls}"><span class="cl">${esc(label)}</span>${control}</label>`;
}

export function dateInput(b, value, opts = {}) {
  return `<input type="date" id="${fieldId(b)}" ${bindAttrs(b)} value="${esc(value || '')}" min="1970-01-01" max="2045-12-31"${opts.required ? ' required' : ''}>`;
}

export function textInput(b, value, opts = {}) {
  const mode = opts.inputmode ? ` inputmode="${opts.inputmode}"` : '';
  const ph = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : '';
  const cls = opts.num ? ' class="num"' : '';
  const max = opts.maxlength ? ` maxlength="${opts.maxlength}"` : '';
  return `<input type="text" id="${fieldId(b)}" ${bindAttrs(b)} value="${esc(value ?? '')}"${mode}${ph}${cls}${max} autocomplete="off">`;
}

export function numInput(b, value, opts = {}) {
  return textInput(b, value, { inputmode: 'decimal', num: true, ...opts });
}

export function selectInput(b, value, options, opts = {}) {
  const t = opts.number ? ' data-type="number"' : '';
  const rr = opts.rerender ? ' data-rerender' : '';
  const o = options.map(([v, label]) => (
    `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(label)}</option>`
  )).join('');
  return `<select id="${fieldId(b)}" ${bindAttrs(b)}${t}${rr}>${o}</select>`;
}

export function toggle(b, checked, title, desc, opts = {}) {
  const rr = opts.rerender ? ' data-rerender' : '';
  return `<label class="switch-row">
    <span class="switch-text"><span class="switch-title">${esc(title)}</span>${desc ? `<span class="switch-desc">${desc}</span>` : ''}</span>
    <input type="checkbox" role="switch" ${bindAttrs(b)}${checked ? ' checked' : ''}${rr}>
  </label>`;
}

export function removeBtn(list, id, what) {
  return `<button type="button" class="btn-text remove" data-action="remove" data-list="${esc(list)}" data-id="${esc(id)}" aria-label="${esc(what)} 삭제">삭제</button>`;
}

export function addBtn(list, label) {
  return `<button type="button" class="btn" data-action="add" data-list="${esc(list)}">${esc(label)}</button>`;
}

// 평정 기준일 고르기 칸에 쓰는 이름
export function evalLabel(d) {
  return `${D.fmtDate(d)} 평정`;
}

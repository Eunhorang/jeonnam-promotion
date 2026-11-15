// 화면 조립: 상태를 고치고, 다시 계산하고, 바뀐 자리만 채운다. 저장은 이 브라우저(localStorage)에만.
import * as D from './dates.js';
import * as Store from './store.js';
import { calculate } from './calc.js';
import { EVAL_DATES } from './rules.js';
import { VIEWS, ledgerTree, ledgerTotals, setSavedAt, stampText, hasAnyData } from './views.js';
import { f4, evalLabel } from './format.js';

const $ = (sel, el = document) => el.querySelector(sel);
const main = $('#view');

// 주소에 ?sample이 있고 저장한 자료가 없으면 예시 자료로 둘러본다(손대기 전에는 저장하지 않음).
let S = Store.load() || (new URLSearchParams(location.search).has('sample') ? Store.sampleState() : Store.emptyState());
let R = calculate(S);
setSavedAt(S.savedAt ? new Date(S.savedAt) : null);

/* ───── 주소(#/화면/구역) ───── */
function parseRoute() {
  const h = decodeURIComponent(location.hash || '').replace(/^#\/?/, '');
  const [name = '', anchor = ''] = h.split('/');
  const view = VIEWS[name] ? name : 'overview';
  return { view, anchor, hash: `#/${view === 'overview' ? '' : h}` };
}
let route = parseRoute();

/* ───── 상태 읽고 쓰기 ───── */
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = val;
}

function readValue(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.dataset.type === 'number') return Number(el.value);
  return el.value;
}

function writeFrom(el) {
  let v = readValue(el);
  if (el.dataset.bind === 'requirements.koreanHistory') v = v === '' ? null : v === 'true';
  if (el.dataset.bind) setPath(S, el.dataset.bind, v);
  else if (el.dataset.list) {
    const arr = getPath(S, el.dataset.list);
    const it = Array.isArray(arr) ? arr.find((x) => x.id === el.dataset.id) : null;
    if (it) it[el.dataset.field] = v;
  }
}

const isBound = (el) => el && el.dataset && (el.dataset.bind || el.dataset.list);

/* ───── 그리기 ───── */
function buildEvalSelect() {
  const sel = $('#evalSelect');
  sel.innerHTML = EVAL_DATES.map((d) => `<option value="${d}">${evalLabel(d)}</option>`).join('');
  sel.value = S.evalDate;
}

function renderLedger() {
  $('[data-ledger="totals"]').innerHTML = ledgerTotals(S, R);
  $('[data-ledger="tree"]').innerHTML = ledgerTree(S, R, route.hash);
  $('[data-ledger="top"]').innerHTML = `총점 ${f4(R.total)}`;
  $('[data-ledger="stamp"]').textContent = stampText();
  const sel = $('#evalSelect');
  if (sel.value !== S.evalDate) sel.value = S.evalDate;
}

function renderView({ focus = false, keepScroll = false } = {}) {
  const v = VIEWS[route.view];
  const y = window.scrollY;
  main.innerHTML = v.render(S, R);
  document.title = route.view === 'overview' ? '전남 promotion · 교감 승진 평정 계산기' : `${v.title} · 전남 promotion`;
  if (keepScroll) window.scrollTo(0, y);
  else if (route.anchor) {
    const t = document.getElementById(`sec-${route.anchor}`);
    if (t) t.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  } else if (focus) window.scrollTo(0, 0);
  if (focus) main.querySelector('h1')?.focus({ preventScroll: true });
}

function renderAll(opts) {
  R = calculate(S);
  renderLedger();
  renderView(opts);
}

// 값이 바뀌면 입력 칸은 그대로 두고 결과 자리만 다시 채운다.
function refresh() {
  R = calculate(S);
  renderLedger();
  const v = VIEWS[route.view];
  for (const el of main.querySelectorAll('[data-out]')) {
    const key = el.dataset.out;
    const i = key.indexOf(':');
    const name = i < 0 ? key : key.slice(0, i);
    const arg = i < 0 ? '' : key.slice(i + 1);
    const fn = v.outs[name];
    if (fn) el.innerHTML = fn(S, R, arg);
  }
}

/* ───── 저장 ───── */
let saveTimer = null;
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 400);
}
function doSave() {
  saveTimer = null;
  const ok = Store.save(S);
  setSavedAt(ok ? new Date() : false);
  $('[data-ledger="stamp"]').textContent = stampText();
  const line = main.querySelector('[data-out="stampLine"]');
  if (line) line.textContent = stampText();
}
window.addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); doSave(); } });

/* ───── 목록 줄 더하기·지우기 ───── */
const TEMPLATES = {
  career: () => ({ start: '', end: '', grade: '가', rate: 1, memo: '' }),
  'training.jobCourses': () => ({ name: '', done: '', hours: '', score: '' }),
  'training.contests': () => ({ year: '', scope: '시도', grade: '1', people: '1' }),
  'bonus.labs': () => ({ type: '교육감', start: '', end: '', name: '' }),
  'bonus.abroad': () => ({ start: '', end: '' }),
  'bonus.islands': () => ({ kind: '도서', level: '다', start: '', end: '', name: '' }),
  'bonus.rural': () => ({ kind: '농어촌', level: 1, start: '', end: '', name: '' }),
  'bonus.posts': () => ({ start: '', end: '', name: '' }),
  'bonus.etcPeriods': () => ({ type: 'scout', start: '', end: '' }),
  'bonus.etcAwards': () => ({ year: '', medal: '동' }),
  'bonus.certs': () => ({ name: '', field: '', points: '0.3' }),
  'bonus.residence': () => ({ kind: '전가족', start: '2012-06-01', end: '' }),
};

function addItem(list) {
  const arr = getPath(S, list);
  if (!Array.isArray(arr) || !TEMPLATES[list]) return;
  const item = { id: Store.uid(), ...TEMPLATES[list]() };
  // 앞 줄이 끝난 다음 날부터 이어 쓰기
  const prev = arr[arr.length - 1];
  if ('start' in item && prev && D.isDate(prev.end) && list !== 'bonus.residence') item.start = D.addDays(prev.end, 1);
  arr.push(item);
  renderAll({ keepScroll: true });
  main.querySelector(`[data-list="${list}"][data-id="${item.id}"]`)?.focus();
  queueSave();
}

let undoBuf = null;
function removeItem(list, id) {
  const arr = getPath(S, list);
  if (!Array.isArray(arr)) return;
  const i = arr.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [item] = arr.splice(i, 1);
  undoBuf = { list, item, index: i };
  renderAll({ keepScroll: true });
  main.querySelector(`[data-action="add"][data-list="${list}"]`)?.focus();
  showToast('한 줄을 지웠어요.', { undo: true });
  queueSave();
}

function undo() {
  if (!undoBuf) return;
  const arr = getPath(S, undoBuf.list);
  arr.splice(undoBuf.index, 0, undoBuf.item);
  const { list, item } = undoBuf;
  undoBuf = null;
  hideToast();
  renderAll({ keepScroll: true });
  main.querySelector(`[data-list="${list}"][data-id="${item.id}"]`)?.focus();
  queueSave();
}

/* ───── 알림과 확인 창 ───── */
let toastTimer = null;
function showToast(text, { undo: canUndo = false } = {}) {
  const t = $('#toast');
  $('#toastText').textContent = text;
  $('#toastUndo').hidden = !canUndo;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, canUndo ? 7000 : 3500);
}
function hideToast() {
  $('#toast').hidden = true;
  if (!$('#toastUndo').hidden) undoBuf = null;
}

function ask({ title, body, ok = '확인', danger = false }) {
  const d = $('#dlg');
  $('#dlgTitle').textContent = title;
  $('#dlgBody').textContent = body;
  const okBtn = $('#dlgOk');
  okBtn.textContent = ok;
  okBtn.className = `btn ${danger ? 'btn-danger-fill' : 'btn-primary'}`;
  // close 이벤트에 기대지 않고 단추와 Esc를 직접 받는다(브라우저마다 close가 늦거나 빠지는 경우가 있음).
  return new Promise((resolve) => {
    const cancelBtn = $('#dlgCancel');
    const done = (v) => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      d.removeEventListener('keydown', onKey);
      d.removeEventListener('cancel', onEsc);
      if (d.open) d.close();
      resolve(v);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(false); } };
    const onEsc = (e) => { e.preventDefault(); done(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    d.addEventListener('keydown', onKey);
    d.addEventListener('cancel', onEsc);
    d.showModal();
    (danger ? cancelBtn : okBtn).focus();
  });
}

/* ───── 자료 옮기기 ───── */
async function loadSample() {
  if (hasAnyData(S) && !(await ask({
    title: '예시 자료를 불러올까요?',
    body: '지금 넣은 평정 자료가 가상의 교사 자료로 바뀌어요. 지금 자료를 남기려면 먼저 파일로 내보내 두세요.',
    ok: '예시로 바꾸기',
  }))) return;
  S = Store.sampleState();
  doSave();
  if (route.view !== 'overview') location.hash = '#/';
  else renderAll({ focus: true });
  showToast('가상의 교사 자료를 불러왔어요.');
}

async function resetAll() {
  if (!(await ask({
    title: '평정 자료를 모두 지울까요?',
    body: '이 브라우저에 저장한 경력, 근평, 연수, 가산점 자료가 모두 지워져요. 지운 자료는 되살릴 수 없어요.',
    ok: '모두 지우기',
    danger: true,
  }))) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  Store.clear();
  S = Store.emptyState();
  setSavedAt(null);
  if (route.view !== 'overview') location.hash = '#/';
  else renderAll({ focus: true });
  showToast('평정 자료를 모두 지웠어요.');
}

async function onImport(input) {
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  let data;
  try {
    data = await Store.importFile(f);
  } catch (err) {
    showToast(err?.message?.includes('평정') ? err.message : '파일을 읽지 못했어요. 이 계산기에서 내보낸 JSON 파일인지 확인해 주세요.');
    return;
  }
  if (hasAnyData(S) && !(await ask({
    title: '불러온 자료로 바꿀까요?',
    body: `‘${f.name}’ 파일의 자료로 지금 자료를 바꿔요.`,
    ok: '불러오기',
  }))) return;
  S = data;
  doSave();
  renderAll({ keepScroll: true });
  showToast('파일에서 자료를 불러왔어요.');
}

/* ───── 휴대폰 메뉴 ───── */
function openMenu() {
  document.body.classList.add('menu-open');
  $('.menu-btn').setAttribute('aria-expanded', 'true');
  $('#ledger .menu-close')?.focus();
}
function closeMenu() {
  if (!document.body.classList.contains('menu-open')) return;
  document.body.classList.remove('menu-open');
  $('.menu-btn').setAttribute('aria-expanded', 'false');
}

/* ───── 이벤트 ───── */
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!isBound(el) || el.tagName === 'SELECT' || el.type === 'checkbox') return;
  writeFrom(el);
  refresh();
  queueSave();
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'importFile') { onImport(el); return; }
  if (!isBound(el) || (el.tagName !== 'SELECT' && el.type !== 'checkbox')) return;
  writeFrom(el);
  if (el.dataset.bind === 'evalDate' || 'rerender' in el.dataset) {
    const id = el.id;
    renderAll({ keepScroll: true });
    if (id && main.contains(document.getElementById(id))) document.getElementById(id).focus();
  } else refresh();
  queueSave();
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) {
    // 전망 표는 줄 어디를 눌러도 그 기준일로 바꾼다.
    const tr = e.target.closest('tr[data-eval]');
    if (tr && main.contains(tr)) { setEval(tr.dataset.eval); return; }
    if (e.target.closest('#ledger a')) closeMenu();
    return;
  }
  const a = b.dataset.action;
  if (a === 'add') addItem(b.dataset.list);
  else if (a === 'remove') removeItem(b.dataset.list, b.dataset.id);
  else if (a === 'undo') undo();
  else if (a === 'eval') setEval(b.dataset.date);
  else if (a === 'export') { Store.exportFile(S); showToast('평정 자료를 파일로 내보냈어요.'); }
  else if (a === 'import') $('#importFile').click();
  else if (a === 'sample') loadSample();
  else if (a === 'reset') resetAll();
  else if (a === 'menu-open') openMenu();
  else if (a === 'menu-close') closeMenu();
});

function setEval(d) {
  if (!EVAL_DATES.includes(d)) return;
  S.evalDate = d;
  renderAll({ keepScroll: true });
  main.querySelector(`[data-action="eval"][data-date="${d}"]`)?.focus();
  queueSave();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
    closeMenu();
    $('.menu-btn').focus();
  }
});

window.addEventListener('hashchange', () => {
  route = parseRoute();
  closeMenu();
  renderAll({ focus: true });
});

buildEvalSelect();
renderAll();

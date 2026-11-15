// 입력값 저장: 이 브라우저의 localStorage에만 둔다. 다른 기기로는 JSON 파일로 옮긴다.
const KEY = 'jeonnam-promotion/v1';

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function emptyState() {
  return {
    version: 1,
    evalDate: '2027-02-28',
    options: { keepOldLabRates: false, perfFillForward: true },
    requirements: { koreanHistory: null },
    career: [],
    perf: { scores: {} },
    training: { firstGrade: { mode: 'score', score: '' }, jobCourses: [], contests: [], degree: 'none' },
    bonus: {
      labs: [], abroad: [], credits: { years4: '', extra: '' }, violence: { years: '' },
      islands: [], rural: [], posts: [],
      etcPeriods: [], etcAwards: [], etcFlags: { classMgmt: false, infoCert: 'none' }, certs: [], eduMerit: { years: '' },
      goodClass: { school: '', region: '', after: '' },
      residence: [],
    },
  };
}

// 예시: 실제 인물이 아니라 화면을 둘러보기 위한 가상의 교사
export function sampleState() {
  const s = emptyState();
  s.evalDate = '2028-02-29';
  s.requirements.koreanHistory = true;
  s.career = [
    { id: uid(), start: '2007-03-01', end: '2016-02-29', grade: '가', rate: 1, memo: '교사' },
    { id: uid(), start: '2016-03-01', end: '2017-02-28', grade: '가', rate: 1, memo: '육아휴직' },
    { id: uid(), start: '2017-03-01', end: '', grade: '가', rate: 1, memo: '교사' },
  ];
  s.perf.scores = { 2023: '98.5', 2024: '99.2', 2025: '97.8', 2026: '99.6' };
  s.training.firstGrade = { mode: 'score', score: '96.4' };
  s.training.jobCourses = [
    { id: uid(), name: '수업 나눔과 평가 설계', done: '2019-08-09', hours: '60', score: '97.5' },
    { id: uid(), name: '학교폭력 예방과 회복적 생활교육', done: '2021-01-22', hours: '60', score: '' },
    { id: uid(), name: 'AI 디지털 교과서 활용', done: '2024-08-02', hours: '75', score: '94' },
  ];
  s.training.contests = [
    { id: uid(), year: '2018', scope: '시도', grade: '2', people: '1' },
    { id: uid(), year: '2021', scope: '시도', grade: '3', people: '1' },
  ];
  s.bonus.labs = [
    { id: uid(), type: '교육감', start: '2018-03-01', end: '2020-02-29', name: '독서 인문 교육' },
  ];
  s.bonus.credits = { years4: '9', extra: '2' };
  s.bonus.violence = { years: '8' };
  s.bonus.islands = [
    { id: uid(), kind: '도서', level: '나', start: '2020-03-01', end: '2022-02-28', name: '섬 학교' },
  ];
  s.bonus.rural = [
    { id: uid(), kind: '농어촌', level: 2, start: '2012-03-01', end: '2016-02-29', name: '면 소재 학교' },
    { id: uid(), kind: '농어촌', level: 1, start: '2022-03-01', end: '', name: '읍 소재 학교' },
  ];
  s.bonus.posts = [{ id: uid(), start: '2019-03-01', end: '', name: '연구부장' }];
  s.bonus.etcPeriods = [{ id: uid(), type: 'scout', start: '2013-03-01', end: '2016-02-29' }];
  s.bonus.etcAwards = [{ id: uid(), year: '2019', medal: '은' }];
  s.bonus.eduMerit = { years: '3' };
  s.bonus.goodClass = { school: '18', region: '3', after: '' };
  s.bonus.residence = [{ id: uid(), kind: '전가족', start: '2012-06-01', end: '' }];
  return s;
}

// 저장본이 옛 모양이어도 빈 칸을 채워서 돌려준다.
function fill(base, saved) {
  if (Array.isArray(base)) return Array.isArray(saved) ? saved : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const k of Object.keys(saved)) out[k] = k in base ? fill(base[k], saved[k]) : saved[k];
    }
    return out;
  }
  return saved === undefined ? base : saved;
}

export function normalize(raw) {
  return fill(emptyState(), raw || {});
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function save(state) {
  try {
    state.savedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* 저장소를 못 쓰는 브라우저 */ }
}

export function exportFile(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; // taste-skill-ignore: 파일 이름 날짜
  a.href = URL.createObjectURL(blob);
  a.download = `전남promotion-평정자료-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

export async function importFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('bonus' in data || 'career' in data)) throw new Error('평정 자료 파일이 아니에요.');
  return normalize(data);
}

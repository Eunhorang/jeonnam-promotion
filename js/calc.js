// 교감 자격연수 대상자(초등 교사) 평정 계산. 화면과 떨어진 순수 함수만 둔다.
import * as D from './dates.js';
import {
  CAREER, PERF, TRAINING, COMMON, ISLAND, RURAL, POST, LAB, ETC_TYPES, ETC,
  GOOD_CLASS, RESIDENCE, selectiveMax, bonusMax,
} from './rules.js';

const EPS = 1e-9;
export const r3 = (x) => Math.round((x + EPS) * 1000) / 1000;
export const r4 = (x) => Math.round((x + EPS) * 10000) / 10000;
const pts = (sp, rate) => sp.months * rate[0] + sp.days * rate[1];

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// 끝 날짜가 비면 기준일까지 계속 근무한 것으로 보고, 기준일 뒤는 잘라 낸다.
function norm(p, evalDate) {
  if (!p || !D.isDate(p.start)) return null;
  const end = p.end && D.isDate(p.end) ? D.minDate(p.end, evalDate) : evalDate;
  if (end < p.start) return null;
  return { ...p, end };
}

function spanPts(start, end, rate, from, to) {
  const c = D.clip(start, end, from || null, to || null);
  if (!c) return { v: 0, sp: null };
  const sp = D.span(c.start, c.end);
  return { v: pts(sp, rate), sp };
}

// 두 기간이 겹치는지
function overlaps(list) {
  const s = [...list].sort((a, b) => (a.start < b.start ? -1 : 1));
  for (let i = 1; i < s.length; i++) if (s[i].start <= s[i - 1].end) return true;
  return false;
}

// 남은 점수를 채우는 데 걸리는 기간
export function timeToFill(remaining, rate) {
  if (remaining <= EPS || !rate || rate[0] <= 0) return null;
  const months = Math.floor(remaining / rate[0] + EPS);
  const rest = remaining - months * rate[0];
  const days = rest > EPS ? Math.ceil(rest / rate[1] - EPS) : 0;
  return { months, days };
}

/* ───────── 경력평정(70) ───────── */
// 등급·인정률이 같은 기간이 하루 틈 없이 이어지면 하나로 합친다(개월·일 끝수가 따로 쌓이지 않게).
function mergeContiguous(list, sameKey) {
  const s = [...list].sort((a, b) => (a.start < b.start ? -1 : 1));
  const out = [];
  for (const p of s) {
    const last = out[out.length - 1];
    if (last && sameKey(last) === sameKey(p) && D.addDays(last.end, 1) === p.start) last.end = D.maxDate(last.end, p.end);
    else out.push({ ...p });
  }
  return out;
}

export function calcCareer(periods, evalDate) {
  const normed = (periods || []).map((p) => norm(p, evalDate)).filter(Boolean);
  const list = mergeContiguous(normed, (p) => `${p.grade}|${Number(p.rate)}`)
    .sort((a, b) => (a.end < b.end ? 1 : -1));
  let remBase = CAREER.baseMonths * 30;
  let remExtra = CAREER.extraMonths * 30;
  const take = { base: {}, extra: {} };
  const rows = [];
  for (const p of list) {
    const sp = D.span(p.start, p.end);
    const factor = Number(p.rate) === 0.5 ? 0.5 : Number(p.rate) === 0 ? 0 : 1;
    let eff = D.spanDays30(sp) * factor;
    const g = CAREER.base[p.grade] ? p.grade : '가';
    const b = Math.min(eff, remBase); remBase -= b; eff -= b;
    const e = Math.min(eff, remExtra); remExtra -= e;
    take.base[g] = (take.base[g] || 0) + b;
    take.extra[g] = (take.extra[g] || 0) + e;
    rows.push({ id: p.id, span: sp, factor, grade: g });
  }
  const score = (win, table, full) => {
    const grades = Object.keys(take[win]).filter((g) => take[win][g] > EPS);
    if (!grades.length) return 0;
    if (full && grades.length === 1) return table[grades[0]].max; // 한 등급으로 다 채우면 만점
    let s = 0;
    for (const g of grades) s += pts(D.fromDays30(take[win][g]), table[g].rate);
    return Math.min(s, Math.max(...grades.map((g) => table[g].max)));
  };
  const base = r3(score('base', CAREER.base, remBase <= EPS));
  const extra = r3(score('extra', CAREER.extra, remExtra <= EPS));
  return {
    base, extra, total: r3(base + extra), max: CAREER.max, rows,
    missing: D.fromDays30(Math.max(0, remBase) + Math.max(0, remExtra)),
    overlap: overlaps(list),
  };
}

/* ───────── 근무성적평정(100) ───────── */
export function perfYears(evalDate) {
  const last = D.parse(evalDate).y - 1; // 2030. 2. 28. 평정 → 2029학년도가 가장 가까운 해
  const out = [];
  for (let y = last - PERF.years + 1; y <= last; y++) out.push(y);
  return out;
}

function combos(arr, k, start = 0, acc = [], out = []) {
  if (acc.length === k) { out.push([...acc]); return out; }
  for (let i = start; i < arr.length; i++) { acc.push(arr[i]); combos(arr, k, i + 1, acc, out); acc.pop(); }
  return out;
}

// fillForward: 마지막으로 넣은 해 뒤의 빈 해는 그 점수를 그대로 받는다고 어림한다(앞날 전망용).
export function calcPerf(scores, evalDate, opts = {}) {
  const years = perfYears(evalDate);
  const entered = Object.keys(scores || {}).map(Number).filter((y) => Number.isInteger(y) && num(scores[y]) !== null);
  const lastY = entered.length ? Math.max(...entered) : null;
  const assumed = [];
  const avail = years.map((y) => {
    let v = num(scores?.[y]);
    if (v === null && opts.fillForward && lastY !== null && y > lastY) {
      v = num(scores[lastY]);
      assumed.push(y);
    }
    return { y, v };
  }).filter((o) => o.v !== null && o.v >= 0 && o.v <= 100);
  if (!avail.length) return { score: 0, picked: [], years, max: PERF.max, count: 0, assumed: [] };
  const k = Math.min(PERF.pick, avail.length);
  const w = k === 3 ? PERF.weights : k === 2 ? [0.5, 0.5] : [1];
  let best = null;
  for (const c of combos(avail, k)) {
    const sorted = [...c].sort((a, b) => b.y - a.y);
    const s = sorted.reduce((acc, o, i) => acc + o.v * w[i], 0);
    if (!best || s > best.s + EPS) best = { s, c: sorted };
  }
  return {
    score: r3(best.s), picked: best.c.map((o) => o.y), years, max: PERF.max, count: avail.length,
    assumed: assumed.filter((y) => avail.some((o) => o.y === y)),
  };
}

/* ───────── 연수성적평정(30) ───────── */
export function jobWindowStart(evalDate) {
  const { y, m, d } = D.parse(evalDate);
  if (m === 2 && d >= 28) return D.iso(y - 10, 3, 1); // 2030. 2. 28. 평정 → 2020. 3. 1.부터
  return D.addDays(D.addMonths(evalDate, -120), 1);
}

export function convertJobScore(score) {
  const s = score === null ? 80 : score; // 성적이 없으면 만점의 8할로 봄(승진규정 제33조 제1항)
  for (const row of TRAINING.jobConvert) if (s > row.over) return row.value;
  return 85;
}

export function qualPoints(firstGrade) {
  const mode = firstGrade?.mode || 'score';
  if (mode === 'exclude') return { points: 0, used: null, note: '1정 성적을 반영하지 않는 경우로 계산' };
  let s = mode === 'nograde' ? null : num(firstGrade?.score);
  let note = '';
  if (s === null && mode === 'score') return { points: 0, used: null, note: '성적을 넣으면 계산해요' };
  if (s === null) { s = 80; note = '성적이 없으면 만점의 8할(80점)로 평정'; }
  else if (s < 60) return { points: 0, used: s, note: '만점의 6할 미만은 평정하지 않음' };
  else if (s < 80) { note = '만점의 8할 미만은 8할(80점)로 평정'; s = 80; }
  if (s > 100) s = 100;
  return { points: TRAINING.qualMax - (100 - s) * TRAINING.qualFactor, used: s, note };
}

export function contestPoints(c) {
  const scope = c?.scope === '전국' ? '전국' : '시도';
  const base = TRAINING.contest[scope]?.[Number(c?.grade)] || 0;
  const people = Math.min(4, Math.max(1, Number(c?.people) || 1));
  return base * TRAINING.coauthor[people];
}

export function calcTraining(t, evalDate) {
  const q = qualPoints(t?.firstGrade);
  const winStart = jobWindowStart(evalDate);
  const courses = (t?.jobCourses || []).map((c) => {
    const hours = num(c.hours);
    const inWindow = D.isDate(c.done) && c.done >= winStart && c.done <= evalDate;
    const ok = inWindow && hours !== null && hours >= TRAINING.jobMinHours;
    return { ...c, ok, inWindow, conv: convertJobScore(num(c.score)) };
  });
  const okList = courses.filter((c) => c.ok);
  let best = null;
  for (const c of okList) if (!best || c.conv > best.conv) best = c;
  let job = 0;
  if (best) {
    job += TRAINING.jobPerCourse * best.conv / 100;
    job += TRAINING.jobPerCourse * Math.min(2, okList.length - 1);
  }
  const byYear = {};
  for (const c of t?.contests || []) {
    const p = contestPoints(c);
    const y = Number(c.year);
    if (!p || !y) continue;
    if (!byYear[y] || p > byYear[y].p) byYear[y] = { p, id: c.id };
  }
  const contest = Object.values(byYear).reduce((a, o) => a + o.p, 0);
  const degree = TRAINING.degree[t?.degree || 'none'] || 0;
  const research = Math.min(TRAINING.researchMax, contest + degree);
  const excluded = (t?.firstGrade?.mode || 'score') === 'exclude';
  const qual = r3(q.points);
  return {
    qual, qualNote: q.note, qualUsed: q.used, excluded,
    job: r3(job), jobBestId: best?.id || null, winStart, courses,
    contest: r4(contest), counted: Object.values(byYear).map((o) => o.id), degree,
    research: r3(research),
    total: r3(qual + job + research),
    max: excluded ? TRAINING.max - TRAINING.qualMax : TRAINING.max,
  };
}

/* ───────── 가산점 ───────── */
function sumPeriods(list, evalDate, rateOf) {
  let total = 0;
  const rows = [];
  for (const p0 of list || []) {
    const p = norm(p0, evalDate);
    if (!p) continue;
    const v = rateOf(p);
    total += v;
    rows.push({ id: p.id, points: r4(v) });
  }
  return { total, rows };
}

export function calcBonus(b, evalDate, opts = {}, training) {
  const { ruralCap, labCap } = selectiveMax(evalDate);
  const newLab = evalDate >= LAB.changeDate;
  const warnings = [];

  // 연구학교(교육부 → 공통, 교육감·교육장 → 선택 4호)
  let moe = 0;
  let local = 0;
  const labRows = [];
  const labNorm = [];
  for (const p0 of b?.labs || []) {
    const p = norm(p0, evalDate);
    if (!p) continue;
    labNorm.push(p);
    let v = 0;
    if (p.type === '교육부') {
      v = spanPts(p.start, p.end, COMMON.labMoe.rate).v;
      moe += v;
    } else {
      const key = p.type === '교육장' ? '교육장' : '교육감';
      const from = key === '교육장' ? LAB.districtFrom : LAB.educhiefFrom;
      if (newLab && opts.keepOldLabRates) {
        v += spanPts(p.start, p.end, LAB.old[key], from, '2027-02-28').v;
        v += spanPts(p.start, p.end, LAB.new[key], LAB.changeDate, null).v;
      } else {
        v = spanPts(p.start, p.end, (newLab ? LAB.new : LAB.old)[key], from, null).v;
      }
      local += v;
    }
    labRows.push({ id: p.id, points: r4(v) });
  }
  if (overlaps(labNorm)) warnings.push('같은 기간의 연구학교 경력은 하나만 인정돼요. 겹치는 기간이 있어요.');
  const labCommon = Math.min(COMMON.labMoe.cap, moe);
  const labSelect = Math.max(0, Math.min(labCap - labCommon, local));

  // 재외국민교육기관 파견
  const abroadSum = sumPeriods(b?.abroad, evalDate, (p) => spanPts(p.start, p.end, COMMON.abroad.rate).v);
  const abroad = Math.min(COMMON.abroad.cap, abroadSum.total);

  // 연수이수학점
  const y4 = Math.max(0, num(b?.credits?.years4) || 0);
  const extraCredits = Math.max(0, num(b?.credits?.extra) || 0);
  const credit = Math.min(COMMON.credit.cap, y4 * COMMON.credit.perYear + extraCredits * COMMON.credit.perCredit);

  // 학교폭력 예방·대응
  const violence = Math.min(COMMON.violence.cap, Math.max(0, num(b?.violence?.years) || 0) * COMMON.violence.perYear);

  const common = labCommon + abroad + credit + violence;

  // 1호 도서·벽지
  const islandSum = sumPeriods(b?.islands, evalDate, (p) => {
    const rate = ISLAND.rate[p.kind === '벽지' ? '벽지' : '도서']?.[p.level];
    return rate ? spanPts(p.start, p.end, rate).v : 0;
  });
  const island = Math.min(ISLAND.cap, islandSum.total);

  // 2호 농어촌·시(市)지역균형발전학교
  let ruralRaw = 0;
  let cityRaw = 0;
  const ruralRows = [];
  for (const p0 of b?.rural || []) {
    const p = norm(p0, evalDate);
    if (!p) continue;
    const lv = Number(p.level) || 1;
    let v = 0;
    if (p.kind === '시지역') {
      if (lv >= 4) v = spanPts(p.start, p.end, RURAL.seg3Rate[lv], RURAL.seg3Start, null).v;
      cityRaw += v;
    } else {
      v += spanPts(p.start, p.end, RURAL.seg1Rate, RURAL.start, RURAL.seg1End).v;
      if (RURAL.seg2Rate[lv]) v += spanPts(p.start, p.end, RURAL.seg2Rate[lv], '2013-03-01', RURAL.seg2End).v;
      if (RURAL.seg3Rate[lv]) v += spanPts(p.start, p.end, RURAL.seg3Rate[lv], RURAL.seg3Start, null).v;
      ruralRaw += v;
    }
    ruralRows.push({ id: p.id, points: r4(v) });
  }
  const rural = Math.min(ruralCap, Math.min(ruralCap, ruralRaw) + Math.min(RURAL.cityCap, cityRaw));
  const islandAll = [...(b?.islands || []), ...(b?.rural || [])].map((p) => norm(p, evalDate)).filter(Boolean);
  if (overlaps(islandAll)) warnings.push('도서·벽지와 농어촌 경력이 같은 기간에 겹치면 유리한 쪽 하나만 인정돼요.');

  // 3호 보직교사(기본 1.0 → 2016. 3. 1. 이후 추가 0.25, 1정 자격연수와 합쳐 9점까지)
  const posts = (b?.posts || []).map((p) => norm(p, evalDate)).filter(Boolean)
    .sort((a, c) => (a.start < c.start ? -1 : 1));
  let postBase = 0;
  let postExtraRaw = 0;
  let baseFullDate = null;
  for (const p of posts) {
    let cur = { start: p.start, end: p.end };
    if (postBase < POST.base.cap - EPS) {
      const v = pts(D.span(cur.start, cur.end), POST.base.rate);
      if (postBase + v <= POST.base.cap + EPS) { postBase += v; continue; }
      const need = timeToFill(POST.base.cap - postBase, POST.base.rate);
      const fullDay = D.addDays(D.addMonths(cur.start, need.months), need.days - 1);
      postBase = POST.base.cap;
      baseFullDate = fullDay;
      const restStart = D.addDays(fullDay, 1);
      if (restStart > cur.end) continue;
      cur = { start: restStart, end: cur.end };
    }
    postExtraRaw += spanPts(cur.start, cur.end, POST.extra.rate, POST.extra.from, null).v;
  }
  if (overlaps(posts)) warnings.push('보직 기간이 서로 겹쳐요.');
  const qualExcluded = training?.excluded;
  const qualScore = training?.qual ?? 0;
  const extraLimit = qualExcluded ? POST.extra.cap : Math.max(0, Math.min(POST.extra.cap, POST.qualLimit - qualScore));
  const post3Extra = Math.min(postExtraRaw, extraLimit);
  const postOverflow = Math.max(0, postExtraRaw - post3Extra);
  const post = postBase + post3Extra;

  // 7호 좋은수업 실천연구
  const gcSchool = Math.max(0, num(b?.goodClass?.school) || 0);
  const gcRegion = Math.max(0, num(b?.goodClass?.region) || 0);
  const gcRaw = gcSchool * GOOD_CLASS.school + gcRegion * GOOD_CLASS.region;
  const goodClass = Math.min(GOOD_CLASS.cap, gcRaw);
  let gcOverflow = 0;
  const known = num(b?.goodClass?.after);
  if (known !== null) gcOverflow = Math.max(0, known);
  else if (gcRaw > GOOD_CLASS.cap + EPS) {
    const n = gcSchool + gcRegion;
    const need = Math.ceil(GOOD_CLASS.cap / (gcRaw / n) - EPS);
    gcOverflow = Math.max(0, n - need);
  }

  // 6호 기타 교육활동·전문성 신장
  const mok = {};
  const addMok = (letter, pre, post) => {
    mok[letter] = mok[letter] || { pre: 0, post: 0 };
    mok[letter].pre += pre;
    mok[letter].post += post;
  };
  const etcRows = [];
  const etcNorm = [];
  for (const p0 of b?.etcPeriods || []) {
    const t = ETC_TYPES[p0.type];
    const p = norm(p0, evalDate);
    if (!t || !p) continue;
    let pre = 0;
    let post = 0;
    const segs = t.oldUntil
      ? [{ from: t.from, to: t.oldUntil, rate: t.oldRate }, { from: D.addDays(t.oldUntil, 1), to: t.to, rate: t.rate }]
      : [{ from: t.from, to: t.to, rate: t.rate }];
    for (const s of segs) {
      const c = D.clip(p.start, p.end, s.from, s.to);
      if (!c) continue;
      pre += spanPts(c.start, c.end, s.rate, null, '2008-12-31').v;
      post += spanPts(c.start, c.end, s.rate, '2009-01-01', null).v;
    }
    addMok(t.mok, pre, post);
    etcRows.push({ id: p.id, points: r4(pre + post) });
    if (['가', '나', '다', '라', '마', '바', '아'].includes(t.mok)) etcNorm.push(p);
  }
  if (overlaps(etcNorm)) warnings.push('기타 교육활동 가~아목은 같은 기간이면 하나만 인정돼요.');
  // 타목: 학년도마다 가장 높은 1회
  const medalByYear = {};
  for (const a of b?.etcAwards || []) {
    const v = ETC.medal[a.medal] || 0;
    const y = Number(a.year);
    if (!v || !y) continue;
    medalByYear[y] = Math.max(medalByYear[y] || 0, v);
  }
  for (const [y, v] of Object.entries(medalByYear)) addMok('타', Number(y) <= 2008 ? v : 0, Number(y) <= 2008 ? 0 : v);
  if (b?.etcFlags?.classMgmt) addMok('자', 0, ETC.classMgmt);
  if (b?.etcFlags?.infoCert === 'pre') addMok('차', ETC.infoCert, 0);
  if (b?.etcFlags?.infoCert === 'post') addMok('차', 0, ETC.infoCert);
  // 거목: 분야마다 가장 높은 것, 합쳐 0.3까지
  const certByField = {};
  for (const c of b?.certs || []) {
    const v = num(c.points) || 0;
    const f = c.field || '기타';
    certByField[f] = Math.max(certByField[f] || 0, v);
  }
  const certTotal = Math.min(ETC.certCap, Object.values(certByField).reduce((a, v) => a + v, 0));
  if (certTotal) addMok('거', 0, certTotal);
  const eduMerit = Math.min(ETC.eduMerit.cap, Math.max(0, num(b?.eduMerit?.years) || 0) * ETC.eduMerit.perYear);
  if (eduMerit) addMok('더', 0, eduMerit);
  const reo = gcOverflow * ETC.goodClassExtra;
  if (reo) addMok('러', 0, reo);
  if (postOverflow) addMok('머', 0, Math.min(POST.meokCap, postOverflow));
  // 2008. 12. 31. 이전 점수는 모두 합쳐 0.25까지
  const preSum = Object.values(mok).reduce((a, o) => a + o.pre, 0);
  const preScale = preSum > ETC.pre2009Cap ? ETC.pre2009Cap / preSum : 1;
  const mokScores = {};
  let etcRaw = 0;
  for (const [letter, o] of Object.entries(mok)) {
    const v = Math.min(ETC.mokCap, o.pre * preScale + o.post);
    mokScores[letter] = r4(v);
    etcRaw += v;
  }
  const etc = Math.min(ETC.cap, etcRaw);

  // 8호 전라남도 거주
  const newRes = evalDate >= RESIDENCE.changeDate;
  const resSum = sumPeriods(b?.residence, evalDate, (p) => {
    const rate = newRes ? RESIDENCE.new : RESIDENCE.old[p.kind === '단독' ? '단독' : '전가족'];
    return spanPts(p.start, p.end, rate, RESIDENCE.from, null).v;
  });
  if (overlaps((b?.residence || []).map((p) => norm(p, evalDate)).filter(Boolean))) warnings.push('거주 기간이 서로 겹쳐요.');
  const residence = Math.min(RESIDENCE.cap, resSum.total);

  const selective = island + rural + post + labSelect + etc + goodClass + residence;
  const total = common + selective;

  return {
    total: r4(total), max: bonusMax(evalDate), common: r4(common), selective: r4(selective),
    items: {
      labCommon: { v: r4(labCommon), cap: COMMON.labMoe.cap, raw: r4(moe) },
      abroad: { v: r4(abroad), cap: COMMON.abroad.cap, raw: r4(abroadSum.total), rows: abroadSum.rows },
      credit: { v: r4(credit), cap: COMMON.credit.cap },
      violence: { v: r4(violence), cap: COMMON.violence.cap },
      island: { v: r4(island), cap: ISLAND.cap, raw: r4(islandSum.total), rows: islandSum.rows },
      rural: { v: r4(rural), cap: ruralCap, raw: r4(ruralRaw + cityRaw), rows: ruralRows },
      post: { v: r4(post), cap: r4(POST.base.cap + extraLimit), base: r4(postBase), extra: r4(post3Extra), extraRaw: r4(postExtraRaw), extraLimit: r4(extraLimit), overflow: r4(postOverflow), baseFullDate },
      labSelect: { v: r4(labSelect), cap: Math.max(0, labCap - labCommon), raw: r4(local), labCap, rows: labRows, newLab },
      etc: { v: r4(etc), cap: ETC.cap, mok: mokScores, rows: etcRows },
      goodClass: { v: r4(goodClass), cap: GOOD_CLASS.cap, raw: r4(gcRaw), overflow: gcOverflow },
      residence: { v: r4(residence), cap: RESIDENCE.cap, raw: r4(resSum.total), newRes, rows: resSum.rows },
    },
    warnings,
  };
}

/* ───────── 전체 ───────── */
export function calculate(state) {
  const evalDate = D.isDate(state?.evalDate) ? state.evalDate : '2027-02-28';
  const opts = state?.options || {};
  const career = calcCareer(state?.career, evalDate);
  const perf = calcPerf(state?.perf?.scores, evalDate, { fillForward: opts.perfFillForward !== false });
  const training = calcTraining(state?.training, evalDate);
  const bonus = calcBonus(state?.bonus, evalDate, opts, training);
  const total = career.total + perf.score + training.total + bonus.total;
  const max = career.max + perf.max + training.max + bonus.max;
  const warnings = [...bonus.warnings];
  if (career.overlap) warnings.push('경력 기간이 서로 겹쳐요. 겹친 기간은 한 번만 넣어 주세요.');
  if (perf.count && perf.count < 3) warnings.push('근무성적은 5년 가운데 3년이 필요해요. 빈 해는 교육청이 앞뒤 해 평균 등으로 채우니 실제와 다를 수 있어요.');
  if (state?.requirements?.koreanHistory === false) warnings.push('한국사능력검정 3급 이상이나 한국사 연수 60시간 이상이 없으면 순위명부에 오를 수 없어요.');
  return {
    evalDate, career, perf, training, bonus,
    total: r4(total), max: r3(max), warnings,
  };
}

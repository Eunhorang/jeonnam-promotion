// 계산 엔진 점검: node tests/run.js
import assert from 'node:assert/strict';
import * as D from '../js/dates.js';
import { calculate, calcCareer, calcPerf, calcTraining, convertJobScore, qualPoints, jobWindowStart, contestPoints, timeToFill, estimateCutline, cutStanding } from '../js/calc.js';
import { bonusMax } from '../js/rules.js';

let passed = 0;
const near = (a, b, eps = 0.0005) => Math.abs(a - b) <= eps;
function t(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('실패:', name); throw e; }
}

t('기간 개월·일', () => {
  assert.deepEqual(D.span('2008-03-01', '2009-01-19'), { months: 10, days: 19 });
  assert.deepEqual(D.span('2024-03-01', '2026-02-28'), { months: 24, days: 0 });
  assert.deepEqual(D.span('2011-02-04', '2013-02-28'), { months: 24, days: 25 });
  assert.deepEqual(D.span('2012-06-01', '2027-02-28'), { months: 177, days: 0 });
});

t('경력: 20년 가경력이면 70점, 19년이면 68.8점', () => {
  assert.equal(calcCareer([{ start: '2007-03-01', end: null, grade: '가', rate: 1 }], '2027-02-28').total, 70);
  const c = calcCareer([{ start: '2008-03-01', end: null, grade: '가', rate: 1 }], '2027-02-28');
  assert.equal(c.base, 64);
  assert.ok(near(c.extra, 4.8));
});

t('경력: 50% 인정 휴직과 나경력', () => {
  const c = calcCareer([
    { start: '2016-03-01', end: null, grade: '가', rate: 1 },
    { start: '2014-03-01', end: '2016-02-29', grade: '가', rate: 0.5 },
    { start: '2013-03-01', end: '2014-02-28', grade: '나', rate: 1 },
  ], '2027-02-28');
  // 가 11년(132개월) + 가 50% 2년(12개월) + 나 1년(12개월)
  assert.ok(near(c.base, 132 * 0.3555 + 12 * 0.3555 + 12 * 0.3333));
  assert.equal(c.extra, 0);
});

t('근평: 5년 가운데 유리한 3년(가까운 해 34%)', () => {
  const p = calcPerf({ 2025: 99, 2026: 95, 2027: 100, 2028: 98, 2029: 97 }, '2030-02-28');
  // 2028·2027·2025를 고르면 가장 가까운 2028(98)이 34%: 98x0.34 + 100x0.33 + 99x0.33 = 98.99
  assert.ok(near(p.score, 98.99));
  assert.deepEqual(p.picked, [2028, 2027, 2025]);
});

t('근평: 앞날의 빈 해는 마지막 점수로 어림', () => {
  const p = calcPerf({ 2025: 99, 2026: 98 }, '2030-02-28', { fillForward: true });
  // 2027·2028·2029는 2026년의 98점으로 어림 → 가장 유리한 3년은 2025(99)를 넣은 조합(같은 점수면 실제 점수를 먼저 고름)
  assert.deepEqual(p.picked, [2027, 2026, 2025]);
  assert.ok(near(p.score, 98 * 0.34 + 98 * 0.33 + 99 * 0.33));
  assert.deepEqual(p.assumed.sort(), [2027, 2028, 2029]);
  const q = calcPerf({ 2025: 99, 2026: 98 }, '2030-02-28');
  assert.equal(q.count, 2);
  assert.deepEqual(q.assumed, []);
});

t('근평 빈 해: 교육부 인사실무 예시(95 → 90 → 87.5)', () => {
  const p = calcPerf({ 2025: 95 }, '2026-02-28');
  assert.equal(p.vals[2024], 90);
  assert.equal(p.vals[2023], 87.5);
  assert.deepEqual(p.filled, [2021, 2022, 2023, 2024]);
  assert.deepEqual(p.picked, [2025, 2024, 2023]);
  assert.ok(near(p.score, 95 * 0.34 + 90 * 0.33 + 87.5 * 0.33));
});

t('근평 빈 해: 앞 점수는 평정 기간 밖의 가장 가까운 해', () => {
  // 2021·2022 휴직, 앞 점수는 2020년 98점, 뒤 점수는 2023년 96점
  const p = calcPerf({ 2020: 98, 2023: 96, 2024: 97 }, '2026-02-28');
  assert.equal(p.vals[2022], 97); // (96 + 98) ÷ 2
  assert.equal(p.vals[2021], 97.5); // (97 + 98) ÷ 2
  assert.equal(p.fillInfo[2021].beforeYear, 2020);
  assert.deepEqual(p.picked, [2024, 2022, 2021]);
  assert.ok(near(p.score, 97.165));
  assert.equal(p.vals[2025], undefined); // 어림을 끄면 마지막 해 뒤는 비워 둠
});

t('연수: 1정 92점은 8.8, 성적 없으면 8.5', () => {
  assert.ok(near(qualPoints({ score: 92 }).points, 8.8));
  assert.ok(near(qualPoints({ mode: 'nograde' }).points, 8.5));
  assert.equal(qualPoints({ score: 55 }).points, 0);
});

t('직무연수 환산과 인정 기간', () => {
  assert.equal(convertJobScore(95.5), 100);
  assert.equal(convertJobScore(95), 95);
  assert.equal(convertJobScore(90.1), 95);
  assert.equal(convertJobScore(85), 85);
  assert.equal(jobWindowStart('2030-02-28'), '2020-03-01');
  assert.equal(jobWindowStart('2027-02-28'), '2017-03-01');
  const tr = calcTraining({ firstGrade: { score: 100 }, jobCourses: [
    { id: 'a', done: '2021-08-10', hours: 60, score: 98 },
    { id: 'b', done: '2022-01-20', hours: 60, score: 90 },
    { id: 'c', done: '2019-08-01', hours: 60, score: 99 }, // 2030 평정엔 기간 밖
    { id: 'd', done: '2023-07-30', hours: 30, score: 99 }, // 60시간 미만
    { id: 'e', done: '2024-01-10', hours: 75, score: 92 },
  ] }, '2030-02-28');
  assert.ok(near(tr.job, 18));
  assert.ok(near(tr.qual, 9));
});

t('연구실적: 공동 입상과 학년도당 1회', () => {
  assert.ok(near(contestPoints({ scope: '시도', grade: 2, people: 1 }), 0.75));
  assert.ok(near(contestPoints({ scope: '전국', grade: 1, people: 2 }), 1.05));
  const tr = calcTraining({ firstGrade: { score: 90 }, contests: [
    { id: 1, year: 2015, scope: '시도', grade: 3, people: 1 },
    { id: 2, year: 2015, scope: '시도', grade: 1, people: 1 },
    { id: 3, year: 2016, scope: '시도', grade: 2, people: 1 },
  ], degree: 'ms-job' }, '2027-02-28');
  assert.ok(near(tr.research, 3)); // 1.0 + 0.75 + 1.5 → 3점 상한
});

t('가산점 최대값', () => {
  assert.ok(near(bonusMax('2027-02-28'), 11.8));
  assert.ok(near(bonusMax('2028-02-29'), 11.55));
  assert.ok(near(bonusMax('2030-02-28'), 12.05));
});

t('예상 컷: 만점에서 덜 채우는 몫을 빼고 0.1점 단위', () => {
  const c27 = estimateCutline('2027-02-28');
  assert.ok(near(c27.max, 211.8));
  assert.ok(near(c27.gap, 1.71)); // 거주 몫 0.06은 옛 배점인 2027. 2. 28. 평정에만
  assert.equal(c27.mid, 210.1);
  assert.equal(c27.low, 209.3);
  assert.equal(c27.high, 210.8);
  assert.equal(estimateCutline('2028-02-29').mid, 209.9); // 연구학교 상한 1.25 → 1.0
  assert.equal(estimateCutline('2029-02-28').mid, 210.4); // 농어촌 상한 1.0 → 1.5
  assert.equal(estimateCutline('2032-02-29').mid, 210.4);
  const x = estimateCutline('2029-02-28', { qualExcluded: true });
  assert.ok(near(x.max, 203.05));
  assert.equal(x.mid, 201.6); // 203.05 − 1.5 = 201.55 → 반올림 201.6
});

t('예상 컷: 범위 안팎', () => {
  const c = estimateCutline('2029-02-28'); // 209.6 ~ 211.1
  assert.equal(cutStanding(211.1, c), 'above');
  assert.equal(cutStanding(210.0, c), 'within');
  assert.equal(cutStanding(209.6, c), 'within');
  assert.equal(cutStanding(209.59, c), 'below');
});

t('남은 기간 계산', () => {
  assert.deepEqual(timeToFill(0.48, [0.084, 0.0028]), { months: 5, days: 22 });
});

t('예시 교사 전체 계산', () => {
  const r = calculate({
    evalDate: '2027-02-28',
    career: [{ start: '2006-03-01', end: null, grade: '가', rate: 1 }],
    perf: { scores: { 2022: 98, 2023: 99, 2024: 97, 2025: 99.5, 2026: 98.5 } },
    training: { firstGrade: { score: 96 }, jobCourses: [
      { id: 'a', done: '2018-08-01', hours: 60, score: 97 },
      { id: 'b', done: '2020-01-10', hours: 60 },
      { id: 'c', done: '2023-08-01', hours: 90, score: 93 },
    ], contests: [{ id: 'x', year: 2019, scope: '시도', grade: 1, people: 1 }], degree: 'ms-job' },
    bonus: {
      labs: [{ id: 'l1', type: '교육감', start: '2019-03-01', end: '2021-02-28' }],
      credits: { years4: 10 }, violence: { years: 10 },
      islands: [{ id: 'i1', kind: '도서', level: '나', start: '2021-03-01', end: '2023-02-28' }],
      rural: [{ id: 'r1', kind: '농어촌', level: 2, start: '2014-03-01', end: '2019-02-28' }],
      posts: [{ id: 'p1', start: '2018-03-01', end: null }],
      goodClass: { school: 20, region: 2 },
      eduMerit: { years: 4 },
      residence: [{ id: 'h1', kind: '전가족', start: '2012-06-01', end: null }],
    },
  });
  assert.equal(r.career.total, 70);
  assert.ok(r.total > 200 && r.total < 215);
  assert.ok(r.bonus.items.island.v === 3);
  assert.ok(near(r.bonus.items.labSelect.v, 24 * 0.0167));
  assert.equal(r.cut.mid, 210.1);
  assert.equal(calculate({ evalDate: '2027-02-28', training: { firstGrade: { mode: 'exclude' } } }).cut.mid, 201.2);
});

console.log(`계산 엔진 점검 ${passed}개 통과`);

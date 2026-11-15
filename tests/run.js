// 계산 엔진 점검: node tests/run.js
import assert from 'node:assert/strict';
import * as D from '../js/dates.js';
import { calculate, calcCareer, calcPerf, calcTraining, convertJobScore, qualPoints, jobWindowStart, contestPoints, timeToFill } from '../js/calc.js';
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
});

console.log(`계산 엔진 점검 ${passed}개 통과`);

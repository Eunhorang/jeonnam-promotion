// 화면마다 render(S, R)로 HTML을 만들고, 값이 바뀌면 data-out 자리만 outs[key](S, R, arg)로 다시 채운다.
import * as D from './dates.js';
import {
  EVAL_DATES, CAREER, PERF, TRAINING, COMMON, ISLAND, RURAL, POST, LAB, ETC_TYPES, ETC,
  GOOD_CLASS, RESIDENCE, RULESET_LABEL, CUTLINE,
} from './rules.js';
import { calculate, timeToFill, contestPoints, num, cutStanding } from './calc.js';
import {
  esc, fx, f3, f4, capText, bar, span, date, dash, cell, dateInput, textInput, numInput,
  selectInput, toggle, removeBtn, addBtn, evalLabel,
} from './format.js';

/* ───────── 공통 조각 ───────── */
function slot(view, key, S, R, { arg = '', tag = 'div', cls = '' } = {}) {
  const k = arg !== '' ? `${key}:${arg}` : key;
  return `<${tag} data-out="${esc(k)}"${cls ? ` class="${cls}"` : ''}>${view.outs[key](S, R, arg)}</${tag}>`;
}

function head(view, S, R, title) {
  return `<header class="view-head"><h1 tabindex="-1">${esc(title)}</h1>${slot(view, 'finding', S, R, { tag: 'p', cls: 'finding' })}</header>`;
}

function card(title, body, { id = '', caption = '', action = '', cls = '' } = {}) {
  return `<section class="card ${cls}"${id ? ` id="${id}"` : ''}${title && id ? ` aria-labelledby="${id}h"` : ''}>
    ${title ? `<div class="card-head"><div><h2${id ? ` id="${id}h"` : ''}>${esc(title)}</h2>${caption ? `<p class="caption">${caption}</p>` : ''}</div>${action}</div>` : ''}
    ${body}
  </section>`;
}

// 결과 칸: 한 카드를 가는 선으로 나눈다.
function kpis(items) {
  return `<div class="kpis n${items.length}">${items.map((k) => `
    <div class="kpi">
      <span class="kpi-label">${esc(k.label)}</span>
      <span class="kpi-value num">${k.text ?? fx(k.v, k.dp ?? 4)}${k.cap !== undefined ? `<span class="kpi-cap"> / ${k.capLabel ?? capText(k.cap)}</span>` : ''}</span>
      ${k.cap !== undefined ? bar(k.v, k.cap, k.label) : '<span class="bar bar-none"></span>'}
      ${k.sub ? `<span class="kpi-sub">${k.sub}</span>` : ''}
    </div>`).join('')}</div>`;
}

// 입력 목록: 머리줄 + 줄들 + 추가 단추
function rows(kind, list, items, headCells, rowFn, emptyText, addLabel) {
  const hd = headCells.map((h) => `<span${h.num ? ' class="num"' : ''}>${esc(h.t)}</span>`).join('');
  const body = items.length
    ? items.map((it) => `<div class="r" role="listitem">${rowFn(it)}</div>`).join('')
    : `<p class="r-empty">${esc(emptyText)}</p>`;
  return `<div class="rows rows-${kind}" role="list"><div class="rhead" aria-hidden="true">${hd}</div>${body}</div>
    <div class="card-foot">${addBtn(list, addLabel)}</div>`;
}

function notes(items) {
  return `<ul class="notes">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

const rate = (r) => `월 ${r[0]}점(일 ${r[1]}점)`;
const ptsOf = (rowsArr, id) => rowsArr?.find((o) => o.id === id)?.points;

function rowPts(v) {
  return v === undefined ? dash() : f4(v);
}

function endOf(p, evalDate) {
  if (!D.isDate(p.start)) return null;
  const end = p.end && D.isDate(p.end) ? D.minDate(p.end, evalDate) : evalDate;
  return end < p.start ? null : end;
}

function periodSpan(p, evalDate) {
  const end = endOf(p, evalDate);
  return end ? D.span(p.start, end) : null;
}

function sumSpans(list, evalDate) {
  let d = 0;
  for (const p of list || []) {
    const sp = periodSpan(p, evalDate);
    if (sp) d += D.spanDays30(sp);
  }
  return D.fromDays30(d);
}

const fillText = (left, r) => {
  const t = timeToFill(left, r);
  return t ? span(t) : '';
};

/* ───────── 왼쪽 장부(점수 목록과 메뉴) ───────── */
const TRAIN_LEAVES = [
  ['1정 자격연수', 'training/qual', (R) => R.training.qual, (R) => (R.training.excluded ? 0 : TRAINING.qualMax), 3],
  ['직무연수', 'training/job', (R) => R.training.job, () => TRAINING.jobMax, 3],
  ['연구실적', 'training/research', (R) => R.training.research, () => TRAINING.researchMax, 3],
];
const COMMON_LEAVES = [
  ['연구학교(교육부 지정)', 'bonus-lab/moe', 'labCommon'],
  ['재외국민교육기관 파견', 'bonus-common/abroad', 'abroad'],
  ['연수이수학점', 'bonus-common/credit', 'credit'],
  ['학교폭력 예방·대응', 'bonus-common/violence', 'violence'],
];
const SELECT_LEAVES = [
  ['도서·벽지', 'bonus-area/island', 'island'],
  ['농어촌·시지역', 'bonus-area/rural', 'rural'],
  ['보직교사', 'bonus-post', 'post'],
  ['연구학교(교육감·교육장)', 'bonus-lab', 'labSelect'],
  ['기타 교육활동', 'bonus-etc', 'etc'],
  ['좋은수업', 'bonus-good', 'goodClass'],
  ['전라남도 거주', 'bonus-home', 'residence'],
];

export function activeHref(routeHash, hrefs) {
  // 주소가 그대로 같은 줄을 먼저, 없으면 같은 화면의 첫 줄을 밝힌다.
  const h = routeHash.replace(/^#\/?/, '');
  if (hrefs.includes(h)) return h;
  const base = h.split('/')[0];
  return hrefs.find((x) => x.split('/')[0] === base) ?? null;
}

export { hasAnyData };

export function ledgerTotals(S, R) {
  return `<a class="total" href="#/">
      <span class="total-label">총점</span>
      <span class="total-value num">${f4(R.total)}</span>
    </a>
    <p class="total-sub"><span>만점</span><span class="num">${R.max.toFixed(3)}</span></p>
    <a class="total-sub cut-link" href="#/overview/cut"><span>예상 컷(어림)</span><span class="num">${R.cut.mid.toFixed(1)}</span></a>`;
}

export function ledgerTree(S, R, routeHash) {
  const it = R.bonus.items;
  const hrefs = [
    '', 'career', 'perf', 'training', ...TRAIN_LEAVES.map((l) => l[1]),
    ...COMMON_LEAVES.map((l) => l[1]), ...SELECT_LEAVES.map((l) => l[1]),
  ];
  const act = activeHref(routeHash, hrefs);
  const cur = (h) => (act === h ? ' aria-current="page"' : '');
  const area = (label, href, v, cap, dp, capLbl) => `
    <a class="t-row area" href="#/${href}"${cur(href)}>
      <span class="t-label">${esc(label)}</span>
      <span class="t-val num">${fx(v, dp)}<span class="t-cap">/${capLbl}</span></span>
      ${bar(v, cap, label)}
    </a>`;
  const leaf = (label, href, v, cap) => `
    <a class="t-row leaf" href="#/${href}"${cur(href)}>
      <span class="t-label">${esc(label)}</span>
      <span class="t-val num">${f4(v)}<span class="t-cap">/${capText(cap)}</span></span>
    </a>`;
  const trainLeaf = (label, href, v, cap) => `
    <a class="t-row leaf" href="#/${href}"${cur(href)}>
      <span class="t-label">${esc(label)}</span>
      <span class="t-val num">${f3(v)}<span class="t-cap">/${cap || '–'}</span></span>
    </a>`;
  return `
    <a class="t-row home" href="#/"${cur('')}><span class="t-label">평정 총괄</span></a>
    <div class="t-group">
      ${area('경력평정', 'career', R.career.total, CAREER.max, 3, CAREER.max)}
      ${area('근무성적평정', 'perf', R.perf.score, PERF.max, 3, PERF.max)}
      ${area('연수성적평정', 'training', R.training.total, R.training.max, 3, R.training.max)}
      <div class="t-leaves">${TRAIN_LEAVES.map(([l, h, v, c]) => trainLeaf(l, h, v(R), c(R))).join('')}</div>
    </div>
    <div class="t-group">
      <div class="t-row area static">
        <span class="t-label">가산점</span>
        <span class="t-val num">${f4(R.bonus.total)}<span class="t-cap">/${R.bonus.max.toFixed(2)}</span></span>
        ${bar(R.bonus.total, R.bonus.max, '가산점')}
      </div>
      <p class="t-sub"><span>공통가산점</span><span class="num">${f4(R.bonus.common)}</span></p>
      <div class="t-leaves">${COMMON_LEAVES.map(([l, h, k]) => leaf(l, h, it[k].v, it[k].cap)).join('')}</div>
      <p class="t-sub"><span>선택가산점</span><span class="num">${f4(R.bonus.selective)}</span></p>
      <div class="t-leaves">${SELECT_LEAVES.map(([l, h, k]) => leaf(l, h, it[k].v, it[k].cap)).join('')}</div>
    </div>`;
}

/* ───────── 남은 점수와 채우는 길 ───────── */
function lastOpen(list) {
  const s = [...(list || [])].filter((p) => D.isDate(p.start)).sort((a, b) => (a.start < b.start ? 1 : -1));
  return s[0] || null;
}

export function remainingItems(S, R) {
  const out = [];
  const it = R.bonus.items;
  const push = (label, href, now, cap, how, dp = 4) => {
    const left = Math.max(0, cap - now);
    out.push({ label, href, now, cap, left, how, dp, done: left < 1e-6 });
  };
  // 경력
  const miss = R.career.missing;
  push('경력평정', 'career', R.career.total, CAREER.max,
    miss.months || miss.days ? `${span(miss)} 더 근무하면 20년` : '', 3);
  // 직무연수
  const okCourses = R.training.courses.filter((c) => c.ok);
  let jobHow = '';
  if (okCourses.length < 3) jobHow = `${date(R.training.winStart)} 이후 60시간 이상 직무연수 ${3 - okCourses.length}개 더`;
  else if (Math.max(...okCourses.map((c) => c.conv)) < 100) jobHow = '성적이 95점을 넘는 직무연수 1개';
  push('직무연수', 'training/job', R.training.job, TRAINING.jobMax, jobHow, 3);
  // 연구실적
  const rLeft = TRAINING.researchMax - R.training.research;
  let rHow = '';
  if (rLeft > 1e-6) {
    if (rLeft <= 0.5) rHow = '시도 연구대회 3등급 1회';
    else if (rLeft <= 0.75) rHow = '시도 연구대회 2등급 1회';
    else if (rLeft <= 1) rHow = '시도 연구대회 1등급 1회';
    else rHow = `시도 연구대회 1등급 ${Math.ceil(rLeft - 1e-9)}회(학년도마다 1회)`;
  }
  push('연구실적', 'training/research', R.training.research, TRAINING.researchMax, rHow, 3);
  // 가산점
  const lab = it.labSelect;
  const newLab = lab.newLab;
  const labUsed = it.labCommon.v + lab.v;
  const labLeft = Math.max(0, lab.labCap - labUsed);
  const chief = (newLab ? LAB.new : LAB.old).교육감;
  const district = (newLab ? LAB.new : LAB.old).교육장;
  out.push({
    label: '연구학교', href: 'bonus-lab', now: labUsed, cap: lab.labCap, left: labLeft, dp: 4, done: labLeft < 1e-6,
    how: labLeft > 1e-6 ? `교육감 지정 ${fillText(labLeft, chief)}, 교육장 지정이면 ${fillText(labLeft, district)}` : '',
  });
  push('연수이수학점', 'bonus-common/credit', it.credit.v, it.credit.cap,
    `4학점 이상 이수한 해 ${Math.ceil((it.credit.cap - it.credit.v) / COMMON.credit.perYear - 1e-9)}년 더`);
  push('학교폭력 예방·대응', 'bonus-common/violence', it.violence.v, it.violence.cap,
    `가산점을 받는 해 ${Math.ceil((it.violence.cap - it.violence.v) / COMMON.violence.perYear - 1e-9)}년 더`);
  const isl = lastOpen(S.bonus.islands);
  const islKind = isl?.kind === '벽지' ? '벽지' : '도서';
  const islLevel = isl?.level && ISLAND.rate[islKind][isl.level] ? isl.level : '다';
  push('도서·벽지', 'bonus-area/island', it.island.v, it.island.cap,
    `${islKind} ${islLevel}지에서 ${fillText(it.island.cap - it.island.v, ISLAND.rate[islKind][islLevel])}`);
  const rur = lastOpen((S.bonus.rural || []).filter((p) => p.kind !== '시지역'));
  const rLv = Number(rur?.level) || 1;
  push('농어촌·시지역', 'bonus-area/rural', it.rural.v, it.rural.cap,
    `농어촌 ${rLv}급지에서 ${fillText(it.rural.cap - it.rural.v, RURAL.seg3Rate[rLv] || RURAL.seg3Rate[1])}`);
  // 보직: 기본 1.0 + (9 - 자격연수 점수)까지의 추가
  const post = it.post;
  const postCap = POST.base.cap + post.extraLimit;
  let postHow = '';
  if (post.base < POST.base.cap - 1e-6) postHow = `보직 ${fillText(POST.base.cap - post.base, POST.base.rate)} 더 맡으면 기본 1.0`;
  else if (post.extra < post.extraLimit - 1e-6) postHow = `추가경력 ${fillText(post.extraLimit - post.extra, POST.extra.rate)} 더`;
  push('보직교사', 'bonus-post', post.v, postCap, postHow);
  push('기타 교육활동', 'bonus-etc', it.etc.v, it.etc.cap, '아직 받지 않은 목에서(한 목 0.5점까지)');
  push('좋은수업', 'bonus-good', it.goodClass.v, it.goodClass.cap,
    `교내 공개 ${Math.ceil((it.goodClass.cap - it.goodClass.v) / GOOD_CLASS.school - 1e-9)}회(해마다 2회까지)`);
  const resRate = it.residence.newRes ? RESIDENCE.new : RESIDENCE.old.전가족;
  push('전라남도 거주', 'bonus-home', it.residence.v, it.residence.cap,
    `전남 거주 ${fillText(it.residence.cap - it.residence.v, resRate)} 더`);
  return out;
}

/* ───────── 평정 총괄 ───────── */
function hasAnyData(S) {
  const b = S.bonus;
  return S.career.length || Object.values(S.perf.scores).some((v) => num(v) !== null)
    || S.training.jobCourses.length || S.training.contests.length || num(S.training.firstGrade.score) !== null
    || b.labs.length || b.islands.length || b.rural.length || b.posts.length || b.residence.length
    || b.etcPeriods.length || b.etcAwards.length || num(b.credits.years4) || num(b.violence.years)
    || num(b.goodClass.school) || num(b.eduMerit.years);
}

// 기준일마다 다시 계산한 결과. 같은 R에서는 한 번만 계산한다.
const byDateCache = new WeakMap();
function byDate(S, R) {
  if (!byDateCache.has(R)) byDateCache.set(R, EVAL_DATES.map((d) => (d === R.evalDate ? R : calculate({ ...S, evalDate: d }))));
  return byDateCache.get(R);
}

const CUT_STANDING = { above: '범위보다 위', within: '범위 안', below: '범위보다 아래' };

const overview = {
  title: '평정 총괄',
  outs: {
    finding(S, R) {
      const left = Math.max(0, R.bonus.max - R.bonus.total);
      return `${date(R.evalDate)} 평정 기준 총점은 <b class="num">${f4(R.total)}</b>점이에요. `
        + (left > 1e-6 ? `가산점은 상한까지 ${f4(left)}점 남았어요.` : '가산점은 상한을 다 채웠어요.');
    },
    start(S) {
      if (hasAnyData(S)) return '';
      return card('', `<div class="start">
          <h2>아직 넣은 자료가 없어요</h2>
          <p>경력증명서와 가산점 평정표를 옆에 두고 경력부터 차례로 넣어 보세요. 넣는 대로 왼쪽 점수가 바뀌어요.</p>
          <div class="btns"><a class="btn btn-primary" href="#/career">경력부터 넣기</a>
          <button type="button" class="btn" data-action="sample">예시 자료로 둘러보기</button></div>
        </div>`, { cls: 'card-start' });
    },
    phone(S, R) {
      const row = (label, href, v, cap, dp) => `<a class="ps-row" href="#/${href}"><span>${label}</span><span class="num">${fx(v, dp)}<span class="t-cap">/${cap}</span></span></a>`;
      return `<div class="ps-total"><span>총점</span><span class="num">${f4(R.total)}</span></div>
        <p class="ps-sub">만점 ${R.max.toFixed(3)} · ${evalLabel(R.evalDate)}</p>
        ${row('경력평정', 'career', R.career.total, CAREER.max, 3)}
        ${row('근무성적평정', 'perf', R.perf.score, PERF.max, 3)}
        ${row('연수성적평정', 'training', R.training.total, R.training.max, 3)}
        ${row('가산점', 'bonus-common', R.bonus.total, R.bonus.max.toFixed(2), 4)}
        <a class="ps-row" href="#/overview/cut"><span>예상 컷(어림)</span><span class="num">${R.cut.mid.toFixed(1)}</span></a>`;
    },
    projection(S, R) {
      let prev = null;
      const body = byDate(S, R).map((r) => {
        const d = r.evalDate;
        const delta = prev === null ? null : r.total - prev;
        prev = r.total;
        const current = d === R.evalDate;
        const dl = delta === null ? dash()
          : Math.abs(delta) < 1e-6 ? '<span class="zero">0.0000</span>'
            : `<span class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(4)}</span>`;
        return `<tr data-eval="${d}"${current ? ' aria-current="true" class="current"' : ''}>
          <th scope="row"><button type="button" class="linkish" data-action="eval" data-date="${d}" aria-label="${evalLabel(d)}으로 보기">${date(d)}</button>${current ? '<span class="now">보는 중</span>' : ''}</th>
          <td class="num hide-s">${f3(r.career.total)}</td>
          <td class="num hide-s">${f3(r.perf.score)}</td>
          <td class="num hide-s">${f3(r.training.total)}</td>
          <td class="num cell-bar">${f4(r.bonus.total)}${bar(r.bonus.total, r.bonus.max, `${date(d)} 가산점`)}</td>
          <td class="num strong">${f4(r.total)}</td>
          <td class="num hide-s">${dl}</td>
          <td class="sub-row">경력 ${f3(r.career.total)} · 근평 ${f3(r.perf.score)} · 연수 ${f3(r.training.total)}</td>
        </tr>`;
      }).join('');
      return `<div class="tbl-wrap"><table class="tbl proj">
        <thead><tr><th scope="col">평정 기준일</th><th scope="col" class="num hide-s">경력</th><th scope="col" class="num hide-s">근평</th>
        <th scope="col" class="num hide-s">연수</th><th scope="col" class="num">가산점</th><th scope="col" class="num">총점</th><th scope="col" class="num hide-s">앞 해보다</th></tr></thead>
        <tbody>${body}</tbody></table></div>`;
    },
    projNotes(S, R) {
      const rs = byDate(S, R);
      const out = [];
      for (let i = 1; i < rs.length; i++) {
        const a = rs[i - 1];
        const b = rs[i];
        const dTrain = b.training.total - a.training.total;
        if (dTrain < -1e-6) {
          const gone = a.training.courses.filter((c) => c.ok && !b.training.courses.find((x) => x.id === c.id)?.ok);
          const names = gone.map((c) => `‘${esc(c.name || '이름 없는 연수')}’(${date(c.done)} 이수)`).join(', ');
          out.push(`${date(b.evalDate)} 평정부터 ${names || '직무연수 일부'}가 인정 기간 10년을 벗어나 연수성적이 ${f3(-dTrain)}점 줄어요.`);
        }
        const labA = a.bonus.items.labSelect.v + a.bonus.items.labCommon.v;
        const labB = b.bonus.items.labSelect.v + b.bonus.items.labCommon.v;
        if (labB < labA - 1e-6) out.push(`${date(b.evalDate)} 평정부터 연구학교 배점이 내려가 연구학교 점수가 ${f4(labA - labB)}점 줄어요.`);
      }
      return out.length ? `<ul class="proj-notes">${out.map((n) => `<li>${n}</li>`).join('')}</ul>` : '';
    },
    cutline(S, R) {
      const has = hasAnyData(S);
      const body = byDate(S, R).map((r) => {
        const c = r.cut;
        const current = r.evalDate === R.evalDate;
        const diff = r.total - c.mid;
        const range = `${c.low.toFixed(1)}~${c.high.toFixed(1)}`;
        const dl = !has ? dash()
          : `${Math.abs(diff) < 0.005 ? '<span class="zero">0.00</span>'
            : `<span class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)}</span>`}<span class="standing">${CUT_STANDING[cutStanding(r.total, c)]}</span>`;
        return `<tr${current ? ' aria-current="true" class="current"' : ''}>
          <th scope="row">${date(r.evalDate)}${current ? '<span class="now">보는 중</span>' : ''}</th>
          <td class="num hide-s">${c.max.toFixed(3)}</td>
          <td class="num strong">${c.mid.toFixed(1)}</td>
          <td class="num hide-s">${range}</td>
          <td class="num hide-s">${has ? f4(r.total) : dash()}</td>
          <td class="num">${dl}</td>
          <td class="sub-row">만점 ${c.max.toFixed(3)} · 범위 ${range}${has ? ` · 내 총점 ${f4(r.total)}` : ''}</td>
        </tr>`;
      }).join('');
      return `<div class="tbl-wrap"><table class="tbl cut">
        <thead><tr><th scope="col">평정 기준일</th><th scope="col" class="num hide-s">만점</th><th scope="col" class="num">예상 컷</th>
        <th scope="col" class="num hide-s">어림 범위</th><th scope="col" class="num hide-s">내 총점</th><th scope="col" class="num">컷과 차이</th></tr></thead>
        <tbody>${body}</tbody></table></div>`;
    },
    cutMethod(S, R) {
      const c = R.cut;
      const lastBefore = (d) => EVAL_DATES.filter((x) => x < d).at(-1);
      const items = c.gaps.map((g) => `<li><b>${esc(g.label)} ${g.v}점</b>: ${esc(g.why)}${g.before ? ` ${date(lastBefore(g.before))} 평정에서만 빼요.` : ''}</li>`).join('');
      return `<details class="method">
        <summary>어떻게 어림했나요</summary>
        <p class="calc-line">${date(c.evalDate)} 평정은 만점 <b class="num">${c.max.toFixed(3)}</b>점에서 아래 몫 <b class="num">${f3(c.gap)}</b>점을 빼고 0.1점 단위로 반올림해 <b class="num">${c.mid.toFixed(1)}</b>점으로 잡았어요.</p>
        <ul class="notes">${items}</ul>
        <ul class="notes">
          <li>경력은 모두 만점으로 봤어요. 어림 범위는 이 값보다 ${CUTLINE.below}점 낮은 데서 ${CUTLINE.above}점 높은 데까지예요.</li>
          <li>2028. 2. 29. 평정은 연구학교 상한이 ${LAB.old.cap}점에서 ${LAB.new.cap.toFixed(1)}점으로 내려가 예상 컷도 내려가지만 2029. 2. 28. 평정부터는 농어촌 상한이 ${RURAL.capAfter.toFixed(1)}점으로 올라 컷도 다시 올라가요. 그 뒤 해는 규정이 그대로라고 보고 같은 값을 썼어요.</li>
          ${c.qualExcluded ? '<li>1정 자격연수 성적을 빼고 계산하는 중이라 만점과 예상 컷에서도 그 몫을 뺐어요.</li>' : ''}
          <li>실제 컷은 교육지원청 인사 담당 장학사나 최근에 대상자가 된 선생님께 물어보는 편이 더 정확해요.</li>
        </ul>
      </details>`;
    },
    projCaption(S) {
      const a = ['끝난 날을 비워 둔 근무는 그 기준일까지 이어진다고 보고 계산했어요.'];
      if (S.options.perfFillForward !== false) a.push('아직 받지 않은 해의 근평은 가장 최근 점수로 어림했어요.');
      return a.join(' ');
    },
    remaining(S, R) {
      const items = remainingItems(S, R);
      const open = items.filter((x) => !x.done);
      const done = items.filter((x) => x.done);
      const body = open.map((x) => `<tr>
          <th scope="row"><a href="#/${x.href}">${esc(x.label)}</a><span class="sub">${esc(x.how)}</span></th>
          <td class="num hide-s">${fx(x.now, x.dp)}</td>
          <td class="num hide-s">${x.cap.toFixed(x.dp === 3 ? 0 : 2)}</td>
          <td class="num strong">${fx(x.left, x.dp)}</td>
          <td class="how hide-s">${esc(x.how) || dash()}</td>
        </tr>`).join('');
      const table = open.length ? `<div class="tbl-wrap"><table class="tbl remain">
          <thead><tr><th scope="col">항목</th><th scope="col" class="num hide-s">지금</th><th scope="col" class="num hide-s">상한</th>
          <th scope="col" class="num">남은 점수</th><th scope="col" class="hide-s">채우는 길(어림)</th></tr></thead>
          <tbody>${body}</tbody></table></div>` : '<p class="empty-line">모든 항목을 상한까지 채웠어요.</p>';
      const doneLine = done.length ? `<p class="done-line">다 채운 항목: ${done.map((x) => esc(x.label)).join(', ')}</p>` : '';
      return table + doneLine;
    },
    warnings(S, R) {
      if (!R.warnings.length) return '';
      return `<section class="notice" aria-labelledby="warnh"><h2 id="warnh">확인할 것</h2>
        <ul>${R.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>`;
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    return `${head(this, S, R, '평정 총괄')}
      ${o('start')}
      ${card('', o('phone', { cls: 'ps' }), { cls: 'phone-only' })}
      ${o('warnings')}
      ${card('기준일별 전망', o('projection') + o('projNotes'), { id: 'sec-proj', caption: `<span data-out="projCaption">${this.outs.projCaption(S)}</span> 줄을 누르면 그 기준일로 바꿔 봐요.` })}
      ${card('기준일별 예상 컷트라인', o('cutline') + o('cutMethod'), { id: 'sec-cut', caption: '공개된 컷 점수가 없어서 기준일 만점에서 컷 근처 후보가 흔히 덜 채우는 몫을 빼 어림했어요. 실제 컷과는 1점 넘게 차이 날 수도 있으니 참고로만 보세요.' })}
      ${card('남은 점수와 채우는 길', o('remaining'), { id: 'sec-remain', caption: '상한까지 남은 항목이에요. 채우는 길은 지금 배점으로 어림한 기간과 횟수예요.' })}`;
  },
};

/* ───────── 경력평정 ───────── */
const GRADE_OPTS = [['가', '가경력'], ['나', '나경력'], ['다', '다경력']];
const RATE_OPTS = [['1', '100%'], ['0.5', '50%'], ['0', '인정 안 함']];

const career = {
  title: '경력평정',
  outs: {
    finding(S, R) {
      const c = R.career;
      if (c.total >= CAREER.max - 1e-9) return `기준일부터 거슬러 근무한 20년을 봐요. 만점 ${CAREER.max}점을 채웠어요.`;
      if (!S.career.length) return '기준일부터 거슬러 근무한 20년(기본 15년, 초과 5년)을 봐요. 근무 기간을 넣어 주세요.';
      return `기준일부터 거슬러 근무한 20년을 봐요. 지금 <b class="num">${f3(c.total)}</b>점이고 20년까지 ${span(c.missing)}이 모자라요.`;
    },
    kpi(S, R) {
      const c = R.career;
      return kpis([
        { label: '기본경력(15년)', v: c.base, cap: 64, capLabel: '64', dp: 3 },
        { label: '초과경력(5년)', v: c.extra, cap: 6, capLabel: '6', dp: 3 },
        { label: '경력평정', v: c.total, cap: CAREER.max, capLabel: String(CAREER.max), dp: 3 },
      ]);
    },
    row(S, R, id) {
      const p = S.career.find((x) => x.id === id);
      if (!p) return '';
      const sp = periodSpan(p, R.evalDate);
      if (!sp) return D.isDate(p.start) ? '<span class="zero">기준일 뒤</span>' : dash();
      const r = Number(p.rate);
      return `${span(sp)}${r === 0.5 ? '<span class="rv-note"> · 50%</span>' : r === 0 ? '<span class="rv-note"> · 빼고 계산</span>' : ''}`;
    },
    total(S, R) {
      const all = sumSpans(S.career.filter((p) => Number(p.rate) !== 0), R.evalDate);
      return `넣은 근무 ${span(all)}`;
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const L = 'career';
    const list = rows('career', L, S.career,
      [{ t: '시작일' }, { t: '끝난 날' }, { t: '등급' }, { t: '인정' }, { t: '메모' }, { t: '기간', num: true }, { t: '' }],
      (p) => `
        ${cell('시작일', dateInput({ list: L, id: p.id, field: 'start' }, p.start))}
        ${cell('끝난 날', dateInput({ list: L, id: p.id, field: 'end' }, p.end))}
        ${cell('등급', selectInput({ list: L, id: p.id, field: 'grade' }, p.grade, GRADE_OPTS))}
        ${cell('인정', selectInput({ list: L, id: p.id, field: 'rate' }, String(p.rate), RATE_OPTS, { number: true }))}
        ${cell('메모', textInput({ list: L, id: p.id, field: 'memo' }, p.memo, { placeholder: '학교, 휴직 등', maxlength: 40 }), 'c-memo')}
        <span class="rv num" data-out="row:${esc(p.id)}">${this.outs.row(S, R, p.id)}</span>
        ${removeBtn(L, p.id, '이 기간')}`,
      '아직 넣은 근무 기간이 없어요.', '근무 기간 추가');
    return `${head(this, S, R, '경력평정')}
      ${card('', o('kpi'), { cls: 'card-kpi' })}
      ${card('근무 기간', list, { id: 'sec-periods', caption: '끝난 날을 비우면 기준일까지 근무하는 것으로 계산해요. 기간이 끊긴 동안은 건너뛰고 그 앞 근무를 더 거슬러 세요.', action: o('total', { tag: 'span', cls: 'head-meta num' }) })}
      ${card('계산 방법', notes([
        `기본경력 15년: 가경력 ${rate(CAREER.base.가.rate)}, 64점까지. 나경력은 월 ${CAREER.base.나.rate[0]}점, 다경력은 월 ${CAREER.base.다.rate[0]}점이에요.`,
        `초과경력 5년: 가경력 ${rate(CAREER.extra.가.rate)}, 6점까지. 나경력은 월 ${CAREER.extra.나.rate[0]}점, 다경력은 월 ${CAREER.extra.다.rate[0]}점이에요.`,
        '초등학교 교사로 근무한 기간은 가경력이에요. 등급과 인정 비율이 다른 기간은 경력증명서를 보고 나눠 넣으세요.',
        '절반만 인정되는 휴직은 50%를, 경력에 넣지 않는 기간은 \'인정 안 함\'을 고르세요.',
      ]), { id: 'sec-howto', cls: 'card-notes' })}`;
  },
};

/* ───────── 근무성적평정 ───────── */
const n3 = (x) => String(Math.round(x * 1000) / 1000);

const perf = {
  title: '근무성적평정',
  outs: {
    finding(S, R) {
      const p = R.perf;
      const ys = p.years;
      const range = `${ys[0]}~${ys[ys.length - 1]}학년도`;
      if (!p.count) return `${range} 가운데 유리한 3년을 골라요. 학년도별 평정점을 넣어 주세요.`;
      const fill = p.filled.length ? ` 근평이 빈 해 ${p.filled.length}개는 앞뒤 해 평균으로 채웠어요.` : '';
      return `${range} 가운데 ${p.picked.join(', ')}학년도를 골라 <b class="num">${f3(p.score)}</b>점이에요.${fill}`;
    },
    kpi(S, R) {
      const p = R.perf;
      const sub = [];
      if (p.filled.length) sub.push(`앞뒤 평균으로 채운 해 ${p.filled.length}개`);
      if (p.assumed.length) sub.push(`어림한 해 ${p.assumed.length}개`);
      return kpis([
        { label: '근무성적평정', v: p.score, cap: PERF.max, capLabel: String(PERF.max), dp: 3 },
        { label: '점수를 넣은 해', text: `${p.actual}년`, sub: sub.join(' · ') || '5년 가운데' },
      ]);
    },
    use(S, R, y) {
      const p = R.perf;
      const yy = Number(y);
      if (!p.years.includes(yy)) {
        // 평정 기간 바로 앞 해: 빈 해를 채울 때 앞 점수로만 쓴다
        return Object.values(p.fillInfo).some((f) => f.beforeYear === yy) ? '빈 해를 채울 때 씀' : dash();
      }
      if (p.vals[yy] === undefined) return dash();
      const i = p.picked.indexOf(yy);
      const w = p.picked.length === 3 ? PERF.weights : p.picked.length === 2 ? [0.5, 0.5] : [1];
      const share = i >= 0 ? `${Math.round(w[i] * 100)}% 반영` : '<span class="zero">빼고 계산</span>';
      if (p.filled.includes(yy)) {
        const f = p.fillInfo[yy];
        const before = f.beforeYear === null ? '85(앞 점수 없음)' : n3(f.before);
        return `${share}<span class="rv-hint">앞뒤 평균 ${f3(p.vals[yy])} = <span class="nw">(${n3(f.after)} + ${before}) ÷ 2</span></span>`;
      }
      if (p.assumed.includes(yy)) return `${share}<span class="rv-hint">어림 ${f3(p.vals[yy])}(마지막으로 넣은 점수)</span>`;
      return share;
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const ys = [...R.perf.years].reverse();
    const prev = R.perf.years[0] - 1;
    const row = (y, isPrev) => `<div class="r${isPrev ? ' r-prev' : ''}" role="listitem">
        <span class="ry">${y}학년도<span class="sub">${isPrev ? '평정 기간 앞 해 · 빈 해를 채울 때만 써요' : `${y}. 3. 1.~${y + 1}. 2. ${D.daysInMonth(y + 1, 2)}.`}</span></span>
        ${cell(`${y}학년도 평정점`, numInput({ path: `perf.scores.${y}` }, S.perf.scores[y] ?? '', { placeholder: '100점 만점' }))}
        <span class="rv num" data-out="use:${y}">${this.outs.use(S, R, String(y))}</span>
      </div>`;
    const list = `<div class="rows rows-perf" role="list"><div class="rhead" aria-hidden="true"><span>학년도</span><span class="num">평정점</span><span class="num">반영</span></div>
      ${ys.map((y) => row(y, false)).join('')}${row(prev, true)}</div>`;
    return `${head(this, S, R, '근무성적평정')}
      ${card('', o('kpi'), { cls: 'card-kpi' })}
      ${card('학년도별 평정점', list, { id: 'sec-years', caption: '해마다 통보받은 근무성적평정점(다면평가 포함, 100점 만점)을 넣으세요. 휴직 등으로 근평이 없는 해는 비워 두면 규정대로 채워요.' })}
      ${card('계산 방법', notes([
        '기준일 전 5년(학년도) 가운데 유리한 3년을 골라 기준일에 가장 가까운 해에 34%, 나머지 두 해에 33%를 곱해 더해요.',
        '근평이 없는 해는 승진규정 제40조 제5항대로 그해 앞뒤에 받은 점수의 평균으로 채워요. 앞에 받은 점수가 없으면 85점으로 봐요.',
        '가까운 해부터 차례로 채워요. 채운 값은 그보다 앞 해를 채울 때 뒤 점수가 돼요. 교육부 인사실무 예시로는 95점 다음 두 해가 90점, 87.5점이에요.',
        '평정 기간 첫해가 비면 맨 아래 칸(평정 기간 앞 해)에 넣은 점수를 앞 점수로 써요.',
        S.options.perfFillForward !== false
          ? '마지막으로 넣은 해 뒤의 빈 해는 그 점수를 그대로 받는다고 어림해요. 설정에서 끌 수 있어요.'
          : '앞날의 근평 어림을 꺼 두었어요. 마지막으로 넣은 해 뒤는 비워 둔 채 계산해요.',
      ]), { cls: 'card-notes' })}`;
  },
};

/* ───────── 연수성적평정 ───────── */
const QUAL_MODES = [['score', '성적이 있어요'], ['nograde', '성적 없이 이수만 했어요'], ['exclude', '반영하지 않는 경우로 계산']];
const SCOPE_OPTS = [['시도', '시·도 대회'], ['전국', '전국 대회']];
const GRADE3 = [['1', '1등급'], ['2', '2등급'], ['3', '3등급']];
const PEOPLE = [['1', '혼자'], ['2', '2명'], ['3', '3명'], ['4', '4명 이상']];
const DEGREE_OPTS = [
  ['none', '없음'], ['ms-job', '석사(직무 관련) 1.5점'], ['ms-other', '석사(그 밖) 1.0점'],
  ['phd-job', '박사(직무 관련) 3.0점'], ['phd-other', '박사(그 밖) 1.5점'],
];

const training = {
  title: '연수성적평정',
  outs: {
    finding(S, R) {
      const t = R.training;
      return `자격연수 ${f3(t.qual)}점, 직무연수 ${f3(t.job)}점, 연구실적 ${f3(t.research)}점을 더해 <b class="num">${f3(t.total)}</b>점이에요.`;
    },
    kpi(S, R) {
      const t = R.training;
      return kpis([
        { label: '1정 자격연수', v: t.qual, cap: t.excluded ? 0 : TRAINING.qualMax, capLabel: t.excluded ? '반영 안 함' : '9', dp: 3 },
        { label: '직무연수', v: t.job, cap: TRAINING.jobMax, capLabel: '18', dp: 3 },
        { label: '연구실적', v: t.research, cap: TRAINING.researchMax, capLabel: '3', dp: 3 },
        { label: '연수성적평정', v: t.total, cap: t.max, capLabel: String(t.max), dp: 3 },
      ]);
    },
    qual(S, R) {
      const t = R.training;
      if (t.excluded) return '<p class="calc-line">1정 자격연수 성적을 빼고 계산하고 있어요. 연수성적평정 만점은 21점이 돼요.</p>';
      if (t.qualUsed === null || t.qualUsed === undefined) return '';
      const formula = `9 − (100 − ${t.qualUsed}) × 0.025`;
      return `<p class="calc-line"><b class="num">${f3(t.qual)}</b>점 <span class="muted">= ${formula}</span>${t.qualNote ? `<span class="muted"> · ${esc(t.qualNote)}</span>` : ''}</p>`;
    },
    jobWin(S, R) {
      return `${date(R.training.winStart)}부터 기준일까지 이수한 60시간 이상 연수에서 3개를 쓰는데 성적이 가장 좋은 1개는 환산성적으로, 나머지 2개는 이수 실적으로 6점씩 받아요.`;
    },
    jobRow(S, R, id) {
      const c = R.training.courses.find((x) => x.id === id);
      if (!c) return dash();
      if (!D.isDate(c.done)) return '<span class="zero">이수일 필요</span>';
      if (!c.inWindow) return '<span class="zero">기간 밖</span>';
      if (!c.ok) return '<span class="zero">60시간 미만</span>';
      if (R.training.jobBestId === id) return `환산 ${c.conv} · 성적 반영`;
      const okList = R.training.courses.filter((x) => x.ok && x.id !== R.training.jobBestId);
      const idx = okList.findIndex((x) => x.id === id);
      return idx >= 0 && idx < 2 ? '이수 실적' : '<span class="zero">3개 넘음</span>';
    },
    research(S, R) {
      const t = R.training;
      return `<p class="calc-line">연구대회 ${f4(t.contest)}점 + 학위 ${f4(t.degree)}점 → <b class="num">${f3(t.research)}</b>점 <span class="muted">(3점까지)</span></p>`;
    },
    contestRow(S, R, id) {
      const c = S.training.contests.find((x) => x.id === id);
      if (!c) return dash();
      const p = contestPoints(c);
      if (!Number(c.year)) return '<span class="zero">학년도 필요</span>';
      const counted = R.training.counted.includes(id);
      return counted ? f4(p) : `<span class="zero">${p.toFixed(4)} · 같은 해 더 높은 실적</span>`;
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const t = S.training;
    const qualBody = `<div class="form-grid">
        ${cell('성적', selectInput({ path: 'training.firstGrade.mode' }, t.firstGrade.mode || 'score', QUAL_MODES, { rerender: true }), 'f-wide')}
        ${(t.firstGrade.mode || 'score') === 'score' ? cell('자격연수 성적(100점 만점)', numInput({ path: 'training.firstGrade.score' }, t.firstGrade.score, { placeholder: '예: 92' })) : ''}
      </div>${o('qual')}`;
    const JL = 'training.jobCourses';
    const jobList = rows('job', JL, t.jobCourses,
      [{ t: '연수 이름' }, { t: '이수일' }, { t: '시간', num: true }, { t: '성적', num: true }, { t: '반영', num: true }, { t: '' }],
      (c) => `
        ${cell('연수 이름', textInput({ list: JL, id: c.id, field: 'name' }, c.name, { placeholder: '연수 이름', maxlength: 60 }), 'c-name')}
        ${cell('이수일', dateInput({ list: JL, id: c.id, field: 'done' }, c.done))}
        ${cell('시간', numInput({ list: JL, id: c.id, field: 'hours' }, c.hours, { placeholder: '60' }))}
        ${cell('성적', numInput({ list: JL, id: c.id, field: 'score' }, c.score, { placeholder: '없으면 비움' }))}
        <span class="rv num" data-out="jobRow:${esc(c.id)}">${this.outs.jobRow(S, R, c.id)}</span>
        ${removeBtn(JL, c.id, '이 연수')}`,
      '아직 넣은 직무연수가 없어요.', '직무연수 추가');
    const CL = 'training.contests';
    const contestList = rows('contest', CL, t.contests,
      [{ t: '학년도' }, { t: '대회' }, { t: '등급' }, { t: '함께 입상' }, { t: '점수', num: true }, { t: '' }],
      (c) => `
        ${cell('학년도', numInput({ list: CL, id: c.id, field: 'year' }, c.year, { placeholder: '2024', maxlength: 4 }))}
        ${cell('대회', selectInput({ list: CL, id: c.id, field: 'scope' }, c.scope, SCOPE_OPTS))}
        ${cell('등급', selectInput({ list: CL, id: c.id, field: 'grade' }, String(c.grade), GRADE3))}
        ${cell('함께 입상', selectInput({ list: CL, id: c.id, field: 'people' }, String(c.people), PEOPLE))}
        <span class="rv num" data-out="contestRow:${esc(c.id)}">${this.outs.contestRow(S, R, c.id)}</span>
        ${removeBtn(CL, c.id, '이 입상 실적')}`,
      '아직 넣은 연구대회 입상 실적이 없어요.', '입상 실적 추가');
    const degree = `<div class="form-grid">${cell('학위', selectInput({ path: 'training.degree' }, t.degree, DEGREE_OPTS), 'f-wide')}</div>`;
    return `${head(this, S, R, '연수성적평정')}
      ${card('', o('kpi'), { cls: 'card-kpi' })}
      ${card('1급 정교사 자격연수', qualBody, { id: 'sec-qual', caption: '9 − (100 − 성적) × 0.025로 계산해요. 만점의 8할 미만이거나 성적이 없으면 80점으로 봐요.' })}
      ${card('직무연수', jobList, { id: 'sec-job', caption: `<span data-out="jobWin">${this.outs.jobWin(S, R)}</span>` })}
      ${card('연구실적', `<h3 class="sub-h">연구대회 입상</h3>${contestList}<h3 class="sub-h">학위</h3>${degree}${o('research')}`, { id: 'sec-research', caption: '연구대회 입상과 학위를 합쳐 3점까지예요. 입상은 학년도마다 가장 높은 1회만 들어가요.' })}
      ${card('계산 방법', notes([
        '직무연수 환산성적: 95점 넘으면 100, 90점 넘으면 95, 85점 넘으면 90, 그 밖은 85. 성적이 없으면 80점으로 보고 환산해요.',
        `연구대회 1인 입상: 전국 1등급 ${TRAINING.contest.전국[1]}, 2등급 ${TRAINING.contest.전국[2]}, 3등급 ${TRAINING.contest.전국[3]} / 시·도 1등급 ${TRAINING.contest.시도[1]}, 2등급 ${TRAINING.contest.시도[2]}, 3등급 ${TRAINING.contest.시도[3]}. 함께 입상하면 2명 7할, 3명 5할, 4명 이상 3할이에요.`,
        '연수성적에 쓴 직무연수 3개는 공통가산점의 연수이수학점에 다시 넣을 수 없어요.',
        '2026. 9. 11. 입법예고안은 1정 자격연수 성적을 2029. 12. 31.까지만 반영하는 내용이에요. \'반영하지 않는 경우로 계산\'을 고르면 그 뒤 평정의 점수를 어림해 볼 수 있어요.',
      ]), { cls: 'card-notes' })}`;
  },
};

/* ───────── 가산점: 연구학교 ───────── */
const LAB_TYPES = [['교육감', '교육감 지정'], ['교육장', '교육장 지정'], ['교육부', '교육부 지정']];

const bonusLab = {
  title: '연구학교',
  outs: {
    finding(S, R) {
      const it = R.bonus.items;
      const used = it.labCommon.v + it.labSelect.v;
      const cap = it.labSelect.labCap;
      return `교육부 지정과 교육감·교육장 지정을 합쳐 ${cap.toFixed(2)}점까지예요. 지금 <b class="num">${f4(used)}</b>점이고 ${used >= cap - 1e-6 ? '상한을 채웠어요.' : `${f4(cap - used)}점 남았어요.`}`;
    },
    kpi(S, R) {
      const it = R.bonus.items;
      return kpis([
        { label: '교육부 지정(공통가산점)', v: it.labCommon.v, cap: it.labCommon.cap },
        { label: '교육감·교육장 지정(선택가산점)', v: it.labSelect.v, cap: it.labSelect.cap },
        { label: '연구학교 합계', v: it.labCommon.v + it.labSelect.v, cap: it.labSelect.labCap },
      ]);
    },
    row(S, R, id) {
      return rowPts(ptsOf(R.bonus.items.labSelect.rows, id));
    },
    compare(S, R) {
      const it = R.bonus.items.labSelect;
      if (!it.newLab) return `<p class="calc-line muted">${date(R.evalDate)} 평정은 바뀌기 전 배점(교육감 월 ${LAB.old.교육감[0]}점, 교육장 월 ${LAB.old.교육장[0]}점, 합산 ${LAB.old.cap}점까지)으로 계산해요.</p>`;
      const alt = calculate({ ...S, options: { ...S.options, keepOldLabRates: !S.options.keepOldLabRates } }).bonus.items.labSelect.v;
      const now = it.v;
      const label = S.options.keepOldLabRates ? '모든 기간에 새 배점을 쓰면' : '2027. 2. 28.까지 근무분에 옛 배점을 쓰면';
      return `<p class="calc-line">지금 방식 <b class="num">${f4(now)}</b>점 · ${label} <span class="num">${f4(alt)}</span>점</p>`;
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const L = 'bonus.labs';
    const list = rows('lab', L, S.bonus.labs,
      [{ t: '지정' }, { t: '시작일' }, { t: '끝난 날' }, { t: '학교·주제' }, { t: '점수', num: true }, { t: '' }],
      (p) => `
        ${cell('지정', selectInput({ list: L, id: p.id, field: 'type' }, p.type, LAB_TYPES))}
        ${cell('시작일', dateInput({ list: L, id: p.id, field: 'start' }, p.start))}
        ${cell('끝난 날', dateInput({ list: L, id: p.id, field: 'end' }, p.end))}
        ${cell('학교·주제', textInput({ list: L, id: p.id, field: 'name' }, p.name, { placeholder: '학교, 연구 주제', maxlength: 60 }), 'c-memo')}
        <span class="rv num" data-out="row:${esc(p.id)}">${this.outs.row(S, R, p.id)}</span>
        ${removeBtn(L, p.id, '이 연구학교 기간')}`,
      '아직 넣은 연구학교 근무가 없어요.', '연구학교 기간 추가');
    const optBody = `${toggle({ path: 'options.keepOldLabRates' }, S.options.keepOldLabRates,
      '2027. 2. 28.까지 근무분은 옛 배점으로 계산',
      '처리요령 문구대로라면 2027. 3. 1. 평정부터 지난 근무분까지 새 배점으로 다시 계산해요. 경과 규정이 나오면 켜 보세요.', { rerender: true })}
      ${o('compare')}`;
    return `${head(this, S, R, '연구학교')}
      ${card('', o('kpi'), { cls: 'card-kpi', id: 'sec-moe' })}
      ${card('연구학교 근무 기간', list, { id: 'sec-periods', caption: '같은 기간에 두 연구학교가 겹치면 하나만 인정돼요.' })}
      ${card('배점이 바뀌는 때', optBody, { id: 'sec-change', caption: `2027. 3. 1. 평정부터 교육감 지정은 월 ${LAB.new.교육감[0]}점, 교육장 지정은 월 ${LAB.new.교육장[0]}점, 합산 상한은 ${LAB.new.cap.toFixed(1)}점으로 낮아져요.` })}
      ${card('계산 방법', notes([
        `교육감 지정 ${rate(LAB.old.교육감)}, 교육장 지정 ${rate(LAB.old.교육장)}. 교육부와 합쳐 ${LAB.old.cap}점까지예요(2027. 2. 28. 평정까지).`,
        `2027. 3. 1. 평정부터: 교육감 지정 ${rate(LAB.new.교육감)}, 교육장 지정 ${rate(LAB.new.교육장)}, 합쳐 ${LAB.new.cap.toFixed(1)}점까지.`,
        `교육부 지정 ${rate(COMMON.labMoe.rate)}, ${COMMON.labMoe.cap.toFixed(1)}점까지 공통가산점으로 들어가요.`,
        '교육장 지정은 2002. 3. 1. 이후 근무분부터 세요.',
      ]), { cls: 'card-notes' })}`;
  },
};

/* ───────── 가산점: 공통 ───────── */
const bonusCommon = {
  title: '공통가산점',
  outs: {
    finding(S, R) {
      return `연구학교(교육부 지정), 재외국민교육기관 파견, 연수이수학점, 학교폭력 예방·대응을 합쳐 <b class="num">${f4(R.bonus.common)}</b>점이에요(3.30점까지).`;
    },
    kpi(S, R) {
      const it = R.bonus.items;
      return kpis([
        { label: '연수이수학점', v: it.credit.v, cap: it.credit.cap },
        { label: '학교폭력 예방·대응', v: it.violence.v, cap: it.violence.cap },
        { label: '재외국민교육기관', v: it.abroad.v, cap: it.abroad.cap },
        { label: '연구학교(교육부)', v: it.labCommon.v, cap: it.labCommon.cap },
      ]);
    },
    credit(S, R) {
      const it = R.bonus.items.credit;
      const y4 = Math.max(0, num(S.bonus.credits.years4) || 0);
      const ex = Math.max(0, num(S.bonus.credits.extra) || 0);
      return `<p class="calc-line">${y4}년 × ${COMMON.credit.perYear} + ${ex}학점 × ${COMMON.credit.perCredit} → <b class="num">${f4(it.v)}</b>점 <span class="muted">(${it.cap.toFixed(2)}점까지)</span></p>`;
    },
    violence(S, R) {
      const it = R.bonus.items.violence;
      const y = Math.max(0, num(S.bonus.violence.years) || 0);
      return `<p class="calc-line">${y}년 × ${COMMON.violence.perYear} → <b class="num">${f4(it.v)}</b>점 <span class="muted">(${it.cap.toFixed(2)}점까지)</span></p>`;
    },
    row(S, R, id) {
      return rowPts(ptsOf(R.bonus.items.abroad.rows, id));
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const L = 'bonus.abroad';
    const creditBody = `<div class="form-grid">
        ${cell('4학점(60시간) 이상 이수한 학년도 수', numInput({ path: 'bonus.credits.years4' }, S.bonus.credits.years4, { placeholder: '예: 10' }))}
        ${cell('그 밖의 학년도에 이수한 학점 합계', numInput({ path: 'bonus.credits.extra' }, S.bonus.credits.extra, { placeholder: '학년도마다 4학점까지' }))}
      </div>${o('credit')}`;
    const violenceBody = `<div class="form-grid">
        ${cell('가산점을 받은 학년도 수', numInput({ path: 'bonus.violence.years' }, S.bonus.violence.years, { placeholder: '예: 10' }))}
      </div>${o('violence')}`;
    const abroadList = rows('period', L, S.bonus.abroad,
      [{ t: '시작일' }, { t: '끝난 날' }, { t: '점수', num: true }, { t: '' }],
      (p) => `
        ${cell('시작일', dateInput({ list: L, id: p.id, field: 'start' }, p.start))}
        ${cell('끝난 날', dateInput({ list: L, id: p.id, field: 'end' }, p.end))}
        <span class="rv num" data-out="row:${esc(p.id)}">${this.outs.row(S, R, p.id)}</span>
        ${removeBtn(L, p.id, '이 파견 기간')}`,
      '파견 근무가 없으면 비워 두세요.', '파견 기간 추가');
    return `${head(this, S, R, '공통가산점')}
      ${card('', o('kpi'), { cls: 'card-kpi' })}
      ${card('연수이수학점', creditBody, { id: 'sec-credit', caption: `1학점(15시간)에 ${COMMON.credit.perCredit}점, 학년도마다 ${COMMON.credit.perYear}점까지, 모두 ${COMMON.credit.cap}점까지예요. 연수성적에 쓴 직무연수 3개는 빼고 세요.` })}
      ${card('학교폭력 예방·대응', violenceBody, { id: 'sec-violence', caption: `실적을 인정받은 학년도마다 ${COMMON.violence.perYear}점, ${COMMON.violence.cap.toFixed(1)}점까지예요.` })}
      ${card('재외국민교육기관 파견', abroadList, { id: 'sec-abroad', caption: `${rate(COMMON.abroad.rate)}, ${COMMON.abroad.cap}점까지예요.` })}
      ${card('연구학교(교육부 지정)', '<p class="calc-line">교육부 지정 연구학교 근무는 <a href="#/bonus-lab">연구학교</a> 화면에서 교육감·교육장 지정과 함께 넣어요. 같은 기간이 겹치지 않게 하나만 인정하기 때문이에요.</p>', { id: 'sec-moe' })}`;
  },
};

/* ───────── 가산점: 도서·벽지와 농어촌 ───────── */
const ISLAND_KIND = [['도서', '도서'], ['벽지', '벽지']];
const ISLAND_LV = [['가', '가지'], ['나', '나지'], ['다', '다지'], ['라', '라지']];
const RURAL_KIND = [['농어촌', '농어촌'], ['시지역', '시지역 균형발전']];
const RURAL_LV = [1, 2, 3, 4, 5, 6].map((n) => [String(n), `${n}급지`]);

function ruralNote(p) {
  const lv = Number(p.level) || 1;
  if (!D.isDate(p.start)) return '';
  const end = p.end && D.isDate(p.end) ? p.end : '9999-12-31';
  if (p.kind === '시지역' && lv < 4) return '시지역은 4~6급지만 있어요';
  if (p.kind === '시지역' && p.start < RURAL.seg3Start) return '2026. 3. 1.부터만 세요';
  if (p.kind !== '시지역' && lv > 3 && p.start <= RURAL.seg2End && end >= '2013-03-01') return '2026. 2. 28.까지는 1~3급지로 나눠 넣으세요';
  return '';
}

const bonusArea = {
  title: '도서·벽지와 농어촌',
  outs: {
    finding(S, R) {
      const it = R.bonus.items;
      return `도서·벽지 <b class="num">${f4(it.island.v)}</b>점(${it.island.cap.toFixed(1)}점까지), 농어촌·시지역 <b class="num">${f4(it.rural.v)}</b>점(${it.rural.cap.toFixed(1)}점까지)이에요. 같은 기간이 겹치면 유리한 쪽 하나만 인정돼요.`;
    },
    kpi(S, R) {
      const it = R.bonus.items;
      return kpis([
        { label: '도서·벽지', v: it.island.v, cap: it.island.cap, sub: it.island.raw > it.island.cap ? `계산값 ${it.island.raw.toFixed(4)}` : '' },
        { label: '농어촌·시지역', v: it.rural.v, cap: it.rural.cap, sub: it.rural.raw > it.rural.cap ? `계산값 ${it.rural.raw.toFixed(4)}` : '' },
      ]);
    },
    irow(S, R, id) {
      return rowPts(ptsOf(R.bonus.items.island.rows, id));
    },
    rrow(S, R, id) {
      const p = S.bonus.rural.find((x) => x.id === id);
      const note = p ? ruralNote(p) : '';
      return `${rowPts(ptsOf(R.bonus.items.rural.rows, id))}${note ? `<span class="rv-warn">${esc(note)}</span>` : ''}`;
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const IL = 'bonus.islands';
    const islandList = rows('area', IL, S.bonus.islands,
      [{ t: '구분' }, { t: '급지' }, { t: '시작일' }, { t: '끝난 날' }, { t: '학교' }, { t: '점수', num: true }, { t: '' }],
      (p) => `
        ${cell('구분', selectInput({ list: IL, id: p.id, field: 'kind' }, p.kind, ISLAND_KIND))}
        ${cell('급지', selectInput({ list: IL, id: p.id, field: 'level' }, p.level, ISLAND_LV))}
        ${cell('시작일', dateInput({ list: IL, id: p.id, field: 'start' }, p.start))}
        ${cell('끝난 날', dateInput({ list: IL, id: p.id, field: 'end' }, p.end))}
        ${cell('학교', textInput({ list: IL, id: p.id, field: 'name' }, p.name, { placeholder: '학교 이름', maxlength: 40 }), 'c-memo')}
        <span class="rv num" data-out="irow:${esc(p.id)}">${this.outs.irow(S, R, p.id)}</span>
        ${removeBtn(IL, p.id, '이 도서·벽지 근무')}`,
      '도서·벽지 근무가 없으면 비워 두세요.', '도서·벽지 근무 추가');
    const RL = 'bonus.rural';
    const ruralList = rows('area', RL, S.bonus.rural,
      [{ t: '구분' }, { t: '급지' }, { t: '시작일' }, { t: '끝난 날' }, { t: '학교' }, { t: '점수', num: true }, { t: '' }],
      (p) => `
        ${cell('구분', selectInput({ list: RL, id: p.id, field: 'kind' }, p.kind, RURAL_KIND))}
        ${cell('급지', selectInput({ list: RL, id: p.id, field: 'level' }, String(p.level), RURAL_LV, { number: true }))}
        ${cell('시작일', dateInput({ list: RL, id: p.id, field: 'start' }, p.start))}
        ${cell('끝난 날', dateInput({ list: RL, id: p.id, field: 'end' }, p.end))}
        ${cell('학교', textInput({ list: RL, id: p.id, field: 'name' }, p.name, { placeholder: '학교 이름', maxlength: 40 }), 'c-memo')}
        <span class="rv num" data-out="rrow:${esc(p.id)}">${this.outs.rrow(S, R, p.id)}</span>
        ${removeBtn(RL, p.id, '이 농어촌 근무')}`,
      '농어촌 근무가 없으면 비워 두세요.', '농어촌 근무 추가');
    const isl = ISLAND.rate;
    const s3 = RURAL.seg3Rate;
    return `${head(this, S, R, '도서·벽지와 농어촌')}
      ${card('', o('kpi'), { cls: 'card-kpi' })}
      ${card('도서·벽지 학교', islandList, { id: 'sec-island', caption: '급지는 근무한 때의 도서·벽지 지정 고시를 따라요.' })}
      ${card('농어촌·시지역 학교', ruralList, { id: 'sec-rural', caption: '2026. 3. 1.부터 급지가 1~6급지로 바뀌었어요. 그 전후로 급지가 다르면 기간을 나눠 넣으세요.' })}
      ${card('계산 방법', notes([
        `도서: 가지 월 ${isl.도서.가[0]}, 나지 ${isl.도서.나[0]}, 다지 ${isl.도서.다[0]}, 라지 ${isl.도서.라[0]}점. 벽지: 가지 월 ${isl.벽지.가[0]}, 나지 ${isl.벽지.나[0]}, 다지 ${isl.벽지.다[0]}, 라지 ${isl.벽지.라[0]}점. 모두 ${ISLAND.cap.toFixed(1)}점까지예요.`,
        `농어촌: 2013. 2. 28.까지 급지 없이 월 ${RURAL.seg1Rate[0]}점, 2013. 3. 1.~2026. 2. 28. 1급지 ${RURAL.seg2Rate[1][0]}, 2급지 ${RURAL.seg2Rate[2][0]}, 3급지 ${RURAL.seg2Rate[3][0]}점.`,
        `2026. 3. 1.부터 1급지 월 ${s3[1][0]}, 2급지 ${s3[2][0]}, 3급지 ${s3[3][0]}, 4급지 ${s3[4][0]}, 5급지 ${s3[5][0]}, 6급지 ${s3[6][0]}점이에요.`,
        `농어촌 상한은 2028. 2. 29. 평정까지 ${RURAL.capBefore.toFixed(1)}점, 그 뒤 평정부터 ${RURAL.capAfter.toFixed(1)}점이에요. 시지역 균형발전학교(4~6급지)는 그 안에서 ${RURAL.cityCap.toFixed(1)}점까지예요.`,
      ]), { cls: 'card-notes' })}`;
  },
};

/* ───────── 가산점: 보직교사 ───────── */
const bonusPost = {
  title: '보직교사',
  outs: {
    finding(S, R) {
      const p = R.bonus.items.post;
      const sp = sumSpans(S.bonus.posts, R.evalDate);
      if (!S.bonus.posts.length) return `보직교사 경력은 ${rate(POST.base.rate)}, 1.0점까지 받고 그 뒤 추가경력을 더 받아요.`;
      const full = p.baseFullDate ? ` 기본 1.0점은 ${date(p.baseFullDate)}에 채웠어요.` : '';
      return `보직 ${span(sp)}으로 <b class="num">${f4(p.v)}</b>점이에요.${full}`;
    },
    kpi(S, R) {
      const p = R.bonus.items.post;
      return kpis([
        { label: '기본(1.0점까지)', v: p.base, cap: POST.base.cap },
        { label: '추가경력', v: p.extra, cap: p.extraLimit, capLabel: p.extraLimit.toFixed(4), sub: '1정 자격연수 점수와 합쳐 9점까지' },
        { label: '기타 교육활동으로 넘김', v: Math.min(POST.meokCap, p.overflow), cap: POST.meokCap, sub: '6호 머목' },
      ]);
    },
    row(S, R, id) {
      const p = S.bonus.posts.find((x) => x.id === id);
      const sp = p ? periodSpan(p, R.evalDate) : null;
      return sp ? span(sp) : dash();
    },
    plan(S, R) {
      const p = R.bonus.items.post;
      const a = [];
      if (p.base < POST.base.cap - 1e-6) a.push(`기본 1.0점까지 보직 ${fillText(POST.base.cap - p.base, POST.base.rate)}이 더 필요해요.`);
      else if (p.extra < p.extraLimit - 1e-6) a.push(`추가경력 ${f4(p.extraLimit)}점까지 보직 ${fillText(p.extraLimit - p.extra, POST.extra.rate)}이 더 필요해요.`);
      if (p.extraLimit < POST.extra.cap - 1e-6 && !R.training.excluded) {
        a.push(`1정 자격연수가 ${f3(R.training.qual)}점이라 추가경력은 ${f4(p.extraLimit)}점까지만 보직교사 점수로 들어가고 넘는 몫은 기타 교육활동 머목(0.25점까지)으로 가요.`);
      }
      return a.length ? `<p class="calc-line">${a.join(' ')}</p>` : '<p class="calc-line">보직교사 점수를 다 채웠어요.</p>';
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const L = 'bonus.posts';
    const list = rows('post', L, S.bonus.posts,
      [{ t: '시작일' }, { t: '끝난 날' }, { t: '보직' }, { t: '기간', num: true }, { t: '' }],
      (p) => `
        ${cell('시작일', dateInput({ list: L, id: p.id, field: 'start' }, p.start))}
        ${cell('끝난 날', dateInput({ list: L, id: p.id, field: 'end' }, p.end))}
        ${cell('보직', textInput({ list: L, id: p.id, field: 'name' }, p.name, { placeholder: '예: 연구부장', maxlength: 30 }), 'c-memo')}
        <span class="rv num" data-out="row:${esc(p.id)}">${this.outs.row(S, R, p.id)}</span>
        ${removeBtn(L, p.id, '이 보직 기간')}`,
      '아직 넣은 보직 기간이 없어요.', '보직 기간 추가');
    return `${head(this, S, R, '보직교사')}
      ${card('', o('kpi'), { cls: 'card-kpi' })}
      ${card('보직 기간', `${list}${o('plan')}`, { id: 'sec-periods', caption: '끝난 날을 비우면 기준일까지 계속 맡는 것으로 계산해요.' })}
      ${card('계산 방법', notes([
        `보직교사 경력 ${rate(POST.base.rate)}, ${POST.base.cap.toFixed(1)}점까지예요.`,
        `기본 1.0점을 채운 뒤 2016. 3. 1. 이후 경력은 ${rate(POST.extra.rate)}을 더 받아 ${POST.extra.cap}점까지 쌓여요.`,
        '추가경력은 1정 자격연수 평정점과 합쳐 9점까지만 보직교사 점수에 들어가고 넘는 몫은 기타 교육활동 머목으로 옮겨 0.25점까지 받아요.',
      ]), { cls: 'card-notes' })}`;
  },
};

/* ───────── 가산점: 기타 교육활동(6호) ───────── */
const MOK_LABEL = {
  가: '특별연구교사·수업선도교사', 나: '교과전담·복식·겸임·순회', 다: '사이버가정학습 학급배정반',
  라: '영재교육원·발명교실·외국어체험', 마: '교육실습생 담당', 바: '청소년단체 담당', 아: '현직연구원',
  자: '학급경영 우수교사 표창', 차: '정보활용능력인증서', 타: '전국 규모 대회 입상 지도',
  파: '한센병 환자 자녀 학급', 하: '특수학교·특수학급', 거: '국가기술자격', 더: '학교교육력 증진 유공교원',
  러: '좋은수업 추가 실적', 머: '보직교사 추가경력',
};
const ETC_OPTS = Object.entries(ETC_TYPES).map(([k, t]) => [k, `${t.mok}목 · ${t.label}`]);
const MEDAL_OPTS = [['금', '금상(1등급)'], ['은', '은상(2등급)'], ['동', '동상(3등급)']];
const INFO_OPTS = [['none', '없음'], ['pre', '2008년까지 취득'], ['post', '2009~2013년 취득']];
const CERT_OPTS = [['0.3', '1급(0.3점)'], ['0.2', '2급(0.2점)'], ['0.1', '3급(0.1점)']];

function etcRange(t) {
  const from = t.from ? date(t.from) : '';
  const to = t.to ? date(t.to) : '';
  if (from && to) return `${from}~${to}`;
  if (from) return `${from}부터`;
  return `${to}까지`;
}

const bonusEtc = {
  title: '기타 교육활동',
  outs: {
    finding(S, R) {
      const e = R.bonus.items.etc;
      const n = Object.values(e.mok).filter((v) => v > 0).length;
      if (!n) return '한 목에 0.5점, 모두 합쳐 1.0점까지예요. 해당하는 활동을 넣으면 목별로 계산해요.';
      return `한 목에 0.5점, 모두 합쳐 1.0점까지예요. ${n}개 목에서 <b class="num">${f4(e.v)}</b>점을 받고 있어요.`;
    },
    mok(S, R) {
      const m = R.bonus.items.etc.mok;
      const keys = Object.keys(m).sort((a, b) => Object.keys(MOK_LABEL).indexOf(a) - Object.keys(MOK_LABEL).indexOf(b));
      if (!keys.length) return '<p class="empty-line">아직 받은 목이 없어요. 아래에서 해당하는 활동을 넣어 보세요.</p>';
      const sum = keys.reduce((a, k) => a + m[k], 0);
      return `<div class="tbl-wrap"><table class="tbl mok"><thead><tr><th scope="col">목</th><th scope="col">항목</th><th scope="col" class="num">점수</th><th scope="col" class="num hide-s">한 목 상한</th></tr></thead>
        <tbody>${keys.map((k) => `<tr><th scope="row">${k}목</th><td>${esc(MOK_LABEL[k] || '')}</td><td class="num">${f4(m[k])}</td><td class="num hide-s">${ETC.mokCap.toFixed(2)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row" colspan="2">합계${sum > ETC.cap + 1e-9 ? ' <span class="muted">(1.0점까지)</span>' : ''}</th><td class="num strong">${f4(R.bonus.items.etc.v)}</td><td class="num hide-s">${ETC.cap.toFixed(2)}</td></tr></tfoot></table></div>`;
    },
    prow(S, R, id) {
      const p = S.bonus.etcPeriods.find((x) => x.id === id);
      const v = ptsOf(R.bonus.items.etc.rows, id);
      const t = p && ETC_TYPES[p.type];
      const hint = t ? `<span class="rv-hint">${etcRange(t)}</span>` : '';
      return `${rowPts(v)}${hint}`;
    },
    arow(S, R, id) {
      const a = S.bonus.etcAwards.find((x) => x.id === id);
      if (!a || !Number(a.year)) return dash();
      return f4(ETC.medal[a.medal] || 0);
    },
    carried(S, R) {
      const m = R.bonus.items.etc.mok;
      const gc = R.bonus.items.goodClass;
      const p = R.bonus.items.post;
      return `<ul class="carry">
        <li><span>러목 · 좋은수업 상한을 넘긴 공개수업 ${gc.overflow}회</span><span class="num">${f4(m.러 || 0)}</span><a href="#/bonus-good">좋은수업</a></li>
        <li><span>머목 · 보직교사 추가경력 중 넘친 몫</span><span class="num">${f4(m.머 || 0)}</span><a href="#/bonus-post">보직교사</a></li>
      </ul>${p.overflow > POST.meokCap + 1e-9 ? '<p class="calc-line muted">머목은 0.25점까지만 들어가요.</p>' : ''}`;
    },
    merit(S, R) {
      const y = Math.max(0, num(S.bonus.eduMerit.years) || 0);
      return `<span class="muted">${y}년 × ${ETC.eduMerit.perYear} → ${f4(Math.min(ETC.eduMerit.cap, y * ETC.eduMerit.perYear))}점(${ETC.eduMerit.cap}점까지)</span>`;
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const b = S.bonus;
    const PL = 'bonus.etcPeriods';
    const periodList = rows('etc', PL, b.etcPeriods,
      [{ t: '항목' }, { t: '시작일' }, { t: '끝난 날' }, { t: '점수', num: true }, { t: '' }],
      (p) => `
        ${cell('항목', selectInput({ list: PL, id: p.id, field: 'type' }, p.type, ETC_OPTS), 'c-name')}
        ${cell('시작일', dateInput({ list: PL, id: p.id, field: 'start' }, p.start))}
        ${cell('끝난 날', dateInput({ list: PL, id: p.id, field: 'end' }, p.end))}
        <span class="rv num" data-out="prow:${esc(p.id)}">${this.outs.prow(S, R, p.id)}</span>
        ${removeBtn(PL, p.id, '이 활동 기간')}`,
      '기간으로 받는 활동이 없으면 비워 두세요.', '활동 기간 추가');
    const AL = 'bonus.etcAwards';
    const awardList = rows('award', AL, b.etcAwards,
      [{ t: '학년도' }, { t: '상' }, { t: '점수', num: true }, { t: '' }],
      (a) => `
        ${cell('학년도', numInput({ list: AL, id: a.id, field: 'year' }, a.year, { placeholder: '2019', maxlength: 4 }))}
        ${cell('상', selectInput({ list: AL, id: a.id, field: 'medal' }, a.medal, MEDAL_OPTS))}
        <span class="rv num" data-out="arow:${esc(a.id)}">${this.outs.arow(S, R, a.id)}</span>
        ${removeBtn(AL, a.id, '이 입상 지도 실적')}`,
      '입상 지도 실적이 없으면 비워 두세요.', '입상 지도 추가');
    const CL = 'bonus.certs';
    const certList = rows('cert', CL, b.certs,
      [{ t: '자격' }, { t: '분야' }, { t: '급' }, { t: '' }],
      (c) => `
        ${cell('자격', textInput({ list: CL, id: c.id, field: 'name' }, c.name, { placeholder: '예: 컴퓨터활용능력', maxlength: 40 }), 'c-name')}
        ${cell('분야', textInput({ list: CL, id: c.id, field: 'field' }, c.field, { placeholder: '같은 분야는 같게', maxlength: 30 }))}
        ${cell('급', selectInput({ list: CL, id: c.id, field: 'points' }, String(c.points), CERT_OPTS))}
        ${removeBtn(CL, c.id, '이 자격')}`,
      '국가기술자격이 없으면 비워 두세요.', '자격 추가');
    const flags = `<div class="form-grid">
        <div class="f-wide">${toggle({ path: 'bonus.etcFlags.classMgmt' }, b.etcFlags.classMgmt, '자목 · 학급경영 우수교사 표창', '2009~2011년 표창, 0.25점')}</div>
        ${cell('차목 · 정보활용능력인증서', selectInput({ path: 'bonus.etcFlags.infoCert' }, b.etcFlags.infoCert, INFO_OPTS))}
        <label class="cell"><span class="cl">더목 · 학교교육력 증진 유공교원(해)</span>${numInput({ path: 'bonus.eduMerit.years' }, b.eduMerit.years, { placeholder: '예: 6' })}<span data-out="merit" class="cell-help">${this.outs.merit(S, R)}</span></label>
      </div>`;
    return `${head(this, S, R, '기타 교육활동')}
      ${card('목별 점수', o('mok'), { id: 'sec-mok' })}
      ${card('기간으로 받는 활동(가~하목)', periodList, { id: 'sec-periods', caption: '가~아목은 같은 기간이면 하나만 인정돼요. 항목마다 인정하는 기간이 달라요.' })}
      ${card('전국 규모 대회 입상 지도(타목)', awardList, { id: 'sec-awards', caption: `금상 ${ETC.medal.금}, 은상 ${ETC.medal.은}, 동상 ${ETC.medal.동}점, 학년도마다 가장 높은 1회만 들어가요.` })}
      ${card('표창·인증·유공(자·차·더목)', flags, { id: 'sec-flags' })}
      ${card('국가기술자격(거목)', certList, { id: 'sec-certs', caption: '1급 0.3, 2급 0.2, 3급 0.1점. 다른 분야 자격은 더해서 0.3점까지, 워드·컴퓨터활용능력·문서실무사는 같은 분야라 하나만 들어가요.' })}
      ${card('다른 항목에서 넘어온 점수(러·머목)', o('carried'), { id: 'sec-carried' })}
      ${card('계산 방법', notes([
        '2008. 12. 31. 이전에 받은 점수는 모두 합쳐 0.25점까지만 들어가요.',
        `청소년단체 담당은 2012. 5. 31.까지 월 ${ETC_TYPES.scout.oldRate[0]}점, 그 뒤 월 ${ETC_TYPES.scout.rate[0]}점이에요. 교육실습생 담당은 월 ${ETC_TYPES.practicum.rate[0]}점이에요.`,
        `학교교육력 증진 유공교원은 해마다 ${ETC.eduMerit.perYear}점, ${ETC.eduMerit.cap}점까지예요.`,
      ]), { cls: 'card-notes' })}`;
  },
};

/* ───────── 가산점: 좋은수업 ───────── */
const bonusGood = {
  title: '좋은수업',
  outs: {
    finding(S, R) {
      const g = R.bonus.items.goodClass;
      const n = (num(S.bonus.goodClass.school) || 0) + (num(S.bonus.goodClass.region) || 0);
      return `좋은수업 공개 ${n}회로 <b class="num">${f4(g.v)}</b>점이에요(${g.cap.toFixed(2)}점까지).${g.overflow ? ` 상한을 넘긴 ${g.overflow}회는 기타 교육활동 러목으로 가요.` : ''}`;
    },
    kpi(S, R) {
      const g = R.bonus.items.goodClass;
      const reo = R.bonus.items.etc.mok.러 || 0;
      return kpis([
        { label: '좋은수업', v: g.v, cap: g.cap, sub: g.raw > g.cap ? `계산값 ${g.raw.toFixed(4)}` : '' },
        { label: '러목으로 넘긴 점수', v: reo, cap: ETC.mokCap, sub: `${g.overflow}회 × ${ETC.goodClassExtra}` },
      ]);
    },
    calc(S, R) {
      const s = Math.max(0, num(S.bonus.goodClass.school) || 0);
      const r = Math.max(0, num(S.bonus.goodClass.region) || 0);
      return `<p class="calc-line">${s}회 × ${GOOD_CLASS.school} + ${r}회 × ${GOOD_CLASS.region} = <span class="num">${(s * GOOD_CLASS.school + r * GOOD_CLASS.region).toFixed(4)}</span> → <b class="num">${f4(R.bonus.items.goodClass.v)}</b>점</p>`;
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const g = S.bonus.goodClass;
    const body = `<div class="form-grid">
        ${cell(`교내 공개(회당 ${GOOD_CLASS.school}점)`, numInput({ path: 'bonus.goodClass.school' }, g.school, { placeholder: '횟수' }))}
        ${cell(`시·군·도 단위 공개(회당 ${GOOD_CLASS.region}점)`, numInput({ path: 'bonus.goodClass.region' }, g.region, { placeholder: '횟수' }))}
        ${cell('상한을 채운 뒤 공개한 횟수(모르면 비움)', numInput({ path: 'bonus.goodClass.after' }, g.after, { placeholder: '비우면 비율로 어림' }))}
      </div>${o('calc')}`;
    return `${head(this, S, R, '좋은수업')}
      ${card('', o('kpi'), { cls: 'card-kpi' })}
      ${card('공개수업 횟수', body, { id: 'sec-count', caption: '2012. 6. 1. 이후 좋은수업 실천연구로 인정받은 공개수업을 세요. 해마다 2회까지 인정돼요.' })}
      ${card('계산 방법', notes([
        `교내 공개는 회당 ${GOOD_CLASS.school}점, 시·군·도 단위 공개는 회당 ${GOOD_CLASS.region}점, 모두 ${GOOD_CLASS.cap}점까지예요.`,
        `상한을 넘긴 공개수업은 회당 ${ETC.goodClassExtra}점씩 기타 교육활동 러목에 들어가요. 채운 뒤 횟수를 비워 두면 전체 횟수 가운데 넘친 비율로 어림해요.`,
      ]), { cls: 'card-notes' })}`;
  },
};

/* ───────── 가산점: 전라남도 거주 ───────── */
const RES_KIND = [['전가족', '전 가족 거주'], ['단독', '본인만 거주']];

const bonusHome = {
  title: '전라남도 거주',
  outs: {
    finding(S, R) {
      const h = R.bonus.items.residence;
      return `2012. 6. 1. 이후 거주 기간을 세어 <b class="num">${f4(h.v)}</b>점이에요(${h.cap.toFixed(2)}점까지). ${h.newRes ? '이 기준일엔 구분 없이 월 0.0027점을 써요.' : '이 기준일엔 전 가족과 본인만 거주의 배점이 달라요.'}`;
    },
    kpi(S, R) {
      const h = R.bonus.items.residence;
      const sp = sumSpans((S.bonus.residence || []).map((p) => ({ ...p, start: D.isDate(p.start) ? D.maxDate(p.start, RESIDENCE.from) : p.start })), R.evalDate);
      return kpis([
        { label: '전라남도 거주', v: h.v, cap: h.cap, sub: h.raw > h.cap ? `계산값 ${h.raw.toFixed(4)}` : '' },
        { label: '인정 거주 기간(2012. 6. 1. 이후)', text: span(sp) || '0일', sub: h.newRes ? `구분 없이 ${rate(RESIDENCE.new)}` : '전 가족·본인만 거주 배점이 달라요' },
      ]);
    },
    row(S, R, id) {
      return rowPts(ptsOf(R.bonus.items.residence.rows, id));
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const L = 'bonus.residence';
    const list = rows('home', L, S.bonus.residence,
      [{ t: '구분' }, { t: '시작일' }, { t: '끝난 날' }, { t: '점수', num: true }, { t: '' }],
      (p) => `
        ${cell('구분', selectInput({ list: L, id: p.id, field: 'kind' }, p.kind, RES_KIND))}
        ${cell('시작일', dateInput({ list: L, id: p.id, field: 'start' }, p.start))}
        ${cell('끝난 날', dateInput({ list: L, id: p.id, field: 'end' }, p.end))}
        <span class="rv num" data-out="row:${esc(p.id)}">${this.outs.row(S, R, p.id)}</span>
        ${removeBtn(L, p.id, '이 거주 기간')}`,
      '아직 넣은 거주 기간이 없어요.', '거주 기간 추가');
    return `${head(this, S, R, '전라남도 거주')}
      ${card('', o('kpi'), { cls: 'card-kpi' })}
      ${card('거주 기간', list, { id: 'sec-periods', caption: '주민등록상 전라남도에 산 기간이에요. 2012. 6. 1. 전은 세지 않아요.' })}
      ${card('계산 방법', notes([
        `2027. 2. 28. 평정까지: 전 가족 거주 ${rate(RESIDENCE.old.전가족)}, 본인만 거주 ${rate(RESIDENCE.old.단독)}.`,
        `2027. 3. 1. 평정부터: 구분 없이 ${rate(RESIDENCE.new)}, 2012. 6. 1. 이후 거주 기간 전체에 써요. 모두 ${RESIDENCE.cap}점까지예요.`,
      ]), { cls: 'card-notes' })}`;
  },
};

/* ───────── 설정과 저장 ───────── */
const KH_OPTS = [['', '아직 확인 안 함'], ['true', '갖췄어요'], ['false', '아직 없어요']];

function setRow(title, desc, panel, id = '') {
  return `<section class="set-row"${id ? ` id="${id}"` : ''}>
    <div class="set-label"><h2>${esc(title)}</h2><p>${desc}</p></div>
    <div class="set-panel">${panel}</div>
  </section>`;
}

const settings = {
  title: '설정과 저장',
  outs: {
    finding(S, R) {
      return `평정 자료는 이 브라우저에만 저장돼요. 지금은 ${date(R.evalDate)} 평정 기준으로 보고 있어요.`;
    },
    stampLine() {
      return stampText();
    },
  },
  render(S, R) {
    const o = (k, opt) => slot(this, k, S, R, opt);
    const evalOpts = EVAL_DATES.map((d) => [d, evalLabel(d)]);
    const kh = S.requirements.koreanHistory === null ? '' : String(S.requirements.koreanHistory);
    return `${head(this, S, R, '설정과 저장')}
      <div class="settings">
      ${setRow('평정 기준일', '순위명부를 만드는 날이에요. 끝난 날을 비워 둔 근무는 이날까지 이어진다고 보고 계산해요.',
        `<div class="form-grid">${cell('평정 기준일', selectInput({ path: 'evalDate' }, S.evalDate, evalOpts))}</div>`)}
      ${setRow('계산 가정', '규정이 바뀌는 대목과 앞날 어림을 고를 수 있어요.',
        `${toggle({ path: 'options.perfFillForward' }, S.options.perfFillForward !== false, '앞으로 받을 근평은 최근 점수로 어림', '마지막으로 넣은 해 뒤의 빈 해를 그 점수로 채워 계산해요.', { rerender: true })}
         ${toggle({ path: 'options.keepOldLabRates' }, S.options.keepOldLabRates, '연구학교 옛 배점 유지', '2027. 3. 1. 평정 뒤에도 2027. 2. 28.까지 근무분은 옛 배점으로 계산해요.', { rerender: true })}
         <p class="calc-line muted">1정 자격연수 성적을 빼고 계산해 보려면 <a href="#/training/qual">연수성적평정</a>에서 고르세요.</p>`)}
      ${setRow('응시 요건', '한국사능력검정 3급 이상이나 한국사 연수 60시간 이상이 있어야 순위명부에 올라요.',
        `<div class="form-grid">${cell('한국사 요건', selectInput({ path: 'requirements.koreanHistory' }, kh, KH_OPTS, { rerender: true }))}</div>`)}
      ${setRow('자료 옮기기', '다른 기기나 브라우저로 옮길 때는 파일로 내보낸 뒤 그곳에서 불러오세요. 파일에는 넣은 자료가 모두 들어 있으니 공유할 때 조심하세요.',
        `<div class="btns"><button type="button" class="btn btn-primary" data-action="export">파일로 내보내기</button>
         <button type="button" class="btn" data-action="import">파일 불러오기</button></div>
         <p class="calc-line muted" data-out="stampLine">${stampText()}</p>`)}
      ${setRow('예시 자료', '가상의 교사 자료로 화면을 둘러볼 수 있어요. 지금 넣은 자료는 예시로 바뀌어요.',
        '<div class="btns"><button type="button" class="btn" data-action="sample">예시 자료 불러오기</button></div>')}
      ${setRow('모두 지우기', '이 브라우저에 저장한 평정 자료를 모두 지워요. 지운 자료는 되살릴 수 없어요.',
        '<div class="btns"><button type="button" class="btn btn-danger" data-action="reset">평정 자료 모두 지우기</button></div>')}
      </div>`;
  },
};

let lastSaved = null;
export function setSavedAt(d) { lastSaved = d; }
export function stampText() {
  if (lastSaved === false) return '저장하지 못했어요. 브라우저 저장 공간을 쓸 수 없는 상태예요.';
  if (!lastSaved) return '아직 저장한 기록이 없어요.';
  const t = lastSaved.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  return `이 브라우저에 저장됨 · ${t}`;
}

/* ───────── 근거와 안내 ───────── */
const about = {
  title: '근거와 안내',
  outs: {
    finding() {
      return `${RULESET_LABEL}으로 계산해요. 실제 평정은 학교와 교육지원청이 확인한 서류로 정해져요.`;
    },
  },
  render(S, R) {
    return `${head(this, S, R, '근거와 안내')}
      ${card('이 계산기가 하는 일', `<div class="prose">
        <p>전라남도 유·초등 교사가 교감 자격연수 대상자 순위명부에 오를 때 받는 점수를 항목별로 계산해요. 경력평정 70점, 근무성적평정 100점, 연수성적평정 30점에 가산점을 더해요.</p>
        <p>평정 기준일을 2032년까지 바꿔 보면 끝난 날을 비워 둔 근무가 그 기준일까지 이어진다고 보고 계산하므로 몇 년 뒤 점수를 미리 볼 수 있어요.</p>
        <p>중등 교사 평정(학급담임 경력 등)은 아직 넣지 않았어요.</p>
      </div>`)}
      ${card('근거 규정', notes([
        '2026. 전라남도교육공무원 승진후보자 평정업무 처리요령(유·초등)',
        '전라남도 교육공무원 승진후보자 명부작성에 따른 가산점 산정규정(교육훈령 제253호)과 별표',
        '교육공무원 승진규정(2026. 6. 16. 시행), 교원 등의 연수에 관한 규정 시행규칙 제4조',
      ]))}
      ${card('바뀌는 규정', notes([
        `2027. 3. 1. 평정부터 연구학교 배점이 내려가요: 교육감 지정 월 ${LAB.old.교육감[0]} → ${LAB.new.교육감[0]}점, 교육장 지정 월 ${LAB.old.교육장[0]} → ${LAB.new.교육장[0]}점, 합산 상한 ${LAB.old.cap} → ${LAB.new.cap.toFixed(1)}점.`,
        `같은 때부터 전라남도 거주는 구분 없이 월 ${RESIDENCE.new[0]}점이 돼요.`,
        `2028. 2. 29. 평정 뒤부터 농어촌 상한이 ${RURAL.capBefore.toFixed(1)}점에서 ${RURAL.capAfter.toFixed(1)}점으로 올라가요.`,
        '1정 자격연수 성적을 2029. 12. 31.까지만 반영하는 개정이 입법예고됐어요(2026. 9. 11.). 확정되면 연수성적평정 계산이 달라질 수 있어요.',
      ]))}
      ${card('알아 두실 점', notes([
        '이 계산기는 공식 프로그램이 아니에요. 점수는 참고용이고 실제 점수는 해마다 나오는 처리요령과 교육청 확인 결과를 따라요.',
        '첫 화면의 예상 컷트라인은 공개된 자료 없이 규정의 만점 구조로 어림한 값이에요. 실제 컷과 다를 수 있어요.',
        '입력한 자료는 이 브라우저 저장소에만 남고 어디로도 보내지 않아요. 공용 컴퓨터라면 다 본 뒤 설정에서 지워 주세요.',
        '기간은 처리요령처럼 개월과 일로 나눠 세어요. 가산점은 소수 넷째 자리까지 보여 줘요.',
      ]))}`;
  },
};

export const VIEWS = {
  overview, career, perf, training,
  'bonus-lab': bonusLab, 'bonus-common': bonusCommon, 'bonus-area': bonusArea,
  'bonus-post': bonusPost, 'bonus-etc': bonusEtc, 'bonus-good': bonusGood, 'bonus-home': bonusHome,
  settings, about,
};

// 평정 규칙 표. 근거: 「2026. 전라남도교육공무원 승진후보자 평정업무 처리요령(유·초등)」,
// 「전라남도 교육공무원 승진후보자 명부작성에 따른 가산점 산정규정」(교육훈령 제253호),
// 「교육공무원 승진규정」(2026. 6. 16. 시행), 「교원 등의 연수에 관한 규정 시행규칙」 제4조.
// 배점은 [월, 일] 순서다.

export const RULESET_LABEL = '2026 전남 처리요령(유·초등) 기준';

// 고를 수 있는 평정 기준일
export const EVAL_DATES = ['2027-02-28', '2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'];

// 경력평정(승진규정 제8~12조, 별표 2): 기준일부터 거슬러 15년(기본)과 그 앞 5년(초과)
export const CAREER = {
  baseMonths: 180,
  extraMonths: 60,
  base: { 가: { rate: [0.3555, 0.0118], max: 64 }, 나: { rate: [0.3333, 0.0111], max: 60 }, 다: { rate: [0.3111, 0.0103], max: 56 } },
  extra: { 가: { rate: [0.1, 0.0033], max: 6 }, 나: { rate: [0.0833, 0.0027], max: 5 }, 다: { rate: [0.0666, 0.0022], max: 4 } },
  max: 70,
};

// 근무성적평정(승진규정 제40조): 5년 가운데 유리한 3년, 가장 가까운 해 34%, 나머지 33%
export const PERF = { years: 5, pick: 3, weights: [0.34, 0.33, 0.33], max: 100 };

// 연수성적평정(승진규정 제32~37조, 연수규정 시행규칙 제4조)
export const TRAINING = {
  qualMax: 9, // 1급 정교사 자격연수: 9 - (100 - 성적) x 0.025
  qualFactor: 0.025,
  jobPerCourse: 6, // 성적 1회 + 이수 실적 2회
  jobMax: 18,
  jobMinHours: 60,
  jobConvert: [ // 직무연수 성적 → 환산성적
    { over: 95, value: 100 },
    { over: 90, value: 95 },
    { over: 85, value: 90 },
    { over: -1, value: 85 },
  ],
  researchMax: 3,
  contest: { // 연구대회 1인 입상 점수
    전국: { 1: 1.5, 2: 1.25, 3: 1.0 },
    시도: { 1: 1.0, 2: 0.75, 3: 0.5 },
  },
  coauthor: { 1: 1, 2: 0.7, 3: 0.5, 4: 0.3 }, // 공동 입상: 2인 7할, 3인 5할, 4인 이상 3할
  degree: { none: 0, 'ms-job': 1.5, 'ms-other': 1.0, 'phd-job': 3.0, 'phd-other': 1.5 },
  max: 30,
};

// 공통가산점(승진규정 제41조 제3항, 산정규정 제2조)
export const COMMON = {
  labMoe: { rate: [0.018, 0.0006], cap: 1.0 }, // 교육부장관 지정 연구학교
  abroad: { rate: [0.015, 0.0005], cap: 0.5 }, // 재외국민교육기관 파견
  credit: { perCredit: 0.02, perYear: 0.08, cap: 0.8 }, // 연수이수학점(1학점=15시간)
  violence: { perYear: 0.1, cap: 1.0 }, // 학교폭력 예방·대응
  max: 3.3,
};

// 선택가산점 1호: 도서·벽지
export const ISLAND = {
  rate: {
    도서: { 가: [0.167, 0.0056], 나: [0.125, 0.0042], 다: [0.084, 0.0028], 라: [0.063, 0.0021] },
    벽지: { 가: [0.084, 0.0028], 나: [0.063, 0.0021], 다: [0.05, 0.0017], 라: [0.042, 0.0014] },
  },
  cap: 3.0,
};

// 선택가산점 2호: 농어촌교육진흥학교·시(市)지역균형발전학교(유·초등, 2026. 3. 1. 시행 조문)
export const RURAL = {
  start: '1995-01-01',
  seg1End: '2013-02-28',
  seg1Rate: [0.0119, 0.0004],
  seg2End: '2026-02-28',
  seg2Rate: { 1: [0.012, 0.0004], 2: [0.008, 0.00027], 3: [0.006, 0.0002] },
  seg3Start: '2026-03-01',
  seg3Rate: { 1: [0.0114, 0.00038], 2: [0.0105, 0.00035], 3: [0.0097, 0.00032], 4: [0.0079, 0.00026], 5: [0.0063, 0.00021], 6: [0.0053, 0.00018] },
  capChangeAfter: '2028-02-29', // 이 날 평정까지 1.0, 그 뒤 평정부터 1.5
  capBefore: 1.0,
  capAfter: 1.5,
  cityCap: 1.0,
};

// 선택가산점 3호: 보직교사(초등)
export const POST = {
  base: { rate: [0.012, 0.0004], cap: 1.0 },
  extra: { rate: [0.003, 0.0001], cap: 0.25, from: '2016-03-01' },
  qualLimit: 9, // 추가경력점은 1정 자격연수 평정점과 합쳐 9점까지만 3호에, 나머지는 6호 머목
  meokCap: 0.25,
};

// 선택가산점 4호 + 공통 1호: 연구학교(2027. 3. 1. 평정부터 배점·상한 하향)
export const LAB = {
  changeDate: '2027-03-01',
  old: { 교육감: [0.0167, 0.00056], 교육장: [0.0139, 0.00047], cap: 1.25 },
  new: { 교육감: [0.0144, 0.00048], 교육장: [0.012, 0.0004], cap: 1.0 },
  moeFrom: null,
  educhiefFrom: '1973-01-01',
  districtFrom: '2002-03-01',
};

// 선택가산점 6호: 기타 교육활동·전문성 신장(전체 1.0, 한 목 0.5)
export const ETC_TYPES = {
  special: { mok: '가', label: '특별연구교사·(좋은)수업선도교사', from: '2002-03-01', to: '2012-05-31', rate: [0.0105, 0.00035] },
  subject: { mok: '나', label: '교과전담 교사(초등)', from: '2009-01-01', to: '2012-02-29', rate: [0.0105, 0.00035] },
  multigrade: { mok: '나', label: '복식학급 담당', from: '2009-01-01', to: null, rate: [0.0105, 0.00035] },
  itinerant: { mok: '나', label: '겸임·순회교사', from: '2009-01-01', to: null, rate: [0.0105, 0.00035] },
  cyber: { mok: '다', label: '사이버가정학습·전남e학습터 학급배정반 운영', from: '2009-01-01', to: null, rate: [0.0105, 0.00035] },
  gifted: { mok: '라', label: '영재교육원 전담', from: '2005-03-01', to: null, rate: [0.0105, 0.00035] },
  invention: { mok: '라', label: '발명교실·영어(외국어체험)타운 전담', from: '2009-01-01', to: null, rate: [0.0105, 0.00035] },
  practicum: { mok: '마', label: '교육실습생 담당(2명 이상)', from: '2005-03-01', to: null, rate: [0.0315, 0.00105] },
  scout: { mok: '바', label: '청소년단체 담당', from: '2005-03-01', to: null, rate: [0.0053, 0.000177], oldUntil: '2012-05-31', oldRate: [0.0105, 0.00035] },
  researcher: { mok: '아', label: '현직연구원', from: '2009-01-01', to: null, rate: [0.0105, 0.00035] },
  leprosy: { mok: '파', label: '한센병 환자 자녀 수용학교·학급 담임', from: null, to: '2008-12-31', rate: [0.0084, 0.00028] },
  specialSchool: { mok: '하', label: '특수학교 근무', from: null, to: '2008-02-29', rate: [0.0084, 0.00028] },
  specialClass: { mok: '하', label: '특수학급 담당', from: null, to: '2008-02-29', rate: [0.0042, 0.00014] },
  inclusiveClass: { mok: '하', label: '통합교육학급 담당', from: null, to: '2008-02-29', rate: [0.0021, 0.00007] },
};

export const ETC = {
  cap: 1.0,
  mokCap: 0.5,
  pre2009Cap: 0.25, // 2008. 12. 31. 이전에 받은 점수는 0.25점까지
  medal: { 금: 0.25, 은: 0.1875, 동: 0.125 }, // 타목 전국대회 입상 지도(연 1회)
  classMgmt: 0.25, // 자목 학급경영 우수교사 표창(2009~2011)
  infoCert: 0.25, // 차목 정보활용능력인증서(1998~2013 취득)
  certCap: 0.3, // 거목 국가기술자격
  eduMerit: { perYear: 0.036, cap: 0.2 }, // 더목 학교교육력 증진 유공교원
  goodClassExtra: 0.02, // 러목 좋은수업 추가 실적(1회)
};

// 선택가산점 7호: 좋은수업 실천연구(2012. 6. 1. 이후)
export const GOOD_CLASS = { school: 0.06, region: 0.08, perYear: 2, cap: 1.5 };

// 선택가산점 8호: 전라남도 거주(2012. 6. 1.부터)
export const RESIDENCE = {
  from: '2012-06-01',
  changeDate: '2027-03-01',
  old: { 단독: [0.0016, 0.000053], 전가족: [0.0025, 0.000083] },
  new: [0.0027, 0.00009],
  cap: 0.5,
};

// 날짜별 상한
export function selectiveMax(evalDate) {
  const ruralCap = evalDate > RURAL.capChangeAfter ? RURAL.capAfter : RURAL.capBefore;
  const labCap = evalDate >= LAB.changeDate ? LAB.new.cap : LAB.old.cap;
  return { ruralCap, labCap };
}

// 연구학교 합산 상한을 반영한 가산점 실제 최대
export function bonusMax(evalDate) {
  const { ruralCap, labCap } = selectiveMax(evalDate);
  return +(labCap + COMMON.abroad.cap + COMMON.credit.cap + COMMON.violence.cap
    + ISLAND.cap + ruralCap + POST.base.cap + POST.extra.cap + ETC.cap + GOOD_CLASS.cap + RESIDENCE.cap).toFixed(3);
}

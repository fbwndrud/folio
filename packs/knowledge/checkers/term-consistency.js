import { fencedRanges, maskRanges } from '../../../core/util/fences.js';
import { namesOf, workEntities } from './definitions.js';

const nfc = (text) => text.normalize('NFC');

/**
 * text 에서 term 이 나온 곳을 모두 찾는다(앞에서부터). [start, end) 목록.
 * overlapping 이면 겹쳐 나온 곳도 모두 찾는다(이름 자리: "가나가나가" 속 "가나가" 둘 — N1 미룬 minor ABA 겹침).
 * avoid 표기의 횟수는 겹치지 않게 센다(지적 메시지의 "n번").
 * @returns {Array<[number, number]>}
 */
function occurrencesOf(text, term, { overlapping = false } = {}) {
  /** @type {Array<[number, number]>} */
  const spans = [];
  const step = overlapping ? 1 : term.length;
  for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + step)) {
    spans.push([at, at + term.length]);
  }
  return spans;
}

/**
 * 자리 목록 안에 완전히 들어가는지 묻는 함수를 만든다. 시작 순으로 정렬하고 앞에서부터의 끝 최댓값을 두어 이분 탐색한다:
 * [a, b) 가 어떤 [s, e) 안에 드는 것은 s ≤ a 인 자리들의 끝 최댓값이 b 이상인 것과 같다. O(log n) — N1 미룬 minor O(n·m) 성능.
 * @param {Array<[number, number]>} spans
 * @returns {(span: [number, number]) => boolean}
 */
export function containmentIndex(spans) {
  const sorted = [...spans].sort((x, y) => x[0] - y[0]);
  const maxEnd = [];
  let max = -Infinity;
  for (const [, end] of sorted) { max = Math.max(max, end); maxEnd.push(max); }
  return ([start, end]) => {
    let lo = 0;
    let hi = sorted.length - 1;
    let at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid][0] <= start) { at = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return at >= 0 && maxEnd[at] >= end;
  };
}

/** 작품에 나오는 모든 엔티티의 이름·별칭(다듬고 NFC, 중복 없이). "다른 엔티티" 판정의 기준값. */
const allNamesOf = (entities) => new Set(entities.flatMap((entity) => namesOf(entity).map(nfc)));

/**
 * 엔티티의 avoid 표기(쓰지 않기로 한 표기)를 다듬어 쓸 수 있는 것과 잘못된 것으로 나눈다.
 * - `data.avoid` 가 있는데 배열이 아니면 그 값 전체가 잘못된 항목 하나다.
 * - 배열 안 문자열이 아닌 값(숫자·null·객체 등)은 잘못된 항목이다.
 * - 다듬어 빈 문자열(빈 문자열·공백만)은 조용히 무시한다(잘못이 아니다 — 계획 테스트).
 * - NUL(\u0000)이 든 표기는 잘못된 항목이다 — 코드 블록 가림이 NUL 로 채우므로 가린 자리에 거짓으로 맞는다(N1 미룬 minor).
 * - 다듬고 NFC 로 맞춘 뒤 (자기 자신이든 다른 엔티티든) 작품 어떤 엔티티의 이름·별칭과 같으면 잘못된 항목이다
 *   (설정이 자기 모순이거나 — 결정 3 — 그 표기가 다른 엔티티의 정식 이름이라 이름 스캔이 항상 가려 이 검사가 영원히
 *   조용해지기 때문이다 — Review Round 2 Minor 3, final-review.md).
 * - 남은 표기는 다듬고 NFC 로 맞춰 중복 없이 모은다(앞뒤 공백만 다른 값은 하나로 합친다).
 */
function avoidOf(entity, allNames) {
  const raw = entity?.data?.avoid;
  if (raw === undefined) return { forms: [], invalid: [] };
  if (!Array.isArray(raw)) return { forms: [], invalid: [String(raw)] };
  const forms = new Set();
  const invalid = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      invalid.push(String(item));
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    const form = nfc(trimmed);
    if (allNames.has(form) || form.includes('\u0000')) {
      invalid.push(form);
      continue;
    }
    forms.add(form);
  }
  return { forms: [...forms], invalid };
}

/**
 * 용어 통일(knowledge.term-consistency). 원고 본문에 엔티티의 avoid 표기(쓰지 않기로 한 표기)가 있으면 그 표기를 인용해 지적한다.
 * `data.avoid` 가 배열이 아니거나 문자열 아닌 값을 담거나 자기 이름·별칭과 같은 표기를 담으면 `TERM_AVOID_INVALID` 로 알린다.
 * - 코드 블록(``` ~~~ 울타리, core/util/fences.js) 안은 보지 않는다. 닫히지 않은 울타리는 글 끝까지 코드 블록이다(M4 A2 와 같은 규칙).
 * - avoid 표기가 나온 자리가 (작품의 어떤 엔티티든) 이름·별칭이 나온 자리에 완전히 들어가면 세지 않는다 — 결정 7의 취지는
 *   "이름 **안에 든** avoid 표기는 쓴 것으로 안 친다"이다. 이름·별칭을 먼저 원고에서 지우는 방식은 avoid 표기가 짧은 별칭을
 *   품을 때(예: 별칭 "막", avoid "세포 막") 반대 방향까지 지워 버려 쓰지 않기로 한 표기 자체를 놓친다 — 그래서 위치가 완전히
 *   들어가는지만 본다(포함 관계, 가림이 아니다).
 * - 순서와 무관하다(requiresOrder 없음). 작품의 모든 엔티티를 본다 — 피할 표기는 이름 스캔에 걸리지 않으니 범위로 좁힐 수 없다.
 * - 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다.
 * - ctx.work 가 없으면 던진다(workEntities — 코어가 CHECK_CRASHED 로 알린다).
 * @param {{ draft?: string, work?: { entities: Map<string, any> } }} ctx
 */
export function termConsistency(ctx) {
  const entities = [...workEntities(ctx).values()];
  const text = typeof ctx.draft === 'string' ? nfc(ctx.draft) : '';
  const prose = maskRanges(text, fencedRanges(text));

  const allNames = allNamesOf(entities);
  // 작품의 모든 avoid 표기를 수집한다. 이름이 avoid 표기를 완전히 가려 주려면 이름 문자열이 그 표기를 포함해야 한다.
  const avoidForms = [...new Set(entities.flatMap((e) => avoidOf(e, allNames).forms))];
  // 이름 자리는 겹치는 것까지 한 번만 모으고(같은 이름은 한 번), 같은 avoid 표기의 횟수도 한 번만 센다(병적 입력에서 엔티티 수만큼 되풀이하지 않는다).
  // avoid 표기가 하나도 없으면 이름 위치 스캔을 건너뛴다. 있어도, avoid 표기를 포함한 이름만 인덱싱한다(avoid 표기를 가릴 수 있는 이름만).
  const insideName = containmentIndex(
    avoidForms.length === 0 ? [] : [...allNames]
      .filter((name) => avoidForms.some((form) => name.includes(form)))
      .flatMap((name) => occurrencesOf(prose, name, { overlapping: true }))
  );
  const counted = new Map();
  const timesOf = (form) => {
    if (!counted.has(form)) counted.set(form, occurrencesOf(prose, form).filter((span) => !insideName(span)).length);
    return counted.get(form);
  };

  const findings = [];
  for (const entity of entities) {
    const { forms, invalid } = avoidOf(entity, allNames);
    for (const quote of invalid) {
      findings.push({
        code: 'TERM_AVOID_INVALID', entityId: entity.id, quote,
        message: `${entity.name}(${entity.id}): 쓰지 않을 표기 설정이 올바르지 않다 — "${quote}"`,
      });
    }
    for (const form of forms) {
      const times = timesOf(form);
      if (times === 0) continue;
      findings.push({
        code: 'TERM_AVOIDED', entityId: entity.id, quote: form,
        message: `${entity.name}(${entity.id}): 쓰지 않기로 한 표기 "${form}"이(가) ${times}번 나온다. "${entity.name}"(으)로 통일한다`,
      });
    }
  }
  return findings;
}

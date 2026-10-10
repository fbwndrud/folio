/**
 * 시점 누설(novel.pov). 1인칭·제한 3인칭 원고에서 서술(대사 밖)이 화자 아닌 인물의 속마음을 사실로 말하면 POV_VIOLATION 으로 알린다.
 *   - 감정: "<이름><조사?> <감정 동사>" — 예: "서진은 슬펐다"
 *   - 내면: "<이름><조사?> …(20자 안)… 속으로/마음속/내심/머릿속으로/생각했다/느꼈다/깨달았다/여겼다/믿었다"
 * vibelore engine/src/continuity/pov-check.js(checkPov) 와 pov-narrator.js(resolveNarrator) 의 뜻을 옮김.
 * - 화자는 data.narrator === true 인 character 엔티티다. 화자가 없으면 보지 않는다(vibelore 가 narratorId 없이 건너뛰는 것과 같다).
 *   화자가 여럿이면(다중 시점) 이 노드에 등장한 화자가 딱 하나일 때만 그 인물로 보고, 아니면 보지 않는다.
 * - 같은 인물·같은 종류(감정/내면)로 이미 알린 자리와 겹치는 일치는 다시 알리지 않는다(vibelore 는 시작 위치만 같을 때 걸렀다).
 * - 대사(따옴표 안)는 보지 않는다 — 인물이 남의 기분을 짐작해 말하는 건 누설이 아니다.
 * - vibelore 는 hard 였지만 여기서는 pack.yaml 이 advisory 로 선언한다(휴리스틱이라 오탐이 있다). 지적에 severity 를 적지 않는다.
 * - 조사·감정 동사 사전·내면 표지가 모두 한국어 전용이다.
 */
import { EMOTION_VERBS } from '../lexicons/emotion-verbs.js';
import { draftText } from './text/style-prose.js';
import { stripDialogue } from './text/strip-dialogue.js';

const NAME_TAIL_PARTICLES = '(?:는|은|이|가|도|만|께서|께서는)?';
const INTERIOR_MARKERS = Object.freeze(['속으로', '마음속', '내심', '머릿속으로']);
const THOUGHT_VERBS = Object.freeze(['생각했다', '느꼈다', '깨달았다', '여겼다', '믿었다']);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 엔티티의 이름·별칭(다듬고 NFC, 빈 값 제외). */
const namesOf = (entity) => [entity.name, ...(Array.isArray(entity.aliases) ? entity.aliases : [])]
  .filter((n) => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim().normalize('NFC'));

/** 이 노드의 화자. 화자 표시가 하나면 그 인물, 여럿이면 이 노드에 등장한 화자가 하나일 때만 그 인물. 아니면 null. */
function narratorOf(characters, appearances) {
  const narrators = characters.filter((c) => c.data?.narrator === true);
  if (narrators.length === 1) return narrators[0];
  const onStage = narrators.filter((c) => appearances.includes(c.id));
  return onStage.length === 1 ? onStage[0] : null;
}

/**
 * @param {{ draft?: string, appearances?: string[], work?: { entities?: Map<string, any> } }} ctx
 */
export function pov(ctx) {
  const characters = [...(ctx.work?.entities?.values() ?? [])].filter((e) => e?.kind === 'character');
  const narrator = narratorOf(characters, ctx.appearances ?? []);
  if (!narrator) return [];
  const text = draftText(ctx);
  if (text.length === 0) return [];
  const narratorNames = new Set(namesOf(narrator));
  const others = new Map();
  for (const c of characters) {
    if (c.id === narrator.id) continue;
    for (const name of namesOf(c)) if (!narratorNames.has(name)) others.set(name, c);
  }
  const narrative = stripDialogue(text);
  const spans = new Map();
  const findings = [];
  /** 같은 인물·같은 종류로 이미 알린 자리와 겹치면 true, 아니면 그 자리를 기억한다(별칭이 이름 안에 든 경우 — 예: "나"와 "하나"). */
  const overlapsReported = (key, start, end) => {
    const list = spans.get(key) ?? [];
    if (list.some(([s, e]) => start < e && s < end)) return true;
    spans.set(key, [...list, [start, end]]);
    return false;
  };
  const scan = (name, other, pattern, kind, what) => {
    const re = new RegExp(`${escapeRegex(name)}${NAME_TAIL_PARTICLES}${pattern}`, 'g');
    for (const m of narrative.matchAll(re)) {
      if (overlapsReported(`${other.id}:${kind}`, m.index, m.index + m[0].length)) continue;
      findings.push({
        code: 'POV_VIOLATION', entityId: other.id, quote: text.slice(m.index, m.index + m[0].length).trim(),
        message: `화자 ${narrator.name}(${narrator.id})의 시점인데 서술이 ${name}의 ${what}을(를) 사실로 말한다(시점 누설). 행동·표정으로 보여 주거나 화자의 짐작으로 바꾼다`,
      });
    }
  };
  // 긴 이름부터 본다 — 이름 안에 든 짧은 별칭보다 온전한 이름이 인용으로 남는다.
  for (const [name, other] of [...others].sort((a, b) => b[0].length - a[0].length)) {
    for (const verb of EMOTION_VERBS) scan(name, other, `\\s*${escapeRegex(verb)}`, 'emotion', `감정 '${verb}'`);
    for (const marker of [...INTERIOR_MARKERS, ...THOUGHT_VERBS]) {
      scan(name, other, `\\s*[^.!?。…\\n]{0,20}${escapeRegex(marker)}`, 'interior', `내면(${marker})`);
    }
  }
  return findings;
}

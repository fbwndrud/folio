/**
 * 파괴된 물건(novel.destroyed-object). 앞 노드의 state 사건으로 파괴된(exists: destroyed) 엔티티를 이 원고가 다시 다루면 지적한다.
 * vibelore engine/src/continuity/ledger.js 의 뜻을 옮김(LEDGER_UPDATE_AFTER_DESTROY·LEDGER_RESTORE_NOTE_REQUIRED·DESTROYED_ENTITY_MENTION).
 * - 뒤에 되돌려졌거나(exists: restored) 이 원고가 원고에 그대로 있는 인용과 함께 되돌리면 지적하지 않는다.
 * - 인용 없는 되돌림은 인정하지 않는다(RESTORE_NOTE_MISSING). 추출 한 줄로 파괴 기록이 지워지면 안 된다.
 * - exists 값은 앞뒤 공백을 떼고 소문자로 본다. destroyed/restored 가 아닌 값은 EXISTS_UNKNOWN 으로 작가에게 묻는다.
 * - 실험 검사라 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ priorEvents?: any[], draftEvents?: any[], appearances?: string[], entityIds?: string[], draft?: string,
 *   work?: { entities: Map<string, any> } }} ctx
 */
export function destroyedObject(ctx) {
  const draft = typeof ctx.draft === 'string' ? ctx.draft : '';
  const appearances = ctx.appearances ?? [];
  const draftEvents = ctx.draftEvents ?? [];
  const inScope = new Set([...appearances, ...(ctx.entityIds ?? []), ...draftEvents.map((e) => e.entityId)]);
  const findings = [];
  const unknown = new Set();
  // vibelore: LEDGER_INVALID_STATUS(뜻 모를 상태 값)에 해당한다.
  const flagUnknown = (event, raw) => {
    const key = `${event.entityId}\0${raw}`;
    if (unknown.has(key)) return;
    unknown.add(key);
    findings.push({
      code: 'EXISTS_UNKNOWN', entityId: event.entityId,
      message: `${event.entityId}: 존재 값 "${raw}"을(를) 알 수 없다(destroyed 또는 restored). 작가가 정해야 한다`,
    });
  };

  const destroyed = new Set();
  for (const event of ctx.priorEvents ?? []) {
    const exists = existsOf(event);
    if (exists === null) continue;
    if (exists === 'destroyed') destroyed.add(event.entityId);
    else if (exists === 'restored') destroyed.delete(event.entityId);
    else if (inScope.has(event.entityId)) flagUnknown(event, rawExists(event));
  }
  const restored = new Set();
  for (const event of draftEvents) {
    const exists = existsOf(event);
    if (exists === null || exists === 'destroyed') continue;
    if (exists !== 'restored') { flagUnknown(event, rawExists(event)); continue; }
    if (!destroyed.has(event.entityId)) continue;
    if (quotedInDraft(event.quote, draft)) { restored.add(event.entityId); continue; }
    // vibelore: LEDGER_RESTORE_NOTE_REQUIRED
    findings.push({ code: 'RESTORE_NOTE_MISSING', entityId: event.entityId, message: `${event.entityId}: 파괴된 것을 되돌리는데 원고에 그대로 있는 인용(까닭)이 없다` });
  }

  const still = [...destroyed].filter((id) => !restored.has(id)).sort();
  const entities = ctx.work?.entities ?? new Map();
  const onStage = new Set(appearances);
  const out = [];
  for (const id of still) {
    const label = entities.get(id)?.name ? `${entities.get(id).name}(${id})` : id;
    const own = [];
    // vibelore: LEDGER_UPDATE_AFTER_DESTROY — 되돌림과 파괴 재진술(destroyed)은 갱신으로 치지 않는다.
    const updates = draftEvents.filter((e) => e?.entityId === id && existsOf(e) === null);
    if (updates.length > 0) {
      const quote = updates.map((e) => e.quote).find((q) => quotedInDraft(q, draft));
      const kinds = [...new Set(updates.map((e) => String(e.kind)))].join(', ');
      own.push({ code: 'DESTROYED_UPDATED', entityId: id, ...(quote ? { quote } : {}), message: `${label}: 앞에서 파괴된 것에 되돌림 없이 사건(${kinds})이 생긴다` });
    }
    if (onStage.has(id)) {
      // vibelore: DESTROYED_ENTITY_MENTION(등장한 경우를 따로 가른다)
      own.push({ code: 'DESTROYED_ON_STAGE', entityId: id, message: `${label}: 앞에서 파괴된 것이 되돌림 없이 등장한다` });
    } else if (own.length === 0 && (ctx.entityIds ?? []).includes(id)) {
      // vibelore: DESTROYED_ENTITY_MENTION — 회상일 수 있으니 약한 지적이다.
      const quote = namesOf(entities.get(id)).find((name) => quotedInDraft(name, draft));
      own.push({ code: 'DESTROYED_MENTIONED', entityId: id, ...(quote ? { quote } : {}), message: `${label}: 앞에서 파괴된 것이 다시 언급된다(회상이면 괜찮다)` });
    }
    out.push(...own);
  }
  return [...out, ...findings];
}

/** exists 를 적은 state 사건인가. */
function isExistsEvent(event) {
  return event?.kind === 'state' && event.data != null && event.data.exists !== undefined;
}

const rawExists = (event) => String(event.data.exists);

/** state 사건의 exists 값(다듬고 소문자). exists 가 없는 사건은 null. */
function existsOf(event) {
  return isExistsEvent(event) ? rawExists(event).trim().toLowerCase() : null;
}

/** 엔티티의 이름과 별칭. */
function namesOf(entity) {
  if (!entity) return [];
  return [entity.name, ...(Array.isArray(entity.aliases) ? entity.aliases : [])].filter((n) => typeof n === 'string');
}

/** 인용은 다듬은 길이 2 이상이고 원고(NFC)에 그대로 있어야 한다(코어 인용 규칙과 같은 기준). */
function quotedInDraft(quote, draft) {
  if (typeof quote !== 'string' || quote.trim().length < 2) return false;
  return typeof draft === 'string' && draft.normalize('NFC').includes(quote.normalize('NFC'));
}

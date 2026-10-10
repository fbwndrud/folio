import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { FolioError } from '../errors.js';
import { readTextOrNull, writeFileAtomic } from '../util/fs.js';
import { assertManagedPath } from '../util/managed-path.js';
import { canonicalJson, sha256 } from '../util/hash.js';

const GENESIS = 'genesis';
const NAME = /^[a-z][a-z0-9-]*$/;

/** 프로세스 안에서 같은 기록장 경로로 가는 append를 한 줄로 세운다. 실패한 호출도 다음 호출을 막지 않는다. */
const queues = new Map();
function enqueue(key, task) {
  const prev = (queues.get(key) ?? Promise.resolve()).catch(() => {});
  const result = prev.then(task);
  queues.set(key, result.catch(() => {}));
  return result;
}

/**
 * 추가만 되는 JSON Lines 기록장. 각 줄은 앞 줄의 hash를 품는다.
 * 고치거나 지우는 함수는 없다. 파일을 손으로 고치면 readAll/append가 거부한다.
 * 같은 프로세스 안의 동시 append만 순서를 보장한다 — 여러 프로세스가 동시에 쓰는 것은 지원하지 않는다(단일 기록자; 러너는 한 번에 한 실행만 허용한다).
 * @param {string} root
 * @param {string} name
 * @param {{ now?: () => string, hooks?: { afterAppend?: () => void | Promise<void> } }} [options]
 */
export function openLedger(root, name, { now = () => new Date().toISOString(), hooks = {} } = {}) {
  if (!NAME.test(name)) throw new FolioError('LEDGER_NAME_INVALID', name);
  const path = join(root, '.folio', 'ledger', `${name}.jsonl`);
  const headPath = join(root, '.folio', 'ledger', `${name}.head`);
  const queueKey = resolve(path);

  async function readAll() {
    await assertManagedPath(root, path);
    await assertManagedPath(root, headPath);
    const text = await readTextOrNull(path);
    const records = [];
    if (text) {
      let prev = GENESIS;
      const lines = text.split('\n').filter((line) => line.length > 0);
      for (const [index, line] of lines.entries()) {
        let record;
        try { record = JSON.parse(line); }
        catch { throw new FolioError('LEDGER_TAMPERED', `${name}:${index + 1} is not JSON`, { line: index + 1 }); }
        const { hash, ...rest } = record;
        if (rest.seq !== index + 1 || rest.prev !== prev || hash !== sha256(canonicalJson(rest))) {
          throw new FolioError('LEDGER_TAMPERED', `${name}:${index + 1} breaks the hash chain`, { line: index + 1 });
        }
        records.push(record);
        prev = hash;
      }
    }
    const headText = await readTextOrNull(headPath);
    if (headText) {
      let head;
      try { head = JSON.parse(headText); }
      catch { throw new FolioError('LEDGER_TAMPERED', `${name} head is not JSON`, { line: 0 }); }
      const found = records.some((record) => record.seq === head.seq && record.hash === head.hash);
      if (!found) throw new FolioError('LEDGER_TAMPERED', `${name} chain is missing the recorded head`, { line: head.seq });
    }
    return records;
  }

  async function append(entry) {
    if (!entry || typeof entry.type !== 'string') throw new FolioError('LEDGER_ENTRY_INVALID', 'entry needs a type');
    const { seq: _s, prev: _p, hash: _h, ...stripped } = entry;
    // hash는 파일에 쓰는 것과 정확히 같은 값을 대상으로 계산한다(JSON 왕복으로 Date 등을 미리 정규화).
    const normalized = JSON.parse(JSON.stringify({ ...stripped, at: entry.at ?? now() }));
    return enqueue(queueKey, async () => {
      const last = (await readAll()).at(-1);
      const ledgerText = await readTextOrNull(path);
      const separator = ledgerText && !ledgerText.endsWith('\n') ? '\n' : '';
      const rest = { ...normalized, seq: (last?.seq ?? 0) + 1, prev: last?.hash ?? GENESIS };
      const record = { ...rest, hash: sha256(canonicalJson(rest)) };
      await assertManagedPath(root, path);
      await assertManagedPath(root, headPath);
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, `${separator}${JSON.stringify(record)}\n`, { flag: 'a' });
      await hooks.afterAppend?.();
      await writeFileAtomic(headPath, JSON.stringify({ seq: record.seq, hash: record.hash }));
      return record;
    });
  }

  async function verify() {
    try { await readAll(); return { ok: true }; }
    catch (error) {
      if (error.code === 'LEDGER_TAMPERED') return { ok: false, line: error.details.line, error: error.message };
      throw error;
    }
  }

  return Object.freeze({ name, path, append, readAll, verify });
}

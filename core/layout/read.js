import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { parseYaml } from '../util/yaml.js';
import { validateLayout, LAYOUT_LIMITS } from './validate.js';

/** 지면 파일 하나만 제한된 크기로 읽는다. 링크·특수 파일·하드 링크를 따라가지 않는다. */
export async function readLayout(root, work) {
  let handle;
  try { handle = await open(join(root, 'layout.yaml'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) {
    if (error.code === 'ENOENT') return { layout: null, problems: [] };
    throw new FolioError('LAYOUT_INVALID', '지면 파일을 안전하게 읽을 수 없다');
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > LAYOUT_LIMITS.bytes) throw new FolioError('LAYOUT_INVALID', '지면은 1MiB 이하의 보통 파일이어야 한다');
    const buffer = Buffer.alloc(LAYOUT_LIMITS.bytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > LAYOUT_LIMITS.bytes) throw new FolioError('LAYOUT_INVALID', '지면 파일이 1MiB를 넘었다');
    let input;
    try { input = parseYaml(buffer.subarray(0, offset).toString('utf8')); }
    catch { throw new FolioError('LAYOUT_INVALID', '지면 YAML이 잘못됐다'); }
    return validateLayout(input, work);
  } finally { await handle.close(); }
}

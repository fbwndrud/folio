import { deflateRawSync } from 'node:zlib';
import { FolioError } from '../errors.js';
import { EXPORT_LIMITS } from './source.js';
const table = Uint32Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let j = 0; j < 8; j += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/** ZIP32·UTF-8 이름·고정 DOS 시각. mimetype은 첫 비압축 항목이며 extra가 없다. */
export function epubZip(files) {
  if (files.size > EXPORT_LIMITS.files || files.get('mimetype')?.toString('ascii') !== 'application/epub+zip') throw new FolioError('EXPORT_ZIP_INVALID', 'EPUB 항목이 잘못됐다');
  return zipFiles(files, ['mimetype', ...[...files.keys()].filter((name) => name !== 'mimetype').sort()]);
}
/** Bounded ZIP for a Web edition; no arbitrary paths or filesystem writes. */
export function zipFiles(files, order = [...files.keys()].sort()) {
  if (files.size > EXPORT_LIMITS.files) throw new FolioError('EXPORT_LIMIT', 'too many ZIP files');
  const local = [], central = [];
  let offset = 0, total = 0;
  for (const path of order) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path) || path.split('/').some((p) => !p || p === '.' || p === '..')) throw new FolioError('EXPORT_ZIP_INVALID', 'ZIP 경로가 잘못됐다');
    const raw = files.get(path), name = Buffer.from(path), method = path === 'mimetype' ? 0 : 8;
    total += raw.length; if (total > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', '출력 바이트 한도를 넘었다');
    const packed = method ? deflateRawSync(raw) : raw, crc = crc32(raw), header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(method, 8); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(raw.length, 22); header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(method, 10); entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    local.push(header, name, packed); central.push(entry, name); offset += header.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(order.length, 8); end.writeUInt16LE(order.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  const result = Buffer.concat([...local, directory, end]);
  if (result.length > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', 'ZIP이 출력 바이트 한도를 넘었다');
  return result;
}

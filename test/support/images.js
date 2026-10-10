import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 합성 그림: 1×1 PNG 두 장(색만 다름). 실제 생성 결과물이 아니다. */
export const PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const PNG_B = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** dir/name 에 바이트를 쓰고 그 절대 경로를 돌려준다(호스트가 그림을 만들어 둔 자리 흉내). */
export async function placeImage(dir, name, bytes = PNG_A) {
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
}

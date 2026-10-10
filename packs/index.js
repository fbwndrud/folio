import { loadNovelPack } from './novel/index.js';
import { loadKnowledgePack } from './knowledge/index.js';
import { loadSourcesPack } from './sources/index.js';
import { loadBrandPack } from './brand/index.js';
import { loadImagePack } from './image/index.js';
import { loadGamebookPack } from './gamebook/index.js';
import { loadVariantsPack } from './variants/index.js';

/** 내장 팩(이름 → Pack). work.yaml 의 packs 가 이 이름을 가리킨다. sources·brand·image·variants 는 둘째 팩으로만 쓴다(단계가 없다). */
export async function loadBuiltinPacks() {
  const packs = [await loadNovelPack(), await loadKnowledgePack(), await loadSourcesPack(), await loadBrandPack(), await loadImagePack(), await loadVariantsPack(), await loadGamebookPack()];
  return new Map(packs.map((pack) => [pack.name, pack]));
}

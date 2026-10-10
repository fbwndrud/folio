import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { withCheckConfig } from '../../core/pack/check-config.js';
import { BRAND_CHECKERS } from './checkers/index.js';

export const BRAND_PACK_DIR = import.meta.dirname;

/** 브랜드 팩(둘째 팩): pack.yaml + 검사 지시 글 + 이름으로 등록한 검사기. 단계·프리셋은 없다. 검사 config 는 소설 팩과 같은 코어 도우미로 넘긴다. */
export const loadBrandPack = async () => withCheckConfig(await loadYamlPack(BRAND_PACK_DIR, { name: 'brand', checkers: BRAND_CHECKERS, modules: ['checkers/index.js'] }));

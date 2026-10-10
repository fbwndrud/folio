import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { VARIANTS_CHECKERS } from './checkers/index.js';

export const VARIANTS_PACK_DIR = import.meta.dirname;

/** 판본 팩(둘째 팩): 원본 대비 검사. 단계는 없다 — 판본 파이프라인은 코어(core/variants/pipeline.js)가 준다. */
export const loadVariantsPack = () => loadYamlPack(VARIANTS_PACK_DIR, { name: 'variants', checkers: VARIANTS_CHECKERS, modules: ['checkers/index.js'] });

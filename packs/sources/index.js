import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { SOURCES_CHECKERS } from './checkers/index.js';

export const SOURCES_PACK_DIR = import.meta.dirname;

/** 자료 근거 팩(둘째 팩): pack.yaml + 검사 지시 글 + 이름으로 등록한 검사기. 단계는 없다. */
export const loadSourcesPack = () => loadYamlPack(SOURCES_PACK_DIR, { name: 'sources', checkers: SOURCES_CHECKERS, modules: ['checkers/index.js'] });

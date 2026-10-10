import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { KNOWLEDGE_CHECKERS } from './checkers/index.js';

export const KNOWLEDGE_PACK_DIR = import.meta.dirname;

/** 지식 책 팩: pack.yaml + 글 + 이름으로 등록한 검사기. */
export const loadKnowledgePack = () => loadYamlPack(KNOWLEDGE_PACK_DIR, { name: 'knowledge', checkers: KNOWLEDGE_CHECKERS, modules: ['checkers/index.js'] });

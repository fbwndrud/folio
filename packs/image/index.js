import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { withCheckConfig } from '../../core/pack/check-config.js';
import { IMAGE_CHECKERS } from './checkers/index.js';

export const IMAGE_PACK_DIR = import.meta.dirname;

/** 그림 팩(둘째 팩): pack.yaml + 검토 지시 글 + 이름으로 등록한 검사기. 단계·프리셋은 없다. 그림 실행은 core/image 가 돈다. */
export const loadImagePack = async () => withCheckConfig(await loadYamlPack(IMAGE_PACK_DIR, { name: 'image', checkers: IMAGE_CHECKERS, modules: ['checkers/index.js'] }));

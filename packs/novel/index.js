import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { withCheckConfig } from '../../core/pack/check-config.js';
import { NOVEL_CHECKERS } from './checkers/index.js';

export const NOVEL_PACK_DIR = import.meta.dirname;

/** pack.yaml checks.<id>.config 를 검사기 둘째 인자로 넘기는 로더 도우미. 코어(core/pack/check-config.js)로 옮겼고 예전 경로도 그대로 쓸 수 있다. */
export { withCheckConfig };

/** 소설 팩: pack.yaml + 글 + 이름으로 등록한 검사기. 검사 config 는 작품 work.yaml checks.<id>.config 로 겹칠 수 있다(C0). */
export const loadNovelPack = async () => withCheckConfig(await loadYamlPack(NOVEL_PACK_DIR, { name: 'novel', checkers: NOVEL_CHECKERS, modules: ['checkers/index.js'] }));

import { publishTree } from '../util/publish-tree.js';
/** 기존 가져오기 코드·완료 표시는 그대로인 공용 배타 게시의 얇은 경계다. */
export const publishWork = (temp, target, options = {}) => publishTree(temp, target, { ...options, marker: 'work.yaml', prefix: 'IMPORT' });

import { trackingChange } from '../../core/tracking/change.js';

/** 쓰기는 core의 작품 잠금 경로만 사용한다. */
export const trackingTool = (root, input) => trackingChange(root, input);

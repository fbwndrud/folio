// 화면 이름만 바꾼다. 저장 형식·라우트·API 식별자는 그대로 전달한다.
export const readable = (value) => {
  const text = String(value ?? '');
  return (text === text.toUpperCase() ? text.toLowerCase() : text).replace(/[._-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
};

const STEPS = {
  plan: 'Plan', draft: 'Write draft', extract: 'Record details', facts: 'Consistency checks',
  critic: 'Writing review', revise: 'Revise', approve: 'Your approval', commit: 'Finalize',
  fit: 'Plan review', children: 'Create sections', review: 'Overall review',
  'variant-checks': 'Compare with original', 'variant-review': 'Meaning review',
  image_brief: 'Image brief', image_generate: 'Create image', image_review: 'Image review',
};
export const stepLabel = (id) => STEPS[id] ?? readable(id);
export const STATUS_LABELS = Object.freeze({ draft: 'Draft', planned: 'Planned', committed: 'Finalized', imported: 'Imported' });
export const SEVERITY_LABELS = Object.freeze({ hard: 'Must fix', block: 'Needs your decision', advisory: 'Suggestion', warning: 'Warning' });
export const RESULT_LABELS = Object.freeze({ passed: 'Passed', failed: 'Failed', skipped: 'Skipped', auto: 'Automatic approval', approved: 'Approved', not_needed: 'Not needed', not_applicable: 'Not applicable', overridden: 'Accepted with a reason', error: 'Could not complete' });
export const RUN_LABELS = Object.freeze({ needs_model: 'Waiting for AI', needs_user: 'Waiting for your decision', waiting_children: 'Waiting for sections', committing: 'Finalizing', done: 'Finished', idle: 'No work waiting', skipped: 'Skipped', blocked: 'Needs attention', running: 'In progress' });
export const runLabel = (id) => ({ awaiting_model: 'Waiting for AI', awaiting_user: 'Waiting for your decision', active: 'In progress', abandoned: 'Skipped' })[id] ?? RUN_LABELS[id] ?? readable(id);
export const originLabel = (id) => ({ user: 'Author decision', 'work.yaml': 'Work settings', pack: 'Built-in rules', pipeline: 'Default writing steps' })[id] ?? readable(id);
export const KIND_LABELS = Object.freeze({ node: 'Section', entity: 'Definition', asset: 'Image', source: 'Source', character: 'Character', object: 'Object', place: 'Place', concept: 'Concept', term: 'Term', example: 'Example', promise: 'Story thread', generate: 'Writing', check: 'Check', gate: 'Approval', commit: 'Finalize', deterministic: 'Automatic check', model: 'AI review', leaf: 'Writing section', branch: 'Group' });
export const kindLabel = (id) => KIND_LABELS[id] ?? readable(id);
export const locationLabel = (id) => ({ located: 'Located', relocated: 'Found in a new position', stale: 'Needs relinking', missing: 'Missing' })[id] ?? readable(id);
export const threadLabel = (id) => ({ planted: 'Introduced', advanced: 'Developed', misdirected: 'Misdirected', resolved: 'Resolved', closed: 'Closed', parked: 'On hold', reopened: 'Reopened', mentioned: 'Mentioned' })[id] ?? readable(id);

const ERRORS = {
  VIEW_CHANGED: 'The writing sources changed while exporting. Refresh and retry.',
  LOCK_TRACKING_INTEGRITY: 'Tracking records could not be verified. Ask your AI assistant to check them.',
  TRACKING_RECORD_INVALID: 'Tracking records could not be verified. Ask your AI assistant to check them.',
  EXPORT_EMPTY: 'There are no writing sections to export yet.',
  ASSET_FILE_UNAVAILABLE: 'An image is missing or changed. Ask your AI assistant to check it before exporting.',
  RESOURCE_NOT_VISIBLE: 'This resource is not included in the verified list.',
  RESOURCE_VIEW_CHANGED: 'The workspace changed while opening this view. Retry to read its current evidence.',
  RESOURCE_INTEGRITY_FAILURE: 'The resource content could not be verified. Ask your AI assistant to check it.',
  PROJECTION_INTEGRITY_FAILURE: 'The resource list could not be verified. Ask your AI assistant to check it.',
  OPERATION_INTEGRITY_FAILURE: 'The review record could not be verified. Ask your AI assistant to check it.',
  WORKSPACE_STATE_INTEGRITY_FAILURE: 'The activity record could not be verified. Ask your AI assistant to check it.',
  STATIC_UNAVAILABLE: 'This page is not included in this exported view.',
  STEP_LOCKED: 'This required step cannot be changed.',
  FEATURE_DISABLED: 'This feature is turned off for this work.',
  STAGE_STALE: 'Settings changed. Refresh this page and try again.',
  STAGES_STALE: 'Settings changed. Refresh this page and try again.',
  WORK_YAML_CHANGED: 'Settings changed. Refresh this page and try again.',
  STATIC_EXPORT: 'This exported view is read only.',
  VIEWER_NOT_BUILT: 'Ask your AI assistant to prepare the viewing screens, then reopen the viewer.',
  CONFIG_INVALID: 'The work settings need attention. Ask your AI assistant to check them.',
  UNAUTHORIZED: 'Your viewing session has expired. Ask your AI assistant to reopen the viewer.',
  TOKEN_INVALID: 'Your viewing session has expired. Ask your AI assistant to reopen the viewer.',
  NODE_NOT_FOUND: 'This section is no longer available.',
  ENTITY_NOT_FOUND: 'This definition is no longer available.',
  SOURCE_NOT_FOUND: 'This source is no longer available.',
  ASSET_NOT_FOUND: 'This image is no longer available.',
  EXPORT_DIR_NOT_OURS: 'The export folder contains other files. Choose a different folder with your AI assistant.',
};
export const errorSummary = (code) => ERRORS[code] ?? 'This action could not be completed. Ask your AI assistant to help.';

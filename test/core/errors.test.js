import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FolioError } from '../../core/errors.js';

test('FolioError carries a code and details', () => {
  const error = new FolioError('LOCK_NO_RECEIPT', 'commit requires a receipt', { nodeId: 'a' });
  assert.ok(error instanceof Error);
  assert.equal(error.code, 'LOCK_NO_RECEIPT');
  assert.deepEqual(error.details, { nodeId: 'a' });
  assert.match(error.message, /^LOCK_NO_RECEIPT: /);
});

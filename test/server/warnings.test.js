import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quietSqliteWarning } from '../../server/warnings.js';

test('only the SQLite experimental warning is dropped, and the filter can be removed', () => {
  const seen = [];
  const proc = { emitWarning: (...args) => { seen.push(args); } };
  const restore = quietSqliteWarning(proc);
  proc.emitWarning('SQLite is an experimental feature and might change at any time', 'ExperimentalWarning');
  const error = Object.assign(new Error('SQLite is an experimental feature'), { name: 'ExperimentalWarning' });
  proc.emitWarning(error);
  proc.emitWarning('SQLite is an experimental feature', { type: 'ExperimentalWarning' });
  proc.emitWarning('Something else is experimental', 'ExperimentalWarning');
  proc.emitWarning('SQLite handle leaked', 'Warning');
  assert.deepEqual(seen.map((args) => args[0]), ['Something else is experimental', 'SQLite handle leaked']);
  restore();
  proc.emitWarning('SQLite is an experimental feature', 'ExperimentalWarning');
  assert.equal(seen.length, 3);
});

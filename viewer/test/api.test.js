import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi, readToken, stripToken } from '../src/lib/api.js';

const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};

test('the token comes from ?token= and is kept for the session', () => {
  const storage = memory();
  assert.equal(readToken({ search: '?token=abc' }, storage), 'abc');
  assert.equal(readToken({ search: '' }, storage), 'abc');
  assert.equal(readToken({ search: '?token=' }, storage), 'abc');
  assert.equal(readToken({ search: '' }, null), null);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(readToken({ search: '?token=x' }, broken), 'x');
});

test('stripToken preserves the path, other parameters, and hash', () => {
  assert.equal(stripToken('http://127.0.0.1:41000/read?foo=1&token=secret&bar=2#/node'), '/read?foo=1&bar=2#/node');
  assert.equal(stripToken('http://localhost:5173/?token=#/'), '/#/');
  assert.equal(stripToken('http://localhost:5173/?foo=1#/'), null);
});

test('requests carry the token; errors keep the server code', async () => {
  const calls = [];
  const reply = (status, body) => ({ ok: status < 400, status, headers: new Map([['content-type', 'application/json']]), json: async () => body });
  const fetchImpl = async (path, init) => {
    calls.push({ path, init });
    return path === '/api/stages' && init.method === 'POST' ? reply(403, { error: { code: 'STEP_LOCKED', message: 'locked' } }) : reply(200, { ok: 1 });
  };
  const api = createApi({ token: 't1', fetchImpl });
  assert.deepEqual(await api.get('/api/work'), { ok: 1 });
  assert.equal(calls[0].init.headers['x-folio-token'], 't1');
  await assert.rejects(api.post('/api/stages', { stepId: 'commit' }), (e) => e instanceof ApiError && e.code === 'STEP_LOCKED' && e.status === 403);
  assert.equal(calls[1].init.headers['content-type'], 'application/json');
  assert.equal(calls[1].init.body, '{"stepId":"commit"}');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewGraph } from '../../core/view/graph-view.js';
import { copyFixture } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

test('the graph links nodes to the entities they name or declare, and lists every entity with its kind', async () => {
  const graph = await viewGraph(await copyFixture('novel-3level'));
  assert.deepEqual(graph.kinds, ['character', 'location', 'promise']);
  assert.deepEqual(graph.entities.map((e) => [e.id, e.kind]), [['entity:junho', 'character'], ['entity:mara', 'character'], ['entity:red-letter', 'promise'], ['entity:rooftop', 'location']]);
  const rooftop = graph.edges.filter((e) => e.source === 'node:rooftop-scene');
  assert.deepEqual(rooftop.map((e) => [e.target, e.weight, e.declared]), [['entity:mara', 1, true], ['entity:red-letter', 1, false], ['entity:rooftop', 1, true]]);
  assert.ok(graph.nodes.every((n) => graph.edges.some((e) => e.source === n.id)));
  assert.deepEqual(graph.nodes.map((n) => n.ordinal), [...graph.nodes.map((n) => n.ordinal)].sort((a, b) => a - b));
  assert.equal(new Set(graph.edges.map((e) => e.id)).size, graph.edges.length);
});

test('node links appear when the links feature is on, and are null when it is off', async () => {
  const root = await copyFixture('gamebook');
  const on = await viewGraph(root);
  assert.deepEqual(on.links.map((l) => [l.from, l.to, l.kind, l.label, l.index]), [['gate', 'left-path', 'choice', '왼쪽 길', 0], ['gate', 'right-path', 'choice', '오른쪽 길', 1], ['left-path', 'ending-key', 'choice', '열쇠를 줍는다', 0], ['right-path', 'ending-trap', 'choice', '문을 연다', 0]]);
  const ids = new Set(on.nodes.map((n) => n.refId));
  assert.ok(on.links.every((l) => ids.has(l.from) && ids.has(l.to)));
  assert.equal(new Set(on.nodes.map((n) => n.id)).size, on.nodes.length);
  await editYaml(root, (config) => { config.features = { links: false }; });
  const off = await viewGraph(root);
  assert.equal(off.links, null);
  assert.ok(off.nodes.every((n) => ids.has(n.refId)));
  assert.ok(off.nodes.length <= on.nodes.length);
});

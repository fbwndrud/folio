import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { valueText } from '../src/lib/value-display.js';
import { focusedConnections } from '../src/lib/connections.js';

let server, StructuredValue, ThreadTimeline;
before(async () => {
  server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom' });
  ({ StructuredValue } = await server.ssrLoadModule('/src/components/StructuredValue.jsx'));
  ({ ThreadTimeline } = await server.ssrLoadModule('/src/components/ThreadTimeline.jsx'));
});
after(async () => { await server?.close(); });
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('manuscript citations show readable source titles while preserving missing source marks', async () => {
  const { ManuscriptBody } = await server.ssrLoadModule('/src/components/ManuscriptBody.jsx');
  const html = render(ManuscriptBody, { mode: 'text', segments: [{ text: '[[source:synthetic]]', citation: 'synthetic', valid: true, label: '합성 연구 자료' }, { text: '[[source:missing]]', citation: 'missing', valid: false }] });
  assert.match(html, /href="#\/source\/synthetic">합성 연구 자료/);
  assert.doesNotMatch(html, /\[\[source:synthetic\]\]/);
  assert.match(html, /\[\[source:missing\]\]/);
});

test('structured display preserves nested custom data, zero, false and empty values without a serialized object', () => {
  const value = { count: 0, approved: false, nested: { customField: '합성 <script> example', unknown: null }, rows: ['one', { name: 'two' }], empty: [], blank: '', unused: {} };
  const html = render(StructuredValue, { value });
  for (const text of ['Count', '>0<', '>No<', 'Custom Field', 'Not recorded', 'No items', 'Empty text', 'No recorded fields', 'two']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<pre>|<script>|&quot;count&quot;|\{"count"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(valueText(value), /Count: 0/); assert.match(valueText(value), /Approved: No/);
});

test('valid JSON source previews become fields without losing their values', async () => {
  const { ResourceContent } = await server.ssrLoadModule('/src/screens/Resources.jsx');
  const entry = { resourceId: 'synthetic', revisionId: 'synthetic-revision', role: 'source', mediaType: 'application/json' };
  const data = { entries: [entry], freshness: 'current', coverage: { missing: [], unknown: [] } };
  const html = render(ResourceContent, { data, detail: { entry, contentPreview: '{"customCount":0,"enabled":false,"items":["a","b"]}', previewTruncated: false } });
  assert.match(html, /Custom Count/); assert.match(html, />0</); assert.match(html, />No</); assert.doesNotMatch(html, /<pre>|&quot;customCount&quot;/);
});

test('timeline headers wrap into distinct cells and group events are not mislabelled as leaf events', () => {
  const leaves = [1, 2].map((n) => ({ id: `scene-${n}`, title: `아주 긴 합성 장면 제목 ${n} ${'읽을 수 있는 제목 '.repeat(5)}` }));
  const marks = [{ eventId: 'group-event', nodeId: 'chapter', nodeTitle: '그룹', stage: 'planted', column: 0 }, { eventId: 'scene-event', nodeId: 'scene-2', stage: 'advanced', column: 1 }];
  const html = render(ThreadTimeline, { leaves, promises: [{ entityId: 'thread', name: '합성 이야기', marks }] });
  assert.match(html, /Section 1/); assert.match(html, /Section 2/); assert.doesNotMatch(html, /<svg|Introduced/);
  assert.equal((html.match(/Developed/g) ?? []).length, 2);
  for (const leaf of leaves) assert.ok(html.includes(leaf.title));
});

test('focused connection list includes only real links and preserves declared-only references', () => {
  const graph = { entities: [{ id: 'entity:a', refId: 'a', label: 'A' }, { id: 'entity:b', refId: 'b', label: 'B' }],
    nodes: [{ id: 'node:one', refId: 'one', label: 'Opening' }, { id: 'node:two', refId: 'two', label: 'Ending' }],
    edges: [{ source: 'node:one', target: 'entity:a', weight: 0, declared: true }, { source: 'node:two', target: 'entity:b', weight: 2 }] };
  const focus = focusedConnections(graph, 'a');
  assert.deepEqual(focus.nodes.map((n) => n.refId), ['one']); assert.equal(focus.bySource.get('node:one').declared, true);
  assert.deepEqual(focusedConnections(graph, 'a', 'Ending').nodes, []);
  assert.equal(focusedConnections({ ...graph, entities: [], edges: [] }, '').entity, null);
});


test('custom fields never acquire system meanings just because their names match metadata keys', () => {
  const value = { unknown: null, missing: 0, kind: 'custom category' };
  const custom = render(StructuredValue, { value });
  assert.match(custom, />Unknown</); assert.match(custom, />Missing</); assert.match(custom, />Kind</);
  assert.doesNotMatch(custom, /Unobserved resources|Missing resources/);
  const system = render(StructuredValue, { value: { unknown: [] }, systemLabels: true });
  assert.match(system, /Unobserved resources/);
});

test('footnotes show source titles as links and retain unparsed text safely', async () => {
  const { ReferenceText } = await server.ssrLoadModule('/src/components/ReferenceText.jsx');
  const html = render(ReferenceText, { segments: [{ text: '참고 ' }, { citation: 'ref', valid: true, label: '합성 자료' }, { text: '<script>' }, { citation: 'missing', valid: false }, { asset: 'synthetic-image' }] });
  assert.match(html, /href="#\/source\/ref"/); assert.match(html, /합성 자료/); assert.match(html, /&lt;script&gt;/); assert.match(html, /Source missing/);
  assert.match(html, /Image reference: synthetic-image/);
});

test('check cards keep selection, recommendations, hard impact and locked status distinct', async () => {
  const { CheckGroupsContent } = await server.ssrLoadModule('/src/screens/CheckSets.jsx');
  const data = { sets: [{ id: 'custom', title: 'Custom group', description: 'Custom purpose', selected: false, default: true, checks: ['required'] }], recommended: [{ setId: 'custom', reasons: [{ kind: 'genre', value: 'custom' }] }], checks: [{ id: 'required', title: 'Required check', stage: 'facts', tier: 'deterministic', severity: 'hard', locked: true, sets: [], experimental: true }], chosenBy: 'work.yaml' };
  const html = render(CheckGroupsContent, { data });
  for (const text of ['Not selected', 'Suggested by default', 'Custom purpose', 'Genre: Custom', 'Always required', 'Must fix', 'Experimental', 'Consistency checks']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<table/);
});

test('incomplete JSON preserves its original source in a closed drawer rather than a metadata dump', async () => {
  const { ResourceContent } = await server.ssrLoadModule('/src/screens/Resources.jsx');
  const entry = { resourceId: 'synthetic', revisionId: 'synthetic-revision', role: 'source', mediaType: 'application/json' };
  const html = render(ResourceContent, { data: { entries: [entry] }, detail: { entry, contentPreview: '{"value":', previewTruncated: true } });
  assert.match(html, /Original source text/); assert.match(html, /too large/); assert.match(html, /&quot;value&quot;/); assert.doesNotMatch(html, /<details open/);
});


test('review references use current human names without replacing their revision identities', async () => {
  const { RevisionReferences } = await server.ssrLoadModule('/src/components/RevisionReferences.jsx');
  const refs = [{ kind: 'entity', id: 'a', rev: 'old-version' }, { kind: 'tracking_snapshot', id: 'scene', rev: 'snapshot-version' }, { kind: 'tracking_plan', id: 'main', rev: 'plan-version' }];
  const html = render(RevisionReferences, { refs, outline: { entities: [{ id: 'a', name: '합성 인물' }], nodes: [{ id: 'scene', title: '합성 장면' }] } });
  assert.match(html, /합성 인물/); assert.match(html, /합성 장면/); assert.match(html, /This work/); assert.match(html, /href="#\/read\/scene"/);
  assert.equal(refs[0].rev, 'old-version'); assert.equal(refs[1].rev, 'snapshot-version');
});

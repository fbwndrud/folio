/** index.db 는 파일과 기록장의 투영이다. 정본이 아니며 언제든 지우고 다시 만든다. */
export const TABLES = ['nodes', 'entities', 'aliases', 'links', 'blocks', 'block_refs', 'assets', 'node_assets', 'sources', 'occurrences', 'events', 'receipts', 'receipt_refs', 'commits', 'marks'];

export const SCHEMA_SQL = `
CREATE TABLE nodes(id TEXT PRIMARY KEY, path TEXT NOT NULL, kind TEXT NOT NULL, level TEXT NOT NULL, role TEXT NOT NULL,
  status TEXT NOT NULL, parent_id TEXT, sibling_index INTEGER NOT NULL, ordinal INTEGER NOT NULL, pos_key TEXT NOT NULL,
  order_mode TEXT NOT NULL, ordered INTEGER NOT NULL, body_hash TEXT NOT NULL);
CREATE TABLE entities(id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, path TEXT, rev TEXT NOT NULL, storage TEXT NOT NULL);
CREATE TABLE aliases(entity_id TEXT NOT NULL, alias TEXT NOT NULL);
CREATE TABLE links(from_id TEXT NOT NULL, to_id TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, valid INTEGER NOT NULL);
CREATE TABLE blocks(id TEXT NOT NULL, node_id TEXT NOT NULL, variant TEXT NOT NULL, line INTEGER NOT NULL);
CREATE TABLE block_refs(node_id TEXT NOT NULL, target TEXT NOT NULL, line INTEGER NOT NULL, valid INTEGER NOT NULL);
CREATE TABLE assets(id TEXT PRIMARY KEY, path TEXT, rev TEXT NOT NULL, storage TEXT NOT NULL CHECK(storage IN ('file', 'managed')));
CREATE TABLE node_assets(node_id TEXT NOT NULL, asset_id TEXT NOT NULL, placement TEXT NOT NULL);
CREATE TABLE sources(id TEXT PRIMARY KEY, path TEXT NOT NULL, rev TEXT NOT NULL, reliability TEXT);
CREATE TABLE occurrences(entity_id TEXT NOT NULL, surface_kind TEXT NOT NULL, surface_id TEXT NOT NULL, origin TEXT NOT NULL, count INTEGER NOT NULL);
CREATE TABLE events(event_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, node_id TEXT NOT NULL, entity_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, active INTEGER NOT NULL);
CREATE TABLE receipts(receipt_id TEXT PRIMARY KEY, node_id TEXT NOT NULL, variant TEXT NOT NULL, draft_hash TEXT NOT NULL, seq INTEGER NOT NULL);
CREATE TABLE receipt_refs(receipt_id TEXT NOT NULL, ref_kind TEXT NOT NULL, ref_id TEXT NOT NULL, rev TEXT);
CREATE TABLE commits(node_id TEXT NOT NULL, variant TEXT NOT NULL, receipt_id TEXT NOT NULL, committed_hash TEXT NOT NULL, seq INTEGER NOT NULL);
CREATE TABLE marks(entity_id TEXT NOT NULL, surface_kind TEXT NOT NULL, surface_id TEXT NOT NULL, field TEXT NOT NULL,
  kind TEXT NOT NULL, quote TEXT NOT NULL, start INTEGER, status TEXT NOT NULL, origin TEXT NOT NULL);
`;

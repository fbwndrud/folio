#!/usr/bin/env node
import { quietSqliteWarning } from '../server/warnings.js';

// 경고 필터를 먼저 건다. 서버(→ 코어 → node:sqlite)는 그 뒤에 읽어야 한다 — 정적 import 는 이 줄보다 먼저 실행되므로 동적으로 읽는다.
quietSqliteWarning(process);
const { startStdioServer } = await import('../server/stdio.js');
await startStdioServer();

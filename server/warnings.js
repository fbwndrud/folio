/**
 * node:sqlite 를 처음 읽을 때 나오는 ExperimentalWarning 만 조용히 한다(MCP 호스트의 stderr 를 어지럽히지 않게).
 * 다른 경고와 다른 ExperimentalWarning 은 그대로 낸다. 되돌리는 함수를 돌려준다.
 * @param {{ emitWarning: (...args: any[]) => any }} proc
 * @returns {() => void}
 */
export function quietSqliteWarning(proc = process) {
  const original = proc.emitWarning;
  proc.emitWarning = function emitWarning(warning, ...rest) {
    const option = rest[0];
    const type = typeof option === 'string' ? option : option?.type;
    const name = typeof warning === 'string' ? type : (warning?.name ?? type);
    const message = typeof warning === 'string' ? warning : warning?.message;
    if (name === 'ExperimentalWarning' && /sqlite/i.test(String(message ?? ''))) return undefined;
    return original.call(proc, warning, ...rest);
  };
  return () => { proc.emitWarning = original; };
}

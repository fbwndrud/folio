import { AsyncLocalStorage } from 'node:async_hooks';
const faults = new AsyncLocalStorage();
/** Scoped pause/kill seam used only by synthetic OS-process recovery tests. */
export function withLockGateFault(hook, fn) { return faults.run(hook, fn); }
export async function lockGateFault(phase) { await faults.getStore()?.(phase); }

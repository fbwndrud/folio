import { AsyncLocalStorage } from 'node:async_hooks';
const faults = new AsyncLocalStorage();
/** Scoped filesystem fault seam for synthetic interruption tests; never changes publication checks. */
export function withImmutableWriteFault(writer, fn) { return faults.run(writer, fn); }
export function immutableWriteFault() { return faults.getStore(); }

import { lstat, mkdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

const within = (child, parent) => {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};
/** Resolve the existing parent before comparing boundaries or creating output. */
export async function prepareExampleOutput(output, sources) {
  const requested = resolve(output), parent = await realpath(dirname(requested));
  const target = join(parent, basename(requested));
  const roots = [];
  for (const source of sources) {
    if (!(await lstat(source)).isDirectory()) throw new Error('Choose a regular source folder');
    roots.push(await realpath(source));
  }
  if (roots.some(root => within(target, root) || within(root, target))) throw new Error('Output must be separate from all source works');
  const identity = await lstat(parent);
  const assertParent = async () => {
    const current = await lstat(parent);
    if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino || await realpath(parent) !== parent) throw new Error('Output parent changed; preserve partial output and retry');
  };
  await assertParent(); await mkdir(target);
  return { target, roots, assertParent };
}

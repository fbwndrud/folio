import { lstat, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { writeFileAtomic } from '../util/fs.js';
import { fields, id } from './schema.js';
import { proposalDigest } from './proposals.js';

async function safePath(path, directory = false) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw new FolioError('TRACKING_PROPOSAL_INVALID', 'proposal cache must use regular files and directories');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function paths(root, proposalId) {
  id(proposalId, 'proposalId');
  const base = join(root, '.folio');
  const dir = join(base, 'tracking-proposals');
  await safePath(base, true); await safePath(dir, true);
  const path = join(dir, `${proposalId}.json`);
  await safePath(path);
  return { dir, path };
}

export async function saveProposal(root, cache) {
  const { dir, path } = await paths(root, cache.proposalId);
  await mkdir(dir, { recursive: true });
  await writeFileAtomic(path, `${JSON.stringify(cache, null, 2)}\n`);
}

export async function loadProposal(root, proposalId, digest) {
  const { path } = await paths(root, proposalId);
  let cache;
  try { cache = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    throw new FolioError(error.code === 'ENOENT' ? 'TRACKING_PROPOSAL_NOT_FOUND' : 'TRACKING_PROPOSAL_INVALID', proposalId);
  }
  fields(cache, ['proposalId', 'proposalDigest', 'proposal'], 'proposal cache');
  if (cache.proposalId !== proposalId || cache.proposalDigest !== digest || proposalDigest(cache.proposal) !== digest) {
    throw new FolioError('TRACKING_PROPOSAL_DIGEST_MISMATCH', 'proposal content no longer matches the presented digest');
  }
  return cache.proposal;
}

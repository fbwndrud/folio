import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt';
const ELK_VERSION = '0.12.0';
const ELKJS_SOURCE = 'https://github.com/kieler/elkjs/tree/ff5771d7165445c42c408bb8a090c8035272218c';
const ELK_SOURCE = 'https://github.com/eclipse-elk/elk/tree/323312916048544e4e594eab3303cdb0d01e2929';
const DOCUMENT = /^(?:licen[cs]e|copying|notice)(?:$|[._-])/i;

async function packageFor(moduleId) {
  const path = moduleId.replace(/^\0/, '').split('?')[0];
  if (!path.replaceAll('\\', '/').includes('/node_modules/')) return null;
  let directory = dirname(path);
  while (directory !== dirname(directory)) {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      return { directory, metadata };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (directory.endsWith('/node_modules')) break;
    directory = dirname(directory);
  }
  throw new Error(`Bundled dependency has no package metadata: ${moduleId}`);
}

function upstream(metadata) {
  const repository = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url;
  return repository?.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '') ?? metadata.homepage ?? null;
}

async function noticeFor({ directory, metadata }) {
  if (!metadata.name || !metadata.version || !metadata.license) throw new Error('Bundled dependency needs name, version and license');
  const names = (await readdir(directory)).filter(name => DOCUMENT.test(name)).sort();
  if (!names.some(name => /^(?:licen[cs]e|copying)(?:$|[._-])/i.test(name))) {
    throw new Error(`Missing full license for bundled dependency ${metadata.name}`);
  }
  const tarball = `https://registry.npmjs.org/${metadata.name}/-/${metadata.name.split('/').at(-1)}-${metadata.version}.tgz`;
  const heading = [`${metadata.name}@${metadata.version}`, `Declared license: ${metadata.license}`,
    `Published package: ${tarball}`, `Upstream source: ${upstream(metadata) ?? tarball}`];
  if (metadata.name === 'elkjs') {
    if (metadata.version !== ELK_VERSION) throw new Error('Update and verify ELK source availability for the new elkjs version');
    heading.push('Folio distributes elkjs under EPL-2.0; its secondary GPL option is not selected.',
      'ELK source is available under EPL-2.0 at the following version-pinned locations:',
      `elkjs ${ELK_VERSION}: ${ELKJS_SOURCE}`, `ELK ${ELK_VERSION}: ${ELK_SOURCE}`,
      'Folio does not modify ELK source. Bundling and minification change its distribution format.',
      'Copyright (c) 2017, 2021 Kiel University and others.');
  }
  const documents = await Promise.all(names.map(async name => `--- ${name} ---\n${await readFile(join(directory, name), 'utf8')}`));
  return [...heading, '', ...documents].join('\n');
}

/** Only modules actually present in emitted chunks require bundled-code notices. */
export async function bundledNotices(bundle) {
  const packages = new Map();
  for (const chunk of Object.values(bundle)) {
    if (chunk.type !== 'chunk') continue;
    for (const id of Object.keys(chunk.modules)) {
      const item = await packageFor(id);
      if (item) packages.set(item.directory, item);
    }
  }
  const sorted = [...packages.values()].sort((a, b) => `${a.metadata.name}@${a.metadata.version}`.localeCompare(`${b.metadata.name}@${b.metadata.version}`));
  const notices = await Promise.all(sorted.map(noticeFor));
  return 'Folio Studio — bundled third-party software\n\nThese components retain their own licenses and copyright notices.\n'
    + 'Folio’s Apache-2.0 license and the example content license do not replace these terms.\n\n'
    + notices.join('\n\n' + '='.repeat(72) + '\n\n') + '\n';
}

export function viewerNotices() {
  return { name: 'folio-viewer-notices', apply: 'build',
    async generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: NOTICES_FILE, source: await bundledNotices(bundle) });
    } };
}

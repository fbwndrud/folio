import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

/** Only file destinations are checked; remote URLs and same-document anchors are not fetched. */
export function markdownDestinations(markdown) {
  let fence = null;
  const prose = markdown.split('\n').map((line) => {
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (mark && mark[1][0] === fence.char && mark[1].length >= fence.length && !line.slice(mark[0].length).trim()) fence = null;
      return '';
    }
    if (mark) { fence = { char: mark[1][0], length: mark[1].length }; return ''; }
    return line.replace(/(`+)[\s\S]*?\1/g, '');
  }).join('\n');
  const destinations = [];
  const starts = /!?\[[^\]\n]*\]\([ \t]*|^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*/gm;
  for (const match of prose.matchAll(starts)) {
    let cursor = match.index + match[0].length, destination = '', depth = 0;
    if (prose[cursor] === '<') {
      const end = prose.indexOf('>', cursor + 1);
      if (end !== -1) destination = prose.slice(cursor + 1, end);
    } else {
      while (cursor < prose.length) {
        const character = prose[cursor];
        if (character === '\\' && cursor + 1 < prose.length) { destination += prose[cursor + 1]; cursor += 2; continue; }
        if (/\s/.test(character) || (character === ')' && depth === 0)) break;
        if (character === '(') depth += 1;
        if (character === ')') depth -= 1;
        destination += character; cursor += 1;
      }
    }
    if (destination) destinations.push(destination);
  }
  return destinations;
}

export function missingPackedLinks(document, markdown, files) {
  return markdownDestinations(markdown).flatMap((destination) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(destination)) return [];
    const plain = destination.split(/[?#]/)[0];
    if (!plain) return [];
    let path;
    try { path = decodeURIComponent(plain); }
    catch { return [{ document, destination, target: null }]; }
    const target = posix.normalize(posix.join(posix.dirname(document), path)).replace(/\/$/, '');
    const present = files.has(target) || [...files].some((file) => file.startsWith(`${target}/`));
    return present && !target.startsWith('../') && !path.startsWith('/') ? [] : [{ document, destination, target }];
  });
}

/** Read the installed tarball, not the checkout: exclusions and prepared files are authoritative. */
export async function verifyPackedMarkdownLinks({ root, files }) {
  const packed = new Set(files);
  const documents = [...packed].filter((file) => file.endsWith('.md')).sort();
  const failures = (await Promise.all(documents.map(async (document) =>
    missingPackedLinks(document, await readFile(join(root, document), 'utf8'), packed)))).flat();
  if (failures.length) throw new Error(`Broken packaged documentation links (${failures.length}):\n${failures.map(({ document, destination }) => `${document}: ${destination}`).join('\n')}`);
  return { documents: documents.length, relativeLinksVerified: true };
}

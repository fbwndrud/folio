import { readable } from './labels.js';

const SETS = {
  'novel.basic': ['Story consistency', 'Review character facts, continuity, plans and story threads.'],
  'novel.serial': ['Serial writing', 'Review episode endings, pacing, length, repetition and unresolved threads.'],
  'novel.young-readers': ['Young reader review', 'Review reading needs, reader understanding and how pictures support the text.'],
  'novel.style': ['Writing style', 'Review rhythm, dialogue, viewpoint and consistency with your style examples.'],
  'knowledge.basic': ['Learning content', 'Review definitions, prerequisites, plans and learning goals.'],
  'knowledge.terms': ['Consistent terminology', 'Find spellings and terms you chose to avoid.'],
  'knowledge.exercises': ['Exercise coverage', 'Review whether exercises cover the learning goals.'],
  'knowledge.references': ['Cross-references', 'Find missing figures, footnotes and source references.'],
  'knowledge.unordered': ['Reference works', 'Review links and consistency between independently read entries.'],
  'sources.citations': ['Source support', 'Review supporting quotes, numbers and source reliability.'],
  'sources.review': ['Source review', 'Review conflicting sources and claims missing evidence links.'],
  'brand.voice': ['Brand voice', 'Review tone and claims that sound exaggerated or absolute.'],
  'brand.figures': ['Numbers & units', 'Compare claims, numbers and units with their sources.'],
  'image.basic': ['Image review', 'Review the brief, dialogue, characters, references and generated image.'],
  'image.placement': ['Image references', 'Find images referenced in the text that are not available.'],
  'variants.basic': ['Version comparison', 'Compare meaning, numbers, terms and references with the original.'],
  'gamebook.basic': ['Choice paths', 'Review reachable scenes, endings and facts along each path.'],
};
const CHECKS = {
  'young-readers': 'Young reader review',
  'dead-on-stage': 'Character life status', 'fixed-facts': 'Established facts', critic: 'Writing review',
  'parent-fit': 'Fit with the larger plan', 'promise-kept': 'Story thread follow-through',
  'destroyed-object': 'Object condition', 'honorific-gender': 'Forms of address', 'metadata-leak': 'Internal notes in the text',
  'promise-evidence': 'Story thread evidence', 'promise-flow': 'Story thread flow', 'episode-hook': 'Episode ending',
  cliffhanger: 'Cliffhanger', 'time-skip': 'Time jumps', 'webnovel-format': 'Mobile reading format',
  length: 'Target length', 'info-restate': 'Repeated information', sensitive: 'Sensitive content',
  'promise-dormant': 'Unresolved story threads', 'sentence-rhythm': 'Sentence rhythm', prosody: 'Reading rhythm',
  'show-dont-tell': 'Show, do not tell', cliche: 'Overused phrases', 'dialogue-tags': 'Dialogue tags',
  'dialogue-ratio': 'Dialogue balance', pov: 'Point of view', 'style-drift': 'Style consistency',
  'defined-before-use': 'Explain concepts before using them', 'prerequisite-order': 'Prerequisite concepts',
  'goals-covered': 'Learning goal coverage', 'term-consistency': 'Consistent terminology',
  'exercises-cover-goals': 'Exercise coverage', 'cross-refs': 'Cross-references', links: 'Section links',
  'linked-consistency': 'Consistency with linked entries', 'claim-supported': 'Supporting evidence',
  'numbers-match': 'Numbers match the sources', reliability: 'Source reliability', conflict: 'Conflicting sources',
  'claims-found': 'Claims needing evidence', tone: 'Brand tone', 'banned-phrases': 'Phrases to avoid',
  'figure-units': 'Units match the sources', 'dialogue-in-text': 'Dialogue matches the text',
  'entities-in-node': 'Characters match the section', 'references-present': 'Reference images available',
  'show-conflict': 'Conflicting image instructions', review: 'Image review', 'asset-refs': 'Images available',
  'blocks-kept': 'References preserved', 'numbers-kept': 'Numbers preserved', paragraphs: 'Paragraph structure',
  terms: 'Translation terms', fidelity: 'Meaning preserved', 'dead-ends': 'Unfinished choice paths',
  unreachable: 'Unreachable scenes', paths: 'Choice path evidence', 'path-facts': 'Facts along each path',
  'structure-review': 'Overall choice structure', 'promise-order': 'Story thread sequence',
};
const BUILTIN = /^(core|novel|knowledge|sources|brand|image|variants|gamebook)\./;
export const checkTitle = (id, title, t = (value) => value) => BUILTIN.test(id)
  ? (CHECKS[id.split('.').at(-1)] ? t(CHECKS[id.split('.').at(-1)]) : readable(id.split('.').at(-1)))
  : title || readable(id);
export const setTitle = (id, title, t = (value) => value) => SETS[id] ? t(SETS[id][0]) : title ?? readable(id);
export const setDescription = (id, description, t = (value) => value) => SETS[id] ? t(SETS[id][1]) : description;

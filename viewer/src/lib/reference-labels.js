const PROBLEMS = {
  FOOTNOTE_UNDEFINED: 'A note is referenced, but its text is missing.',
  FOOTNOTE_DUPLICATE: 'Two notes use the same identifier.',
  FOOTNOTE_UNUSED: 'This note is defined but never referenced.',
  BLOCK_REF_BROKEN: 'A reference points to an item that is missing.',
  SOURCE_CITATION_BROKEN: 'A citation points to a source that is missing.',
  BLOCK_DUPLICATE: 'Two items use the same reference identifier.',
};
export const referenceProblem = (code) => PROBLEMS[code] ?? 'A manuscript reference needs review.';

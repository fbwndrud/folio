/** Inline images already appear in mixed mode; the gallery contains only other attachments. */
export function galleryImages(assets, mode) {
  if (mode === 'pictures') return [...new Map([...assets.inline, ...assets.attached].map((a) => [a.id, a])).values()];
  if (mode !== 'mixed') return [];
  const inlineIds = new Set(assets.inline.map((a) => a.id));
  return [...new Map(assets.attached.filter((a) => !inlineIds.has(a.id)).map((a) => [a.id, a])).values()];
}

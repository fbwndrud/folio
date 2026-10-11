/** Derived display titles only: do not rewrite the copied work or its sealed records. */
export function exampleStudio(html, example) {
  const titles = example.titles ?? {}, variant = example.variant ?? 'main';
  const titleOf = node => { if (node && Object.hasOwn(titles, node.id)) node.title = titles[node.id]; };
  return html.replace(/(<script type="application\/json" id="folio-data">)([\s\S]*?)(<\/script>)/, (_match, start, json, end) => {
    const snapshot = JSON.parse(json);
    const edition = variant === 'main' ? snapshot : snapshot.variants?.editions?.[variant];
    const nodes = edition?.nodes;
    for (const view of Object.values(nodes ?? {})) {
      titleOf(view.node); for (const crumb of view.breadcrumb) titleOf(crumb);
    }
    for (const [id, view] of Object.entries(edition?.receiptNodes ?? {})) if (Object.hasOwn(titles, id)) view.title = titles[id];
    const contents = entries => { for (const entry of entries ?? []) { titleOf(entry); contents(entry.children); } };
    contents(edition?.publication?.contents);
    return `${start}${JSON.stringify(snapshot).replaceAll('<', '\\u003c')}${end}`;
  });
}

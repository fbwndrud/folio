import { useT } from '../i18n/context.jsx';

export function exampleMetadata(doc) {
  try {
    const value = JSON.parse(doc?.getElementById?.('folio-example')?.textContent ?? 'null');
    return value && ['simulated', 'pending'].includes(value.approval) ? value : null;
  } catch { return null; }
}
export function exampleApproval(doc) { return exampleMetadata(doc)?.approval ?? null; }
export function ExampleNotice() {
  const t = useT();
  const metadata = exampleMetadata(globalThis.document);
  const approval = metadata?.approval;
  if (!approval) return null;
  return <aside className="example-disclosure" aria-label={t("Example status")}>
    <strong>{approval === 'simulated' ? t("Demonstration · Simulated approval") : t("Draft · Author approval pending")}</strong>
    <p>{t("Same-host review is not independent certification. Simulated approval is not author adoption.")}</p>
    {metadata.readingVariant && metadata.readingVariant !== 'main' && <p>{t("Web and EPUB use the translation. Studio shows the original main manuscript; a variant selector is not available yet.")}</p>}
  </aside>;
}

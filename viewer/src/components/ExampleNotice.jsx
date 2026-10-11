import { useLoad } from '../api-context.jsx';
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
  const [variants] = useLoad('/api/variants');
  const variantReader = variants.data?.editions?.length > 1;
  const metadata = exampleMetadata(globalThis.document);
  const approval = metadata?.approval;
  if (!approval) return null;
  return <aside className="example-disclosure" aria-label={t("Example status")}>
    <strong>{approval === 'simulated' ? t("Demonstration · Simulated approval") : t("Draft · Author approval pending")}</strong>
    <p>{t("Same-host review is not independent certification. Simulated approval is not author adoption.")}</p>
    {metadata.readingVariant && metadata.readingVariant !== 'main' && !variants.loading && !variantReader && <p>{t("Web and EPUB use the translation. Studio shows the original main manuscript; a variant selector is not available yet.")}</p>}
  </aside>;
}

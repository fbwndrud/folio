import { useT } from '../i18n/context.jsx';

export function exampleApproval(doc) {
  try {
    const value = JSON.parse(doc?.getElementById?.('folio-example')?.textContent ?? 'null');
    return value && ['simulated', 'pending'].includes(value.approval) ? value.approval : null;
  } catch { return null; }
}
export function ExampleNotice() {
  const t = useT();
  const approval = exampleApproval(globalThis.document);
  if (!approval) return null;
  return <aside className="example-disclosure" aria-label={t("Example status")}>
    <strong>{approval === 'simulated' ? t("Demonstration · Simulated approval") : t("Draft · Author approval pending")}</strong>
    <p>{t("Same-host review is not independent certification. Simulated approval is not author adoption.")}</p>
  </aside>;
}

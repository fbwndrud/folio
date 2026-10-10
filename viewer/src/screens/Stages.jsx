import { useT } from '../i18n/context.jsx';
import { stepLabel, kindLabel, readable, errorSummary } from '../lib/labels.js';
import { useState } from 'react';
import { useApi, useLoad } from '../api-context.jsx';
import { canToggle, MODE_LABELS, toggleRequest } from '../lib/stages.js';
import { LoadState, TechnicalDetails } from '../components/Status.jsx';

/** 단계 화면: 레벨별 단계 흐름. 잠금 단계는 자물쇠만 그리고 토글이 없다. 바꾸면 work.yaml 에 쓴다. */
export function Stages({ onChanged }) {
  const t = useT();
  const api = useApi();
  const [state, reload] = useLoad('/api/stages');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(null);
  if (!state.data) return <LoadState state={state} />;
  const stages = state.data;
  const toggles = stages.toggles && !api.static;
  const change = async (level, step, mode) => {
    setMessage(null);
    try {
      await api.post('/api/stages', toggleRequest(stages, level, step, mode, reason));
      setMessage({ ok: true, level, stepId: step.id, mode });
      reload();
      onChanged?.();
    } catch (error) {
      setMessage({ ok: false, error });
      reload();
    }
  };
  return (
    <section className="writing-settings">
      <h2>{t("Writing steps")}</h2><p className="muted">{t("The steps your AI assistant follows for each group and writing section. Required steps always stay on.")}</p>
      {!toggles ? <p className="muted">{t("Step settings are read only for this work.")}</p> : (
        <label className="reason">{t("Reason for turning a step off")} <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></label>
      )}
      {message ? <p className={message.ok ? 'ok' : 'error'} role="status">{message.ok ? `${t(readable(message.level))} · ${t(stepLabel(message.stepId))}: ${t(MODE_LABELS[message.mode])}` : t(errorSummary(message.error.code))}</p> : null}
      {message?.error ? <TechnicalDetails code={message.error.code} message={message.error.message} /> : null}
      {stages.levels.map((level) => (
        <div key={level.level} className="level">
          <h3>{t(readable(level.level))} <span className="muted">{level.kind === 'leaf' ? t("Writing section") : t("Group")}</span></h3>
          <ol className="steps">
            {level.steps.map((step) => (
              <li key={step.id} className={step.locked ? 'locked' : undefined}>
                <div className="step-description"><span className="step-id">{t(stepLabel(step.id))}</span> <span className="muted">{step.tier ? t(kindLabel(step.tier)) : step.kind === 'commit' ? '' : t(kindLabel(step.kind))}</span></div>
                {step.locked ? <span className="lock" title={t("This required step cannot be turned off")}>{t("🔒 Required")}</span> : null}
                {canToggle(step, toggles) ? (
                  <select aria-label={`${t(readable(level.level))} ${t(stepLabel(step.id))}`} value={step.mode} onChange={(e) => change(level.level, step, e.target.value)}>
                    {step.modes.map((mode) => <option key={mode} value={mode}>{t(MODE_LABELS[mode])}</option>)}
                  </select>
                ) : (!step.locked ? <span>{t(MODE_LABELS[step.mode])}</span> : null)}
                {step.reason ? <span className="muted"> “{step.reason}”</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

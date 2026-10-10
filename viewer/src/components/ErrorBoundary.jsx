import { useT } from '../i18n/context.jsx';
import { Component } from 'react';
import { TechnicalDetails } from './Status.jsx';

/** 화면 렌더링 오류를 라우트 안에 가두고, 다른 화면으로 이동하면 다시 시작한다. */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  render() {
    if (this.state.error) return <ScreenError error={this.state.error} />;
    return this.props.children;
  }
}

function ScreenError({ error }) {
  const t = useT();
  return <div className="error" role="alert"><p>{t("This page could not be displayed. Reload the viewer to load its current screens.")}</p><button type="button" onClick={() => window.location.reload()}>{t("Reload viewer")}</button><TechnicalDetails code="SCREEN_UNAVAILABLE" message={error.message} /></div>;
}

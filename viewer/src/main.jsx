import { I18nProvider } from './i18n/context.jsx';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import './styles.css';
import './workspace.css';
import './resources.css';
import './reading.css';
import './studio.css';
import './examples.css';

createRoot(document.getElementById('root')).render(<StrictMode><I18nProvider><App /></I18nProvider></StrictMode>);

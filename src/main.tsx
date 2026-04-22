import ReactDOM from 'react-dom/client';
import App from './App';
import type { ColorMode } from '../ipc-contract';
import { api } from './services/api';
import { ColorModeProvider } from './theme/ColorModeContext';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

async function bootstrap() {
  let initialMode: ColorMode = 'light';
  try {
    const p = await api.getPreferences();
    initialMode = p.colorMode === 'dark' ? 'dark' : 'light';
  } catch {
    /* preload / DB not ready — stay light */
  }
  if (initialMode === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  } else {
    delete document.documentElement.dataset.theme;
  }

  ReactDOM.createRoot(rootEl as HTMLElement).render(
    <ColorModeProvider initialMode={initialMode}>
      <App />
    </ColorModeProvider>
  );
}

void bootstrap();

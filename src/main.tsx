import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/manrope';
import './styles.css';
import App from './App';
import { usePrefs } from './lib/prefs';

// Opened with no page (the home-screen icon): go to the chosen start page. Links and shortcuts with a page are left alone.
const start = usePrefs.getState().start;
if (start !== 'today' && (!window.location.hash || window.location.hash === '#/')) window.location.replace(`#/${start}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

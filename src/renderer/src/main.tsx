import '@fontsource/space-grotesk/700.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RuntimeMonitorApp } from './runtime-monitor-app';
import { EventOverlay } from './event-overlay';
import { getAstraDockClient } from './astradock-api';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Runtime Monitor root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get('overlay') === '1'
      ? <EventOverlay />
      : <RuntimeMonitorApp client={getAstraDockClient()} />}
  </StrictMode>
);

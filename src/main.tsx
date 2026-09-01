import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill';
import App from './App';
import { exposeTestApi } from './game/expose';
import './index.css';

initializeWebMCPPolyfill({ installTestingShim: true });
exposeTestApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

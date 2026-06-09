import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { applyAppearance } from './lib/settings';

const isDesktop = !!(window as Window & { orbitNative?: unknown }).orbitNative;
if (isDesktop) document.documentElement.classList.add('orbit-desktop');
applyAppearance();
const app = isDesktop ? <App /> : (
  <StrictMode>
    <App />
  </StrictMode>
);

createRoot(document.getElementById('root')!).render(app);

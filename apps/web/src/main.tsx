import '@dental/ui/fonts';
import { ColorSchemeScript } from '@mantine/core';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.tsx';
// Side-effect: api-client singleton'ini boot'da sozlaydi (configureClient).
// Login/register sahifalari `@dental/api-client`'dan to'g'ridan import qiladi,
// shuning uchun bu eager import bo'lmasa client sozlanmay qoladi.
import './lib/api.ts';
import './lib/dayjs.ts';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="light" />
    <App />
  </React.StrictMode>,
);

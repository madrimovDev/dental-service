import '@dental/ui/fonts';
import { ColorSchemeScript } from '@mantine/core';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ColorSchemeScript defaultColorScheme="light" />
    <App />
  </React.StrictMode>,
);

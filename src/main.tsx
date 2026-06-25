import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installGridVideoApi } from './lib/grid-video-api';
import './styles.css';

installGridVideoApi();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

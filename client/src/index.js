import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

import { Toaster } from 'react-hot-toast';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" toastOptions={{
      success: { style: { background: '#2E7D32', color: '#fff' }},
      error: { style: { background: '#C62828', color: '#fff' }}
    }} />
  </React.StrictMode>
);

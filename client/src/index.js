import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" toastOptions={{
        success: { style: { background: '#2E7D32', color: '#fff' }},
        error: { style: { background: '#C62828', color: '#fff' }}
      }} />
    </QueryClientProvider>
  </React.StrictMode>
);

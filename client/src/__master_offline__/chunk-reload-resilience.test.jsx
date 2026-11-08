import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../App';
import { LanguageProvider } from '../i18n/LanguageContext';

describe('ChunkLoadError resilience in ErrorBoundary', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    delete window.location;
    window.location = { ...originalLocation, reload: jest.fn() };
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    window.location = originalLocation;
  });

  test('1. ChunkLoadError triggers exactly one automatic window.location.reload()', () => {
    const ChunkError = () => {
      const err = new Error('Loading chunk 42 failed');
      err.name = 'ChunkLoadError';
      throw err;
    };
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(
        <LanguageProvider>
          <ErrorBoundary>
            <ChunkError />
          </ErrorBoundary>
        </LanguageProvider>
      );

      expect(window.location.reload).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem('medisync_chunk_reload')).toBe('true');
    } finally {
      logSpy.mockRestore();
    }
  });

  test('2. Repeated ChunkLoadError prevents reload loop and renders fallback UI', () => {
    sessionStorage.setItem('medisync_chunk_reload', 'true');
    const ChunkError = () => {
      const err = new Error('Loading chunk 42 failed');
      err.name = 'ChunkLoadError';
      throw err;
    };
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(
        <LanguageProvider>
          <ErrorBoundary>
            <ChunkError />
          </ErrorBoundary>
        </LanguageProvider>
      );

      // Must not call reload again when reload flag is active
      expect(window.location.reload).not.toHaveBeenCalled();
      // Must show fallback screen
      expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    } finally {
      logSpy.mockRestore();
    }
  });

  test('3. Dynamic import failure message also triggers single reload', () => {
    const DynamicImportError = () => {
      throw new Error('Failed to fetch dynamically imported module: /static/js/page.123.chunk.js');
    };
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(
        <LanguageProvider>
          <ErrorBoundary>
            <DynamicImportError />
          </ErrorBoundary>
        </LanguageProvider>
      );

      expect(window.location.reload).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem('medisync_chunk_reload')).toBe('true');
    } finally {
      logSpy.mockRestore();
    }
  });

  test('4. Healthy mount clears the chunk reload flag', async () => {
    sessionStorage.setItem('medisync_chunk_reload', 'true');

    render(
      <LanguageProvider>
        <ErrorBoundary>
          <div>Healthy Child Component</div>
        </ErrorBoundary>
      </LanguageProvider>
    );

    expect(screen.getByText('Healthy Child Component')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 600));
    expect(sessionStorage.getItem('medisync_chunk_reload')).toBeNull();
  });
});

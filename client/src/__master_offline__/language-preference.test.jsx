import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LanguagePreferenceCard from '../components/common/LanguagePreferenceCard';
import { LanguageProvider } from '../i18n/LanguageContext';
import api from '../api/axiosInstance';

jest.mock('../api/axiosInstance');

describe('LanguagePreferenceCard — Five-role preference selector', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  const renderCard = () =>
    render(
      <LanguageProvider>
        <LanguagePreferenceCard />
      </LanguageProvider>
    );

  test('1. Renders trilingual language choices (English, Sinhala, Tamil) with radio accessibility', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { preferredLanguage: 'en', persistenceAvailable: true } } });
    renderCard();

    expect(screen.getByRole('radiogroup', { name: /preferred language/i })).toBeInTheDocument();
    expect(screen.getByText('සිංහල')).toBeInTheDocument();
    expect(screen.getByText('தமிழ்')).toBeInTheDocument();

    await waitFor(() => {
      const radioOptions = screen.getAllByRole('radio');
      expect(radioOptions.length).toBe(3);
      expect(radioOptions[0]).toHaveAttribute('aria-checked', 'true');
    });
  });

  test('2. Loads initial preferred language from GET /auth/preferences/language', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { preferredLanguage: 'si', persistenceAvailable: true } } });
    renderCard();

    await waitFor(() => {
      const radioOptions = screen.getAllByRole('radio');
      // Sinhala should be checked
      expect(radioOptions[1]).toHaveAttribute('aria-checked', 'true');
    });
    expect(api.get).toHaveBeenCalledWith('/auth/preferences/language');
  });

  test('3. Selects new language and dispatches PATCH /auth/preferences/language on save', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { preferredLanguage: 'en', persistenceAvailable: true } } });
    api.patch.mockResolvedValueOnce({ data: { data: { preferredLanguage: 'ta', persistenceAvailable: true } } });

    renderCard();

    await waitFor(() => {
      expect(screen.getAllByRole('radio').length).toBe(3);
    });

    // Click Tamil radio
    const tamilOption = screen.getByText('தமிழ்');
    fireEvent.click(tamilOption);

    const saveButton = screen.getByRole('button', { name: /save account preference/i });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/auth/preferences/language', {
        preferredLanguage: 'ta'
      });
      expect(screen.getByText(/(Language preference updated and saved to your account|விருப்பம் வெற்றிகரமாக சேமி|Preference saved successfully)/i)).toBeInTheDocument();
    });

    expect(localStorage.getItem('medisync_language')).toBe('ta');
  });

  test('4. Handles 403 authorization denied / expired session path gracefully', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { preferredLanguage: 'en', persistenceAvailable: true } } });
    api.patch.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { error: 'LANGUAGE_ACCOUNT_DENIED' }
      }
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getAllByRole('radio').length).toBe(3);
    });

    fireEvent.click(screen.getByText('සිංහල'));
    fireEvent.click(screen.getByRole('button', { name: /save account preference/i }));

    await waitFor(() => {
      expect(screen.getByText(/(Permission denied or session expired|ක්‍රියාව ප්‍රතික්ෂේප විය|Action denied)/i)).toBeInTheDocument();
    });
  });

  test('5. Handles network failure without crashing, displaying informative status', async () => {
    api.get.mockRejectedValueOnce({
      code: 'ERR_NETWORK',
      message: 'Network Error'
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/Network connectivity issue/i)).toBeInTheDocument();
    });
  });

  test('6. Save button is disabled when selected language matches already persisted preference', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { preferredLanguage: 'en', persistenceAvailable: true } } });
    renderCard();

    await waitFor(() => {
      const saveBtn = screen.getByRole('button', { name: /save account preference/i });
      expect(saveBtn).toBeDisabled();
    });
  });

  test('7. Accurately presents persistenceAvailable:false hold for Patient profile without false save confirmation', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          preferredLanguage: 'en',
          persistenceAvailable: false
        }
      }
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/Account database persistence is unavailable for this profile/i)).toBeInTheDocument();
      const heldBtn = screen.getByRole('button', { name: /database persistence unavailable/i });
      expect(heldBtn).toBeDisabled();
    });

    // Selecting a language applies to session and local cache, without calling PATCH or showing savedSuccess
    fireEvent.click(screen.getByText('සිංහල'));
    expect(localStorage.getItem('medisync_language')).toBe('si');
    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.queryByText(/Language preference updated and saved to your account/i)).not.toBeInTheDocument();
  });

  test('8. Handles 503 schema hold response from backend with specific schema authorization message', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { preferredLanguage: 'en', persistenceAvailable: true } } });
    api.patch.mockRejectedValueOnce({
      response: {
        status: 503,
        data: { error: 'LANGUAGE_SCHEMA_APPROVAL_REQUIRED' }
      }
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getAllByRole('radio').length).toBe(3);
    });

    fireEvent.click(screen.getByText('தமிழ்'));
    fireEvent.click(screen.getByRole('button', { name: /save account preference/i }));

    await waitFor(() => {
      expect(screen.getByText(/Patch 07/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Language preference updated and saved to your account/i)).not.toBeInTheDocument();
  });

  test('9. Missing persistenceAvailable in GET response defaults to false (fail-closed)', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          preferredLanguage: 'en'
          // persistenceAvailable omitted
        }
      }
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/Account database persistence is unavailable for this profile/i)).toBeInTheDocument();
      const heldBtn = screen.getByRole('button', { name: /database persistence unavailable/i });
      expect(heldBtn).toBeDisabled();
    });
  });

  test('10. Malformed PATCH response does not confirm save', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { preferredLanguage: 'en', persistenceAvailable: true } } });
    api.patch.mockResolvedValueOnce({
      data: {
        // missing data.preferredLanguage
        message: 'Updated'
      }
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getAllByRole('radio').length).toBe(3);
    });

    fireEvent.click(screen.getByText('සිංහල'));
    fireEvent.click(screen.getByRole('button', { name: /save account preference/i }));

    await waitFor(() => {
      expect(screen.getByText(/(did not confirm account preference persistence|ගිණුම් මනාප තහවුරු කිරීම සේවාදායකයෙන් තහවුරු නොවීය)/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Language preference updated and saved to your account/i)).not.toBeInTheDocument();
  });
});

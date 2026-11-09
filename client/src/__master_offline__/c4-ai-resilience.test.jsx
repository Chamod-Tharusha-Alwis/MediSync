import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { isColdStartError } from '../utils/inferenceResponse';
import NewConsultation from '../pages/doctor/NewConsultation';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/SymptomTagInput', () => ({ onChange }) => (
  <button onClick={() => onChange(['fever', 'headache'])}>Add symptoms</button>
));
jest.mock('../components/DrugSearchInput', () => () => null);
jest.mock('../components/PatientAccessModal', () => ({ onSuccess }) => (
  <button onClick={() => onSuccess(`inert.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.inert`)}>
    Grant consent
  </button>
));

describe('Feature C4: Doctor AI Resilience & Disclaimer Suite', () => {
  describe('isColdStartError client utility', () => {
    test('identifies cold start status codes and waking payloads', () => {
      expect(isColdStartError({ response: { status: 503 } })).toBe(true);
      expect(isColdStartError({ response: { status: 502 } })).toBe(true);
      expect(isColdStartError({ response: { status: 504 } })).toBe(true);
      expect(isColdStartError({ code: 'ECONNABORTED' })).toBe(true);
      expect(isColdStartError({ code: 'ERR_NETWORK' })).toBe(true);
      expect(isColdStartError({ response: { data: { availability: 'waking_up' } } })).toBe(true);
      expect(isColdStartError({ response: { data: { error: 'Service waking up' } } })).toBe(true);
    });

    test('rejects non-cold start errors', () => {
      expect(isColdStartError({ response: { status: 400 } })).toBe(false);
      expect(isColdStartError({ response: { status: 401 } })).toBe(false);
      expect(isColdStartError({ response: { status: 403 } })).toBe(false);
      expect(isColdStartError({ response: { status: 404 } })).toBe(false);
      expect(isColdStartError({ response: { status: 500 } })).toBe(false);
      expect(isColdStartError(null)).toBe(false);
      expect(isColdStartError({})).toBe(false);
    });
  });

  describe('NewConsultation AI disclaimer and fallback', () => {
    beforeEach(() => {
      localStorage.clear();
      const api = require('../api/axiosInstance').default;
      api.get.mockReset();
      api.post.mockReset();
      api.get
        .mockResolvedValueOnce({ data: { data: { fullName: 'Test Patient' } } })
        .mockResolvedValueOnce({ data: { data: [] } });
    });

    test('displays Reference matches only badge and mandatory non-diagnostic disclaimer', async () => {
      render(<NewConsultation />);
      fireEvent.change(screen.getByLabelText('Patient NIC'), { target: { value: 'QA-SYNTHETIC' } });
      fireEvent.click(screen.getByLabelText('Request patient verification'));
      fireEvent.click(screen.getByText('Grant consent'));
      await screen.findByText('Test Patient');
      fireEvent.click(screen.getByText('Proceed to Symptoms'));
      fireEvent.click(screen.getByText('Add symptoms'));
      fireEvent.click(screen.getByText('Continue to Reference Matches'));

      const disclaimer = screen.getByTestId('clinical-validation-disclaimer');
      expect(disclaimer).toBeInTheDocument();
      expect(screen.getByTestId('clinical-validation-badge')).toHaveTextContent('Reference matches only');
      expect(disclaimer).toHaveTextContent('A clinician must assess; matches are not diagnoses');
    });
  });
});

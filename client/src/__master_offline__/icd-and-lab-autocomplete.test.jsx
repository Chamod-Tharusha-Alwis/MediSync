import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import api from '../api/axiosInstance';
import NewConsultation from '../pages/doctor/NewConsultation';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/SymptomTagInput', () => ({ onChange }) => (
  <button onClick={() => onChange(['fever', 'joint pain'])}>Add symptoms</button>
));
jest.mock('../components/DrugSearchInput', () => () => <div data-testid="mock-drug-search" />);
jest.mock('../components/PatientAccessModal', () => ({ onSuccess }) => (
  <button onClick={() => onSuccess(`inert.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.inert`)}>
    Grant consent
  </button>
));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getIcdInput = () => screen.getByPlaceholderText(/Search disease, rare condition, or code/i);
const getLabInput = () => screen.getByPlaceholderText(/e\.g\. Blood, Thyroid, Chest X-Ray/i);

let currentIcdResults = [];

async function navigateToStep4() {
  render(<NewConsultation />);
  fireEvent.change(screen.getByLabelText('Patient NIC'), { target: { value: 'QA-SYNTHETIC-NIC' } });
  fireEvent.click(screen.getByLabelText('Request patient verification'));
  fireEvent.click(screen.getByText('Grant consent'));
  await screen.findByText('Synthetic Patient');
  fireEvent.click(screen.getByText('Proceed to Symptoms'));
  fireEvent.click(screen.getByText('Add symptoms'));
  fireEvent.click(screen.getByText('Continue to Reference Matches'));
}

describe('ICD & Lab Test Autocomplete Enhancements Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    api.get.mockReset();
    api.post.mockReset();
    currentIcdResults = [
      { code: 'A90', description: 'Dengue fever', version: 'ICD-10' },
      { code: '1D20', description: 'Dengue without warning signs', version: 'ICD-11' }
    ];
    api.get.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/patient/QA-SYNTHETIC-NIC/timeline')) {
        return Promise.resolve({ data: { data: [] } });
      }
      if (typeof url === 'string' && url.includes('/patient/QA-SYNTHETIC-NIC')) {
        return Promise.resolve({ data: { data: { fullName: 'Synthetic Patient', allergies: [] } } });
      }
      if (typeof url === 'string' && url.includes('/drugs/icd/search')) {
        return Promise.resolve({ data: { data: currentIcdResults } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  afterEach(() => {
    cleanup();
  });

  test('1. ICD search debounces 300ms and queries with min 2 characters', async () => {
    await navigateToStep4();

    // Single character: no API call even after 350ms
    fireEvent.change(getIcdInput(), { target: { value: 'd' } });
    await sleep(350);
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/drugs/icd/search'), expect.anything());

    // Two characters + debounce: API call made
    fireEvent.change(getIcdInput(), { target: { value: 'de' } });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/drugs/icd/search?q=de'), expect.anything());
    }, { timeout: 1500 });
  });

  test('2. ICD search keyboard navigation: ArrowDown navigates suggestions, Enter selects', async () => {
    await navigateToStep4();

    fireEvent.change(getIcdInput(), { target: { value: 'den' } });
    expect(await screen.findByText('Dengue fever', {}, { timeout: 1500 })).toBeInTheDocument();

    // Arrow down highlights first item
    fireEvent.keyDown(getIcdInput(), { key: 'ArrowDown' });
    await waitFor(() => {
      const firstOption = screen.getByRole('option', { name: /Dengue fever/i });
      expect(firstOption).toHaveAttribute('aria-selected', 'true');
    });

    // Enter selects highlighted item
    fireEvent.keyDown(getIcdInput(), { key: 'Enter' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  test('3. ICD search Escape key dismisses suggestion dropdown', async () => {
    await navigateToStep4();

    fireEvent.change(getIcdInput(), { target: { value: 'den' } });
    expect(await screen.findByRole('listbox', {}, { timeout: 1500 })).toBeInTheDocument();

    fireEvent.keyDown(getIcdInput(), { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  test('4. ICD search empty state renders custom clinician fallback option', async () => {
    currentIcdResults = [];

    await navigateToStep4();

    fireEvent.change(getIcdInput(), { target: { value: 'UnheardDiseaseXYZ' } });
    expect(await screen.findByText(/No matching diagnoses found in catalog for "UnheardDiseaseXYZ"/i, {}, { timeout: 1500 })).toBeInTheDocument();

    // Pressing Enter sets manual clinician diagnosis
    fireEvent.keyDown(getIcdInput(), { key: 'Enter' });
    await waitFor(() => {
      const manualInput = screen.getByPlaceholderText(/Enter clinician-entered condition description.../i);
      expect(manualInput).toHaveValue('UnheardDiseaseXYZ');
    });
  });

  test('5. Lab test autocomplete: ArrowDown highlights, Enter selects suggestion', async () => {
    await navigateToStep4();
    // Proceed to Step 5 (Rx & Labs)
    const manualInput = screen.getByPlaceholderText(/Enter clinician-entered condition description.../i);
    fireEvent.change(manualInput, { target: { value: 'Clinical Observation' } });
    fireEvent.click(screen.getByText('Build Prescription'));

    fireEvent.change(getLabInput(), { target: { value: 'dengue' } });
    expect(await screen.findByRole('option', { name: /Dengue NS1 Antigen/i })).toBeInTheDocument();

    // Navigate and select
    fireEvent.keyDown(getLabInput(), { key: 'ArrowDown' });
    await waitFor(() => {
      const firstLabOption = screen.getByRole('option', { name: /Dengue NS1 Antigen/i });
      expect(firstLabOption).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.keyDown(getLabInput(), { key: 'Enter' });

    // Assert Dengue NS1 Antigen is added as tag in ordered tests
    await waitFor(() => {
      expect(screen.getByText('Dengue NS1 Antigen')).toBeInTheDocument();
      expect(getLabInput().value).toBe('');
    });
  });

  test('6. Lab test autocomplete: Escape dismisses suggestions', async () => {
    await navigateToStep4();
    const manualInput = screen.getByPlaceholderText(/Enter clinician-entered condition description.../i);
    fireEvent.change(manualInput, { target: { value: 'Clinical Observation' } });
    fireEvent.click(screen.getByText('Build Prescription'));

    fireEvent.change(getLabInput(), { target: { value: 'dengue' } });
    expect(await screen.findByRole('option', { name: /Dengue NS1 Antigen/i })).toBeInTheDocument();

    fireEvent.keyDown(getLabInput(), { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /Dengue NS1 Antigen/i })).not.toBeInTheDocument();
    });
  });
});

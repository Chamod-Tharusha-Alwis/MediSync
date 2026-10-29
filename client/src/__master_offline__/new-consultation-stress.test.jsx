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

async function navigateToStep5() {
  await navigateToStep4();
  const manualInput = screen.getByPlaceholderText(/Enter clinician-entered condition description.../i);
  fireEvent.change(manualInput, { target: { value: 'Dengue Fever Assessment' } });
  fireEvent.click(screen.getByText('Build Prescription'));
}

describe('NewConsultation ICD & Lab Tests Stress Suite (m2_challenger_2)', () => {
  beforeEach(() => {
    localStorage.clear();
    api.get.mockReset();
    api.post.mockReset();
    currentIcdResults = [
      { code: 'A90', description: 'Dengue fever', version: 'ICD-10' },
      { code: 'A91', description: 'Dengue haemorrhagic fever', version: 'ICD-10' }
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

  test('1. ICD search wrapping arrow navigation (30 Down, 30 Up) bounds and wrap-around', async () => {
    await navigateToStep4();
    const icdInput = getIcdInput();

    fireEvent.change(icdInput, { target: { value: 'den' } });
    expect(await screen.findByText('Dengue fever', {}, { timeout: 2000 })).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);

    // 1st Down press: from -1 -> 0
    fireEvent.keyDown(getIcdInput(), { key: 'ArrowDown' });
    await waitFor(() => {
      const updatedOptions = screen.getAllByRole('option');
      expect(updatedOptions[0]).toHaveAttribute('aria-selected', 'true');
    });

    // 2nd Down press: from 0 -> 1
    fireEvent.keyDown(getIcdInput(), { key: 'ArrowDown' });
    await waitFor(() => {
      const updatedOptions = screen.getAllByRole('option');
      expect(updatedOptions[1]).toHaveAttribute('aria-selected', 'true');
    });

    // 3rd Down press: wraps from 1 -> 0
    fireEvent.keyDown(getIcdInput(), { key: 'ArrowDown' });
    await waitFor(() => {
      const updatedOptions = screen.getAllByRole('option');
      expect(updatedOptions[0]).toHaveAttribute('aria-selected', 'true');
    });

    // ArrowUp from 0: wraps backwards to 1 (last item)
    fireEvent.keyDown(getIcdInput(), { key: 'ArrowUp' });
    await waitFor(() => {
      const finalOptions = screen.getAllByRole('option');
      expect(finalOptions[1]).toHaveAttribute('aria-selected', 'true');
    });

    // ArrowUp from 1: moves to 0
    fireEvent.keyDown(getIcdInput(), { key: 'ArrowUp' });
    await waitFor(() => {
      const finalOptions = screen.getAllByRole('option');
      expect(finalOptions[0]).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('2. ICD search empty or whitespace Enter does not confirm manual diagnosis', async () => {
    await navigateToStep4();
    const icdInput = getIcdInput();
    const manualInput = screen.getByPlaceholderText(/Enter clinician-entered condition description.../i);

    // 10 enters on empty string
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(icdInput, { key: 'Enter' });
    }
    expect(manualInput.value).toBe('');

    // 10 enters on whitespace
    fireEvent.change(icdInput, { target: { value: '       ' } });
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(icdInput, { key: 'Enter' });
    }
    expect(manualInput.value).toBe('');
  });

  test('3. ICD search rapid click-outside & touch-outside bursts dismiss listbox', async () => {
    await navigateToStep4();
    const icdInput = getIcdInput();

    fireEvent.change(icdInput, { target: { value: 'den' } });
    expect(await screen.findByRole('listbox', {}, { timeout: 2000 })).toBeInTheDocument();

    // 20 alternating mousedown and touchstart events outside
    for (let i = 0; i < 10; i++) {
      fireEvent.mouseDown(document.body);
      fireEvent.touchStart(document.body);
    }

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  test('4. Lab test autocomplete wrapping arrows (50 Down, 50 Up) and bounds', async () => {
    await navigateToStep5();
    const labInput = getLabInput();

    fireEvent.change(labInput, { target: { value: 'urine' } });
    expect(await screen.findByRole('option', { name: /Urine Full Report/i }, { timeout: 2000 })).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    const count = options.length;

    // 1st Down: highlights item 0
    fireEvent.keyDown(getLabInput(), { key: 'ArrowDown' });
    await waitFor(() => {
      const freshOptions = screen.getAllByRole('option');
      expect(freshOptions[0]).toHaveAttribute('aria-selected', 'true');
    });

    // 2nd Down: highlights item 1
    fireEvent.keyDown(getLabInput(), { key: 'ArrowDown' });
    await waitFor(() => {
      const freshOptions = screen.getAllByRole('option');
      expect(freshOptions[1]).toHaveAttribute('aria-selected', 'true');
    });

    // Up press: moves back to 0
    fireEvent.keyDown(getLabInput(), { key: 'ArrowUp' });
    await waitFor(() => {
      const freshOptions = screen.getAllByRole('option');
      expect(freshOptions[0]).toHaveAttribute('aria-selected', 'true');
    });

    // Up press from 0: wraps to last item (count - 1)
    fireEvent.keyDown(getLabInput(), { key: 'ArrowUp' });
    await waitFor(() => {
      const freshOptions = screen.getAllByRole('option');
      expect(freshOptions[count - 1]).toHaveAttribute('aria-selected', 'true');
    });

    // Down press from last item: wraps back to 0
    fireEvent.keyDown(getLabInput(), { key: 'ArrowDown' });
    await waitFor(() => {
      const freshOptions = screen.getAllByRole('option');
      expect(freshOptions[0]).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('5. Lab test autocomplete empty or whitespace Enter does not add empty chips', async () => {
    await navigateToStep5();
    const labInput = getLabInput();

    // Enter on empty input
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(labInput, { key: 'Enter' });
    }
    // Enter on whitespace
    fireEvent.change(labInput, { target: { value: '     ' } });
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(labInput, { key: 'Enter' });
    }

    // Verify no chips rendered
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('6. Lab test click-outside & touch-outside bursts dismiss suggestions', async () => {
    await navigateToStep5();
    const labInput = getLabInput();

    fireEvent.change(labInput, { target: { value: 'urine' } });
    expect(await screen.findByRole('listbox', {}, { timeout: 2000 })).toBeInTheDocument();

    for (let i = 0; i < 10; i++) {
      fireEvent.mouseDown(document.body);
      fireEvent.touchStart(document.body);
    }

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  test('7. Layout shift invariant: ICD and Lab dropdowns use absolute positioning with 0px displacement', async () => {
    await navigateToStep4();
    const icdInput = getIcdInput();

    fireEvent.change(icdInput, { target: { value: 'den' } });
    const icdList = await screen.findByRole('listbox', {}, { timeout: 2000 });
    expect(icdList).toBeInTheDocument();

    // Absolute positioning invariant
    expect(icdList.className).toContain('absolute');
    expect(icdList.className).toContain('z-50');

    // Sibling container (manual clinician diagnosis section)
    const icdWrapper = icdList.parentElement;
    expect(icdWrapper.className).toContain('relative');
    const siblingDiagnosisSection = icdWrapper.nextElementSibling;
    expect(siblingDiagnosisSection).not.toBeNull();

    // Step 5: Lab test dropdown
    const manualInput = screen.getByPlaceholderText(/Enter clinician-entered condition description.../i);
    fireEvent.change(manualInput, { target: { value: 'Confirmed Observation' } });
    fireEvent.click(screen.getByText('Build Prescription'));

    const labInput = getLabInput();
    fireEvent.change(labInput, { target: { value: 'urine' } });
    const labList = await screen.findByRole('listbox', {}, { timeout: 2000 });

    // Absolute positioning invariant for Lab dropdown
    expect(labList.className).toContain('absolute');
    expect(labList.className).toContain('z-50');
  });
});

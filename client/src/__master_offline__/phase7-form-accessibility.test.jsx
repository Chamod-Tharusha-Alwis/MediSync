import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../api/axiosInstance';
import AdminLogin from '../pages/admin/Login';
import DoctorLogin from '../pages/doctor/Login';
import PatientLogin from '../pages/patient/Login';
import PharmacyLogin from '../pages/pharmacy/Login';
import HospitalLogin from '../pages/hospital/Login';
import PasswordInput from '../components/common/PasswordInput';
import NewConsultation from '../pages/doctor/NewConsultation';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() }
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/SymptomTagInput', () => ({ onChange }) => <button onClick={() => onChange(['synthetic symptom'])}>Add symptoms</button>);
jest.mock('../components/DrugSearchInput', () => ({ onSelect }) => <button onClick={() => onSelect({ name: 'Synthetic medication' })}>Choose synthetic medication</button>);
// Inert consent boundary only: this suite makes no real authorization or persistence claim.
jest.mock('../components/PatientAccessModal', () => ({ onSuccess }) => <button onClick={() => onSuccess(`inert.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.inert`)}>Grant inert consent</button>);

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  api.get.mockImplementation(url => Promise.resolve({ data: { data: url.endsWith('/timeline') ? [] : url.includes('/patient/') ? { fullName: 'Synthetic fixture', allergies: [] } : [] } }));
  api.post.mockResolvedValue({ data: { data: [], interactions: [] } });
});
afterEach(cleanup);

test.each([
  ['Admin', AdminLogin], ['Doctor', DoctorLogin], ['Patient', PatientLogin],
  ['Pharmacy', PharmacyLogin], ['Hospital', HospitalLogin]
])('%s login exposes associated email and password labels without authenticating', (role, Component) => {
  render(<MemoryRouter><Component /></MemoryRouter>);
  const email = screen.getByLabelText(/email/i);
  const password = screen.getByLabelText(/password/i);
  expect(email).toHaveAttribute('type', 'email');
  expect(password).toHaveAttribute('type', 'password');
  fireEvent.change(email, { target: { value: 'offline-identifier' } });
  expect(email).toHaveValue('offline-identifier');
  expect(api.post).not.toHaveBeenCalled();
});

test('password errors are described alongside both caller-provided help references', () => {
  const { rerender } = render(<><p id="help">Help text</p><p id="extra">Additional help</p><PasswordInput label="Credentials" onChange={() => {}} describedBy="help" aria-describedby="extra" error="Invalid fixture input" /></>);
  const input = screen.getByLabelText('Credentials');
  expect(input).toHaveAccessibleDescription('Help text Additional help Invalid fixture input');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  const previousId = input.id;
  rerender(<><p id="help">Help text</p><p id="extra">Additional help</p><PasswordInput label="Credentials" onChange={() => {}} describedBy="help" aria-describedby="extra" /></>);
  expect(screen.getByLabelText('Credentials')).toHaveAttribute('id', previousId);
  expect(screen.getByLabelText('Credentials')).toHaveAccessibleDescription('Help text Additional help');
  expect(screen.getByLabelText('Credentials')).toHaveAttribute('aria-invalid', 'false');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('multiple password inputs associate only their own validation errors', () => {
  render(<><PasswordInput label="First credentials" onChange={() => {}} error="First error" /><PasswordInput label="Second credentials" onChange={() => {}} error="Second error" /></>);
  expect(screen.getByLabelText('First credentials')).toHaveAccessibleDescription('First error');
  expect(screen.getByLabelText('Second credentials')).toHaveAccessibleDescription('Second error');
  expect(screen.getByLabelText('First credentials').id).not.toBe(screen.getByLabelText('Second credentials').id);
});

async function referenceStep() {
  render(<MemoryRouter><NewConsultation /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Patient NIC'), { target: { value: 'QA-SYNTHETIC-NIC' } });
  fireEvent.click(screen.getByLabelText('Request patient verification'));
  fireEvent.click(screen.getByText('Grant inert consent'));
  await screen.findByText('Synthetic fixture');
  fireEvent.click(screen.getByText('Proceed to Symptoms'));
  fireEvent.click(screen.getByText('Add symptoms'));
  fireEvent.click(screen.getByText('Continue to Reference Matches'));
}

test('disease reference search and manual clinician diagnosis have accessible names', async () => {
  await referenceStep();
  expect(screen.getByRole('combobox', { name: 'Search disease reference codes' })).toBeInTheDocument();
  const diagnosis = screen.getByLabelText(/Manual Clinician Diagnosis/);
  fireEvent.change(diagnosis, { target: { value: 'Synthetic assessment' } });
  expect(diagnosis).toHaveValue('Synthetic assessment');
});

test('lab and medication controls remain operable using accessible names', async () => {
  await referenceStep();
  fireEvent.change(screen.getByLabelText(/Manual Clinician Diagnosis/), { target: { value: 'Synthetic assessment' } });
  fireEvent.click(screen.getByText('Build Prescription'));
  expect(screen.getByRole('combobox', { name: 'Search laboratory tests' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Choose synthetic medication'));
  const dosage = await screen.findByLabelText('Dosage for Synthetic medication');
  fireEvent.change(dosage, { target: { value: '2 tabs' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Frequency for Synthetic medication' }), { target: { value: 'BD' } });
  fireEvent.change(screen.getByLabelText('Instructions for Synthetic medication'), { target: { value: 'Synthetic instruction' } });
  expect(dosage).toHaveValue('2 tabs');
  expect(screen.getByLabelText('Frequency for Synthetic medication')).toHaveValue('BD');
  expect(screen.getByLabelText('Instructions for Synthetic medication')).toHaveValue('Synthetic instruction');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Synthetic medication from prescription' }));
  await waitFor(() => expect(screen.queryByLabelText('Dosage for Synthetic medication')).not.toBeInTheDocument());
});

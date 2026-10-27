import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DoctorDirectory from '../pages/public/DoctorDirectory';
import HospitalDirectory from '../pages/public/HospitalDirectory';
import PharmacyDirectory from '../pages/public/PharmacyDirectory';
import { usePublicDirectory } from '../api/usePublicDirectory';

jest.mock('../api/usePublicDirectory', () => ({ usePublicDirectory: jest.fn() }));
jest.mock('../components/common/PublicNavbar', () => () => null);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../pages/public/DoctorProfileModal', () => ({ doctor, onClose }) => <div role="dialog" aria-label={doctor.fullName}><button onClick={onClose}>Close profile</button></div>);
jest.mock('../pages/public/HospitalProfileModal', () => ({ hospital, onClose }) => <div role="dialog" aria-label={hospital.name}><button onClick={onClose}>Close profile</button></div>);
jest.mock('../pages/public/PharmacyProfileModal', () => ({ pharmacy, onClose }) => <div role="dialog" aria-label={pharmacy.name}><button onClick={onClose}>Close profile</button></div>);

const directories = [
  ['doctor', DoctorDirectory, { _id: 'owned-doctor', fullName: 'Synthetic Doctor', specialization: 'Demo Reference', isSynthetic: true }],
  ['hospital', HospitalDirectory, { _id: 'owned-hospital', name: 'Synthetic Hospital', type: 'Demo', isSynthetic: true }],
  ['pharmacy', PharmacyDirectory, { _id: 'owned-pharmacy', name: 'Synthetic Pharmacy', isSynthetic: true }],
];
afterEach(cleanup);

describe.each(directories)('%s directory keyboard profile access', (_name, Component, record) => {
  beforeEach(() => usePublicDirectory.mockReturnValue({ records: [record], loading: false, error: null, retry: jest.fn() }));
  test.each(['Enter', ' '])('%s opens the same profile as a pointer activation', key => {
    render(<Component />); const name = record.fullName || record.name;
    const card = screen.getByRole('button', { name: `View profile: ${name}` });
    card.focus(); expect(card).toHaveFocus(); fireEvent.keyDown(card, { key });
    expect(screen.getByRole('dialog', { name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close profile' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  test('other keys do not activate a profile', () => {
    render(<Component />); const card = screen.getByRole('button', { name: `View profile: ${record.fullName || record.name}` });
    fireEvent.keyDown(card, { key: 'ArrowDown' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  test('pointer activation remains available', () => {
    render(<Component />); fireEvent.click(screen.getByRole('button', { name: `View profile: ${record.fullName || record.name}` }));
    expect(screen.getByRole('dialog', { name: record.fullName || record.name })).toBeInTheDocument();
  });
});

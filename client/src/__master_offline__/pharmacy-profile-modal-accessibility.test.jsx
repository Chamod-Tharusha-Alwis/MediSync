import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PharmacyProfileModal from '../pages/public/PharmacyProfileModal';
import api from '../api/axiosInstance';

jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn() } }));
const pharmacy = { _id: 'owned-synthetic-pharmacy', name: 'Synthetic Pharmacy', isSynthetic: true };
beforeEach(() => { localStorage.clear(); document.body.style.overflow = 'auto'; api.get.mockResolvedValue({ data: { data: [] } }); });
afterEach(() => { cleanup(); document.body.style.overflow = ''; });

test('the actual pharmacy profile exposes a labelled modal dialog', async () => {
  render(<PharmacyProfileModal pharmacy={pharmacy} onClose={() => {}} />);
  expect(await screen.findByRole('dialog', { name: 'Synthetic Pharmacy' })).toHaveAttribute('aria-modal', 'true');
});
test('the visible icon close control has an accessible name and closes once', () => {
  const close = jest.fn(); render(<PharmacyProfileModal pharmacy={pharmacy} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close modal' })); expect(close).toHaveBeenCalledTimes(1);
});
test('Escape dismisses the pharmacy profile while unrelated keys do not', () => {
  const close = jest.fn(); render(<PharmacyProfileModal pharmacy={pharmacy} onClose={close} />);
  fireEvent.keyDown(window, { key: 'ArrowRight' }); expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'Escape' }); expect(close).toHaveBeenCalledTimes(1);
});
test('unmount restores the exact prior scroll state and removes its Escape listener', () => {
  const close = jest.fn(); const { unmount } = render(<PharmacyProfileModal pharmacy={pharmacy} onClose={close} />);
  expect(document.body.style.overflow).toBe('hidden'); unmount(); expect(document.body.style.overflow).toBe('auto');
  fireEvent.keyDown(window, { key: 'Escape' }); expect(close).not.toHaveBeenCalled();
});
test('a pre-existing scroll lock remains locked after closing the profile', () => {
  document.body.style.overflow = 'hidden'; const { unmount } = render(<PharmacyProfileModal pharmacy={pharmacy} onClose={() => {}} />);
  unmount(); expect(document.body.style.overflow).toBe('hidden');
});
test('reviews failure does not remove the accessible dismiss controls', async () => {
  api.get.mockRejectedValue({ response: { status: 503 } }); const close = jest.fn(); render(<PharmacyProfileModal pharmacy={pharmacy} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Patient Feedback' })); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Close modal' })); expect(close).toHaveBeenCalledTimes(1);
});

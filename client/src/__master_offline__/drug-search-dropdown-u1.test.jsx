import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import api from '../api/axiosInstance';
import DrugSearchInput from '../components/DrugSearchInput';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

describe('U1: Medication Search Dropdown Overlap and Accessibility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    api.get.mockReset();
    api.post.mockReset();
    api.post.mockResolvedValue({ data: { data: { hasInteraction: false, warnings: [] } } });
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test('Dropdown renders via portal to document.body with fixed positioning from input rect', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [
          { _id: 'd1', name: 'Paracetamol', brand: 'Panadol', genericName: 'Acetaminophen' },
          { _id: 'd2', name: 'Amoxicillin', brand: 'Amoxil', genericName: 'Amoxicillin' }
        ]
      }
    });

    const { container } = render(
      <div id="host-card" style={{ overflow: 'hidden', position: 'relative' }}>
        <DrugSearchInput onSelect={jest.fn()} />
      </div>
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    // Type query to trigger search
    fireEvent.change(input, { target: { value: 'para' } });
    await act(async () => { jest.advanceTimersByTime(350); });

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    // Portal invariant: listbox should be rendered in document.body, NOT clipped inside #host-card
    expect(container.querySelector('#medication-suggestions-list')).toBeNull();
    expect(document.body.contains(listbox)).toBe(true);
    expect(listbox.parentElement).toBe(document.body);

    // Fixed positioning invariant: renders above all stacking contexts
    expect(listbox.style.position).toBe('fixed');
    expect(Number(listbox.style.zIndex) || 0).toBeGreaterThanOrEqual(9999);
  });

  test('Accessibility: role="listbox", role="option", aria-selected, and aria-expanded toggles', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [
          { _id: 'd1', name: 'Paracetamol', brand: 'Panadol', genericName: 'Acetaminophen' },
          { _id: 'd2', name: 'Paramol', brand: 'Paramol', genericName: 'Paracetamol' }
        ]
      }
    });

    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-controls', 'medication-suggestions-list');

    // Open dropdown
    fireEvent.change(input, { target: { value: 'para' } });
    await act(async () => { jest.advanceTimersByTime(350); });

    expect(input).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0]).toHaveAttribute('aria-selected', 'false');

    // Keyboard navigation: ArrowDown selects first option
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

    // Escape closes dropdown and updates aria-expanded
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('Dismissal on outside click and Escape, keyboard Enter selection intact', async () => {
    const handleSelect = jest.fn();
    api.get.mockResolvedValue({
      data: {
        data: [
          { _id: 'd1', name: 'Paracetamol', brand: 'Panadol', genericName: 'Acetaminophen' }
        ]
      }
    });

    render(
      <div>
        <div data-testid="outside-area">Outside Area</div>
        <DrugSearchInput onSelect={handleSelect} />
      </div>
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'para' } });
    await act(async () => { jest.advanceTimersByTime(350); });

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Outside click dismisses
    fireEvent.mouseDown(screen.getByTestId('outside-area'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Reopen and test Enter selection
    fireEvent.change(input, { target: { value: 'parac' } });
    await act(async () => { jest.advanceTimersByTime(350); });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Paracetamol' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('Reposition listener responds to window scroll and resize', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [{ _id: 'd1', name: 'Paracetamol', brand: 'Panadol', genericName: 'Acetaminophen' }]
      }
    });

    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'para' } });
    await act(async () => { jest.advanceTimersByTime(350); });

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    // Trigger scroll and resize without crashing
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});

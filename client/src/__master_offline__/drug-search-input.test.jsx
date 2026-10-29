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

describe('DrugSearchInput - Autocomplete, Keyboard Navigation, and Layout Stability', () => {
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

  test('Debounce: does not query API when query length < 2 or before 300ms', () => {
    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    // Single character input
    fireEvent.change(input, { target: { value: 'a' } });
    act(() => { jest.advanceTimersByTime(350); });
    expect(api.get).not.toHaveBeenCalled();

    // Two characters entered, but check at 150ms
    fireEvent.change(input, { target: { value: 'am' } });
    act(() => { jest.advanceTimersByTime(150); });
    expect(api.get).not.toHaveBeenCalled();

    // Advance remaining 150ms (total 300ms)
    act(() => { jest.advanceTimersByTime(150); });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/drugs/search?q=am');
  });

  test('Debounce cleanup: rapid typing triggers only single API call for latest value', () => {
    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'am' } });
    act(() => { jest.advanceTimersByTime(100); });
    fireEvent.change(input, { target: { value: 'amo' } });
    act(() => { jest.advanceTimersByTime(100); });
    fireEvent.change(input, { target: { value: 'amox' } });
    act(() => { jest.advanceTimersByTime(300); });

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/drugs/search?q=amox');
  });

  test('Matching: offline fallback filters and matches by name, brand, and genericName', async () => {
    api.get.mockRejectedValue(new Error('Network error'));
    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    // Match by brand "Panadol" (which resolves to Paracetamol)
    fireEvent.change(input, { target: { value: 'panadol' } });
    await act(async () => { jest.advanceTimersByTime(300); });

    expect(screen.getByText('Paracetamol')).toBeInTheDocument();
    expect(screen.getByText('(Panadol)')).toBeInTheDocument();
  });

  test('Keyboard navigation: ArrowDown highlights first suggestion, Enter selects it', async () => {
    const handleSelect = jest.fn();
    api.get.mockResolvedValue({
      data: {
        data: [
          { _id: '1', name: 'Amoxicillin', genericName: 'Amoxicillin', brand: 'Amoxil', category: 'antibiotic' },
          { _id: '2', name: 'Ampicillin', genericName: 'Ampicillin', brand: 'Omnipen', category: 'antibiotic' }
        ]
      }
    });

    render(<DrugSearchInput onSelect={handleSelect} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'amox' } });
    await act(async () => { jest.advanceTimersByTime(300); });

    expect(screen.getByTestId('med-suggestion-0')).toBeInTheDocument();

    // Navigate down to highlight first suggestion
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const firstOption = screen.getByTestId('med-suggestion-0');
    expect(firstOption).toHaveAttribute('aria-selected', 'true');

    // Press Enter to select
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Amoxicillin' }));
    expect(input.value).toBe('Amoxicillin');
  });

  test('Keyboard navigation: Escape immediately dismisses suggestions dropdown', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [{ _id: '1', name: 'Paracetamol', genericName: 'Acetaminophen', brand: 'Panadol' }]
      }
    });

    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'para' } });
    await act(async () => { jest.advanceTimersByTime(300); });

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('Unlisted drug: Enter on unmatched query adds custom unlisted medication', async () => {
    const handleSelect = jest.fn();
    api.get.mockResolvedValue({ data: { data: [] } });

    render(<DrugSearchInput onSelect={handleSelect} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'CustomHerb 100mg' } });
    await act(async () => { jest.advanceTimersByTime(300); });

    // Informative empty state message is present
    expect(screen.getByTestId('no-catalog-match-message')).toHaveTextContent('No catalog medications matching "CustomHerb 100mg".');

    // Press Enter to add custom medication
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({
      name: 'CustomHerb 100mg',
      category: 'Unlisted / Free-Text'
    }));
  });

  test('Click-outside: clicking outside input/dropdown closes listbox', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [{ _id: '1', name: 'Omeprazole', genericName: 'Omeprazole', brand: 'Prilosec' }]
      }
    });

    render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <DrugSearchInput onSelect={jest.fn()} />
      </div>
    );
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'omep' } });
    await act(async () => { jest.advanceTimersByTime(300); });

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-element'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

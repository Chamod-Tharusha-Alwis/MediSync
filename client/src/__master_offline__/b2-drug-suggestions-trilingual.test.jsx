import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import api from '../api/axiosInstance';
import DrugSearchInput from '../components/DrugSearchInput';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('Feature B2: Medication Suggestions - Empty Backend Fallback, Trilingual Transliteration, and Partial Matching', () => {
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

  test('1. Empty backend API response falls back to curated catalog for common drug queries', async () => {
    // API returns empty array (simulating unseeded or empty database collection)
    api.get.mockResolvedValue({ data: { data: [] } });

    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'para' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    // Should still display Paracetamol from curated catalog instead of empty state
    expect(screen.getByText('Paracetamol')).toBeInTheDocument();
    expect(screen.getByText('(Panadol)')).toBeInTheDocument();
  });

  test('2. Sinhala script / transliteration resolves to expected medication', async () => {
    api.get.mockResolvedValue({ data: { data: [] } });

    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    // Doctor enters Sinhala query for Paracetamol
    fireEvent.change(input, { target: { value: 'පැරසිටමෝල්' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getByText('Paracetamol')).toBeInTheDocument();
  });

  test('3. Tamil script / transliteration resolves to expected medication', async () => {
    api.get.mockResolvedValue({ data: { data: [] } });

    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    // Doctor enters Tamil query for Amoxicillin
    fireEvent.change(input, { target: { value: 'அமோக்சிசிலின்' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getAllByText('Amoxicillin').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('(Amoxil)')).toBeInTheDocument();
  });

  test('4. Partial matching ranks prefix matches ahead of substring matches', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [
          { _id: '1', name: 'Ampicillin', genericName: 'Ampicillin', brand: 'Omnipen', category: 'antibiotic' },
          { _id: '2', name: 'Amoxicillin', genericName: 'Amoxicillin', brand: 'Amoxil', category: 'antibiotic' },
          { _id: '3', name: 'Oxamiquine', genericName: 'Oxamiquine', brand: 'Vansil', category: 'anthelmintic' },
        ],
      },
    });

    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'amox' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    const suggestions = screen.getAllByTestId(/^med-suggestion-\d+/);
    // Amoxicillin starts with 'amox', so it must be ranked first
    expect(suggestions[0]).toHaveTextContent('Amoxicillin');
  });

  test('5. Truly unlisted custom medication query shows empty state message and custom add option', async () => {
    api.get.mockResolvedValue({ data: { data: [] } });

    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'AyurvedicElixir 500mg' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getByTestId('no-catalog-match-message')).toHaveTextContent(
      'No catalog medications matching "AyurvedicElixir 500mg".'
    );
    expect(screen.getByTestId('add-custom-medication-button')).toBeInTheDocument();
  });
});

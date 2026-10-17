import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import api from '../api/axiosInstance';
import SymptomTagInput from '../components/SymptomTagInput';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

describe('SymptomTagInput - Privacy and Clinical Behavior', () => {
  let logSpy, warnSpy, infoSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    api.get.mockReset();
    api.get.mockResolvedValue({
      data: {
        data: ['Fever', 'Cough', 'Fatigue', 'Headache', 'Chest Pain', 'Shortness of Breath']
      }
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('Renders input and loads recognized symptom list without console emissions', async () => {
    render(<SymptomTagInput selectedSymptoms={[]} onChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type symptom to search indexed terms/i)).toBeInTheDocument();
    });
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  test('Allows entering recognized symptom without logging PHI', async () => {
    const handleChange = jest.fn();
    render(<SymptomTagInput selectedSymptoms={[]} onChange={handleChange} />);
    const input = await screen.findByPlaceholderText(/Type symptom to search indexed terms/i);

    fireEvent.change(input, { target: { value: 'Fever' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith(['Fever']);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  test('Allows entering clinician free-text custom symptom without logging PHI', async () => {
    const handleChange = jest.fn();
    render(<SymptomTagInput selectedSymptoms={['Fever']} onChange={handleChange} />);
    const input = await screen.findByTestId('symptom-input');

    fireEvent.change(input, { target: { value: 'Epigastric discomfort' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith(['Fever', 'Epigastric discomfort']);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  test('Case-insensitively matches recognized terms', async () => {
    const handleChange = jest.fn();
    render(<SymptomTagInput selectedSymptoms={[]} onChange={handleChange} />);
    const input = await screen.findByTestId('symptom-input');

    fireEvent.change(input, { target: { value: 'cough' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Should resolve to canonical 'Cough'
    expect(handleChange).toHaveBeenCalledWith(['Cough']);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('Removes symptom tag via backspace when input empty without console emissions', async () => {
    const handleChange = jest.fn();
    render(<SymptomTagInput selectedSymptoms={['Fever', 'Headache']} onChange={handleChange} />);
    const input = await screen.findByTestId('symptom-input');

    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(handleChange).toHaveBeenCalledWith(['Fever']);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('Does not add duplicate symptom and produces zero log entries', async () => {
    const handleChange = jest.fn();
    render(<SymptomTagInput selectedSymptoms={['Fever']} onChange={handleChange} />);
    const input = await screen.findByTestId('symptom-input');

    fireEvent.change(input, { target: { value: 'Fever' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('Enforces 15-symptom maximum constraint', async () => {
    const maxSymptoms = Array.from({ length: 15 }, (_, i) => `Symptom ${i + 1}`);
    const handleChange = jest.fn();
    render(<SymptomTagInput selectedSymptoms={maxSymptoms} onChange={handleChange} />);
    const input = await screen.findByTestId('symptom-input');

    expect(input).toBeDisabled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

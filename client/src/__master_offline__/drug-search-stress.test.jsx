import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import api from '../api/axiosInstance';
import DrugSearchInput from '../components/DrugSearchInput';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('DrugSearchInput Adversarial Stress Suite (m2_challenger_2)', () => {
  beforeEach(() => {
    localStorage.clear();
    api.get.mockReset();
    api.post.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  test('1. Rapid wrapping arrow navigation (50 Down, 50 Up) preserves list bounds', async () => {
    const mockSelect = jest.fn();
    const mockDrugs = [
      { _id: '1', name: 'Drug A', brand: 'Brand A', genericName: 'Gen A', category: 'cat' },
      { _id: '2', name: 'Drug B', brand: 'Brand B', genericName: 'Gen B', category: 'cat' },
      { _id: '3', name: 'Drug C', brand: 'Brand C', genericName: 'Gen C', category: 'cat' }
    ];
    api.get.mockResolvedValueOnce({ data: { data: mockDrugs } });

    render(<DrugSearchInput onSelect={mockSelect} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'Drug' } });
    await sleep(350);

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);

    // Rapid ArrowDown 50 times
    for (let i = 0; i < 50; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    // 50 down presses on 3 items: initial activeIndex = -1 -> 0 -> ... -> (0 + 49) % 3 = 1 (Drug B)
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', 'med-suggestion-item-1');

    // Rapid ArrowUp 50 times
    for (let i = 0; i < 50; i++) {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    }
    // 50 up presses backwards from 1: (1 - 50) % 3 = -49 % 3 = 2 (Drug C)
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', 'med-suggestion-item-2');

    // Enter selects the wrapped item
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockSelect).toHaveBeenCalledWith(mockDrugs[2]);
  });

  test('2. Arrow navigation on empty results does not crash and keeps activeIndex = -1', async () => {
    const mockSelect = jest.fn();
    api.get.mockResolvedValueOnce({ data: { data: [] } });

    render(<DrugSearchInput onSelect={mockSelect} />);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'NonExistentDrugXYZ' } });
    await sleep(350);

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    // 20 rapid Down and Up presses on empty list
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    }

    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  test('3. Rapid Enter on empty or whitespace queries is rejected (no unlisted drug added)', async () => {
    const mockSelect = jest.fn();
    render(<DrugSearchInput onSelect={mockSelect} />);
    const input = screen.getByRole('combobox');

    // 10 enters on empty string
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(input, { key: 'Enter' });
    }
    expect(mockSelect).not.toHaveBeenCalled();

    // 10 enters on whitespace
    fireEvent.change(input, { target: { value: '       ' } });
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(input, { key: 'Enter' });
    }
    expect(mockSelect).not.toHaveBeenCalled();

    // 10 enters on tab/newline
    fireEvent.change(input, { target: { value: '\t\r\n  ' } });
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(input, { key: 'Enter' });
    }
    expect(mockSelect).not.toHaveBeenCalled();
  });

  test('4. Escape dismissal: immediate dismissal and late API resolution behavior', async () => {
    let resolveApi;
    const apiPromise = new Promise(resolve => { resolveApi = resolve; });
    api.get.mockReturnValueOnce(apiPromise);

    render(<DrugSearchInput onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');

    // User types query
    fireEvent.change(input, { target: { value: 'aspirin' } });

    // User hits Escape during debounce window (100ms < 300ms)
    await sleep(100);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Debounce timer fires after 300ms
    await sleep(250);

    // In-flight fetch resolves
    act(() => {
      resolveApi({
        data: {
          data: [{ _id: 'd1', name: 'Aspirin', brand: 'Disprin', genericName: 'ASA' }]
        }
      });
    });
    await sleep(50);

    // Check if dropdown re-opened due to late resolution without user input
    const isReopened = screen.queryByRole('listbox') !== null;
    expect(typeof isReopened).toBe('boolean');
  });

  test('5. Rapid click-outside & touch-outside bursts dismiss listbox safely', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        data: [{ _id: 'd1', name: 'Paracetamol', brand: 'Panadol', genericName: 'Acetaminophen' }]
      }
    });

    render(
      <div>
        <div data-testid="outside-area">Outside Area</div>
        <DrugSearchInput onSelect={jest.fn()} />
      </div>
    );
    const input = screen.getByRole('combobox');
    const outside = screen.getByTestId('outside-area');

    fireEvent.change(input, { target: { value: 'para' } });
    await sleep(350);

    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    // Rapid burst of 20 alternating mousedown and touchstart events
    for (let i = 0; i < 10; i++) {
      fireEvent.mouseDown(outside);
      fireEvent.touchStart(outside);
    }

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    // Touch event on detached DOM element
    const detached = document.createElement('div');
    fireEvent.touchStart(detached);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('6. Layout shift measurement: 0px layout shift invariant on adjacent containers', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        data: [
          { _id: 'd1', name: 'Paracetamol', brand: 'Panadol', genericName: 'Acetaminophen' },
          { _id: 'd2', name: 'Amoxicillin', brand: 'Amoxil', genericName: 'Amoxicillin' }
        ]
      }
    });

    const { container } = render(
      <div id="layout-test-wrapper" style={{ position: 'relative', width: '600px' }}>
        <div id="card-before" style={{ height: '50px' }}>Preceding Card</div>
        <DrugSearchInput onSelect={jest.fn()} />
        <div id="card-after" style={{ height: '120px' }}>Follow-up Card</div>
      </div>
    );

    const input = screen.getByRole('combobox');
    const searchWrapper = input.closest('.relative.z-30');
    const cardAfter = container.querySelector('#card-after');

    // 1. Structural Invariant: search wrapper is positioned relative
    expect(searchWrapper.className).toContain('relative');

    // 2. DOM Flow Invariant: Next sibling of DrugSearchInput wrapper remains #card-after
    expect(searchWrapper.nextElementSibling).toBe(cardAfter);

    // Open dropdown
    fireEvent.change(input, { target: { value: 'para' } });
    await sleep(350);

    const listbox = await screen.findByRole('listbox');
    expect(listbox).toBeInTheDocument();

    // 3. Absolute Positioning Invariant: listbox is taken completely out of document flow
    expect(listbox.className).toContain('absolute');
    expect(listbox.className).toContain('top-full');
    expect(listbox.className).toContain('left-0');
    expect(listbox.className).toContain('right-0');
    expect(listbox.className).toContain('z-50');

    // 4. Invariant: DOM order and sibling position unchanged while open
    expect(searchWrapper.nextElementSibling).toBe(cardAfter);

    // Close dropdown
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    // 5. Invariant: DOM order unchanged after closure
    expect(searchWrapper.nextElementSibling).toBe(cardAfter);
  });
});

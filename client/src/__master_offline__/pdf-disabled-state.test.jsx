import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import LabReportDownloadButton from '../components/common/LabReportDownloadButton';
import LabDetailModal from '../components/common/LabDetailModal';
import { en } from '../i18n/translations/en';
import { si } from '../i18n/translations/si';
import { ta } from '../i18n/translations/ta';

afterEach(cleanup);

describe('Agent 3: PDF Download Button Disabled State & Truthful Wording', () => {
  test('LabReportDownloadButton renders nothing when 0 tests are provided', () => {
    const { container } = render(<LabReportDownloadButton labTests={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test('LabReportDownloadButton renders disabled button with truthful unavailable text for single test', () => {
    const onSelect = jest.fn();
    render(<LabReportDownloadButton labTests={[{ testName: 'Lipid Profile' }]} onSelectTest={onSelect} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveTextContent(/PDF export temporarily unavailable/i);
    expect(btn).toHaveAttribute('title', 'PDF export temporarily unavailable');

    fireEvent.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('LabReportDownloadButton renders disabled button for multiple tests without opening dropdown', () => {
    const onSelect = jest.fn();
    render(<LabReportDownloadButton labTests={[{ testName: 'Test A' }, { testName: 'Test B' }]} onSelectTest={onSelect} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/PDF export temporarily unavailable \(2\)/i);

    fireEvent.click(btn);
    expect(screen.queryByText('Select Lab Report to Download')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('LabDetailModal download button is disabled with truthful unavailable text and no encryption claims', () => {
    const onDownload = jest.fn();
    render(
      <LabDetailModal
        isOpen={true}
        onClose={jest.fn()}
        labTest={{ testName: 'Full Blood Count', status: 'Completed', reportId: 'LAB-12345' }}
        onDownload={onDownload}
      />
    );
    const downloadBtn = screen.getByRole('button', { name: /PDF export temporarily unavailable/i });
    expect(downloadBtn).toBeDisabled();
    expect(downloadBtn).toHaveAttribute('title', 'PDF export temporarily unavailable');
    expect(downloadBtn).not.toHaveTextContent(/encrypted/i);
    expect(downloadBtn).not.toHaveTextContent(/password/i);

    fireEvent.click(downloadBtn);
    expect(onDownload).not.toHaveBeenCalled();
  });

  test('trilingual translations define truthful unavailable text across EN, SI, and TA', () => {
    expect(en.patient.pdfUnavailable).toBe('PDF export temporarily unavailable');
    expect(si.patient.pdfUnavailable).toBe('PDF අපනයනය තාවකාලිකව ලබාගත නොහැක');
    expect(ta.patient.pdfUnavailable).toBe('PDF ஏற்றுமதி தற்காலிகமாக கிடைக்கவில்லை');

    expect(en.lab.pdfUnavailable).toBe('PDF export temporarily unavailable');
    expect(si.lab.pdfUnavailable).toBe('PDF අපනයනය තාවකාලිකව ලබාගත නොහැක');
    expect(ta.lab.pdfUnavailable).toBe('PDF ஏற்றுமதி தற்காலிகமாக கிடைக்கவில்லை');
  });

  test('no password-protected or encrypted claims exist in PDF download UI strings', () => {
    const prohibited = [/password.*protected.*nic/i, /encrypted.*diagnostics.*pdf/i];
    for (const pat of prohibited) {
      expect(en.patient.downloadPdf).not.toMatch(pat);
      expect(en.patient.downloadEPrescription).not.toMatch(pat);
      expect(en.lab.downloadReport).not.toMatch(pat);
    }
  });
});

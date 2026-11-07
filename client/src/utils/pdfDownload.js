import axiosInstance from '../api/axiosInstance';

export function isPdfExportClientEnabled(explicitFlag) {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  return process.env.REACT_APP_PDF_EXPORT_ENABLED === 'true';
}

export async function parseBlobErrorPayload(err) {
  const status = err?.response?.status || null;
  const data = err?.response?.data;
  if (!data) {
    return { status, code: null, message: null };
  }
  try {
    if (typeof data.text === 'function') {
      const rawText = await data.text();
      const parsed = JSON.parse(rawText);
      return {
        status,
        code: parsed?.code || null,
        message: parsed?.error || parsed?.message || null,
      };
    }
    if (typeof data === 'object') {
      return {
        status,
        code: data.code || null,
        message: data.error || data.message || null,
      };
    }
  } catch (_) {
    // Non-JSON blob error payload
  }
  return { status, code: null, message: null };
}

export async function downloadClinicalPdf(endpoint, fallbackFilename = 'MediSync-Record.pdf') {
  try {
    const res = await axiosInstance.get(endpoint, { responseType: 'blob' });
    const disposition = res?.headers?.['content-disposition'] || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = (match && match[1] ? match[1] : fallbackFilename).replace(
      /\b(?:[0-9]{9}[vVxX]|[0-9]{12})\b/g,
      'record'
    );

    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    return { ok: true, status: 200, filename };
  } catch (err) {
    const parsed = await parseBlobErrorPayload(err);
    const isHold = parsed.status === 503 || parsed.code === 'PDF_EXPORT_UNAVAILABLE';
    return {
      ok: false,
      status: parsed.status || 500,
      code: isHold ? 'PDF_EXPORT_UNAVAILABLE' : parsed.code || 'PDF_DOWNLOAD_ERROR',
      isHold,
    };
  }
}

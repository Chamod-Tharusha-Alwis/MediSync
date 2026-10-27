// Serialize only the canonical numeric day count; keep each medicine independent.
export function prescriptionPayload(medicines) {
  if (!Array.isArray(medicines)) throw new Error('Invalid medicines');
  return medicines.map(medicine => {
    if (Object.prototype.hasOwnProperty.call(medicine,'duration') || typeof medicine.durationDays !== 'number' ||
        !Number.isSafeInteger(medicine.durationDays) || medicine.durationDays <= 0) {
      throw new Error('Enter a positive whole number of days for each medicine');
    }
    return { ...medicine, durationDays: medicine.durationDays };
  });
}

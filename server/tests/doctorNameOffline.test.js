'use strict';

const { formatDoctorName, stripDoctorPrefix } = require('../src/utils/doctorName');

describe('Phase 4 — Server Doctor Name Normalization Offline Suite', () => {
  test('1. Normalizes pure doctor name by prepending Dr.', () => {
    expect(formatDoctorName('Chamod Alwis')).toBe('Dr. Chamod Alwis');
    expect(formatDoctorName('Jane Doe')).toBe('Dr. Jane Doe');
  });

  test('2. Preserves single Dr. prefix without duplicating', () => {
    expect(formatDoctorName('Dr. Chamod Alwis')).toBe('Dr. Chamod Alwis');
    expect(formatDoctorName('dr. Jane Doe')).toBe('Dr. Jane Doe');
  });

  test('3. Collapses duplicate or multiple Dr. Dr. prefixes into single Dr.', () => {
    expect(formatDoctorName('Dr. Dr. Chamod Alwis')).toBe('Dr. Chamod Alwis');
    expect(formatDoctorName('dr dr. Dr. John Smith')).toBe('Dr. John Smith');
  });

  test('4. Handles "doctor" spelled out in various cases', () => {
    expect(formatDoctorName('Doctor Chamod Alwis')).toBe('Dr. Chamod Alwis');
    expect(formatDoctorName('doctor Jane Doe')).toBe('Dr. Jane Doe');
    expect(formatDoctorName('Doctor Dr. Chamod Alwis')).toBe('Dr. Chamod Alwis');
  });

  test('5. Handles Dr without dot (e.g. "Dr Chamod")', () => {
    expect(formatDoctorName('Dr Chamod Alwis')).toBe('Dr. Chamod Alwis');
    expect(formatDoctorName('dr Jane Doe')).toBe('Dr. Jane Doe');
  });

  test('6. Trims excess whitespace around names and prefixes', () => {
    expect(formatDoctorName('   Chamod Alwis   ')).toBe('Dr. Chamod Alwis');
    expect(formatDoctorName('   Dr.   Chamod Alwis   ')).toBe('Dr. Chamod Alwis');
  });

  test('7. Bypasses institutional entity names unchanged', () => {
    expect(formatDoctorName('Asiri Laboratory')).toBe('Asiri Laboratory');
    expect(formatDoctorName('General Hospital Colombo')).toBe('General Hospital Colombo');
    expect(formatDoctorName('System Administrator')).toBe('System Administrator');
    expect(formatDoctorName('MediSync Support')).toBe('MediSync Support');
  });

  test('8. Handles empty, null, or fallback values gracefully', () => {
    expect(formatDoctorName('')).toBe('');
    expect(formatDoctorName(null)).toBe('');
    expect(formatDoctorName(undefined)).toBe('');
    expect(formatDoctorName('', 'Attending Physician')).toBe('Dr. Attending Physician');
    expect(formatDoctorName(null, 'Asiri Laboratory')).toBe('Asiri Laboratory');
    expect(formatDoctorName('Dr.')).toBe('Dr. Doctor');
  });

  test('9. stripDoctorPrefix strips title cleanly and preserves valid names starting with Dr', () => {
    expect(stripDoctorPrefix('Dr. Chamod Alwis')).toBe('Chamod Alwis');
    expect(stripDoctorPrefix('Doctor Jane Doe')).toBe('Jane Doe');
    expect(stripDoctorPrefix('Dr. Dr. Chamod Alwis')).toBe('Chamod Alwis');
    expect(stripDoctorPrefix('Drew Barrymore')).toBe('Drew Barrymore');
    expect(stripDoctorPrefix('Drake Graham')).toBe('Drake Graham');
    expect(stripDoctorPrefix('')).toBe('');
    expect(stripDoctorPrefix(null)).toBe('');
  });
});

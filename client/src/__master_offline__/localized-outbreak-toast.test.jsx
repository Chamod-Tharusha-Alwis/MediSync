'use strict';

import React from 'react';
import { render, screen } from '@testing-library/react';
import { getLocalizedMessage, formatFriendlyDisease } from '../utils/localizedMessage';

describe('Fix C: Localized Outbreak Toast & Notification Parsing', () => {
  const trilingualMessage = [
    'Outbreak alert: Dengue (A90) rising in Gampaha. Critical. View Outbreak Monitor.',
    'වසංගත අනතුරු ඇඟවීම: Gampaha හි Dengue (A90) වැඩිවේ. Critical මට්ටම. Outbreak Monitor බලන්න.',
    'தொற்றுநோய் எச்சரிக்கை: Gampaha இல் Dengue (A90) பரவல் உயர்கிறது. Critical நிலை. Outbreak Monitor பார்க்கவும்.',
  ].join('\n');

  test('extracts single language matching active user locale', () => {
    expect(getLocalizedMessage(trilingualMessage, 'en')).toBe(
      'Outbreak alert: Dengue (A90) rising in Gampaha. Critical. View Outbreak Monitor.'
    );
    expect(getLocalizedMessage(trilingualMessage, 'si')).toBe(
      'වසංගත අනතුරු ඇඟවීම: Gampaha හි Dengue (A90) වැඩිවේ. Critical මට්ටම. Outbreak Monitor බලන්න.'
    );
    expect(getLocalizedMessage(trilingualMessage, 'ta')).toBe(
      'தொற்றுநோய் எச்சரிக்கை: Gampaha இல் Dengue (A90) பரவல் உயர்கிறது. Critical நிலை. Outbreak Monitor பார்க்கவும்.'
    );
  });

  test('formats ICD codes and standard disease names consistently', () => {
    expect(formatFriendlyDisease('A90')).toBe('Dengue (A90)');
    expect(formatFriendlyDisease('J09')).toBe('Influenza (J09)');
    expect(formatFriendlyDisease('Dengue')).toBe('Dengue (A90)');
    expect(formatFriendlyDisease('Influenza')).toBe('Influenza (J09)');
  });

  test('falls back safely on single-line or non-trilingual messages', () => {
    expect(getLocalizedMessage('Simple English alert', 'si')).toBe('Simple English alert');
    expect(getLocalizedMessage('', 'ta')).toBe('');
    expect(getLocalizedMessage(null, 'en')).toBe('');
  });
});

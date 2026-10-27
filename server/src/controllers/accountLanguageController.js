'use strict';
const { createAccountLanguageService } = require('../services/accountLanguageService');
const { LanguagePreferenceError } = require('../security/preferredLanguage');
function createAccountLanguageController(service = createAccountLanguageService()) {
  const handle = action => async (req, res) => {
    try { res.set('Cache-Control', 'private, no-store'); return res.json({ data: await service[action](req) }); }
    catch (error) {
      const known = error instanceof LanguagePreferenceError;
      return res.status(known ? error.status : 503).json({ error: known ? error.code : 'LANGUAGE_PREFERENCE_UNAVAILABLE' });
    }
  };
  return { get: handle('get'), update: handle('update') };
}
module.exports = { ...createAccountLanguageController(), createAccountLanguageController };

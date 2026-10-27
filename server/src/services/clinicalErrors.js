'use strict';
class ClinicalCommandError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'ClinicalCommandError'; this.code = code; this.status = status; }
}
module.exports = { ClinicalCommandError };

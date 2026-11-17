'use strict';
/**
 * Fix pack 2, C1: run an outbreak scan in the background of the same server process and let the browser poll.
 * The trigger request then returns at once (202), so no proxy timeout can cut it off. No new service, no
 * scheduler. Status: GET /api/admin/outbreak/last-scan?jobId=<id>. Jobs live in memory: after a server restart an unknown job id answers 404, and the admin
 * checks "Last scan" (the scan record is stored by the scan itself).
 */
const crypto = require('crypto');

const MAX_JOBS = 20;
const jobs = new Map();

function start(work, { now = () => new Date() } = {}) {
  const id = crypto.randomBytes(12).toString('hex');
  const job = { id, status: 'running', startedAt: now().toISOString(), finishedAt: null, durationMs: null, result: null, error: null };
  jobs.set(id, job);
  while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value);
  const t0 = Date.now();
  Promise.resolve().then(work).then(result => {
    Object.assign(job, { status: 'done', result, finishedAt: now().toISOString(), durationMs: Date.now() - t0 });
  }, () => {
    Object.assign(job, { status: 'failed', error: 'Surveillance analysis unavailable; no alert was broadcast.', finishedAt: now().toISOString(), durationMs: Date.now() - t0 });
  });
  return job;
}

function get(id) {
  return typeof id === 'string' && /^[a-f0-9]{24}$/.test(id) ? jobs.get(id) || null : null;
}

module.exports = { start, get, _jobs: jobs };

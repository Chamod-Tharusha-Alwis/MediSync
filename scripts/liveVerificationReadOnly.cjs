'use strict';

// Read-only live verification policy. Never accepts an enable-write flag.
const BLOCKED = 'READ_ONLY_VERIFICATION_WRITE_BLOCKED';
function createPolicy() {
  let violations = 0;
  const reject = () => { violations++; throw Error(BLOCKED); };
  function assertRequest(input, options = {}) {
    let url, method;
    try {
      const raw = input instanceof URL ? input.href : typeof input === 'string' ? input : input?.url;
      url = raw ? new URL(raw) : new URL(input?.path || '/', `${input?.protocol || 'https:'}//${input?.hostname || input?.host || 'invalid.local'}`);
      method = String(options.method || input?.method || 'GET').toUpperCase();
    } catch (_) { return reject(); }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (_) { return reject(); }
    if (!['GET','HEAD','OPTIONS'].includes(method) || !['http:','https:'].includes(url.protocol) || url.username || url.password ||
        /(?:^|\/)(?:ingest|seed[^/]*|trigger|clear[-_]?cache|invalidate[-_]?cache|flush[^/]*)(?:\/|$)/i.test(pathname) ||
        /\/cache\/(?:clear|invalidate|flush)/i.test(pathname)) return reject();
    return true;
  }
  return { assertRequest, reject, violations: () => violations };
}

function wrapNodeTransport(transport, policy) {
  for (const method of ['request','get']) {
    const original = transport[method];
    transport[method] = function(input, options, ...rest) {
      policy.assertRequest(input, options && typeof options === 'object' ? options : {});
      return original.call(this, input, options, ...rest);
    };
  }
}

async function guardContext(context, policy) {
  await context.route('**/*', async route => {
    try { policy.assertRequest(route.request().url(), { method: route.request().method() }); }
    catch (_) { await route.abort('blockedbyclient'); return; }
    await route.continue();
  });
  // Persistent service workers could otherwise evade Playwright routing.
  context.unroute = context.unrouteAll = policy.reject;
  if (context.request) guardApiRequest(context.request, policy);
  return context;
}

function guardApiRequest(context, policy, baseURL = 'https://invalid.local') {
  for (const name of ['post','put','patch','delete']) context[name] = policy.reject;
  for (const name of ['get','head','fetch']) {
    const original = context[name].bind(context);
    context[name] = (url, opts = {}) => {
      policy.assertRequest(new URL(url, baseURL).href, { method: name === 'head' ? 'HEAD' : opts.method || 'GET' });
      return original(url, { ...opts, maxRedirects: 0 });
    };
  }
  return context;
}

function guardBrowser(browser, policy) {
  const original = browser.newContext.bind(browser);
  browser.newContext = async options => guardContext(await original({ ...options, serviceWorkers: 'block' }), policy);
  browser.newPage = async options => (await browser.newContext(options)).newPage();
  return browser;
}

function guardPlaywright(playwright, policy) {
  for (const type of ['chromium','firefox','webkit']) {
    const launcher = playwright[type];
    if (!launcher || launcher.__medisyncReadOnly) continue;
    const launch = launcher.launch.bind(launcher);
    launcher.launch = async options => guardBrowser(await launch(options), policy);
    launcher.launchPersistentContext = launcher.connect = launcher.connectOverCDP = policy.reject;
    launcher.__medisyncReadOnly = true;
  }
  // Playwright's APIRequestContext bypasses Chromium's route handler.
  if (playwright.request) {
    const create = playwright.request.newContext.bind(playwright.request);
    playwright.request.newContext = async options => {
      return guardApiRequest(await create(options), policy, options?.baseURL);
    };
  }
}

let installed;
function install() {
  if (installed) return installed;
  const policy = createPolicy();
  installed = policy;
  wrapNodeTransport(require('http'), policy);
  wrapNodeTransport(require('https'), policy);
  if (global.fetch) {
    const fetch = global.fetch;
    global.fetch = (input, options) => { policy.assertRequest(input, options); return fetch(input, { ...options, redirect: 'error' }); };
  }
  // Capture the driver before the import fence; importing it launches no browser.
  guardPlaywright(require('../client/node_modules/playwright'), policy);
  const Module = require('module'), load = Module._load;
  Module._load = function(name, parent, ...args) {
    const normalized = String(name).replaceAll('\\','/');
    if (/^(?:node:sqlite|mongoose|mongodb|redis|sqlite3|better-sqlite3|dotenv)(?:\/|$)/.test(normalized) ||
        /\/node_modules\/(?:mongoose|mongodb|redis|sqlite3|better-sqlite3|dotenv)(?:\/|$)/.test(normalized) ||
        /(?:^|[\/\\])(?:seed-demo-outbreak|remove_synthetic_outbreaks)(?:\.js)?$/.test(name)) return policy.reject();
    return load.call(this, name, parent, ...args);
  };
  const child = require('child_process');
  for (const name of ['exec','execSync','execFile','execFileSync','fork','spawnSync']) child[name] = policy.reject;
  const spawn = child.spawn;
  child.spawn = function(command, args, options) {
    // Only Playwright's already-installed browser process may be launched.
    const normalized = typeof command === 'string' ? command.replaceAll('\\','/') : '';
    if (!/\/ms-playwright\/[^/]+\/(?:[^/]+\/)*(?:chrome|chrome-headless-shell|headless_shell|firefox|MiniBrowser)(?:\.exe)?$/i.test(normalized)) return policy.reject();
    return spawn.call(this, command, args, options);
  };
  const exit = process.exit.bind(process);
  process.exit = code => exit(policy.violations() ? 1 : code);
  process.once('beforeExit', () => { if (policy.violations()) process.exitCode = 1; });
  return policy;
}

module.exports = { BLOCKED, createPolicy, wrapNodeTransport, guardContext, guardApiRequest, guardBrowser, guardPlaywright, install };

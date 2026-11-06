'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const express = require('express');
const rateLimit = require('express-rate-limit');

function loadRouteWithLimiters(routeFile) {
  const module = { exports: {} };
  const createdLimiters = [];
  const inertHandler = (_req, _res, next) => { if (typeof next === 'function') next(); };
  const inertProxy = new Proxy(
    () => inertHandler,
    { get: () => inertHandler }
  );

  const multerMock = () => ({
    single: () => inertHandler,
    array: () => inertHandler
  });
  multerMock.memoryStorage = () => ({});
  multerMock.diskStorage = () => ({});

  const source = fs.readFileSync(
    path.join(__dirname, '../src/routes', routeFile),
    'utf8'
  );

  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    __dirname: path.join(__dirname, '../src/routes'),
    process: { env: { NODE_ENV: 'production' } },
    require(name) {
      if (name === 'express') return express;
      if (name === 'path') return path;
      if (name === 'multer') return multerMock;
      if (name === 'express-rate-limit') {
        return (options) => {
          const mw = rateLimit(options);
          mw._rateLimitOptions = options;
          createdLimiters.push({ options, mw });
          return mw;
        };
      }
      return inertProxy;
    }
  });

  return { router: module.exports, createdLimiters };
}

function getRouteLayer(router, method, routePath) {
  return router.stack.find(
    (layer) =>
      layer.route &&
      layer.route.path === routePath &&
      layer.route.methods &&
      layer.route.methods[method.toLowerCase()]
  );
}

describe('S6 — Public lab status check rate limiting', () => {
  test('labRoutes.js GET /public/:labTestId/status includes publicLimiter middleware', () => {
    const { router } = loadRouteWithLimiters('labRoutes.js');
    const routeLayer = getRouteLayer(router, 'get', '/public/:labTestId/status');
    expect(routeLayer).toBeDefined();

    const rateLimitEntry = routeLayer.route.stack.find(
      (s) => s.handle && s.handle._rateLimitOptions
    );
    expect(rateLimitEntry).toBeDefined();
    expect(rateLimitEntry.handle._rateLimitOptions.max).toBeLessThanOrEqual(60);
    expect(rateLimitEntry.handle._rateLimitOptions.windowMs).toBe(60 * 1000);
  });
});

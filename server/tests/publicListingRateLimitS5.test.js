'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const express = require('express');
const rateLimit = require('express-rate-limit');

function loadRouteWithLimiters(routeFile) {
  const module = { exports: {} };
  const createdLimiters = [];
  const inertHandler = (_req, _res, next) => next();
  const inertProxy = new Proxy(
    () => inertHandler,
    { get: () => inertHandler }
  );

  const source = fs.readFileSync(
    path.join(__dirname, '../src/routes', routeFile),
    'utf8'
  );

  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    process: { env: { NODE_ENV: 'production' } },
    require(name) {
      if (name === 'express') return express;
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

describe('S5 — Public listing and search endpoints rate limiting', () => {
  test.each([
    ['/doctors'],
    ['/hospitals'],
    ['/pharmacies'],
    ['/health-stats'],
    ['/consultation-activity'],
    ['/diseases/search']
  ])(
    'publicRoutes.js GET %s includes an express-rate-limit middleware (max <= 60 per 60s)',
    (routePath) => {
      const { router } = loadRouteWithLimiters('publicRoutes.js');
      const routeLayer = getRouteLayer(router, 'get', routePath);
      expect(routeLayer).toBeDefined();

      const rateLimitEntry = routeLayer.route.stack.find(
        (s) => s.handle && s.handle._rateLimitOptions
      );
      expect(rateLimitEntry).toBeDefined();
      expect(rateLimitEntry.handle._rateLimitOptions.max).toBeLessThanOrEqual(60);
      expect(rateLimitEntry.handle._rateLimitOptions.windowMs).toBe(60 * 1000);
    }
  );

  test('reviewRoutes.js GET /:targetId includes an IP-based express-rate-limit middleware without requiring req.user', () => {
    const { router } = loadRouteWithLimiters('reviewRoutes.js');
    const routeLayer = getRouteLayer(router, 'get', '/:targetId');
    expect(routeLayer).toBeDefined();

    const rateLimitEntry = routeLayer.route.stack.find(
      (s) => s.handle && s.handle._rateLimitOptions
    );
    expect(rateLimitEntry).toBeDefined();
    expect(rateLimitEntry.handle._rateLimitOptions.max).toBeLessThanOrEqual(60);
    expect(rateLimitEntry.handle._rateLimitOptions.windowMs).toBe(60 * 1000);
    expect(rateLimitEntry.handle._rateLimitOptions.keyGenerator).toBeUndefined();
  });
});

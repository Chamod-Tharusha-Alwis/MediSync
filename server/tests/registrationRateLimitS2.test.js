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

describe('S2 — Registration endpoints rate limiting', () => {
  test.each([
    ['hospitalRoutes.js', '/register'],
    ['patientRoutes.js', '/register'],
    ['pharmacyRoutes.js', '/register']
  ])(
    '%s POST %s includes an express-rate-limit middleware with production cap <= 10',
    (routeFile, routePath) => {
      const { router } = loadRouteWithLimiters(routeFile);
      const routeLayer = getRouteLayer(router, 'post', routePath);
      expect(routeLayer).toBeDefined();

      const rateLimitEntry = routeLayer.route.stack.find(
        (s) => s.handle && s.handle._rateLimitOptions
      );
      expect(rateLimitEntry).toBeDefined();
      expect(rateLimitEntry.handle._rateLimitOptions.max).toBeLessThanOrEqual(10);
      expect(rateLimitEntry.handle._rateLimitOptions.windowMs).toBeGreaterThanOrEqual(15 * 60 * 1000);
    }
  );

  test.each([
    ['hospitalRoutes.js'],
    ['patientRoutes.js'],
    ['pharmacyRoutes.js']
  ])(
    '%s uses separate rate limiter instances for /register and /login so counters are isolated',
    (routeFile) => {
      const { router } = loadRouteWithLimiters(routeFile);
      const registerLayer = getRouteLayer(router, 'post', '/register');
      const loginLayer = getRouteLayer(router, 'post', '/login');

      const registerLimiter = registerLayer.route.stack.find(
        (s) => s.handle && s.handle._rateLimitOptions
      )?.handle;
      const loginLimiter = loginLayer.route.stack.find(
        (s) => s.handle && s.handle._rateLimitOptions
      )?.handle;

      expect(registerLimiter).toBeDefined();
      expect(loginLimiter).toBeDefined();
      expect(registerLimiter).not.toBe(loginLimiter);
    }
  );
});

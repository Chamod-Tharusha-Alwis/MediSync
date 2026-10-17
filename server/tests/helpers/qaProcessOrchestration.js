'use strict';

const assert = require('assert');

const REQUIRED_PORTS = Object.freeze({
  CLIENT: 3000,
  BACKEND: 5000,
  ML_ENGINE: 5001,
  PROMETHEUS: 8000
});

const ORCHESTRATION_STAGES = Object.freeze([
  'PORT_CHECK',
  'DB_PREFLIGHT',
  'ML_ENGINE',
  'BACKEND',
  'BROWSER'
]);

const VALID_STATES = Object.freeze([
  'IDLE',
  'PORT_CHECK',
  'STARTING_DB',
  'STARTING_ML',
  'STARTING_BACKEND',
  'STARTING_BROWSER',
  'RUNNING',
  'STOPPING_BROWSER',
  'STOPPING_BACKEND',
  'STOPPING_ML',
  'STOPPING_DB',
  'STOPPED',
  'FAILED'
]);

class ProcessOrchestrator {
  constructor(options = {}) {
    this.state = 'IDLE';
    this.stageHistory = [];
    this.activeProcesses = new Map(); // stage -> process double
    this.portScanner = options.portScanner || (async (port) => false); // false = free, true = bound
    this.mockFailures = options.mockFailures || {};
  }

  recordTransition(toState) {
    assert(VALID_STATES.includes(toState), `Invalid state: ${toState}`);
    this.state = toState;
    this.stageHistory.push({ state: toState, timestamp: Date.now() });
  }

  async checkPorts() {
    this.recordTransition('PORT_CHECK');
    const occupied = [];
    for (const [name, port] of Object.entries(REQUIRED_PORTS)) {
      const isBound = await this.portScanner(port);
      if (isBound) {
        occupied.push({ name, port });
      }
    }

    if (occupied.length > 0) {
      const details = occupied.map(o => `${o.name}:${o.port}`).join(', ');
      const err = new Error(`OP-01: Port conflict detected. Occupied ports: ${details}`);
      err.code = 'OP01_PORT_CONFLICT';
      err.occupiedPorts = occupied;
      this.recordTransition('FAILED');
      throw err;
    }
    return true;
  }

  async start() {
    if (this.state !== 'IDLE' && this.state !== 'STOPPED') {
      const err = new Error(`OP-01: Cannot start orchestrator in state ${this.state}`);
      err.code = 'OP01_INVALID_START_STATE';
      throw err;
    }

    try {
      // 1. Port conflict pre-check
      await this.checkPorts();

      // 2. Database Pre-flight
      this.recordTransition('STARTING_DB');
      if (this.mockFailures.DB_PREFLIGHT) {
        throw new Error('Database preflight validation failed');
      }
      this.activeProcesses.set('DB_PREFLIGHT', { name: 'db_connection', pid: 101, status: 'ready' });

      // 3. ML Engine
      this.recordTransition('STARTING_ML');
      if (this.mockFailures.ML_ENGINE) {
        throw new Error('ML Engine health probe failed');
      }
      this.activeProcesses.set('ML_ENGINE', { name: 'ml_engine', port: REQUIRED_PORTS.ML_ENGINE, pid: 102, status: 'running' });

      // 4. Backend Service
      this.recordTransition('STARTING_BACKEND');
      if (this.mockFailures.BACKEND) {
        throw new Error('Backend HTTP listener failed to bind');
      }
      this.activeProcesses.set('BACKEND', { name: 'backend', port: REQUIRED_PORTS.BACKEND, pid: 103, status: 'running' });

      // 5. Browser Runner
      this.recordTransition('STARTING_BROWSER');
      if (this.mockFailures.BROWSER) {
        throw new Error('Browser runner launch failed');
      }
      this.activeProcesses.set('BROWSER', { name: 'browser', port: REQUIRED_PORTS.CLIENT, pid: 104, status: 'running' });

      this.recordTransition('RUNNING');
      return { success: true, activeCount: this.activeProcesses.size };
    } catch (err) {
      this.recordTransition('FAILED');
      // Execute failure-stop rollback of any processes already started
      await this.orderlyShutdown(true);
      throw err;
    }
  }

  async orderlyShutdown(isRollback = false) {
    const shutdownOrder = ['BROWSER', 'BACKEND', 'ML_ENGINE', 'DB_PREFLIGHT'];
    const terminationLog = [];

    const STAGE_STOP_STATES = {
      BROWSER: 'STOPPING_BROWSER',
      BACKEND: 'STOPPING_BACKEND',
      ML_ENGINE: 'STOPPING_ML',
      DB_PREFLIGHT: 'STOPPING_DB'
    };

    for (const stage of shutdownOrder) {
      if (this.activeProcesses.has(stage)) {
        const stopState = STAGE_STOP_STATES[stage];
        if (stopState && VALID_STATES.includes(stopState)) {
          this.recordTransition(stopState);
        }
        const proc = this.activeProcesses.get(stage);
        proc.status = 'terminated';
        terminationLog.push({ stage, pid: proc.pid });
        this.activeProcesses.delete(stage);
      }
    }

    if (!isRollback) {
      this.recordTransition('STOPPED');
    } else {
      this.recordTransition('FAILED');
    }

    return {
      terminated: terminationLog,
      remaining: this.activeProcesses.size
    };
  }
}

module.exports = {
  REQUIRED_PORTS,
  ORCHESTRATION_STAGES,
  VALID_STATES,
  ProcessOrchestrator
};

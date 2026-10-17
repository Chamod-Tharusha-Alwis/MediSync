'use strict';

const {
  REQUIRED_PORTS,
  ORCHESTRATION_STAGES,
  VALID_STATES,
  ProcessOrchestrator
} = require('./helpers/qaProcessOrchestration');

describe('OP-01 Process Orchestrator & State Machine Specification Suite', () => {
  describe('Part A: Normal Startup Sequencing & Orderly Shutdown', () => {
    test('1. Executes deterministic startup sequencing: Ports -> DB -> ML -> Backend -> Browser', async () => {
      const orchestrator = new ProcessOrchestrator();
      const res = await orchestrator.start();

      expect(res.success).toBe(true);
      expect(res.activeCount).toBe(4);
      expect(orchestrator.state).toBe('RUNNING');

      // Verify sequence of states
      const stateNames = orchestrator.stageHistory.map(h => h.state);
      expect(stateNames).toEqual([
        'PORT_CHECK',
        'STARTING_DB',
        'STARTING_ML',
        'STARTING_BACKEND',
        'STARTING_BROWSER',
        'RUNNING'
      ]);
    });

    test('2. Orderly shutdown terminates children in strict reverse order: Browser -> Backend -> ML -> DB', async () => {
      const orchestrator = new ProcessOrchestrator();
      await orchestrator.start();

      const shutdown = await orchestrator.orderlyShutdown();
      expect(shutdown.remaining).toBe(0);
      expect(orchestrator.state).toBe('STOPPED');

      const terminatedStages = shutdown.terminated.map(t => t.stage);
      expect(terminatedStages).toEqual(['BROWSER', 'BACKEND', 'ML_ENGINE', 'DB_PREFLIGHT']);
    });
  });

  describe('Part B: Port Conflict Pre-Flight Detection (Fail-Closed)', () => {
    test('3. Fails closed before spawning if client port 3000 is occupied', async () => {
      const busyPortScanner = async (port) => port === REQUIRED_PORTS.CLIENT;
      const orchestrator = new ProcessOrchestrator({ portScanner: busyPortScanner });

      await expect(orchestrator.start()).rejects.toThrow(/Port conflict detected.*CLIENT:3000/);
      expect(orchestrator.state).toBe('FAILED');
      expect(orchestrator.activeProcesses.size).toBe(0);
    });

    test('4. Fails closed before spawning if backend port 5000 is occupied', async () => {
      const busyPortScanner = async (port) => port === REQUIRED_PORTS.BACKEND;
      const orchestrator = new ProcessOrchestrator({ portScanner: busyPortScanner });

      await expect(orchestrator.start()).rejects.toThrow(/Port conflict detected.*BACKEND:5000/);
      expect(orchestrator.state).toBe('FAILED');
      expect(orchestrator.activeProcesses.size).toBe(0);
    });

    test('5. Fails closed before spawning if ML Engine port 5001 is occupied', async () => {
      const busyPortScanner = async (port) => port === REQUIRED_PORTS.ML_ENGINE;
      const orchestrator = new ProcessOrchestrator({ portScanner: busyPortScanner });

      await expect(orchestrator.start()).rejects.toThrow(/Port conflict detected.*ML_ENGINE:5001/);
      expect(orchestrator.state).toBe('FAILED');
      expect(orchestrator.activeProcesses.size).toBe(0);
    });

    test('6. Fails closed before spawning if Prometheus port 8000 is occupied', async () => {
      const busyPortScanner = async (port) => port === REQUIRED_PORTS.PROMETHEUS;
      const orchestrator = new ProcessOrchestrator({ portScanner: busyPortScanner });

      await expect(orchestrator.start()).rejects.toThrow(/Port conflict detected.*PROMETHEUS:8000/);
      expect(orchestrator.state).toBe('FAILED');
      expect(orchestrator.activeProcesses.size).toBe(0);
    });
  });

  describe('Part C: Failure-Stop Behavior and Reverse-Order Rollback', () => {
    test('7. Database pre-flight failure aborts subsequent stages immediately', async () => {
      const orchestrator = new ProcessOrchestrator({
        mockFailures: { DB_PREFLIGHT: true }
      });

      await expect(orchestrator.start()).rejects.toThrow(/Database preflight validation failed/);
      expect(orchestrator.state).toBe('FAILED');
      expect(orchestrator.activeProcesses.size).toBe(0);

      // Verify ML, Backend, Browser were never started
      const states = orchestrator.stageHistory.map(h => h.state);
      expect(states).not.toContain('STARTING_ML');
      expect(states).not.toContain('STARTING_BACKEND');
      expect(states).not.toContain('STARTING_BROWSER');
    });

    test('8. ML Engine failure aborts subsequent stages and rolls back DB preflight', async () => {
      const orchestrator = new ProcessOrchestrator({
        mockFailures: { ML_ENGINE: true }
      });

      await expect(orchestrator.start()).rejects.toThrow(/ML Engine health probe failed/);
      expect(orchestrator.state).toBe('FAILED');
      expect(orchestrator.activeProcesses.size).toBe(0);

      const states = orchestrator.stageHistory.map(h => h.state);
      expect(states).toContain('STARTING_DB');
      expect(states).toContain('STARTING_ML');
      expect(states).not.toContain('STARTING_BACKEND');
      expect(states).not.toContain('STARTING_BROWSER');
      expect(states).toContain('STOPPING_DB');
    });

    test('9. Backend service failure rolls back ML Engine and DB in reverse order', async () => {
      const orchestrator = new ProcessOrchestrator({
        mockFailures: { BACKEND: true }
      });

      await expect(orchestrator.start()).rejects.toThrow(/Backend HTTP listener failed to bind/);
      expect(orchestrator.state).toBe('FAILED');
      expect(orchestrator.activeProcesses.size).toBe(0);

      const states = orchestrator.stageHistory.map(h => h.state);
      expect(states).not.toContain('STARTING_BROWSER');
      expect(states).toContain('STOPPING_ML');
      expect(states).toContain('STOPPING_DB');
    });

    test('10. Browser failure rolls back Backend, ML Engine and DB in reverse order', async () => {
      const orchestrator = new ProcessOrchestrator({
        mockFailures: { BROWSER: true }
      });

      await expect(orchestrator.start()).rejects.toThrow(/Browser runner launch failed/);
      expect(orchestrator.state).toBe('FAILED');
      expect(orchestrator.activeProcesses.size).toBe(0);

      const states = orchestrator.stageHistory.map(h => h.state);
      expect(states).toContain('STOPPING_BACKEND');
      expect(states).toContain('STOPPING_ML');
      expect(states).toContain('STOPPING_DB');
    });

    test('11. Rejects start if already running', async () => {
      const orchestrator = new ProcessOrchestrator();
      await orchestrator.start();
      await expect(orchestrator.start()).rejects.toThrow(/Cannot start orchestrator in state RUNNING/);
      await orchestrator.orderlyShutdown();
    });
  });
});

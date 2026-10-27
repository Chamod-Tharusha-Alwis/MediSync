// Stop subsequent cases before their fixture hooks after the first failure.
// The failing case's afterEach and suite afterAll still perform exact cleanup.
const { TestEnvironment } = require('jest-environment-node');
class LabSafetyEnvironment extends TestEnvironment {
  async handleTestEvent(event) {
    if (['test_fn_failure', 'hook_failure'].includes(event.name)) {
      this.failed = true;
      this.global.__MEDISYNC_QA_FREEZE?.();
    }
    if (event.name === 'test_start' && this.failed) event.test.mode = 'skip';
  }
}
module.exports = LabSafetyEnvironment;

'use strict';
const fs=require('fs'),path=require('path'),yaml=require('js-yaml');
test.each(['e2e-tests.yml','security-tests.yml'])('%s is pinned offline verification, with no database/provider/deployment job',file=>{
 const text=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows',file),'utf8'),workflow=yaml.load(text);
 expect(workflow.on.push.branches).toEqual(['main','release/medisync-v1-final-integration']);expect(workflow.on.pull_request.branches).toContain('chore/safe-localhost-development');
 for(const job of Object.values(workflow.jobs)){
  expect(job.services).toBeUndefined();
  for(const step of job.steps){if(step.uses)expect(step.uses).toMatch(/^actions\/(checkout|setup-node|setup-python)@[a-f0-9]{40}$/);}
 }
 expect(text).not.toMatch(/secrets\.|MONGO_URI|VAULT_TOKEN|run_expanded_browser_tests|standaloneMockServer|vercel deploy|git push|upload-artifact|docker run|vault kv/i);
 expect(text).toContain('node scripts/run_offline_tests.js');expect(text).toContain('NOT RUN');
});

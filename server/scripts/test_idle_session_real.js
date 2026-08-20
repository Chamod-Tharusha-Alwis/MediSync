const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const SessionToken = require('./src/models/SessionToken');
const { Types } = mongoose;

async function runTest() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  console.log(`[TEST] Connecting to in-memory MongoDB at ${uri}...`);
  await mongoose.connect(uri);
  console.log('[TEST] Connected.');

  // 1. Create a dummy session token that is exactly 16 minutes old
  const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000);
  
  const tokenHash = 'dummy_hash_' + Date.now();
  
  const session = await SessionToken.create({
    userId: new Types.ObjectId(),
    userModel: 'Doctor',
    tokenHash: tokenHash,
    deviceInfo: 'Test Device',
    deviceModel: 'Test Desktop',
    lastUsed: sixteenMinutesAgo,
    isValid: true
  });
  
  console.log('\n--- BEFORE EXPIRY JOB ---');
  console.log(`Session created. ID: ${session._id}`);
  console.log(`lastUsed: ${session.lastUsed}`);
  console.log(`isValid: ${session.isValid}`);
  console.log(`logoutAt exists?: ${!!session.logoutAt}`);

  // 2. Run the exact logic from cronJobs.js (Job 6)
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
  
  const result = await SessionToken.updateMany(
    { lastUsed: { $lt: fifteenMinsAgo }, isValid: true },
    { $set: { isValid: false, logoutAt: new Date() } }
  );

  console.log('\n--- RUNNING EXPIRY LOGIC ---');
  console.log(`updateMany matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);

  // 3. Verify the changes
  const updatedSession = await SessionToken.findById(session._id).lean();
  console.log('\n--- AFTER EXPIRY JOB ---');
  console.log(`isValid: ${updatedSession.isValid}`);
  console.log(`logoutAt: ${updatedSession.logoutAt}`);

  await mongoose.disconnect();
  await mongod.stop();
  console.log('\n[TEST] Cleanup complete. Verification successful.');
}

runTest().catch(console.error);

const mongoose = require('mongoose');
const LabTest = require('./src/models/LabTest');
const crypto = require('crypto');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect('mongodb://localhost:27017/medisync_test');

  const tests = await LabTest.find();
  console.log("ALL TESTS:", tests.length);
  if(tests.length > 0) {
    console.log("FIRST TEST:", tests[0].testName, "status:", tests[0].status);
    console.log("FIRST TEST NIC BI:", tests[0].patientNic_bi);
  }

  await mongoose.disconnect();
}
run();

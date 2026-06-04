const mongoose = require('mongoose');
const Patient = require('./src/models/Patient');
require('dotenv').config({ path: './.env' });

async function checkPatient() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/medisync');
  const patient = await Patient.findOne();
  console.log("Any patient:", patient ? patient.nic : "none");

  const specific = await Patient.findOne({ nic: "2003257257" });
  if (specific) {
    console.log("Found specific patient!");
    console.log("nic:", specific.nic);
    console.log("patientNic_bi:", specific.patientNic_bi);
  } else {
    console.log("Specific patient not found by NIC!");
    // check if it's there by scanning all
    const all = await Patient.find({});
    console.log("All NICs:", all.map(p => p.nic));
  }
  process.exit(0);
}
checkPatient();

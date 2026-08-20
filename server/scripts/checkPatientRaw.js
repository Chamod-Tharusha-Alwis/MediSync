const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/chamo/Desktop/Final project/medisync/server/.env' });

async function checkPatientRaw() {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/medisync';
    console.log("Connecting to:", uri);
    await mongoose.connect(uri);
    const collection = mongoose.connection.db.collection('patients');
    
    // Find patient by NIC
    const specific = await collection.findOne({ nic: "2003257257" });
    if (specific) {
      console.log("Found specific patient!");
      console.log("nic:", specific.nic);
      console.log("patientNic_bi:", specific.patientNic_bi);
      console.log("Is patientNic_bi equal to calculated hash?", specific.patientNic_bi === require('crypto').createHash('sha256').update('2003257257').digest('hex'));
    } else {
      console.log("Specific patient not found by NIC!");
    }
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    process.exit(0);
  }
}
checkPatientRaw();

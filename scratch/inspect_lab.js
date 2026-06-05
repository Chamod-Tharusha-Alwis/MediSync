const mongoose = require('../server/node_modules/mongoose');
const dotenv = require('../server/node_modules/dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../server/.env') });

const PharmacyStaff = require('../server/src/models/PharmacyStaff');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const staffList = await PharmacyStaff.find();
  console.log('Pharmacy Staff:');
  console.log(staffList.map(s => ({ email: s.email, role: s.role })));

  await mongoose.disconnect();
}

run().catch(console.error);

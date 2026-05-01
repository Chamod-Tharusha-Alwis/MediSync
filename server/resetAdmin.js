require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;
  
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('password123', salt);

  // This looks for ANY document where role is 'admin'
  const admin = await db.collection('doctors').findOne({ role: 'admin' });

  if (admin) {
      await db.collection('doctors').updateOne(
        { _id: admin._id },
        { $set: { password: hashedPassword } }
      );
      console.log('✅ SUCCESS!');
      console.log(`Updated Admin Email: ${admin.email}`);
      console.log('New Password: password123');
  } else {
      console.log('❌ Still nothing. No user with role "admin" exists in the doctors collection.');
  }
  
  process.exit(0);
}).catch(err => {
  console.error('❌ DB Error:', err);
  process.exit(1);
});
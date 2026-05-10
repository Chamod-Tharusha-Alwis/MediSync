const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from server/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

const Doctor = require('../src/models/Doctor');

const makeAdmin = async () => {
  try {
    const emailToMakeAdmin = process.argv[2] || 'test@example.com';
    
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected successfully.');

    // Find the user and update their role
    const updatedUser = await Doctor.findOneAndUpdate(
      { email: emailToMakeAdmin },
      { 
        $set: { 
          role: 'admin', 
          isSuperAdmin: true 
        } 
      },
      { new: true }
    );

    if (updatedUser) {
      console.log(`\nSUCCESS: User ${updatedUser.email} has been updated.`);
      console.log(`New Role: ${updatedUser.role}`);
      console.log(`Super Admin: ${updatedUser.isSuperAdmin}\n`);
    } else {
      console.log(`\nERROR: No user found with email: ${emailToMakeAdmin}`);
      console.log(`Make sure the user exists in the Doctors collection.\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  }
};

makeAdmin();

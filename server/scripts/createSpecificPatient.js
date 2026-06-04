//node server/scripts/createSpecificPatient.js

const axios = require('axios');

async function createSpecificPatient() {
    console.log("⏳ Registering specific patient (NIC: 2003257257)...");

    try {
        const response = await axios.post('http://localhost:5005/api/auth/register-patient', {
            nic: "2003257257",
            fullName: "Lab Test Patient",
            email: "labpatient@medisync.com",
            password: "StrongPassword123!",
            dateOfBirth: "2003-01-01",
            gender: "Male",
            contactNumber: "0771234567",
            contactInfo: "0771234567", // Added just in case your schema uses this name!
            role: "patient" // <--- THIS WAS THE MISSING PIECE!
        });

        console.log("✅ Patient created successfully!");
        console.log("➡️  Now go to your Hospital Dashboard and type exactly: 2003257257");

    } catch (error) {
        // Fallback: If it's supposed to hit the patient-specific route instead
        if (error.response && error.response.status === 404) {
            console.log("⚠️ Route not found, attempting alternative patient route...");
            await axios.post('http://localhost:5005/api/patient/register', {
                nic: "2003257257", fullName: "Lab Test Patient", email: "labpatient@medisync.com",
                password: "StrongPassword123!", dateOfBirth: "2003-01-01", gender: "Male", contactNumber: "0771234567"
            }).then(() => console.log("✅ Patient created successfully!")).catch(e => console.log("❌ Failed:", e.response?.data || e.message));
            return;
        }

        if (error.response && error.response.status === 400 && error.response.data.error.includes("duplicate")) {
            console.log("⚠️ This email or NIC already exists in the database! Try changing the email address in the script.");
        } else if (error.response) {
            console.log("❌ Failed:", error.response.data);
        } else {
            console.log("❌ Server might be offline:", error.message);
        }
    }
}

createSpecificPatient();
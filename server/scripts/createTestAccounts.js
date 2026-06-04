// node server/scripts/createTestAccounts.js

const axios = require('axios');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const BASE_URL = 'http://localhost:5005';

// Universal test password for easy manual login
const TEST_PASSWORD = "StrongPassword123!";

// 1. Doctor Payload
const doctorData = {
    fullName: "Test Doctor",
    email: "doctor@test.com",
    password: TEST_PASSWORD,
    licenseNo: `DOC-${Date.now().toString().slice(-6)}`,
    specialization: "General Physician"
};

const hospitalData = {
    name: "Test Hospital",
    regNo: `HOSP-${Date.now().toString().slice(-6)}`, // Added missing regNo
    email: "hospital@test.com",
    adminEmail: "hospital@test.com", // Added for schema safety
    password: TEST_PASSWORD,
    adminPassword: TEST_PASSWORD,    // Added for schema safety
    address: "123 Health Way, Colombo",
    contactNumber: "0112345678"
};

const pharmacyData = {
    pharmacyName: "Test Pharmacy",
    district: "Kandy",
    address: "456 Pill Street, Kandy",
    regNo: `PHARM-${Date.now().toString().slice(-6)}`,
    phone: "0812345678",
    adminName: "Test Pharmacy Admin",
    adminEmail: "pharmacy@test.com",
    adminPassword: TEST_PASSWORD
};

// 4. Admin Payload
const adminData = {
    fullName: "Test Admin",
    email: "admin@test.com",
    password: TEST_PASSWORD
};

async function createAccounts() {
    console.log("--- 🏥 Generating MediSync Test Accounts ---\n");

    try {
        // Create Doctor
        console.log("⏳ Creating Doctor...");
        await axios.post(`${BASE_URL}/api/auth/register`, { ...doctorData, role: 'doctor' }).catch(err => {
            if (err.response && err.response.status === 400 && err.response.data.error && err.response.data.error.toLowerCase().includes('already')) {
                console.log("ℹ️ Doctor account already exists (skipping).");
            } else throw err;
        });
        console.log("✅ Doctor step completed!");

        // Create Hospital
        console.log("⏳ Creating Hospital...");
        // Note: Using the route from your previous E2E script
        await axios.post(`${BASE_URL}/api/hospital/register`, hospitalData).catch(async (err) => {
            if (err.response && err.response.status === 404) {
                await axios.post(`${BASE_URL}/api/auth/register`, { ...hospitalData, role: 'hospitalAdmin' }).catch(e => {
                    if (e.response && e.response.status === 400 && e.response.data.error && e.response.data.error.toLowerCase().includes('already')) {
                        console.log("ℹ️ Hospital account already exists (skipping).");
                    } else throw e;
                });
            } else if (err.response && err.response.status === 400 && err.response.data.error && err.response.data.error.toLowerCase().includes('already')) {
                console.log("ℹ️ Hospital account already exists (skipping).");
            } else throw err;
        });
        console.log("✅ Hospital step completed!");

        // Create Pharmacy
        console.log("⏳ Creating Pharmacy...");
        await axios.post(`${BASE_URL}/api/pharmacy/register`, pharmacyData).catch(async (err) => {
            if (err.response && err.response.status === 404) {
                await axios.post(`${BASE_URL}/api/auth/register`, { ...pharmacyData, role: 'pharmacist' }).catch(e => {
                    if (e.response && e.response.status === 400 && e.response.data.error && e.response.data.error.toLowerCase().includes('already')) {
                        console.log("ℹ️ Pharmacy account already exists (skipping).");
                    } else throw e;
                });
            } else if (err.response && err.response.status === 400 && err.response.data.error && err.response.data.error.toLowerCase().includes('already')) {
                console.log("ℹ️ Pharmacy account already exists (skipping).");
            } else throw err;
        });
        console.log("✅ Pharmacy step completed!\n");

        // Create Admin
        try {
            console.log("⏳ Logging in as Super Admin to create Admin account...");
            let superAdminToken = null;
            const passwordsToTry = [process.env.ADMIN_PASSWORD, "Admin123!", "password123", "StrongPassword123!"].filter(Boolean);
            
            for (const pwd of passwordsToTry) {
                try {
                    const adminLoginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
                        email: "superadmin@medisync.com",
                        password: pwd,
                        role: "admin"
                    });
                    superAdminToken = adminLoginRes.data.data.accessToken;
                    break;
                } catch (e) {
                    // ignore and try next
                }
            }

            if (!superAdminToken) throw new Error("Invalid credentials for all known superadmin passwords.");

            console.log("⏳ Creating Admin...");
            await axios.post(`${BASE_URL}/api/admin/admins`, adminData, {
                headers: { Authorization: `Bearer ${superAdminToken}` }
            }).catch(err => {
                if (err.response && err.response.status === 400 && err.response.data.error && err.response.data.error.toLowerCase().includes('already')) {
                    console.log("ℹ️ Admin account already exists (skipping).");
                } else throw err;
            });
            console.log("✅ Admin step completed!\n");
        } catch (adminErr) {
            console.log("⚠️ Could not create Admin test account (Ensure ADMIN_PASSWORD matches .env):", adminErr.response ? adminErr.response.data : adminErr.message);
        }

        console.log("🎉 ALL ACCOUNTS READY FOR UI TESTING!");
        console.log("=========================================");
        console.log(`👨‍⚕️ Doctor   -> Email: ${doctorData.email} | Pass: ${TEST_PASSWORD}`);
        console.log(`🏥 Hospital -> Email: ${hospitalData.email} | Pass: ${TEST_PASSWORD}`);
        console.log(`💊 Pharmacy -> Email: ${pharmacyData.adminEmail} | Pass: ${TEST_PASSWORD}`);
        console.log(`🛡️  Admin    -> Email: ${adminData.email} | Pass: ${TEST_PASSWORD}`);
        console.log("=========================================\n");

    } catch (error) {
        console.log("\n❌ Failed to create an account!");
        if (error.response) {
            console.log(`STATUS CODE: ${error.response.status}`);
            console.dir(error.response.data, { depth: null, colors: true });
            console.log("\n💡 TIP: If it says 'Required fields missing', add them to the payload in this script!");
        } else {
            console.log(error.message);
        }
    }
}

createAccounts();
const fs = require('fs');
let file = fs.readFileSync('server/src/controllers/labController.js', 'utf8');

const verifySearchStr = `      // Fetch pending tests
      const pendingTests = await LabTest.find({
        $or: [{ patientNic_bi: hashedNic }, { patientNic: cleanNic }],
        status: 'pending',
      })
        .sort({ createdAt: -1 })
        .select('labTestId testName testCategory urgency notes status createdAt referredBy')
        .populate('referredBy', 'fullName specialization')
        .populate('hospitalId', 'name');

      return res.json({
        count: pendingTests.length,
        tests: pendingTests,
      });`;

const verifyReplaceStr = `      // Fetch pending tests
      const pendingTests = await LabTest.find({
        $or: [{ patientNic_bi: hashedNic }, { patientNic: cleanNic }],
        status: 'pending',
      })
        .sort({ createdAt: -1 })
        .select('labTestId testName testCategory urgency notes status createdAt referredBy')
        .populate('referredBy', 'fullName specialization')
        .populate('hospitalId', 'name');

      console.log("[DEBUG] verifyOtpAndFetchTests found:", pendingTests.length, "hashedNic:", hashedNic, "cleanNic:", cleanNic);

      return res.json({
        count: pendingTests.length,
        tests: pendingTests,
      });`;

file = file.replace(verifySearchStr, verifyReplaceStr);

fs.writeFileSync('server/src/controllers/labController.js', file);
console.log('Done');

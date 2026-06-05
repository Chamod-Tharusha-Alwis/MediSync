const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const Pharmacy = require('../models/Pharmacy');
const PharmacyStaff = require('../models/PharmacyStaff');

exports.uploadProfilePic = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const { role, id } = req.user;
    const imageUrl = req.file.path || req.file.secure_url;

    let updatedDoc;

    if (role === 'doctor' || role === 'admin' || role === 'super_admin') {
      updatedDoc = await Doctor.findByIdAndUpdate(id, { profilePicture: imageUrl }, { new: true });
    } else if (role === 'patient') {
      updatedDoc = await Patient.findByIdAndUpdate(id, { profilePicture: imageUrl }, { new: true });
    } else if (role === 'hospital_admin') {
      updatedDoc = await Hospital.findByIdAndUpdate(id, { profilePicture: imageUrl }, { new: true });
    } else if (role === 'pharmacy_admin' || role === 'pharmacist' || role === 'assistant') {
      updatedDoc = await PharmacyStaff.findByIdAndUpdate(id, { profilePicture: imageUrl }, { new: true });
      if (updatedDoc && updatedDoc.pharmacyId) {
        await Pharmacy.findByIdAndUpdate(updatedDoc.pharmacyId, { profilePicture: imageUrl });
      }
    }

    if (!updatedDoc) {
      return res.status(404).json({ error: 'User record not found' });
    }

    res.json({
      message: 'Profile picture uploaded successfully',
      imageUrl,
      data: updatedDoc
    });
  } catch (error) {
    res.status(500).json({ error: 'Profile picture upload failed', details: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { description, googleMapsUrl, pickupLocationAddress } = req.body;
    const { role, id } = req.user;

    let updatedDoc;

    if (role === 'doctor' || role === 'admin' || role === 'super_admin') {
      const updateData = { description };
      if (googleMapsUrl !== undefined) updateData.googleMapsUrl = googleMapsUrl;
      updatedDoc = await Doctor.findByIdAndUpdate(id, updateData, { new: true });
    } else if (role === 'patient') {
      return res.status(400).json({ error: 'Patients do not support description profiles' });
    } else if (role === 'hospital_admin') {
      const updateData = { description };
      if (googleMapsUrl !== undefined) updateData.googleMapsUrl = googleMapsUrl;
      if (pickupLocationAddress !== undefined) updateData.pickupLocationAddress = pickupLocationAddress;
      updatedDoc = await Hospital.findByIdAndUpdate(id, updateData, { new: true });
    } else if (role === 'pharmacy_admin' || role === 'pharmacist' || role === 'assistant') {
      const updateData = { description };
      updatedDoc = await PharmacyStaff.findByIdAndUpdate(id, updateData, { new: true });
      if (updatedDoc && updatedDoc.pharmacyId) {
        const pharmUpdateData = { description };
        if (googleMapsUrl !== undefined) pharmUpdateData.googleMapsUrl = googleMapsUrl;
        if (pickupLocationAddress !== undefined) pharmUpdateData.pickupLocationAddress = pickupLocationAddress;
        await Pharmacy.findByIdAndUpdate(updatedDoc.pharmacyId, pharmUpdateData);
      }
    }

    if (!updatedDoc) {
      return res.status(404).json({ error: 'User record not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      data: updatedDoc
    });
  } catch (error) {
    res.status(500).json({ error: 'Profile update failed', details: error.message });
  }
};

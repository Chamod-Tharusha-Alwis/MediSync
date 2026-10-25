const { updateFacilityProfile } = require('../services/facilityProfileService');
const { ClinicalCommandError } = require('../services/clinicalErrors');
const { profileDto, isHttpsLink } = require('../security/publicDto');
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
    if (role === 'patient') return res.status(503).json({error:'PRIVATE_PROFILE_IMAGE_STORAGE_REQUIRED'});
    const imageUrl = req.file.path || req.file.secure_url;
    if (!isHttpsLink(imageUrl)) return res.status(400).json({error:'Invalid profile image URL'});

    if (!['doctor','patient','hospital_admin','pharmacy_admin'].includes(role)) return res.status(403).json({error:'Profile editing is not permitted for this role'});
    let updatedDoc;

    if (role === 'doctor') {
      updatedDoc = await Doctor.findByIdAndUpdate(id, { profilePicture: imageUrl }, { new: true });
    } else if (role === 'patient') {
      updatedDoc = await Patient.findByIdAndUpdate(id, { profilePicture: imageUrl }, { new: true });
    } else if (role === 'hospital_admin') {
      updatedDoc = await Hospital.findByIdAndUpdate(id, { profilePicture: imageUrl }, { new: true });
    } else if (role === 'pharmacy_admin') {
      updatedDoc = await updateFacilityProfile({id,role,update:{profilePicture:imageUrl}});
    }

    if (!updatedDoc) {
      return res.status(404).json({ error: 'User record not found' });
    }

    res.json({
      message: 'Profile picture uploaded successfully',
      imageUrl,
      data: profileDto(updatedDoc)
    });
  } catch (error) {
    res.status(error instanceof ClinicalCommandError ? error.status : 500).json({ error: error instanceof ClinicalCommandError ? error.code : 'Profile picture upload failed' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length===0 || Object.keys(body).some(k => !['description','googleMapsUrl','pickupLocationAddress'].includes(k)) || Object.entries(body).some(([k,v]) => typeof v !== 'string' || v.length > (k === 'description' ? 5000 : 2000))) return res.status(400).json({error:'Invalid profile fields'});
    const { description, googleMapsUrl, pickupLocationAddress } = body;
    if (googleMapsUrl && !isHttpsLink(googleMapsUrl)) return res.status(400).json({error:'A valid HTTPS map link is required'});
    const { role, id } = req.user;

    if (!['doctor','patient','hospital_admin','pharmacy_admin'].includes(role)) return res.status(403).json({error:'Profile editing is not permitted for this role'});
    let updatedDoc;

    if (role === 'doctor') {
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
    } else if (role === 'pharmacy_admin') {
      updatedDoc = await updateFacilityProfile({id,role,update:body});
    }

    if (!updatedDoc) {
      return res.status(404).json({ error: 'User record not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      data: profileDto(updatedDoc)
    });
  } catch (error) {
    res.status(error instanceof ClinicalCommandError ? error.status : 500).json({ error: error instanceof ClinicalCommandError ? error.code : 'Profile update failed' });
  }
};

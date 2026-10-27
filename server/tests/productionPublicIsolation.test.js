'use strict';
const {isSyntheticRecord}=require('../src/security/publicDto');
const imageAdmission=require('../src/middleware/profileImageAdmission');
test.each([{isSynthetic:true},{isDemoData:true},{isDemoAccount:true},{datasetVersion:'MEDISYNC_UNIV_DEMO_V2'}])('public eligibility excludes each synthetic marker (%p)',value=>expect(isSyntheticRecord(value)).toBe(true));
test('ordinary publication record is not automatically synthetic',()=>expect(isSyntheticRecord({name:'Real facility'})).toBe(false));
test.each(['patient','assistant','admin',undefined])('image admission rejects %s before provider middleware',role=>{const res={status:jest.fn().mockReturnThis(),json:jest.fn()},next=jest.fn();imageAdmission({user:{role}},res,next);expect(res.status).toHaveBeenCalledWith(role==='patient'?503:403);expect(next).not.toHaveBeenCalled();});
test.each(['doctor','hospital_admin','pharmacy_admin'])('professional image admission continues for %s',role=>{const next=jest.fn();imageAdmission({user:{role}},{},next);expect(next).toHaveBeenCalledTimes(1);});
test('route registration enforces verified account and image admission before upload',()=>{const fs=require('fs'),path=require('path');const source=fs.readFileSync(path.join(__dirname,'../src/routes/userRoutes.js'),'utf8');expect(source).toContain("require('../middleware/verifiedAuth')");expect(source.indexOf("require('../middleware/profileImageAdmission')")).toBeGreaterThan(0);expect(source.indexOf("require('../middleware/profileImageAdmission')")).toBeLessThan(source.indexOf("uploadProfilePic.single('image')"));});

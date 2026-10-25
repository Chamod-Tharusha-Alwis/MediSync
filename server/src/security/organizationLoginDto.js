'use strict';
function organizationLoginDto(rows) {
  if (!Array.isArray(rows)) return [];
  const id = value => /^[a-f0-9]{24}$/i.test(String(value || '')) ? String(value) : undefined;
  return rows.map(org => ({ _id:id(org._id), hospitalId:id(org.hospitalId?._id || org.hospitalId), orgEmail:typeof org.orgEmail === 'string' ? org.orgEmail : undefined,
    isActive:org.isActive===true, mustChangePassword:org.mustChangePassword===true }));
}
module.exports = { organizationLoginDto };

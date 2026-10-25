// Source-audited future coverage contract. Data only; never drives a browser.
module.exports = {
  admin:{ routes:['/admin/login','/admin/dashboard','/admin/dashboard/users','/admin/dashboard/identity','/admin/dashboard/outbreak'],
    selectors:['input[type="email"]','input[type="password"]','button[type="submit"]','Search name, email, or NIC...'],
    preparedUi:['login','dashboard','owned-user search','outbreak navigation'],gaps:['approval boundaries through UI on owned targets'] },
  doctor:{ routes:['/doctor/login','/doctor/consultation/new','/doctor/dashboard'],
    selectors:['e.g. 200312345699','Patient Verification Required','Proceed to Symptoms','Continue to AI Diagnosis','ICD-10',
      'Search disease, rare condition, or code (e.g. Dengue, 1D20, A90, Down Syndrome)...','Build Prescription',
      'Search medication name or generic (press Enter to add unlisted)...','Complete Consultation'],
    preparedUi:['login','profile/new-consultation navigation'],apiBridge:['consent','symptoms','ICD-10 diagnosis','prescription','save'],
    gaps:['all wizard clicks','save/reopen through UI','duration versus durationDays contract review'] },
  patient:{ routes:['/patient/login','/patient/dashboard/history'],selectors:['input[type="email"]','input[type="password"]'],
    preparedUi:['login','medical timeline'],gaps:['prescription download through UI','lab report access after hospital upload','consent denial through UI'] },
  pharmacy:{ routes:['/pharmacy/login','/pharmacy/dashboard/dispense','/pharmacy/dashboard/otc'],
    selectors:['Enter Patient NIC (e.g. 981234567V)','Retrieve','Dispense Medication','#stock-0','#qty-0','Dispense Now'],
    preparedUi:['login','prescription search','quantity','insufficient-stock error','dispense'],
    apiBridge:['duplicate checkout','OTC transaction','same-key retry','changed-payload conflict'],gaps:['OTC form/receipt/retry through UI'] },
  hospital:{ routes:['/hospital/login','/hospital/dashboard/tests'],selectors:['e.g. 200012345678','Send Verification OTP','OTP Digit 1','Verify & Download Report','Approve Test'],
    preparedUi:['login','lab queue','consent entry','approval'],apiBridge:['multipart encrypted report upload'],
    gaps:['report search/file picker/upload through UI','hospital/doctor cross-role denial paths through UI'] }
};

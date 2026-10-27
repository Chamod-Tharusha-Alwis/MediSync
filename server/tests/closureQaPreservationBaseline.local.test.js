'use strict';
// This exact historical snapshot remains local and is never published to CI.
const {plan}=require('../scripts/closureQaReadOnly.cjs');
test('local-only plan binds all original university/operational rows without requiring credentials or a connection',()=>{
 expect(plan()).toMatchObject({university:74803,operational:48,atlasContacted:false,readsOnly:true,database:'medisync_automated_test'});
});

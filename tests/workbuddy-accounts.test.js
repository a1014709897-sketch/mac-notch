'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createWorkbuddyAccounts}=require('../src/main/workbuddy-accounts');
test('credentials persist only through encrypted storage and remain out of login DTO',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wb-accounts-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(Buffer.from(s).toString('base64')),decryptString:b=>Buffer.from(b.toString(),'base64').toString()};
 let managerOptions,calls=0;
 const createManager=o=>{managerOptions=o;return {accounts:o.getAccounts,cancelLogin(){},resolveCredential(){},async addAccount(){calls++;o.credentialStore.writeWorkbuddyCredential('one',{accessToken:'fixture-secret'});o.setAccounts([{id:'one',enabled:true}]);o.saveSettings();return {ok:true,accounts:[{accessToken:'must-not-leak'}]};}};};
 const service=createWorkbuddyAccounts({directory,safeStorage,createManager});
 assert.deepEqual(await service.login(),{ok:true,errorCode:undefined});
 assert.equal(fs.readFileSync(path.join(directory,'workbuddy-accounts.enc'),'utf8').includes('fixture-secret'),false);
 assert.equal(fs.statSync(path.join(directory,'workbuddy-accounts.enc')).mode&0o777,0o600);
 assert.equal((await service.login()).skipped,true);assert.equal(calls,1);
 createWorkbuddyAccounts({directory,safeStorage,createManager});assert.equal(managerOptions.getAccounts()[0].id,'one');
 assert.equal(managerOptions.credentialStore.readWorkbuddyCredential('one').accessToken,'fixture-secret');
});
test('unavailable encryption cannot start browser authorization',async()=>{
 let opened=false;
 const service=createWorkbuddyAccounts({directory:path.join(os.tmpdir(),'missing-wb-account-test'),safeStorage:{isEncryptionAvailable:()=>false},createManager:()=>({accounts:()=>[],addAccount(){opened=true;},cancelLogin(){}})});
 assert.equal((await service.login()).errorCode,'PERSISTENCE_FAILED');assert.equal(opened,false);
});

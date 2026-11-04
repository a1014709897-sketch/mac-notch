"use strict";
const fs = require('node:fs'), path = require('node:path');
const { createWorkbuddyManagedAccounts } = require('../vendor/token-monitor/src/electron/providers/workbuddy/managedAccounts');
// Independent profile. No Token Monitor settings or WorkBuddy session writes.
function createWorkbuddyAccounts({ directory, safeStorage, fetch, openExternal, onChanged, createManager = createWorkbuddyManagedAccounts }) {
  const file = path.join(directory, 'workbuddy-accounts.enc');
  let data = { accounts: [], credentials: {} }, unreadable = false;
  try { data = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))); }
  catch (error) { unreadable = error.code !== 'ENOENT'; }
  function persist() {
    if (unreadable || !safeStorage.isEncryptionAvailable()) throw new Error('WorkBuddy credential storage unavailable');
    fs.mkdirSync(directory, { recursive:true, mode:0o700 });
    const tmp=file+'.tmp';
    fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(data)), {mode:0o600});
    fs.chmodSync(tmp,0o600);fs.renameSync(tmp,file);return true;
  }
  const service = createManager({
    getAccounts:()=>data.accounts, setAccounts:accounts=>{ data.accounts=accounts; }, saveSettings:persist,
    credentialStore:{
      readWorkbuddyCredential:id=>data.credentials[id] || null,
      writeWorkbuddyCredential(id,value) { const before=data.credentials[id];data.credentials[id]=value;try{return persist();}catch(error){if(before)data.credentials[id]=before;else delete data.credentials[id];throw error;} },
      removeWorkbuddyCredential(id) { const before=data.credentials[id];delete data.credentials[id];try{return persist();}catch(error){if(before)data.credentials[id]=before;throw error;} }
    }, fetch, openExternal, onChanged
  });
  let flight;
  return {
    accounts:service.accounts, resolveCredential:service.resolveCredential,
    cancel:()=>service.cancelLogin(),
    login(force=false) {
      if (flight) return flight;
      if (unreadable || !safeStorage.isEncryptionAvailable()) return Promise.resolve({ok:false,errorCode:'PERSISTENCE_FAILED'});
      if (!force && service.accounts().some(account=>account.enabled && data.credentials[account.id])) return Promise.resolve({ok:true,skipped:true});
      flight=service.addAccount('cn').then(result=>({ok:result.ok,errorCode:result.errorCode})).finally(()=>{flight=null;});return flight;
    }
  };
}
module.exports={createWorkbuddyAccounts};

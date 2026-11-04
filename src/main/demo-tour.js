'use strict';
// Invoked only by --demo --demo-tour; uses the already isolated demo profile.
module.exports = function startDemoTour({ store, state, syncProviders, render, app }) {
  store.update({providers:{claude:false,codex:true,workbuddy:false},menuBar:{claude:false,codex:false,workbuddy:false},notifications:false,assistanceNotifications:false});
  syncProviders();
  const stages=['idle','running','waiting','ended','multi'];let index=0;
  function show(){
    const stage=stages[index];state.sessions.clear();
    if(stage==='multi')state.update([{provider:'codex',id:'demo-tour-a',state:'running'},{provider:'codex',id:'demo-tour-b',state:'running'}]);
    else if(stage!=='idle'){
      state.update([{provider:'codex',id:'demo-tour',state:'running'}]);
      if(stage!=='running')state.update([{provider:'codex',id:'demo-tour',state:stage}]);
    }
    render();console.log('DEMO_TOUR '+JSON.stringify({stage,tasks:state.snapshot().filter(t=>t.provider==='codex')}));
    index++;if(index===stages.length)clearInterval(timer);
  }
  let timer=setInterval(show,12000);show();app.once('before-quit',()=>clearInterval(timer));
};

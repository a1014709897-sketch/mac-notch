"use strict";
const fs = require("node:fs"),
  path = require("node:path");
// Legacy visual fixtures intentionally use the original pair. WorkBuddy pairs have separate checks.
const PROVIDERS = ["claude", "codex"];
const wait = () => new Promise((r) => setTimeout(r, 400));
module.exports = async function smoke({
  notch,
  panel,
  trays,
  geometry,
  payload,
  togglePanel,
  notifications,
  syncNotification,
  acknowledgeVisits,
  state,
  store,
  syncProviders,
  app,
}) {
  try {
    notch.webContents.setBackgroundThrottling(false);
    const compact = () => !payload().expanded && !payload().notification && !payload().collapse;
    async function checkDashboardMotion() {
      const checks={};
      notifications.clear();syncNotification(null);await wait();
      for(const action of ['button','escape']) {
        togglePanel();await wait();
        const before=notch.getBounds();let held;
        const nativeEvents=[];const moved=()=>nativeEvents.push(notch.getBounds());
        notch.on("move",moved);notch.on("resize",moved);
        const timer=setTimeout(()=>{held=notch.getBounds();},100);
        // Real usage/quota workers may publish while the panel is folding.
        const pulse=action==='escape' ? setInterval(()=>{
          const data=payload();
          notch.webContents.send('state',{...data,quotas:{...data.quotas,claude:{...data.quotas.claude,updatedAt:Date.now()}}});
        },60) : null;
        const frames=await notch.webContents.executeJavaScript(`new Promise(resolve=>{
          const frames=[],start=performance.now();
          function sample(){frames.push({time:performance.now()-start,
            closing:document.body.classList.contains('closing-dashboard'),
            clip:getComputedStyle(document.querySelector('#surface')).clipPath,
            header:getComputedStyle(document.querySelector('#notch')).visibility,
            headerWidth:document.querySelector('#notch').getBoundingClientRect().width,
            screenX, viewportWidth:innerWidth, headerX:screenX+document.querySelector('#notch').getBoundingClientRect().left});
            // IPC and Rosetta startup can delay the beginning of the 320 ms fold.
            // Observe the actual completion, with a bounded deadline, rather
            // than treating 380 ms after the click as the completion signal.
            const elapsed=performance.now()-start;
            if(elapsed<1500 && (elapsed<380 || document.body.classList.contains('closing-dashboard')))requestAnimationFrame(sample);else resolve(frames);}
          sample();${action==='button' ? "document.querySelector('#collapse').click()" : "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))"};
        })`);
        clearTimeout(timer);
        clearInterval(pulse);
        notch.removeListener("move",moved);notch.removeListener("resize",moved);
        checks[action]=nativeEvents.length===0 && JSON.stringify(notch.getBounds())===JSON.stringify(before) && held?.height===before.height && before.height>geometry.height &&
          frames.every(f=>f.header!=='hidden' && Math.abs(f.headerWidth-geometry.width)<1 && Math.abs(f.headerX-geometry.x)<1) && new Set(frames.filter(f=>f.closing).map(f=>f.clip)).size>2 &&
          compact() && await notch.webContents.executeJavaScript(`document.querySelector('#dashboard').hidden && !document.body.classList.contains('closing-dashboard')`);
        if(process.env.MAC_NOTCH_SMOKE_OUTPUT) {
          fs.mkdirSync(process.env.MAC_NOTCH_SMOKE_OUTPUT,{recursive:true});
          fs.writeFileSync(path.join(process.env.MAC_NOTCH_SMOKE_OUTPUT,`dashboard-fold-${action}.json`),JSON.stringify(frames,null,2));
        }
      }
      togglePanel();await wait();togglePanel();await new Promise(r=>setTimeout(r,60));togglePanel();await wait();
      checks.reopen=notch.getBounds().height>geometry.height && await notch.webContents.executeJavaScript(`!document.querySelector('#dashboard').hidden && !document.body.classList.contains('closing-dashboard')`);
      await notch.webContents.executeJavaScript(`window.savedMotionQuery=window.matchMedia;window.matchMedia=q=>q==='(prefers-reduced-motion: reduce)'?{matches:true}:window.savedMotionQuery(q);void 0`);
      togglePanel();await new Promise(r=>setTimeout(r,120));
      checks.reducedMotion=compact();
      await notch.webContents.executeJavaScript(`window.matchMedia=window.savedMotionQuery;delete window.savedMotionQuery`);
      // Exercise the production IPC -> native click-through path without moving
      // the user's real cursor or touching their settings.
      const {screen,ipcMain}=require('electron');
      const originalCursor=screen.getCursorScreenPoint, originalIgnore=notch.setIgnoreMouseEvents;
      const ignores=[];notch.setIgnoreMouseEvents=function(ignore,options){ignores.push(ignore);return originalIgnore.call(this,ignore,options);};
      try {
        for(const point of [{x:geometry.x-20,y:geometry.y+10},{x:geometry.x+30,y:geometry.y+10},{x:geometry.x-20,y:geometry.y+10},{x:geometry.x+30,y:geometry.y+70},{x:geometry.x+30,y:geometry.y+10}]) {
          screen.getCursorScreenPoint=()=>point;
          ipcMain.emit('notch:pointer',{sender:notch.webContents});
        }
        checks.pointerPassThrough=ignores.slice(-3).join(',')==='false,true,false';
      } finally {
        screen.getCursorScreenPoint=originalCursor;notch.setIgnoreMouseEvents=originalIgnore;
        ipcMain.emit('notch:pointer',{sender:notch.webContents});
      }
      return checks;
    }
    if(process.argv.includes('--dashboard-motion-smoke')) {
      const checks=await checkDashboardMotion(),ok=Object.values(checks).every(Boolean);
      console.log(JSON.stringify({ok,checks}));app.exit(ok?0:1);return;
    }
    if (process.argv.includes('--foreground-motion-smoke')) {
      const checks=[];
      for(const provider of PROVIDERS) for(const focusAt of ['completion','presentation']) {
        state.sessions.clear(); notifications.clear(); syncNotification(null); await wait();
        const id=`foreground-${provider}-${focusAt}`;
        state.update([{provider,id,state:'running'}]);
        state.update([{provider,id,state:'ended',notification:{title:'前台完成测试',description:'当前工具不应弹出通知'}}]);
        notifications.observe([...state.sessions.values()],Date.now(),focusAt==='completion'?provider:null);
        syncNotification(provider);
        const bounds=notch.getBounds();
        await wait();
        checks.push({provider,focusAt,bounds,collapse:payload().collapse,ui:await notch.webContents.executeJavaScript(`({hidden:document.querySelector('#notification').hidden,closing:document.body.classList.contains('closing-notification'),notifying:document.body.classList.contains('notifying')})`)});
        notifications.observe([...state.sessions.values()],Date.now(),null); syncNotification(null);
        const other=provider==='claude'?'codex':'claude';
        state.update([{provider:other,id:'background',state:'running'}]);
        state.update([{provider:other,id:'background',state:'ended',notification:{title:'后台完成',description:'另一个工具仍然提醒'}}]);
        notifications.observe([...state.sessions.values()],Date.now(),provider);syncNotification(provider);
        checks.at(-1).backgroundNotifies=notifications.current?.provider===other;
      }
      state.sessions.clear();notifications.clear();syncNotification(null);await wait();
      const ok=checks.every(c=>c.ui.hidden&&!c.ui.closing&&!c.ui.notifying&&c.backgroundNotifies&&!c.collapse);
      console.log(JSON.stringify({ok,checks}));app.exit(ok?0:1);return;
    }
    const dashboardMotionChecks=await checkDashboardMotion();
    const results = [];
    const cases = [
      ["idle", "idle"],
      ["idle", "running"],
      ["idle", "waiting"],
      ["idle", "ended"],
      ["running", "running"],
      ["waiting", "running"],
    ].map((states) => ({
      name: states.join("-"),
      tasks: PROVIDERS.map((provider, i) => ({
        provider,
        state: states[i],
        count: 1,
      })),
    }));
    cases.push(
      {
        name: "batch-running",
        tasks: [
          { provider: "claude", state: "idle" },
          {
            provider: "codex",
            state: "running",
            animating: true,
            progress: { done: 1, total: 3 },
          },
        ],
      },
      {
        name: "batch-waiting-running",
        tasks: [
          {
            provider: "claude",
            state: "waiting",
            animating: true,
            progress: { done: 1, total: 2 },
          },
          {
            provider: "codex",
            state: "running",
            animating: true,
            progress: { done: 2, total: 3 },
          },
        ],
      },
      {
        name: "batch-large",
        tasks: [
          {
            provider: "claude",
            state: "running",
            animating: true,
            progress: { done: 12, total: 128 },
          },
          {
            provider: "codex",
            state: "running",
            animating: true,
            progress: { done: 99, total: 128 },
          },
        ],
      },
    );
    for (const fixture of cases) {
      const { tasks } = fixture,
        states = tasks.map((task) => task.state);
      notch.webContents.send("state", { ...payload(), tasks });
      await new Promise((resolve) => setTimeout(resolve, 375));
      const result = await notch.webContents.executeJavaScript(
        `({count:document.querySelectorAll('button.tool').length,width:document.querySelector("#notch").getBoundingClientRect().width,height:document.querySelector("#notch").getBoundingClientRect().height,overflow:document.body.scrollWidth>innerWidth,progress:[...document.querySelectorAll('.progress')].map(n=>n.textContent),dots:document.querySelectorAll('.dots i').length,question:document.querySelectorAll('.question').length,check:document.querySelectorAll('.check').length,regions:[...document.querySelectorAll('.logo,.status,.progress')].filter(n=>getComputedStyle(n).display!=='none').map(n=>{const r=n.getBoundingClientRect();const offset=document.querySelector("#notch").getBoundingClientRect().left;return {left:r.left-offset,right:r.right-offset};})})`,
      );
      result.geometry = payload().geometry;
      result.sizing = await notch.webContents.executeJavaScript(`({icons:[...document.querySelectorAll('.logo')].map(n=>({provider:n.alt,width:getComputedStyle(n).width,padding:getComputedStyle(n).padding})),fonts:[...document.querySelectorAll('.progress')].map(n=>getComputedStyle(n).fontSize)})`);
      result.states = states;
      result.expectedDots =
        tasks.filter((t) => t.state === "running" && !t.progress).length * 3;
      result.expectedProgress = tasks
        .filter((t) => t.state === "running" && t.progress)
        .map((t) => `${t.progress.done}/${t.progress.total}`);
      results.push(result);
      if (process.env.MAC_NOTCH_SMOKE_OUTPUT) {
        fs.mkdirSync(process.env.MAC_NOTCH_SMOKE_OUTPUT, { recursive: true });
        fs.writeFileSync(
          path.join(process.env.MAC_NOTCH_SMOKE_OUTPUT, fixture.name + ".png"),
          (await notch.webContents.capturePage()).toPNG(),
        );
      }
    }

    notch.webContents.send("state", payload());
    await wait();
    const bounds = notch.getBounds();
    togglePanel();
    await wait();
    const panelCheck = await notch.webContents.executeJavaScript(
      `({quotaCards:document.querySelectorAll('#quotas article').length,bars:document.querySelectorAll('#chart button').length,width:innerWidth,height:innerHeight,overflow:document.body.scrollWidth>innerWidth,headerBottom:document.querySelector('#notch').getBoundingClientRect().bottom,contentTop:document.querySelector('#dashboard').getBoundingClientRect().top})`,
    );
    const periodChecks = await notch.webContents.executeJavaScript(`(() => {
      const out = [];
      for (const period of ['day','week','month']) {
        document.querySelector('[data-period="'+period+'"]').click();
        out.push({period, label:document.querySelector('#day-label').textContent, bars:document.querySelectorAll('#chart button').length,
          pressed:document.querySelector('[data-period="'+period+'"]').getAttribute('aria-pressed')});
      }
      return {out, noSettings:!document.querySelector('#settings'), noRefresh:!document.querySelector('#refresh')};
    })()`);
    const out = process.env.MAC_NOTCH_SMOKE_OUTPUT;
    // Exercise the real renderer with the layouts that previously forced scrolling.
    const dashboardBase = structuredClone(payload());
    const resetAt = "2026-11-06T11:20:00.000Z";
    dashboardBase.quotas = {
      claude: { windows: [{label:"5 小时",remaining:98,resetAt}, {label:"每周",remaining:99,resetAt}] },
      codex: { windows: [{label:"会话",remaining:55,resetAt}] },
    };
    for (const view of Object.values(dashboardBase.usage.periods)) {
      view.bins.forEach((bin, i) => {
        bin.claude = (i % 4 + 1) * 154321;
        bin.codex = (i % 6 + 1) * 345678;
        bin.tokens = bin.claude + bin.codex;
        bin.cost = bin.tokens / 1e6 * 1.3;
      });
      for (const key of ["claude", "codex", "tokens", "cost"]) view.total[key] = view.bins.reduce((sum, bin) => sum + bin[key], 0);
    }
    const dashboardCases = [
      {name:"day", period:"day"}, {name:"week", period:"week"}, {name:"month", period:"month"},
      {name:"all-windows", period:"day", allWindows:true},
      {name:"login-needed", period:"day", noLogin:true},
      {name:"cached-quotas", period:"day", allWindows:true, stale:true, incomplete:true},
      {name:"single-provider", period:"day", single:true},
      {name:"large-total", period:"month", large:true},
      {name:"full-month", period:"month", fullMonth:true},
      {name:"loading", period:"day", loading:true},
      {name:"workbuddy-codex", period:"day", workbuddy:true},
    ];
    const dashboardChecks = [];
    for (const fixture of dashboardCases) {
      const data = structuredClone(dashboardBase);
      if (fixture.workbuddy) {
        data.settings.providers = {claude:false,codex:true,workbuddy:true};
        data.quotas.workbuddy = {windows:[],error:"WorkBuddy 已加密本机登录信息，暂时无法读取订阅额度"};
      }
      if (fixture.allWindows) {
        data.quotas.claude.windows.push({label:"Sonnet 每周",remaining:100,resetAt});
        data.quotas.codex.windows.push({label:"每周",remaining:0,resetAt});
      }
      if (fixture.noLogin) data.quotas.claude = {windows:[],error:"如果没有获取 Claude 状态，请运行 Claude Code CLI（claude），完成订阅账号登录后刷新"};
      if (fixture.stale) for (const q of Object.values(data.quotas)) {q.stale=true;q.error="网络连接失败，请检查代理";}
      if (fixture.incomplete) data.usage.incomplete = true;
      if (fixture.single) data.settings.providers.claude = false;
      if (fixture.large) data.usage.periods.month.total.tokens = 123456789012;
      if (fixture.fullMonth) {
        const view = data.usage.periods.month;
        view.bins = Array.from({length:31}, (_,i)=>({...view.bins[i % view.bins.length],date:`2026-10-${String(i+1).padStart(2,'0')}`}));
        for (const key of ["claude", "codex", "tokens", "cost"]) view.total[key] = view.bins.reduce((sum, bin)=>sum+bin[key],0);
      }
      if (fixture.loading) {data.usage.loading=true;for(const q of Object.values(data.quotas)) q.windows=[];}
      notch.webContents.send("state", data);
      await wait();
      await notch.webContents.executeJavaScript(`document.querySelector('[data-period="${fixture.period}"]').click()`);
      await wait();
      const check = await notch.webContents.executeJavaScript(`(() => {
        const dashboard=document.querySelector('#dashboard'), bounds=dashboard.getBoundingClientRect();
        const visible=[...dashboard.querySelectorAll('strong,small,p,h2,.quota-row,.quota-track,#updated,#chart')].filter(n=>n.getClientRects().length);
        const outside=visible.filter(n=>{const r=n.getBoundingClientRect(); return r.bottom>innerHeight || r.left<bounds.left || r.right>bounds.right || n.scrollWidth>n.clientWidth+1;});
        return {outside:outside.map(n=>({tag:n.tagName,id:n.id,cls:n.className,width:n.clientWidth,scroll:n.scrollWidth,bottom:n.getBoundingClientRect().bottom})),scrollHeight:dashboard.scrollHeight,clientHeight:dashboard.clientHeight,
          noScroll:dashboard.scrollHeight<=dashboard.clientHeight,
          fits:visible.every(n=>{const r=n.getBoundingClientRect(); return r.bottom<=innerHeight && r.left>=bounds.left && r.right<=bounds.right && n.scrollWidth<=n.clientWidth+1;}),
          providers:document.querySelectorAll('#quotas article').length,
          meters:document.querySelectorAll('[role=meter]').length,
          footerVisible:document.querySelector('.dashboard-footer').getBoundingClientRect().bottom<=innerHeight};
      })()`);
      dashboardChecks.push({name:fixture.name,...check});
      if (out) fs.writeFileSync(path.join(out, `dashboard-${fixture.name}.png`), (await notch.webContents.capturePage()).toPNG());
    }
    notch.webContents.send("state", dashboardBase);
    await wait();
    await notch.webContents.executeJavaScript(`document.querySelector('[data-period="day"]').click()`);
    if (out)
      fs.writeFileSync(
        path.join(out, "dashboard.png"),
        (await notch.webContents.capturePage()).toPNG(),
      );
    togglePanel();
    const notificationChecks = {};
    let serial = 0;
    function presentNotification(description = "已整理布局与交互说明，等待你确认。", provider = "claude") {
      const id = `notification-smoke-${++serial}`;
      state.update([{ provider, id, state: "running" }]);
      state.update([{ provider, id, state: "ended",
        notification: { desktopId: provider === "claude" ? "local_smoke-test" : "01a1a06a-be28-75b0-a87f-67cb63e99502", title: "通知交互方案已生成", description } }]);
      notifications.observe([...state.sessions.values()]); syncNotification();
      return id;
    }
    const firstNotification = presentNotification();
    await wait();
    notificationChecks.layout = await notch.webContents.executeJavaScript(`(() => {
      const n=document.querySelector('#notification'), b=n.getBoundingClientRect(),
        t=document.querySelector('#notification-track').getBoundingClientRect();
      return { visible: !n.hidden, belowCamera: b.top >= ${geometry.height},
        bottomFlush: Math.abs(t.bottom-innerHeight)<1, trackHeight:t.height, contentHeight:b.height, gap:getComputedStyle(document.querySelector("#notification-body")).gap, fonts:["source","title","description"].map(id=>getComputedStyle(document.querySelector("#notification-"+id)).fontSize),
        source:document.querySelector('#notification-source').textContent,
        title:document.querySelector('#notification-title').textContent,
        buttons:n.querySelectorAll('button').length, overflow:document.body.scrollWidth>innerWidth };
    })()`);
    const outNotification = process.env.MAC_NOTCH_SMOKE_OUTPUT;
    if (outNotification) fs.writeFileSync(path.join(outNotification, "notification.png"), (await notch.webContents.capturePage()).toPNG());
    await notch.webContents.executeJavaScript(`document.querySelector('#notification').dispatchEvent(new MouseEvent('mouseenter'))`);
    await new Promise(r => setTimeout(r, 5200));
    notificationChecks.hoverPaused = notifications.current !== null && notifications.current.expiresAt === null;
    const beforeFold = notch.getBounds();
    let duringFold;
    let foldCapture = Promise.resolve();
    const foldSample = setTimeout(() => {
      duringFold = notch.getBounds();
      if(outNotification) foldCapture = notch.webContents.capturePage().then(image =>
        fs.writeFileSync(path.join(outNotification,'fold-mid.png'),image.toPNG()));
    }, 100);
    const foldFrames = await notch.webContents.executeJavaScript(`new Promise(resolve => {
      const frames=[], start=performance.now();
      function sample() {
        const root=document.querySelector('#notch'), logo=root.querySelector('.logo');
        frames.push({time:performance.now()-start, height:innerHeight, x:screenX,
          logoX:logo ? screenX+logo.getBoundingClientRect().left : null,
          closing:document.body.classList.contains('closing-notification'),
          visible:getComputedStyle(root).visibility!=='hidden',
          clip:getComputedStyle(document.querySelector('#surface')).clipPath});
        if(performance.now()-start<380) requestAnimationFrame(sample); else resolve(frames);
      }
      sample(); document.querySelector('#notification-close').click();
    })`);
    clearTimeout(foldSample);
    await foldCapture;
    const movingFrames=foldFrames.filter(f=>f.closing);
    notificationChecks.fold = {
      heldNativeFrame: duringFold?.height === beforeFold.height && duringFold?.x === beforeFold.x,
      intermediateContours: new Set(movingFrames.map(f=>f.clip)).size > 2,
      headerAlwaysVisible: foldFrames.every(f=>f.visible),
      finishedCompact: compact(),
    };
    if(outNotification) fs.writeFileSync(path.join(outNotification,'fold-frames.json'),JSON.stringify(foldFrames,null,2));
    notificationChecks.closeKeepsUnread = !notifications.current && state.completed().some(t=>t.id===firstNotification)
      && compact();
    presentNotification(); await wait();
    await notch.webContents.executeJavaScript(`document.querySelector('#notification-close').click()`);
    await new Promise(r=>setTimeout(r,60));
    presentNotification('收起过程中到达的新通知'); await wait();
    notificationChecks.fold.interruptedByNewNotification = Boolean(notifications.current) && notch.getBounds().height > geometry.height &&
      await notch.webContents.executeJavaScript(`!document.body.classList.contains('closing-notification') && document.querySelector('#surface').getAnimations().length===0`);
    await notch.webContents.executeJavaScript(`document.querySelector('#notification-close').click()`); await wait();
    presentNotification(); await wait();
    await notch.webContents.executeJavaScript(`window.originalMotionQuery=window.matchMedia;
      window.matchMedia=query=>query==='(prefers-reduced-motion: reduce)' ? {matches:true} : window.originalMotionQuery(query);
      document.querySelector('#notification-close').click()`);
    await new Promise(r=>setTimeout(r,120));
    notificationChecks.fold.reducedMotionImmediate = compact();
    await notch.webContents.executeJavaScript(`window.matchMedia=window.originalMotionQuery; delete window.originalMotionQuery`);
    const secondNotification = presentNotification(); await wait();
    await notch.webContents.executeJavaScript(`document.querySelector('#notification').dispatchEvent(new MouseEvent('mouseleave'))`);
    await new Promise(r=>setTimeout(r, 5200));
    notificationChecks.timeoutKeepsUnread = !notifications.current && state.completed().some(t=>t.id===secondNotification);
    presentNotification(); await wait();
    await notch.webContents.executeJavaScript(`document.querySelector('#notification-body').click()`);
    await wait();
    notificationChecks.bodyOpens = !notifications.current && compact();
    presentNotification("这是一段很长的通知描述。".repeat(30)); await wait();
    notificationChecks.longText = await notch.webContents.executeJavaScript(`(() => {
      const d=document.querySelector('#notification-description').getBoundingClientRect();
      return d.bottom <= innerHeight-2 && d.height <= 39 && document.body.scrollWidth === innerWidth;
    })()`);
    togglePanel(); await wait();
    notificationChecks.dashboardDefers = notifications.current.expiresAt === null && await notch.webContents.executeJavaScript(`document.querySelector('#notification').hidden && !document.querySelector('#dashboard').hidden`);
    togglePanel(); notifications.clear(); syncNotification();
    state.sessions.clear();
    presentNotification("本轮修复已完成，可以回到聊天继续查看。", "codex"); await wait();
    notificationChecks.codexSource = await notch.webContents.executeJavaScript(`document.querySelector('#notification-source').textContent === 'Codex'`);
    if (outNotification) fs.writeFileSync(path.join(outNotification, "notification-codex.png"), (await notch.webContents.capturePage()).toPNG());
    await notch.webContents.executeJavaScript(`document.querySelector('#notification-body').click()`); await wait();
    notificationChecks.codexClick = !notifications.current;
    state.sessions.clear();
    const foregroundChecks = [];
    for (const provider of PROVIDERS) {
      for (const focusAt of ["completion", "presentation"]) {
        state.sessions.clear(); notifications.clear(); syncNotification(null);
        // Finish the preceding fixture's legitimate exit before checking that
        // a new foreground event never expands the window, even for one frame.
        await wait();
        const id = `foreground-${provider}-${focusAt}`;
        state.update([{provider,id,state:"running"}]);
        state.update([{provider,id,state:"ended",notification:{title:"前台完成测试",description:"当前工具不应弹出通知"}}]);
        notifications.observe([...state.sessions.values()],Date.now(),focusAt==="completion" ? provider : null);
        syncNotification(provider);
        const neverExpanded = notifications.current===null && compact();
        await wait();
        const hidden = await notch.webContents.executeJavaScript(`document.querySelector('#notification').hidden && !document.body.classList.contains('notifying')`);
        notifications.observe([...state.sessions.values()],Date.now(),null); syncNotification(null);
        const noReplay = notifications.current===null;
        const other = provider==="claude" ? "codex" : "claude";
        state.update([{provider:other,id:"background",state:"running"}]);
        state.update([{provider:other,id:"background",state:"ended",notification:{title:"后台完成",description:"另一个工具仍然提醒"}}]);
        notifications.observe([...state.sessions.values()],Date.now(),provider); syncNotification(provider);
        foregroundChecks.push({provider,focusAt,neverExpanded,hidden,noReplay,otherStillNotifies:notifications.current?.provider===other});
      }
    }
    state.sessions.clear(); notifications.clear(); syncNotification(null);
    // Optional native integration check: temporary in-memory tasks only; no real
    // chats are sent or marked read. Bring each installed app to the foreground.
    if (process.argv.includes("--live-visit-check")) {
      const { execFile } = require("node:child_process");
      const { promisify } = require("node:util");
      const { frontmostTool } = require("../vendor/token-monitor/src/electron/notch/taskAttention");
      notificationChecks.liveVisits = [];
      for (const provider of PROVIDERS) {
        state.sessions.clear(); notifications.clear();
        const id = presentNotification("完成提醒访问回归验证", provider);
        state.update([{provider, id:"still-running", state:"running"}, {provider, id:"still-waiting", state:"waiting"}]);
        acknowledgeVisits(null);
        await promisify(execFile)("/usr/bin/open", ["-b", provider === "claude" ? "com.anthropic.claudefordesktop" : "com.openai.codex"]);
        const deadline = Date.now() + 5000;
        let foreground;
        do {
          await new Promise(resolve=>setTimeout(resolve, 250));
          foreground = frontmostTool(); acknowledgeVisits(foreground);
        } while (state.completed().some(task=>task.id===id) && Date.now()<deadline);
        await wait();
        notificationChecks.liveVisits.push({provider, foreground, cleared:!state.completed().some(task=>task.id===id),
          notificationClosed:!notifications.current,
          runningKept:state.sessions.get(`${provider}:still-running`).state==="running",
          waitingKept:state.sessions.get(`${provider}:still-waiting`).state==="waiting"});
      }
      state.sessions.clear(); notifications.clear(); syncNotification();
    }
    panel.show();
    await wait();
    const setupCheck = await panel.webContents.executeJavaScript(
      `({switches:document.querySelectorAll('[role=switch]').length,overflow:document.documentElement.scrollHeight>innerHeight,legacyInputs:document.querySelectorAll('#proxy,#cookie').length})`,
    );
    if (out)
      fs.writeFileSync(
        path.join(out, "setup.png"),
        (await panel.webContents.capturePage()).toPNG(),
      );
    const liveSettingsChecks = [];
    async function changeSetting(id, checked) {
      await panel.webContents.executeJavaScript(`(() => {const input=document.getElementById(${JSON.stringify(id)});if(input.checked!==${checked})input.click();})()`);
      await wait();
    }
    const notificationToggleChecks = [];
    notificationToggleChecks.push(store.public().notifications === true);
    const visibleTask = presentNotification("通知开关测试", "codex"); await wait();
    notificationToggleChecks.push(Boolean(notifications.current));
    await changeSetting("notifications", false);
    notificationToggleChecks.push(!notifications.current && !notifications.pending.length && compact()
      && state.completed().some(t=>t.id===visibleTask));
    presentNotification("关闭期间不应展示", "codex"); await wait();
    notificationToggleChecks.push(!notifications.current && !notifications.pending.length);
    await panel.loadFile(path.join(__dirname,"../renderer/panel.html")); await wait();
    notificationToggleChecks.push(await panel.webContents.executeJavaScript(`!document.getElementById('notifications').checked`));
    await changeSetting("notifications", true);
    notifications.observe([...state.sessions.values()]); syncNotification();
    notificationToggleChecks.push(!notifications.current && !notifications.pending.length);
    presentNotification("重新开启后的新通知", "codex"); await wait();
    notificationToggleChecks.push(Boolean(notifications.current));
    state.sessions.clear(); notifications.clear(); syncNotification();
    await changeSetting("codex", false);
    liveSettingsChecks.push(!store.public().providers.codex && trays.size===Object.values(store.public().menuBar).filter(Boolean).length && trays.has("codex") && payload().tasks.every(t=>t.provider==="claude") && panel.isVisible());
    await changeSetting("claude", false);
    liveSettingsChecks.push(!notch.isVisible() && payload().tasks.length===0 && panel.isVisible());
    await panel.webContents.executeJavaScript(`document.getElementById('claude').click();document.getElementById('claude').click();document.getElementById('claude').click();document.getElementById('codex').click();`);
    await wait();
    liveSettingsChecks.push(store.public().providers.claude && store.public().providers.codex && trays.size===Object.values(store.public().menuBar).filter(Boolean).length);
    const usageBeforeDisplayChange = payload().usage;
    await changeSetting("menu-codex", false);
    liveSettingsChecks.push(trays.size===Object.values(store.public().menuBar).filter(Boolean).length && !trays.has("codex") && payload().tasks.length===2 && payload().usage===usageBeforeDisplayChange);
    await changeSetting("idle-quota", true);
    liveSettingsChecks.push(store.public().idleQuota && payload().usage===usageBeforeDisplayChange);
    await changeSetting("login", true);
    liveSettingsChecks.push(store.public().startAtLogin);
    // Reload proves the form is driven by persisted settings, not unsaved DOM state.
    await panel.loadFile(path.join(__dirname,"../renderer/panel.html")); await wait();
    liveSettingsChecks.push(await panel.webContents.executeJavaScript(`!document.getElementById('save') && document.getElementById('claude').checked && document.getElementById('codex').checked && !document.getElementById('menu-codex').checked && document.getElementById('idle-quota').checked && document.getElementById('login').checked`));
    await changeSetting("menu-codex", true);
    await changeSetting("idle-quota", false);
    await changeSetting("login", false);
    panel.hide();
    const gestureChecks = [];
    async function gesture(kind) {
      await notch.webContents.executeJavaScript(`document.querySelector('#notch').dispatchEvent(new MouseEvent('${kind}', {bubbles:true,cancelable:true}))`);
      await wait();
    }
    await gesture("contextmenu"); gestureChecks.push(panel.isVisible() && !payload().expanded);
    await gesture("dblclick"); gestureChecks.push(payload().expanded);
    await gesture("dblclick"); gestureChecks.push(!payload().expanded);
    await changeSetting("swap-gestures", true);
    panel.hide(); await gesture("dblclick"); gestureChecks.push(panel.isVisible() && !payload().expanded);
    await gesture("contextmenu"); gestureChecks.push(payload().expanded);
    togglePanel(); await changeSetting("swap-gestures", false); panel.hide();
    state.sessions.clear(); notifications.clear();
    state.update([{provider:"codex",id:"assistance-smoke",state:"running"}]);
    state.update([{provider:"codex",id:"assistance-smoke",state:"waiting",waitingIds:["question-one"],notification:{title:"协助通知样式确认"},waitingPrompts:{"question-one":"请选择这次通知的显示方式。"}}]);
    notifications.observe([...state.sessions.values()]); syncNotification(); await wait();
    const assistanceChecks = [notifications.current?.kind === "waiting",
      await notch.webContents.executeJavaScript(`getComputedStyle(document.querySelector("#notch .question")).visibility === "hidden" && document.querySelector("#notification-title-text").textContent === "协助通知样式确认" && document.querySelector("#notification-status").className === "question"`),
      await notch.webContents.executeJavaScript(`document.querySelector('#notification-description').textContent === '请选择这次通知的显示方式。'`)];
    if (out) fs.writeFileSync(path.join(out,"notification-waiting.png"),(await notch.webContents.capturePage()).toPNG());
    await notch.webContents.executeJavaScript(`document.querySelector('#notification-close').click()`); await wait();
    assistanceChecks.push(!notifications.current && state.sessions.get("codex:assistance-smoke").state === "waiting");
    assistanceChecks.push(await notch.webContents.executeJavaScript(`getComputedStyle(document.querySelector("#notch .question")).visibility === "visible"`));
    notifications.observe([...state.sessions.values()]); syncNotification(); assistanceChecks.push(!notifications.current);
    state.update([{provider:"codex",id:"assistance-smoke",state:"running"}]);
    state.update([{provider:"codex",id:"assistance-smoke",state:"waiting",waitingIds:["question-two"]}]);
    notifications.observe([...state.sessions.values()]); syncNotification(); await wait();
    await changeSetting("assistance-notifications", false); assistanceChecks.push(!notifications.current);
    await changeSetting("assistance-notifications", true); notifications.observe([...state.sessions.values()]); syncNotification();
    assistanceChecks.push(!notifications.current);
    state.sessions.clear(); notifications.clear(); syncNotification();
    panel.show();
    const previewChecks = await panel.webContents.executeJavaScript(`({loaded:[...document.querySelectorAll('.notification-option img')].every(img=>img.complete&&img.naturalWidth>0),scrollable:document.querySelector('main').scrollHeight>document.querySelector('main').clientHeight})`);
    if (out) {
      await panel.webContents.executeJavaScript(`document.querySelector('main').scrollTop=0`); await wait();
      fs.writeFileSync(path.join(out,"settings-top.png"),(await panel.webContents.capturePage()).toPNG());
      await panel.webContents.executeJavaScript(`document.querySelector('main').scrollTop=document.querySelector('main').scrollHeight`); await wait();
      previewChecks.updateVisible = await panel.webContents.executeJavaScript(`document.querySelector('#check-update').getBoundingClientRect().bottom <= innerHeight`);
      fs.writeFileSync(path.join(out,"settings-bottom.png"),(await panel.webContents.capturePage()).toPNG());
    }
    await panel.webContents.executeJavaScript(`document.querySelector('[data-preview="waiting"]').click()`); await wait();
    assistanceChecks.push(notifications.current?.preview === true);
    await notch.webContents.executeJavaScript(`document.querySelector('#notification-body').click()`); await wait();
    assistanceChecks.push(!notifications.current && state.sessions.size === 0);
    panel.hide();
    store.update({providers:{claude:true,codex:true,workbuddy:false}});
    syncProviders();
    const rejectedThird = await panel.webContents.executeJavaScript(`macNotch.save({providers:{workbuddy:true}})`);
    liveSettingsChecks.push(!rejectedThird.ok && !rejectedThird.settings.providers.workbuddy);
    const switches = [];
    for (const providers of [
      { claude: true, codex: false },
      { claude: false, codex: true },
      { claude: false, codex: false },
      { claude: true, codex: false, workbuddy: true },
      { claude: false, codex: true, workbuddy: true },
      { claude: false, codex: false, workbuddy: true },
      { claude: false, codex: false, workbuddy: false },
      { claude: true, codex: true, workbuddy: false },
    ]) {
      store.update({ providers });
      syncProviders();
      notch.webContents.send("state", payload());
      await wait();
      if (providers.workbuddy && out) fs.writeFileSync(path.join(out, `workbuddy-${providers.claude ? 'claude' : providers.codex ? 'codex' : 'single'}.png`), (await notch.webContents.capturePage()).toPNG());
      switches.push({
        expected: Object.values(providers).filter(Boolean).length,
        trays: trays.size,
        expectedMenus: Object.values(store.public().menuBar).filter(Boolean).length,
        tasks: payload().tasks.length,
        visible: notch.isVisible(),
      });
    }
    const menuChecks = [];
    for (const menuBar of [{claude:true,codex:true,workbuddy:true},{claude:false,codex:true,workbuddy:false},{claude:true,codex:false,workbuddy:true},{claude:false,codex:false,workbuddy:false}]) {
      store.update({menuBar}); syncProviders();
      menuChecks.push(trays.size === Object.values(menuBar).filter(Boolean).length && payload().tasks.length === 2 && notch.isVisible());
    }
    const idleData = { ...payload(), settings: {...payload().settings, idleQuota:true}, remainingQuota:{claude:98,codex:0}, tasks: PROVIDERS.map(provider=>({provider,state:'idle'})) };
    notch.webContents.send("state", idleData);
    await wait();
    const idleQuotaCheck = await notch.webContents.executeJavaScript(`[...document.querySelectorAll('.idle-quota')].map(n=>n.textContent)`);
    notch.webContents.send("state", {...idleData, remainingQuota:{claude:null,codex:59}});
    await wait();
    const updatedQuotaCheck = await notch.webContents.executeJavaScript(`[...document.querySelectorAll('.idle-quota')].map(n=>n.textContent)`);
    const quotaFitChecks = [];
    for (const values of [{claude:100,codex:100},{claude:0,codex:null}]) {
      notch.webContents.send("state", {...idleData, remainingQuota:values, quotas:{claude:{stale:true},codex:{stale:true}}});
      await wait();
      quotaFitChecks.push(await notch.webContents.executeJavaScript(`(() => {
        const root=document.querySelector("#notch"), cameraLeft=Number(root.dataset.cameraLeft), gap=Number(root.dataset.cameraGap);
        const regions=[...document.querySelectorAll('.logo,.idle-quota')].map(n=>{const r=n.getBoundingClientRect();const offset=document.querySelector("#notch").getBoundingClientRect().left;return {left:r.left-offset,right:r.right-offset};});
        return {width:root.getBoundingClientRect().width, originalSize:[...document.querySelectorAll(".logo")].every(n=>getComputedStyle(n).width==="22px") && [...document.querySelectorAll(".idle-quota")].every(n=>getComputedStyle(n).fontSize==="15px" && getComputedStyle(n).letterSpacing==="normal"), fits:regions.every(r=>r.left>=0&&r.right<=root.getBoundingClientRect().width&&(!gap||r.right<=cameraLeft||r.left>=cameraLeft+gap))};
      })()`));
    }
    const ok =
      Object.values(dashboardMotionChecks).every(Boolean) &&
      gestureChecks.every(Boolean) && assistanceChecks.every(Boolean) && previewChecks.loaded && previewChecks.scrollable && previewChecks.updateVisible !== false &&
      notificationToggleChecks.every(Boolean) &&
      foregroundChecks.every(r=>r.neverExpanded && r.hidden && r.noReplay && r.otherStillNotifies) &&
      liveSettingsChecks.every(Boolean) &&
      quotaFitChecks.every(r=>r.fits&&r.originalSize) &&
      dashboardChecks.every(r=>r.noScroll && r.fits && r.footerVisible) &&
      notificationChecks.codexSource && notificationChecks.codexClick &&
      Object.values(notificationChecks.fold).every(Boolean) &&
      (!notificationChecks.liveVisits || notificationChecks.liveVisits.every(r=>r.foreground===r.provider && r.cleared && r.notificationClosed && r.runningKept && r.waitingKept)) &&
      notificationChecks.layout.visible && notificationChecks.layout.belowCamera && notificationChecks.layout.bottomFlush &&
      notificationChecks.layout.contentHeight === 82 && notificationChecks.layout.gap === "3px" && JSON.stringify(notificationChecks.layout.fonts) === JSON.stringify(["12px","15px","13px"]) &&
      notificationChecks.layout.trackHeight === 2 && notificationChecks.layout.source === "Claude" &&
      notificationChecks.layout.title === "通知交互方案已生成" && notificationChecks.layout.buttons === 2 && !notificationChecks.layout.overflow &&
      notificationChecks.hoverPaused && notificationChecks.closeKeepsUnread && notificationChecks.timeoutKeepsUnread &&
      notificationChecks.bodyOpens && notificationChecks.longText && notificationChecks.dashboardDefers &&
      menuChecks.every(Boolean) &&
      JSON.stringify(idleQuotaCheck) === JSON.stringify(["98%","0%"]) &&
      JSON.stringify(updatedQuotaCheck) === JSON.stringify(["—","59%"]) &&
      periodChecks.noSettings && periodChecks.noRefresh &&
      periodChecks.out.every(r => r.pressed === 'true' && r.bars > 0) &&
      results.every(r => r.sizing.icons.every(i => i.width === '22px' && i.padding === '0px') && r.sizing.fonts.every(f => f === '15px')) &&
      bounds.y === geometry.y &&
      panelCheck.quotaCards === 2 &&
      panelCheck.bars === 24 &&
      !panelCheck.overflow &&
      panelCheck.contentTop >= panelCheck.headerBottom &&
      setupCheck.switches === 10 &&
      !setupCheck.overflow &&
      !setupCheck.legacyInputs &&
      switches.every(
        (r) =>
          r.expectedMenus === r.trays &&
          r.tasks === r.expected &&
          r.visible === r.expected > 0,
      ) &&
      results.every(
        (r) =>
          !r.overflow &&
          r.width === r.geometry.width &&
          r.height === geometry.height &&
          r.dots === r.expectedDots &&
          JSON.stringify(r.progress) === JSON.stringify(r.expectedProgress) &&
          r.question === r.states.filter((s) => s === "waiting").length &&
          r.check === r.states.filter((s) => s === "ended").length &&
          (!geometry.hardware ||
            r.regions.every(
              (region) =>
                region.right <= r.geometry.cameraLeft + 1 ||
                region.left >= r.geometry.cameraLeft + r.geometry.gap - 1,
            )),
      );
    console.log(
      "SMOKE",
      JSON.stringify({
        ok, dashboardMotionChecks, gestureChecks, assistanceChecks, previewChecks,
        bounds,
        geometry,
        panelCheck,
        periodChecks,
        dashboardChecks,
        notificationChecks,
        notificationToggleChecks,
        foregroundChecks,
        setupCheck,
        liveSettingsChecks,
        menuChecks, idleQuotaCheck, updatedQuotaCheck, quotaFitChecks,
        switches,
        results,
      }),
    );
    app.exit(ok ? 0 : 1);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
};

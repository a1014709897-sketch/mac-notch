"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const { PROVIDERS } = require("./state");
const wait = () => new Promise((r) => setTimeout(r, 400));
module.exports = async function smoke({
  notch,
  panel,
  trays,
  geometry,
  payload,
  togglePanel,
  store,
  syncProviders,
  app,
}) {
  try {
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
        `({count:document.querySelectorAll('button.tool').length,width:innerWidth,height:innerHeight,overflow:document.body.scrollWidth>innerWidth,progress:[...document.querySelectorAll('.progress')].map(n=>n.textContent),dots:document.querySelectorAll('.dots i').length,question:document.querySelectorAll('.question').length,check:document.querySelectorAll('.check').length,regions:[...document.querySelectorAll('.logo,.status,.progress')].filter(n=>getComputedStyle(n).display!=='none').map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};})})`,
      );
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

    const bounds = notch.getBounds();
    togglePanel();
    await wait();
    const panelCheck = await notch.webContents.executeJavaScript(
      `({quotaCards:document.querySelectorAll('#quotas article').length,bars:document.querySelectorAll('#chart button').length,width:innerWidth,height:innerHeight,overflow:document.body.scrollWidth>innerWidth,headerBottom:document.querySelector('#notch').getBoundingClientRect().bottom,contentTop:document.querySelector('#dashboard').getBoundingClientRect().top})`,
    );
    const out = process.env.MAC_NOTCH_SMOKE_OUTPUT;
    if (out)
      fs.writeFileSync(
        path.join(out, "dashboard.png"),
        (await notch.webContents.capturePage()).toPNG(),
      );
    togglePanel();
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
    panel.hide();
    const switches = [];
    for (const providers of [
      { claude: true, codex: false },
      { claude: false, codex: true },
      { claude: false, codex: false },
      { claude: true, codex: true },
    ]) {
      store.update({ providers });
      syncProviders();
      notch.webContents.send("state", payload());
      await wait();
      switches.push({
        expected: Object.values(providers).filter(Boolean).length,
        trays: trays.size,
        tasks: payload().tasks.length,
        visible: notch.isVisible(),
      });
    }
    const ok =
      bounds.y === geometry.y &&
      bounds.width === geometry.width &&
      panelCheck.quotaCards === 2 &&
      panelCheck.bars === 7 &&
      !panelCheck.overflow &&
      panelCheck.contentTop >= panelCheck.headerBottom &&
      setupCheck.switches === 2 &&
      !setupCheck.overflow &&
      !setupCheck.legacyInputs &&
      switches.every(
        (r) =>
          r.expected === r.trays &&
          r.tasks === r.expected &&
          r.visible === r.expected > 0,
      ) &&
      results.every(
        (r) =>
          !r.overflow &&
          r.width === geometry.width &&
          r.height === geometry.height &&
          r.dots === r.expectedDots &&
          JSON.stringify(r.progress) === JSON.stringify(r.expectedProgress) &&
          r.question === r.states.filter((s) => s === "waiting").length &&
          r.check === r.states.filter((s) => s === "ended").length &&
          (!geometry.hardware ||
            r.regions.every(
              (region) =>
                region.right <= (geometry.width - geometry.gap) / 2 + 1 ||
                region.left >= (geometry.width + geometry.gap) / 2 - 1,
            )),
      );
    console.log(
      "SMOKE",
      JSON.stringify({
        ok,
        bounds,
        geometry,
        panelCheck,
        setupCheck,
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

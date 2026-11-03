"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function element() {
  return {textContent:"",children:[],attributes:{},style:{setProperty(){}},classList:{toggle(){},add(){}},
    append(...items){this.children.push(...items);},prepend(...items){this.children.unshift(...items);},
    replaceChildren(...items){this.children=items;},setAttribute(key,value){this.attributes[key]=value;}};
}
function harness() {
  const nodes = new Map(), buttons = ["day","week","month"].map(period=>({...element(),dataset:{period}}));
  const get = id => {if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  let render;
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/renderer/dashboard.js"),"utf8"), {
    document:{getElementById:get,createElement:element,querySelectorAll:()=>buttons},
    macNotch:{get:()=>({then(){}}),onState:fn=>{render=fn;},collapse(){}},
  });
  return {get,buttons,render:data=>render(data)};
}
function fixture(period, dates) {
  const bins=dates.map((date,i)=>({date,tokens:(i+1)*10,cost:0,unpricedTokens:0,claude:(i+1)*10,codex:0}));
  const total={date:null,tokens:bins.reduce((sum,b)=>sum+b.tokens,0),cost:0,unpricedTokens:0,claude:0,codex:0};
  return {expanded:true,settings:{providers:{claude:false,codex:false}},quotas:{},usage:{days:bins,today:bins.at(-1),updatedAt:0,periods:{[period]:{bins,total}}}};
}
for(const [period,oldDates,newDates,label] of [
  ["week",["2026-11-01"],["2026-11-02","2026-11-03"],"本周"],
  ["month",["2026-10-30","2026-10-31"],["2026-11-01"],"本月"],
]) test(`${period} rollover clears an expired selection and labels the new total`,()=>{
  const h=harness(),before=fixture(period,oldDates);
  h.render(before);h.buttons.find(b=>b.dataset.period===period).onclick();
  h.get("chart").children[0].onclick();
  assert.equal(h.get("day-label").textContent,oldDates[0]+" Token");
  h.render(before);
  assert.equal(h.get("day-label").textContent,oldDates[0]+" Token");
  const after=fixture(period,newDates);h.render(after);
  assert.equal(h.get("day-label").textContent,label+" Token");
  assert.equal(h.get("tokens").textContent,String(after.usage.periods[period].total.tokens));
  assert.ok(h.get("chart").children.every(b=>b.attributes["aria-pressed"]==="false"));
});

test("closing dashboard preserves its content while fresh usage arrives",()=>{
  const h=harness(), initial=fixture("day",["2026-11-03"]);
  h.render(initial); const bars=h.get("chart").children;
  const next=fixture("day",["2026-11-03","2026-11-04"]);
  h.render({...next,expanded:false});
  assert.equal(h.get("chart").children,bars);
  h.render(next);
  assert.equal(h.get("chart").children.length,2);
});

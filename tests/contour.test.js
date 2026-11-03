'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm');
test('compact contour never inherits a stale expanded viewport width',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/notch.js'),'utf8');
 const fn=source.slice(source.indexOf('function updateContour()'),source.indexOf('window.addEventListener("resize"'));
 let shape,rect={left:159,width:363,height:32};
 const ctx={window:{innerWidth:680},root:{getBoundingClientRect:()=>rect},notchOutline:(...args)=>{shape=args;return '';},document:{querySelector:()=>({style:{setProperty(){}}})}};
 vm.createContext(ctx);vm.runInContext(fn+'updateContour()',ctx);assert.deepEqual(shape,[159,363,32,true]);
 rect={left:0,width:363,height:32};vm.runInContext('updateContour()',ctx);assert.deepEqual(shape,[0,363,32,true]);
});
test('fold completion retains the native canvas and passes clicks outside the visible header',()=>{
 const {compactHostBounds,containsPoint}=require('../src/main/layout');
 const host={x:524,y:0,width:680,height:432},bar={x:683,y:0,width:363,height:32};
 assert.deepEqual(compactHostBounds(host,bar),host);
 assert.deepEqual(compactHostBounds(host,{...bar,width:300}),host);
 assert.equal(containsPoint(bar,{x:550,y:15}),false);
 assert.equal(containsPoint(bar,{x:700,y:100}),false);
 assert.equal(containsPoint(bar,{x:700,y:15}),true);
 assert.deepEqual(compactHostBounds(host,{...bar,y:1117}),{...bar,y:1117});
 assert.equal(compactHostBounds(host,{...bar,x:500,width:800}).width,800);
});

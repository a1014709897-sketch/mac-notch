'use strict';
// Preserve artwork proportions; normalize painted bounds to the approved optical sizes.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});await win.loadURL('about:blank');
 for(const provider of ['claude','codex','workbuddy']){
  const svg=fs.readFileSync(path.join(__dirname,'../assets',provider+'.svg'),'utf8').replace(/width="1em"/,'width="96"').replace(/height="1em"/,'height="96"');
  const result=await win.webContents.executeJavaScript(`new Promise(resolve=>{
   const image=new Image();image.onload=()=>{
    const src=document.createElement('canvas');src.width=src.height=192;const c=src.getContext('2d');c.drawImage(image,0,0,192,192);
    const pixels=c.getImageData(0,0,192,192).data;let l=192,t=192,r=0,b=0;
    for(let y=0;y<192;y++)for(let x=0;x<192;x++)if(pixels[(y*192+x)*4+3]>0){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
    const out=document.createElement('canvas');out.width=out.height=96;const width=96*${provider==='claude'?.92:.78},height=width*(b-t+1)/(r-l+1);
    out.getContext('2d').drawImage(src,l,t,r-l+1,b-t+1,(96-width)/2,(96-height)/2,width,height);
    resolve({png:out.toDataURL('image/png').split(',')[1],width:width/96*20,height:height/96*20});
   };image.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'))};
  })`);
  fs.writeFileSync(path.join(__dirname,'../assets',provider+'-tray.png'),Buffer.from(result.png,'base64'));
  console.log(provider,JSON.stringify({width:result.width,height:result.height}));
 }
 app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});

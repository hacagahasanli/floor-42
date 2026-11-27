import { createRequire } from 'node:module';
const require = createRequire('/Users/hacaghahasanli/Desktop/projects/games-studio/playable-floor42/package.json');
const { chromium } = require('playwright-core');
const OUT = '/Users/hacaghahasanli/Desktop/projects/games-studio/floor-42/docs/collab/shots/offsite-r2';
const b = await chromium.launch({executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
for (const [w,h,dsf,name] of [[1280,720,3,'tumbleweed-closeup-1280-3x'],[1920,1080,1,'tumbleweed-1920-1x']]) {
  const ctx = await b.newContext({viewport:{width:w,height:h}, deviceScaleFactor:dsf});
  const p = await ctx.newPage();
  await p.goto('http://localhost:3411/#/arena?p1=hotfix&p2=legacy&bot=hard&arena=offsite');
  await p.waitForFunction(()=>window.__mc&&window.__mc.state);
  await p.waitForTimeout(3500);
  await p.evaluate(()=>window.__mc.arena.finale(0));
  let box=null;
  for (let i=0;i<200 && !box;i++){
    await p.waitForTimeout(40);
    box = await p.evaluate(()=>{const mc=window.__mc;const t=mc.scene.getObjectByName('ambient:tumbleweed'); if(!t||!t.visible||t.scale.x<0.99) return null; const v=t.position.clone().project(mc.camera); const W=innerWidth,H=innerHeight; const x=(v.x+1)/2*W,y=(1-v.y)/2*H; if(x<120||x>W-120) return null; return {x,y};});
  }
  console.log(name, box);
  if (box) { const r=(w/1280)*90; await p.screenshot({path:`${OUT}/${name}.png`, clip:{x:Math.max(0,box.x-r*1.2),y:Math.max(0,box.y-r*1.2),width:r*2.4,height:r*2.4}}); await p.screenshot({path:`${OUT}/${name}-context.png`}); }
  await ctx.close();
}
await b.close();

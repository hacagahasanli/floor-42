import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await p.goto('http://localhost:3215/games/floor-42/index.html#/');
await p.waitForSelector('nav[aria-label="Main menu"]');
await p.waitForTimeout(1500);
console.log('portal menu:', JSON.stringify(await p.$$eval('nav[aria-label="Main menu"] [data-nav]', (els) => els.map((e) => e.textContent.trim().slice(0, 12)))));
await p.keyboard.press('ArrowDown');
await p.keyboard.press('Enter');
await p.waitForSelector('[data-testid="select-2p"]');
await p.keyboard.press('KeyG'); // cycle 5 -> 7
await p.keyboard.press('KeyL'); // 7 -> 3
console.log('length chip:', await p.textContent('[data-testid="length-chip"]'));
await p.keyboard.press('KeyF');
await p.keyboard.press('Semicolon');
await p.waitForSelector('[data-testid="key-card"]', { timeout: 30000 });
console.log('url:', p.url());
await p.waitForTimeout(800);
await p.keyboard.press('KeyF');
await p.keyboard.press('Semicolon');
await p.waitForSelector('[data-testid="key-card"]', { state: 'detached' });
await p.waitForTimeout(5000);
console.log('hud says:', await p.locator('text=/FIRST TO \\d/').first().textContent());
await p.screenshot({ path: '/Users/hacaghahasanli/Desktop/projects/games-studio/floor-42/docs/collab/shots/local-2p/portal-d1280x720-match.png' });
await b.close();

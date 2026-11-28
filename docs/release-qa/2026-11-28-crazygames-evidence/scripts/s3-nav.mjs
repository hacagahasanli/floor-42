// S3: keyboard-only start, gamepad-only start + pause, 2P local match to result, muteAudio, 1 hour-ish not.
import { launch, open, sdk, shot, save, fightUntilResult } from './lib.mjs';
const browser = await launch();
const res = {};
const nav = (f) => f.evaluate(() => ({ el: document.activeElement?.getAttribute('data-testid') || document.activeElement?.textContent?.trim().slice(0, 30), tag: document.activeElement?.tagName }));

// A. Keyboard only: in the iframe, click once on empty area to focus (as a CG player would), then keys only.
{
  const { ctx, page, frame, log } = await open(browser, { w: 1280, h: 720 });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]');
  await page.waitForTimeout(1200);
  await page.mouse.click(700, 400); // empty canvas area in the frame
  const steps = [];
  steps.push(['start', await nav(f)]);
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(250);
    steps.push([k, await nav(f)]);
  }
  await shot(page, 's3-kbd-home-focus');
  await page.keyboard.press('Enter');
  try {
    await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 15000 });
    steps.push(['gameplayStart via Enter', true]);
  } catch { steps.push(['gameplayStart via Enter', false]); await shot(page, 's3-kbd-after-enter'); }
  // keyboard-only: Esc pause, ArrowDown to settings, Enter, Esc, Esc
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  steps.push(['pause ArrowDown', await nav(f)]);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  await shot(page, 's3-kbd-settings');
  // Tab switching in settings with ] key
  await page.keyboard.press('BracketRight');
  await page.waitForTimeout(400);
  await shot(page, 's3-kbd-settings-tab2');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  steps.push(['after settings Esc', await nav(f)]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  res.keyboard = { steps, sdk: await sdk(f), errors: log.pageerrors.map((e) => e.msg) };
  await ctx.close();
}

// B. Gamepad only (fake standard pad), top level so no click is needed... but a click is needed for focus: none done.
{
  const { ctx, page, frame, log } = await open(browser, { w: 1280, h: 720, mode: 'top' });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]');
  await f.evaluate(() => window.__padOn());
  await page.waitForTimeout(1200);
  const tap = async (i) => { await f.evaluate((i) => window.__padSet(i, true), i); await page.waitForTimeout(120); await f.evaluate((i) => window.__padSet(i, false), i); await page.waitForTimeout(300); };
  const steps = [['start', await nav(f)]];
  await tap(13); steps.push(['dpad down', await nav(f)]);
  await tap(12); steps.push(['dpad up', await nav(f)]);
  await shot(page, 's3-pad-home');
  await tap(0);
  try {
    await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 15000 });
    steps.push(['gameplayStart via A', true]);
  } catch { steps.push(['gameplayStart via A', false]); }
  await page.waitForTimeout(1500);
  // move right with the stick + shoot (RT=7 or X? standard: 2 = X). Then Start (9) to pause.
  await f.evaluate(() => window.__padAxes(1, 0));
  await page.waitForTimeout(800);
  await f.evaluate(() => window.__padAxes(0, 0));
  await tap(9);
  await page.waitForTimeout(600);
  await shot(page, 's3-pad-pause');
  steps.push(['after Start', await f.evaluate(() => document.body.innerText.includes('PAUSED'))]);
  await tap(1); // B = resume?
  await page.waitForTimeout(600);
  steps.push(['after B', await f.evaluate(() => document.body.innerText.includes('PAUSED'))]);
  res.pad = { steps, sdk: await sdk(f), errors: log.pageerrors.map((e) => e.msg) };
  await ctx.close();
}

// C. 2P local: home -> 2 PLAYER -> whatever the select needs -> fight; play with both keyboards to the result.
{
  const { ctx, page, frame, log } = await open(browser, { w: 1280, h: 720 });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]');
  await page.waitForTimeout(1000);
  await f.click('[data-testid="open-2p"]', { force: true });
  await page.waitForTimeout(1200);
  await shot(page, 's3-2p-01-select');
  res.twoPText = (await f.evaluate(() => document.body.innerText)).slice(0, 600);
  // Ready both: try the obvious keys and the fight button
  const steps = [];
  for (let i = 0; i < 6; i++) {
    if ((await sdk(f)).some((x) => x[0] === 'gameplayStart')) break;
    const fightBtn = f.locator('[data-testid="fight"]');
    if (await fightBtn.count()) { await fightBtn.first().click({ force: true }); steps.push('fight click'); }
    else { await page.keyboard.press('Enter'); steps.push('Enter'); }
    await page.waitForTimeout(1500);
    await shot(page, `s3-2p-02-step${i}`);
  }
  await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 20000 }).catch(() => steps.push('NO gameplayStart'));
  await page.waitForTimeout(1500);
  await shot(page, 's3-2p-03-fight');
  // P1 WASD+Space-ish, P2 arrows: alternate both players, P1 shoots, P2 idles. Use the 2P keys from the strip.
  res.twoPHud = (await f.evaluate(() => document.body.innerText)).slice(0, 500);
  const t = await fightUntilResult(page, f, { timeoutMs: 200000 });
  await page.waitForTimeout(3500);
  await shot(page, 's3-2p-04-result');
  res.twoP = { steps, matchMs: t, sdk: await sdk(f), errors: log.pageerrors.map((e) => e.msg), resultText: (await f.evaluate(() => document.body.innerText)).slice(0, 400) };
  await ctx.close();
}

// D. muteAudio=true from the portal: does the game create/run audio? Then flip to false.
{
  const { ctx, page, frame, log } = await open(browser, { w: 1280, h: 720, muted: true });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]');
  await f.click('[data-testid="play"]', { force: true });
  await page.waitForTimeout(5000);
  const probe = () => f.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('floor42:settings') || '{}');
    const ctxs = (window.__ctxs || []).map((c) => c.state);
    return { stored: { muted: s.muted, volume: s.volume }, ctxs, audioLog: window.__audio.slice(-5) };
  });
  const a = await probe();
  await f.evaluate(() => window.__cgSetMute(false));
  await page.waitForTimeout(500);
  const b = await probe();
  res.mute = { mutedStart: a, afterUnmute: b, muteIcon: await f.evaluate(() => document.body.innerText.slice(0, 50)) };
  await ctx.close();
}
save('s3', res);
console.log(JSON.stringify(res, null, 1).slice(0, 8000));
await browser.close();

// Shared layout check for the colour-balance captures (impl2/ on portal-build, impl-pewfield/ on rename-pewfield), so both
// branches run the same rules, including the F-060 lock-up whitelist. Every function runs in the page (page.evaluate), so each
// one is self-contained. `check` = the traits-menus check, `checkResult` = the fieldday-p2b result check, `checkScoped` = the
// fieldday-p2a in-match / modal check (all copied from impl/capture.mjs, unchanged except the whitelist).
// Entries that start with OK- are notes, not issues: use `issuesOf(list)` to count.
export const issuesOf = (list) => list.filter((x) => !x.startsWith('OK-'));
export const notesOf = (list) => list.filter((x) => x.startsWith('OK-'));

export const check = () => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const s = parseFloat(getComputedStyle(document.querySelector('.fd')).getPropertyValue('--s')) || 1;
  const safe = 12 * s;
  const name = (e) => `${e.getAttribute('data-testid') || e.className.toString().slice(0, 24)} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
  const UI = [...document.querySelectorAll('.fd-btn,.fd-card,.fd-panel,.fd-pill,.fd-hints,.fd-ribbon,.fd-bubble,.fd-chip,h2,[data-testid="wordmark"]')];
  for (const e of UI) {
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    const ring = e === document.activeElement ? 12 * s : 0;
    if (r.left - ring < safe - 1 || r.top - ring < safe - 1 || r.right + ring > W - safe + 1 || r.bottom + ring > H - safe + 1) {
      if (e.closest('.fd-card') && e.closest('.fd-card') !== e) continue;
      out.push('SAFE-AREA ' + name(e) + ` [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  }
  for (const e of document.querySelectorAll('.fd-btn,.fd-chip,.fd-kc,.fd-pill,.fd-hints,.fd-ribbon')) {
    const b = e.getBoundingClientRect(), bw = (parseFloat(getComputedStyle(e).borderLeftWidth) || 0) * s;
    const rects = [];
    const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); rects.push(r.getBoundingClientRect()); }
    for (const k of e.querySelectorAll('svg:not(.fd-tail):not(.fd-ptr)')) { if (k.closest('.fd-ptr')) continue; rects.push(k.getBoundingClientRect()); }
    if (!rects.length) continue;
    const L = Math.min(...rects.map((r) => r.left)) - b.left - bw, R = b.right - bw - Math.max(...rects.map((r) => r.right));
    if (L < -0.5 || R < -0.5) out.push('OVERFLOW ' + name(e));
    const min = e.classList.contains('fd-btn') && !e.classList.contains('fd-icon') ? 12 * s : 0;
    if (min && (L < min - 1 || R < min - 1)) out.push(`TIGHT ${name(e)} ${Math.round(L / s)}/${Math.round(R / s)}px`);
  }
  for (const stage of document.querySelectorAll('.fd-stage')) {
    const tw = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n); const t = r.getBoundingClientRect();
      for (let a = n.parentElement; a && !a.classList.contains('fd-stage'); a = a.parentElement) {
        if (getComputedStyle(a).overflow === 'hidden' && !a.classList.contains('fd-confetti')) {
          const b = a.getBoundingClientRect();
          if (t.left < b.left - 1 || t.right > b.right + 1 || t.top < b.top - 1 || t.bottom > b.bottom + 1) out.push('CLIPPED "' + n.textContent.trim().slice(0, 24) + '" by ' + name(a));
        }
      }
    }
  }
  const boxes = UI.filter((e) => e.getBoundingClientRect().width);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.contains(b) || b.contains(a)) continue;
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (!(ox > 3 * s && oy > 3 * s)) continue;
    // F-060 (colour-balance.md 8.4): the home wordmark slot x arena ribbon lock-up is intended, but only this pair, only on
    // home, and only while their boxes overlap vertically by <= 20 design px. Anything else (or this pair above 20) counts.
    const ids = [a.getAttribute('data-testid'), b.getAttribute('data-testid')].sort().join('|');
    if (ids === 'arena-ribbon|wordmark' && a.closest('[data-testid="home"]') && b.closest('[data-testid="home"]') && oy / s <= 20) {
      out.push(`OK-LOCKUP wordmark x arena-ribbon, vertical overlap ${(oy / s).toFixed(1)} design px (<= 20)`);
      continue;
    }
    out.push('OVERLAP ' + name(a) + ' x ' + name(b));
  }
  return out;
};

export const checkResult = () => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const s = parseFloat(getComputedStyle(document.querySelector('[data-testid="result-screen"] .fd')).getPropertyValue('--s')) || 1;
  const safe = 12 * s;
  const name = (e) => `${e.getAttribute('data-testid') || e.className.toString().slice(0, 24)} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
  const UI = [...document.querySelectorAll('[data-testid="result-screen"] :is(.fd-btn,.fd-card,.fd-panel,.fd-pill,.fd-hints,.fd-ribbon,.fd-chip,h2,.fd-res-pod)')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]') && !e.closest('.fd-sr'));
  // 1 safe area (a focused element counts with its 12 px ring)
  for (const e of UI) {
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    if (e.classList.contains('fd-res-pod')) continue; // podiums stand in the track and run to the screen bottom on purpose
    const ring = e === document.activeElement ? 12 * s : 0;
    if (r.left - ring < safe - 1 || r.top - ring < safe - 1 || r.right + ring > W - safe + 1 || r.bottom + ring > H - safe + 1) {
      if (e.closest('.fd-card') && e.closest('.fd-card') !== e) continue;
      out.push('SAFE-AREA ' + name(e) + ` [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  }
  // 2 text and icons inside their control, with clear space in buttons
  for (const e of document.querySelectorAll('[data-testid="result-screen"] :is(.fd-btn,.fd-chip,.fd-kc,.fd-pill,.fd-hints,.fd-ribbon)')) {
    const b = e.getBoundingClientRect(), bw = (parseFloat(getComputedStyle(e).borderLeftWidth) || 0) * s;
    if (!b.width) continue;
    const rects = [];
    const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); rects.push(r.getBoundingClientRect()); }
    for (const k of e.querySelectorAll('svg:not(.fd-tail):not(.fd-ptr)')) { if (k.closest('.fd-ptr')) continue; rects.push(k.getBoundingClientRect()); }
    if (!rects.length) continue;
    const L = Math.min(...rects.map((r) => r.left)) - b.left - bw, R = b.right - bw - Math.max(...rects.map((r) => r.right));
    if (L < -0.5 || R < -0.5) out.push('OVERFLOW ' + name(e));
    const min = e.classList.contains('fd-btn') && !e.classList.contains('fd-icon') ? 12 * s : 0;
    if (min && (L < min - 1 || R < min - 1)) out.push(`TIGHT ${name(e)} ${Math.round(L / s)}/${Math.round(R / s)}px`);
  }
  // 3 text clipped by an overflow:hidden ancestor
  const tw = document.createTreeWalker(document.querySelector('[data-testid="result-screen"] .fd-stage'), NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    if (!n.textContent.trim()) continue;
    const r = document.createRange(); r.selectNodeContents(n); const t = r.getBoundingClientRect();
    for (let a = n.parentElement; a && !a.classList.contains('fd-stage'); a = a.parentElement) {
      if (getComputedStyle(a).overflow === 'hidden' && !a.classList.contains('fd-confetti') && !a.classList.contains('fd-sr') && getComputedStyle(a).visibility !== 'hidden') {
        const b = a.getBoundingClientRect();
        if (t.width && (t.left < b.left - 1 || t.right > b.right + 1 || t.top < b.top - 1 || t.bottom > b.bottom + 1)) out.push('CLIPPED "' + n.textContent.trim().slice(0, 24) + '" by ' + name(a));
      }
    }
  }
  // 4 partial overlap between unrelated UI boxes (full containment is intended: buttons on a panel, chips on a card)
  const boxes = UI.filter((e) => e.getBoundingClientRect().width && !e.classList.contains('fd-res-pod'));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.contains(b) || b.contains(a)) continue;
    if (a.closest('.fd-res-stats') || b.closest('.fd-res-stats')) continue; // the held stats card is an overlay on purpose
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (ox > 3 * s && oy > 3 * s) out.push('OVERLAP ' + name(a) + ' x ' + name(b));
  }
  return out;
};

export const checkScoped = (scope) => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const root = document.querySelector(scope);
  if (!root) return ['NO-ROOT ' + scope];
  const fd = root.matches('.fd') ? root : root.querySelector('.fd') || root.closest('.fd');
  const s = parseFloat(getComputedStyle(fd).getPropertyValue('--s')) || 1;
  const safe = 12 * s;
  const name = (e) => `${e.getAttribute('data-testid') || e.className.toString().slice(0, 24)} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
  const UI = [...root.querySelectorAll('.fd-btn,.fd-card,.fd-panel,.fd-pill,.fd-hints,.fd-ribbon,.fd-chip,.fd-setcard,.fd-well,.fd-timer,.fd-tile,.fd-kfeed,.fd-segbar,h2')];
  // 1 safe area (a focused element counts with its 12 px ring); the VS doors are full-bleed by design
  if (!root.matches('[data-testid="vs-stage"]')) for (const e of UI) {
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    const ring = e === document.activeElement ? 12 * s : 0;
    if (r.left - ring < safe - 1 || r.top - ring < safe - 1 || r.right + ring > W - safe + 1 || r.bottom + ring > H - safe + 1) {
      if (e.closest('.fd-card') && e.closest('.fd-card') !== e) continue;
      if (e.closest('.fd-ribbon') && e.closest('.fd-ribbon') !== e) continue;
      out.push('SAFE-AREA ' + name(e) + ` [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  }
  // 2 text and icons inside their control, with clear space in buttons
  for (const e of root.querySelectorAll('.fd-btn,.fd-chip,.fd-kc,.fd-pill,.fd-hints,.fd-ribbon,.fd-kfeed')) {
    const b = e.getBoundingClientRect(), bw = (parseFloat(getComputedStyle(e).borderLeftWidth) || 0) * s;
    if (!b.width) continue;
    const rects = [];
    const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); rects.push(r.getBoundingClientRect()); }
    for (const k of e.querySelectorAll('svg:not(.fd-tail):not(.fd-ptr)')) { if (k.closest('.fd-ptr')) continue; rects.push(k.getBoundingClientRect()); }
    if (!rects.length) continue;
    const L = Math.min(...rects.map((r) => r.left)) - b.left - bw, R = b.right - bw - Math.max(...rects.map((r) => r.right));
    if (L < -0.5 || R < -0.5) out.push('OVERFLOW ' + name(e));
    const min = e.classList.contains('fd-btn') && !e.classList.contains('fd-icon') ? 12 * s : 0;
    if (min && (L < min - 1 || R < min - 1)) out.push(`TIGHT ${name(e)} ${Math.round(L / s)}/${Math.round(R / s)}px`);
  }
  // 3 text clipped by an overflow:hidden ancestor
  const stage = root.querySelector('.fd-stage') || root.closest('.fd-stage');
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    if (!n.textContent.trim()) continue;
    const r = document.createRange(); r.selectNodeContents(n); const t = r.getBoundingClientRect();
    if (!t.width) continue;
    for (let a = n.parentElement; a && a !== stage; a = a.parentElement) {
      const o = getComputedStyle(a).overflow;
      if ((o === 'hidden' || o === 'clip') && !a.classList.contains('fd-confetti') && !a.classList.contains('fd-viewport')) {
        const b = a.getBoundingClientRect();
        if (t.left < b.left - 1 || t.right > b.right + 1 || t.top < b.top - 1 || t.bottom > b.bottom + 1) out.push('CLIPPED "' + n.textContent.trim().slice(0, 24) + '" by ' + name(a));
      }
    }
  }
  // 4 partial overlap between unrelated UI boxes (full containment is intended: buttons on a panel, chips on a card)
  const boxes = UI.filter((e) => e.getBoundingClientRect().width && getComputedStyle(e).opacity !== '0' && getComputedStyle(e).visibility !== 'hidden');
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.contains(b) || b.contains(a)) continue;
    // intended: the ribbon over the panel edge, tiles under the timer disc, the score chip under the disc, KO tag on the portrait
    if (a.closest('.fd-ribbon') || b.closest('.fd-ribbon')) continue;
    if (a.matches('.fd-timer,.fd-tile') && b.matches('.fd-timer,.fd-tile')) continue;
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    const inside = (X, Y) => X.left >= Y.left - 2 && X.right <= Y.right + 2 && X.top >= Y.top - 2 && X.bottom <= Y.bottom + 2;
    if (inside(A, B) || inside(B, A)) continue; // full containment (a button on a panel, a card in a well) is intended
    if (ox > 3 * s && oy > 3 * s) out.push('OVERLAP ' + name(a) + ' x ' + name(b));
  }
  // 5 focus: something inside the screen has focus, and the double ring is drawn (data-kbd = 1) on a keyboard-reachable control
  if (root.matches('[data-testid="settings-panel"],[data-testid="pause-menu"],[data-testid="howto"],[data-testid="credits"]')) {
    const f = document.activeElement;
    if (!f || !root.contains(f)) out.push('FOCUS not inside the screen');
  }
  return out;
};

// Criterion 2: count sun-tone buttons that are visible.
export const suns = () => [...document.querySelectorAll('.fd-btn.fd-t-sun')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20));

// R-028: every visible sun mark on screen, not only sun buttons. A "mark" is an element whose own background is sun #ffc83d
// (a button, tab, segment, toggle, slider fill, chip, keycap), outermost only. Decor is left out (bunting, sunburst rays,
// confetti, the wordmark, the podium track). Sun text and sun fills inside SVG icons are listed separately for the record.
export const sunMarks = () => {
  const SUN = 'rgb(255, 200, 61)';
  const DECOR = '.fd-bunting, .fd-rays, .fd-confetti, [data-testid="wordmark"], canvas, .fd-res-pod';
  const name = (e) => `${e.getAttribute('data-testid') || (e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className.toString()).slice(0, 24) || e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 20)}"`;
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    for (let a = e; a && a.nodeType === 1; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
      if (a.closest('[aria-hidden="true"][data-testid^="strip-"]') && cs.opacity === '0') return false;
    }
    return true;
  };
  const fills = [], text = [], icons = new Set();
  for (const e of document.querySelectorAll('.fd *')) {
    if (e.closest(DECOR)) continue;
    const cs = getComputedStyle(e);
    if (cs.backgroundColor === SUN && visible(e) && !fills.some((f) => f.contains(e))) fills.push(e);
    if (e instanceof SVGElement && (cs.fill === SUN || cs.stroke === SUN) && visible(e)) icons.add(e.closest('svg'));
    if (!(e instanceof SVGElement) && cs.color === SUN && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && visible(e)) text.push(e);
  }
  return { count: fills.length, fills: fills.map(name), text: text.map(name), icons: [...icons].map((s) => name(s.parentElement || s)) };
};

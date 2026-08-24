// End-to-end drive: attach to the running app over CDP, capture all console
// noise + uncaught exceptions, probe the backend health endpoints from inside
// the page, click through every main tab, and screenshot each view.
import { writeFileSync } from 'node:fs';

const PORT = 9223;
const OUT_DIR = new URL('./', import.meta.url).pathname.replace(/^\//, '');

const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise(res => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const consoleMsgs = [];
const exceptions = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const type = m.params.type; // log, warning, error, ...
    const text = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    if (type === 'error' || type === 'warning') consoleMsgs.push(`[${type}] ${text.slice(0, 300)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    exceptions.push(String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 400));
  }
};
await new Promise(r => { ws.onopen = r; });
await send('Runtime.enable');
await send('Page.enable');

const evalJs = async expression =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))?.result?.value
  ?? '(evaluate failed: ' + JSON.stringify(
    (await send('Runtime.evaluate', { expression: '1', returnByValue: true })).exceptionDetails ?? ''
  ).slice(0, 200) + ')';

const shot = async name => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL(`./${name}.png`, import.meta.url), Buffer.from(data, 'base64'));
};

const report = {};

// ── 0. Resume the session if the welcome gate is showing ────────────────────
report.resume = await evalJs(`
  (() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Resume');
    if (b) { b.click(); return 'clicked Resume'; }
    return 'gate not present — already in session';
  })()
`);
// Wait for the contact sheet to populate.
report.gridWait = 'timeout';
for (let i = 0; i < 45; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const n = await evalJs(`document.querySelectorAll('.grid img').length`);
  if (Number(n) > 0) { report.gridWait = n + ' grid images after ' + (i + 1) + 's'; break; }
}

// ── 1. In-page backend probes ────────────────────────────────────────────────
report.health = {};
for (const ep of ['/api/system/ram', '/api/config', '/api/models/status']) {
  try {
    const r = await evalJs(`fetch('${ep}').then(r => r.text()).then(t => t.slice(0, 300))`);
    report.health[ep] = r ? r : '(empty)';
  } catch (err) { report.health[ep] = 'FETCH FAILED: ' + err; }
}

// ── 2. App skeleton sanity ───────────────────────────────────────────────────
report.skeleton = await evalJs(`(() => ({
  rootChildren: document.getElementById('root')?.children.length ?? -1,
  tabs: [...document.querySelectorAll('[role=tab]')].map(b => b.textContent.trim()),
  gridImgs: document.querySelectorAll('.grid img').length,
  hasErrorOverlayText: /uncaught|something went wrong/i.test(document.body.innerText),
}))()`);

// ── 3. Click through every tab ───────────────────────────────────────────────
const tabs = report.skeleton.tabs;
report.views = [];
for (let i = 0; i < tabs.length; i++) {
  await evalJs(`
    (() => { const t = [...document.querySelectorAll('[role=tab]')][${i}]; if (t) t.click(); return 'ok'; })()
  `);
  await new Promise(r => setTimeout(r, 1500));
  const state = await evalJs(`(() => ({
    label: [...document.querySelectorAll('[role=tab]')][${i}]?.textContent.trim(),
    selected: [...document.querySelectorAll('[role=tab]')][${i}]?.getAttribute('aria-selected'),
    imgs: document.querySelectorAll('img').length,
    blankRoot: (document.getElementById('root')?.innerText ?? '').trim().length === 0,
  }))()`);
  await shot(`e2e_view_${i}`);
  report.views.push(state);
}

// ── 4. Grade filter interaction (segmented counts) ──────────────────────────
await evalJs(`[...document.querySelectorAll('[role=tab]')].forEach((t, i) => { if (i === 0) t.click(); })`);
await new Promise(r => setTimeout(r, 1200));
report.filterClick = await evalJs(`
  (() => {
    const btns = [...document.querySelectorAll('button')].filter(b => /\\(\\d+\\)/.test(b.textContent));
    return { countButtonsFound: btns.length, sample: btns.slice(0, 5).map(b => b.textContent.trim()) };
  })()
`);

// ── 5. Verdict ───────────────────────────────────────────────────────────────
report.consoleWarningsAndErrors = consoleMsgs;
report.uncaughtExceptions = exceptions;

writeFileSync(new URL('./e2e_report.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(0);
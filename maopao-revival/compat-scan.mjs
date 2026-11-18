/* MRP 游戏兼容性批量扫描（浏览器侧校准，目标同 SkyEngine 回归：标出哪些游戏能玩）
 * 判定：ALIVE = 画面自动动画 或 任一按键（Enter/↓/↑/Q/5）引起画面变化；否则 FROZEN。
 * 用法：node compat-scan.mjs [样本数=50] [输出=docs/compat-report.json]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9380, PROFILE = '/tmp/j2me-cdp-compat';
const N = Number(process.argv[2] || 50);
const OUT = process.argv[3] || 'docs/compat-report.json';
const HALL = process.env.HALL_ORIGIN || 'http://127.0.0.1:8080';

const games = JSON.parse(fs.readFileSync('hall/manifest.json', 'utf8'));
const step = Math.max(1, Math.floor(games.length / N));
const sample = games.filter((_, i) => i % step === 0).slice(0, N);

fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-gpu', '--disable-dev-shm-usage',
  '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=430,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(800) }); if (r.ok) break; } catch {}
  await sleep(200);
}

const chash = `(function(){var c=document.getElementById('canvas');if(!c)return 'nocanvas';var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var h=0;for(var i=0;i<d.length;i+=29)h=(h*31+d[i]+d[i+1]*3+d[i+2]*7)|0;return h;})()`;

async function openTab(url) {
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let tid = 0; const tp = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => {
    const n = ++tid; tp.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method: m, params: p }));
    setTimeout(() => { if (tp.has(n)) { tp.delete(n); rej(new Error('timeout ' + m)); } }, 30000);
  });
  ws.addEventListener('message', ev => {
    let d = ev.data; if (typeof d !== 'string') d = "";
    const m = JSON.parse(d);
    if (m.id && tp.has(m.id)) {
      const p = tp.get(m.id); tp.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  await send('Page.enable'); await send('Runtime.enable');
  return { ws, send };
}

const results = [];
let done = 0;
for (const g of sample) {
  const rec = { file: g.file, name: g.name, vendor: g.vendor, size: g.size };
  const url = `${HALL}/maopao.html?mrp=${encodeURIComponent(g.file)}`;
  try {
    const { ws, send } = await openTab(url);
    await sleep(12000);
    // 1) 自动动画
    let a1 = await send('Runtime.evaluate', { expression: chash, returnByValue: true });
    await sleep(4000);
    let a2 = await send('Runtime.evaluate', { expression: chash, returnByValue: true });
    rec.animated = a1.result.value !== a2.result.value;
    // 2) 按键响应
    const keys = [[13, 'Enter'], [40, 'ArrowDown'], [38, 'ArrowUp'], [81, 'q'], [53, '5']];
    rec.respondsTo = [];
    let responded = false;
    for (const [vk, key] of keys) {
      await send('Runtime.evaluate', { expression: chash, returnByValue: true }); // 清无意义
      let h1 = await send('Runtime.evaluate', { expression: chash, returnByValue: true });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === 'q' ? 'KeyQ' : key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key === 'q' ? 'KeyQ' : key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await sleep(1600);
      let h2 = await send('Runtime.evaluate', { expression: chash, returnByValue: true });
      if (h1.result.value !== h2.result.value) { rec.respondsTo.push(key); responded = true; if (responded && rec.respondsTo.length >= 2) break; }
    }
    rec.alive = rec.animated || responded;
    ws.close();
  } catch (e) {
    rec.alive = null; rec.error = String(e).slice(0, 120);
  }
  results.push(rec);
  done++;
  console.log(`[${done}/${sample.length}] ${rec.alive === true ? 'ALIVE' : rec.alive === false ? 'FROZEN' : 'ERR'} ${rec.name || rec.file} ${rec.respondsTo ? JSON.stringify(rec.respondsTo) : ''} ${rec.error || ''}`);
}

const alive = results.filter(r => r.alive === true).length;
const frozen = results.filter(r => r.alive === false).length;
const summary = { scannedAt: new Date().toISOString(), total: games.length, sampled: results.length, alive, frozen, unknown: results.length - alive - frozen, results };
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
console.log(`\nSUMMARY alive=${alive} frozen=${frozen} of ${results.length} sampled (库共 ${games.length}) -> ${OUT}`);
chrome.kill('SIGKILL');

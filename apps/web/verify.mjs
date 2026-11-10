/* 小潮霸王 UI 统一启动器端到端验证。
 * 用法： node verify.mjs
 * 步骤：打开根路径 → 统计 J2ME 卡片 → 切冒泡 tab → 统计卡片 → 点开一个冒泡游戏验证 React 运行时 → 截图
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9341;
const PROFILE = '/tmp/j2me-cdp-revival';
const URL = 'http://127.0.0.1:8080/';
const SHOT1 = '/tmp/revival-j2me.png';
const SHOT2 = '/tmp/revival-maopao.png';
const SHOT3 = '/tmp/revival-player.png';

fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--use-gl=swiftshader', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1100,900', '--lang=zh-CN', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error('timeout ' + method)); } }, 30000);
  });
}
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

try {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1000) }); if (r.ok) break; } catch {}
    await sleep(200);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', async ev => {
    let d = ev.data; if (typeof d !== 'string') d = await d.text();
    const m = JSON.parse(d);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 200));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(3000);

  // 1. J2ME tab
  const j2me = await evalJs(`(() => {
    const tabs = [...document.querySelectorAll('.tab')].map(b => b.textContent.trim());
    const cards = document.querySelectorAll('.card').length;
    const count = document.querySelector('.count')?.textContent || '';
    const hasUpload = !!document.querySelector('.upload-btn');
    return { tabs, cards, count, hasUpload, title: document.title, url: location.href };
  })()`);
  console.log('J2ME tab:', JSON.stringify(j2me));
  await send('Page.captureScreenshot').then(r => fs.writeFileSync(SHOT1, Buffer.from(r.data, 'base64')));

  await evalJs(`document.querySelector('.card')?.click()`);
  await sleep(300);
  await evalJs(`document.querySelector('.game-menu-options .primary')?.click()`);
  await sleep(7000);
  const j2mePlayer = await evalJs(`(() => { const c = document.querySelector('#canvas'); const gear = document.querySelector('#gear'); return { runtime: !!document.querySelector('.runtime-view'), canvas: !!c, midp: !!window.MIDP, gear: !!gear, w: c?.width || 0, h: c?.height || 0, error: /Could not load|启动失败/.test(document.body.innerText), iframe: !!document.querySelector('iframe') }; })()`);
  console.log('J2ME runtime:', JSON.stringify(j2mePlayer));
  await evalJs(`document.querySelector('.player-exit')?.click()`);
  await sleep(200);
  await evalJs(`document.querySelector('.exit-confirm .danger')?.click()`);
  await sleep(1000);

  // 2. switch to maopao
  await evalJs(`document.querySelectorAll('.tab')[1].click()`);
  await sleep(4000);
  const maopao = await evalJs(`(() => {
    const active = document.querySelector('.tab.active')?.textContent.trim();
    const cards = document.querySelectorAll('.card').length;
    const count = document.querySelector('.count')?.textContent || '';
    const names = [...document.querySelectorAll('.card-name')].slice(0, 3).map(e => e.textContent);
    return { active, cards, count, names };
  })()`);
  console.log('冒泡 tab:', JSON.stringify(maopao));
  await send('Page.captureScreenshot').then(r => fs.writeFileSync(SHOT2, Buffer.from(r.data, 'base64')));

  // 3. open first maopao game
  await evalJs(`document.querySelector('.card').click()`);
  await sleep(300);
  await evalJs(`document.querySelector('.game-menu-options .primary')?.click()`);
  await sleep(12000);
  const player = await evalJs(`(() => {
    return { player: !!document.querySelector('.player'), runtime: !!document.querySelector('.runtime-view'), phone: !!document.querySelector('#phone'), iframe: !!document.querySelector('iframe') };
  })()`);
  console.log('Player:', JSON.stringify(player));
  await send('Page.captureScreenshot').then(r => fs.writeFileSync(SHOT3, Buffer.from(r.data, 'base64')));

  const vm = await evalJs(`(() => { const c = document.querySelector('#canvas'); return { canvas: !!c, w: c?.width || 0, h: c?.height || 0, module: !!window.Module }; })()`);
  console.log('React runtime:', JSON.stringify(vm));

  console.log('RESULT ' + JSON.stringify({ j2me, j2mePlayer, maopao, player, vm, jsErrors: errors.slice(0, 5) }));
} catch (e) {
  console.error('VERIFY FAILED:', e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
}

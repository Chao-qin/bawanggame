/* 冒泡 MRP 网页版端到端探针。
 * 用法： node probe.mjs <mrpUrl> [waitMs] [screenshotPath] [keys]
 * 例：  node probe.mjs "http://127.0.0.1:8090/vmrp_v1.0/main.html?f=/public/mrps/2048.mrp" 10000 /tmp/maopao-2048.png "Enter"
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9339;
const PROFILE = '/tmp/j2me-cdp-maopao';
const URL = process.argv[2] || 'http://127.0.0.1:8090/vmrp_v1.0/main.html';
const WAIT = Number(process.argv[3] || 10000);
const SHOT = process.argv[4] || '/tmp/maopao-probe.png';
const KEYS = (process.argv[5] || '').split(',').filter(Boolean);

fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--use-gl=swiftshader', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=900,900', '--lang=zh-CN', 'about:blank',
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
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error('timeout ' + method)); } }, 20000);
  });
}

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
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CONSOLE ' + (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 250));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await sleep(WAIT);

  const st = await send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var c = document.getElementById('canvas');
      var px = 0, total = 0;
      if (c) {
        try {
          var ctx = c.getContext('2d');
          if (ctx) {
            var d = ctx.getImageData(0, 0, c.width, c.height).data;
            total = c.width * c.height;
            for (var i = 0; i < d.length; i += 4) { if (d[i] + d[i+1] + d[i+2] > 30) px++; }
          }
        } catch (e) { px = 'ctx:' + e.message; }
      }
      return {
        url: location.href,
        status: (document.getElementById('status') || {}).textContent || '',
        canvas: c ? { w: c.width, h: c.height } : null,
        brightPixels: px, totalPixels: total,
        wasmReady: typeof Module !== 'undefined' && !!Module.calledRun,
        hasModule: typeof Module !== 'undefined'
      };
    })())`, returnByValue: true,
  });
  console.log('STATE', st.result.value);

  const KMAP = {
    Enter: { key: 'Enter', code: 'Enter', vk: 13 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
    Q: { key: 'q', code: 'KeyQ', vk: 81 },
    E: { key: 'e', code: 'KeyE', vk: 69 },
  };
  for (const k of KEYS) {
    const m = KMAP[k]; if (!m) continue;
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', { type, key: m.key, code: m.code,
        windowsVirtualKeyCode: m.vk, nativeVirtualKeyCode: m.vk });
    }
    await sleep(400);
  }
  if (KEYS.length) {
    await sleep(2500);
    const st2 = await send('Runtime.evaluate', {
      expression: `JSON.stringify({status:(document.getElementById('status')||{}).textContent||'', bright:(function(){var c=document.getElementById('canvas');if(!c)return -1;try{var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,p=0;for(var i=0;i<d.length;i+=4){if(d[i]+d[i+1]+d[i+2]>30)p++;}return p;}catch(e){return 'ctx';}})()})`,
      returnByValue: true,
    });
    console.log('AFTER_KEYS', st2.result.value);
  }

  console.log('JS_EXCEPTIONS', JSON.stringify(errors.slice(0, 10)));
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(s.data, 'base64'));
  console.log('SCREENSHOT', SHOT);
} catch (e) {
  console.error('FATAL', e);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGKILL');
}

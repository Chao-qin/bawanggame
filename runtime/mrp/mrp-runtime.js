/* =====================================================================
 * React 冒泡播放器 —— 冒泡(MRP)运行时的手机壳
 * 复用 小潮霸王 的手机外观(style/main.css+feedback.css)，内核换 vmrp wasm。
 * 键码桥：小潮霸王 按键 DOM -> Module._c_event(type, code, 0)
 *   type: 0=按下 1=松开；code 按 MR 平台枚举(mrporting.h)：
 *   0-9 数字, 10=*, 11=#, 12-15=方向, 16=挂机, 17/18=软键, 20=确认, 23=清除
 * ===================================================================== */
(function () {
  var BASE = '/maopao';  // 本页由 小潮霸王 服务，vmrp 资源挂在 /maopao/ 下

  function qs(name) {
    var m = location.search.substr(1).match(new RegExp('(^|&)' + name + '=([^&]*)(&|$)'));
    return m ? decodeURIComponent(m[2]) : null;
  }

  // 游戏文件：?mrp=<文件名>（推荐）或 ?f=<完整路径>
  var mrpFile = window.__XIAOCHAO_RUNTIME_MRP || qs('mrp');
  var f = window.__XIAOCHAO_RUNTIME_MRP_URL || qs('f') || (mrpFile ? BASE + '/public/mrps/' + mrpFile : null);
  if (qs('title')) document.title = qs('title');

  /* ---------- 键码桥 ---------- */
  var KEYCODES = {
    up: 12, down: 13, left: 14, right: 15, ok: 20,
    choice: 17, back: 18, ret: 16, clear: 23,
    star: 10, pound: 11,
    num0: 0, num1: 1, num2: 2, num3: 3, num4: 4,
    num5: 5, num6: 6, num7: 7, num8: 8, num9: 9
  };
  var PHYS = {
    ArrowUp: 12, ArrowDown: 13, ArrowLeft: 14, ArrowRight: 15,
    Enter: 20, q: 17, e: 18, Q: 17, E: 18,
    Escape: 16, Backspace: 23,
    '*': 10, '-': 10, '#': 11, '=': 11
  };
  for (var d = 0; d <= 9; d++) PHYS[String(d)] = d;

  function cEvent(type, code) {
    if (window.Module && Module._c_event) Module._c_event(type, code, 0);
  }
  function tapFx(node) {
    node.classList.add('tap');
    setTimeout(function () { node.classList.remove('tap'); }, 160);
  }

  // 虚拟按键：与 j2me 共用 Touchpad 手势内核（touchpad.js，SSOT）——
  // 滑动切向、滞回防抖、斜向双键、中心确认、.down 按住高亮、震动、连发、防卡键。
  // 本页只提供 MR 平台交付层：键码(12-15/20/17/18/16/23/10/11/0-9) -> c_event。
  // 连发参数与 j2me 默认一致（450ms 延迟 / 100ms 间隔），?repeat=0 关闭。
  var REPEAT_DELAY = 450, REPEAT_INTERVAL = 100;
  if (new URLSearchParams(location.search).get('repeat') === '0') { REPEAT_DELAY = 0; }
  var phone = window.matchMedia && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 800;
  Touchpad.bind({
    buttons: KEYCODES,
    sink: {
      press: function (code) { cEvent(0, code); },
      release: function (code) { cEvent(1, code); },
      repeat: function (code) { cEvent(0, code); }  // MR 平台无 keyState 查询，连发即重复 PRESS（真机行为）
    },
    feedback: {
      vibrate: phone ? 10 : 0,
      keyRepeat: REPEAT_DELAY !== 0,
      repeatDelay: REPEAT_DELAY || 450,
      repeatInterval: REPEAT_INTERVAL,
      dpadOk: 'press',
      okHold: 200,
      tapMs: 240
    },
    exclude: '#mrp-dialog',
    onActivate: function () { try { canvas.focus(); } catch (_) {} }
  });

  // code -> DOM 按钮反查（物理键按下时点亮对应虚拟键，作为"按键已收到"的视觉反馈）
  var CODE2ID = {};
  Object.keys(KEYCODES).forEach(function (k) { CODE2ID[KEYCODES[k]] = k; });

  // 物理键盘：emscripten SDL 路径已内置处理方向/确认/数字/软键/挂机（vmrp main.c keyEvent），
  // 桥接会与之重复投递（游戏收到两次 press，菜单选择跳两格回到原位，表现为"方向键失灵"）。
  // 因此物理键只做三件事：防滚动默认行为 + 按键视觉反馈、补 SDL 未映射的键（Backspace/＊/#）、对话框打开时完全放行。
  function physCode(e) {
    return PHYS[e.key] !== undefined ? PHYS[e.key] : PHYS[e.code];
  }
  document.addEventListener('keydown', function (e) {
    var code = physCode(e);
    if (code === undefined) return;
    if (dialog.classList.contains('show')) return;  // 输入框打开时不拦截，让 textarea 正常打字
    e.preventDefault();
    var node = CODE2ID[code] && document.getElementById(CODE2ID[code]);
    if (node) tapFx(node);
    if (e.repeat) return;
    // SDL 未映射的键才走桥：Backspace→清除(23)，'*'(10)，'#'(11)
    if (e.key === 'Backspace') cEvent(0, 23);
    else if (e.key === '*' || e.key === '-') cEvent(0, 10);
    else if (e.key === '#' || e.key === '=') cEvent(0, 11);
  });
  document.addEventListener('keyup', function (e) {
    var code = physCode(e);
    if (code === undefined) return;
    if (dialog.classList.contains('show')) return;
    e.preventDefault();
    if (e.key === 'Backspace') cEvent(1, 23);
    else if (e.key === '*' || e.key === '-') cEvent(1, 10);
    else if (e.key === '#' || e.key === '=') cEvent(1, 11);
  });

  /* ---------- 画布等比缩放 ---------- */
  var canvas = document.getElementById('canvas');
  // Create the context before Emscripten starts. WebView can then reuse the
  // low-latency context instead of negotiating a default one on first frame.
  try {
    var canvasContext = canvas && canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
    if (canvasContext && 'imageSmoothingEnabled' in canvasContext) {
      canvasContext.imageSmoothingEnabled = false;
    }
  } catch (_) {}
  function fit() {
    var box = document.getElementById('display-container');
    var display = document.getElementById('display');
    if (!box) return;
    var s = Math.min(box.clientWidth / 240, box.clientHeight / 320);
    if (!isFinite(s) || s <= 0) s = 1;
    var width = Math.floor(240 * s);
    var height = Math.floor(320 * s);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    // Keep the overlay host the same size as the 240x320 game surface.
    // A full-size flex host lets hidden loading/dialog layers paint outside
    // the canvas and produces a white block above the game screen.
    if (display) {
      display.style.width = width + 'px';
      display.style.height = height + 'px';
    }
  }
  window.addEventListener('resize', fit);
  fit();

  /* ---------- 对话框 / 文本（vmrp js_* 回调所需） ---------- */
  var MR_DIALOG_EVENT = 6, MR_DIALOG_KEY_OK = 0, MR_DIALOG_KEY_CANCEL = 1;
  var MR_DIALOG_OK = 0, MR_DIALOG_OK_CANCEL = 1, MR_DIALOG_CANCEL = 2;
  var MR_EDIT_NUMERIC = 1, MR_EDIT_PASSWORD = 2;
  var dialog = document.getElementById('mrp-dialog');
  var dlgTitle = document.getElementById('mrp-dialog-title');
  var dlgText = document.getElementById('mrp-dialog-text');
  var dlgOk = document.getElementById('mrp-dialog-ok');
  var dlgCancel = document.getElementById('mrp-dialog-cancel');
  var dlgInfo = document.getElementById('mrp-dialog-info');
  var dlgEditAble = false, dlgMax = 0;

  function getUnicodeStr(p) {
    var i = p / 2, arr = [];
    if (!window.Module || !Module.HEAPU16) return '';
    while (Module.HEAPU16[i]) {
      var v = Module.HEAPU16[i];
      arr.push(String.fromCharCode((v >> 8 | v << 8) & 0xffff));
      i++;
    }
    return arr.join('');
  }
  function getDialogText() {
    var s = dlgText.value.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    return s;
  }
  function updateDialogInfo() {
    var len = getDialogText().length;
    dlgInfo.textContent = len + '/' + dlgMax;
    dlgInfo.style.color = len > dlgMax ? 'red' : '#888';
  }
  function dialogOpen(title, text, keyType, editAble, editType, maxSize) {
    if (!window.Module) return 0;
    Module._setEventEnable(false);
    dlgEditAble = !!editAble; dlgMax = maxSize || 0;
    dlgTitle.textContent = getUnicodeStr(title);
    dlgText.value = getUnicodeStr(text);
    dlgText.readOnly = !editAble;
    dlgText.type = (editType == MR_EDIT_PASSWORD) ? 'password'
      : (editType == MR_EDIT_NUMERIC) ? 'number' : 'text';
    dlgOk.style.visibility = (keyType == MR_DIALOG_CANCEL) ? 'hidden' : 'visible';
    dlgCancel.style.visibility = (keyType == MR_DIALOG_OK) ? 'hidden' : 'visible';
    dlgOk.onclick = dlgCancel.onclick = null;
    if (keyType == MR_DIALOG_OK_CANCEL || keyType == MR_DIALOG_OK) {
      dlgOk.onclick = function () {
        if (editAble && getDialogText().length > dlgMax) return;
        dlgText.readOnly = true;
        Module._c_event(MR_DIALOG_EVENT, MR_DIALOG_KEY_OK, 0);
      };
    }
    if (keyType == MR_DIALOG_OK_CANCEL || keyType == MR_DIALOG_CANCEL) {
      dlgCancel.onclick = function () {
        Module._c_event(MR_DIALOG_EVENT, MR_DIALOG_KEY_CANCEL, 0);
      };
    }
    if (editAble) dlgText.oninput = updateDialogInfo;
    else dlgText.oninput = null;
    updateDialogInfo();
    dialog.classList.add('show');
    return 1234;
  }
  function dialogClose() {
    dialog.classList.remove('show');
    dlgOk.onclick = dlgCancel.onclick = null;
    if (window.Module) Module._setEventEnable(true);
  }
  window.js_dialogCreate = function (title, text, type) {
    return dialogOpen(title, text, type, false, 0, 0);
  };
  window.js_dialogRelease = function () { dialogClose(); return 0; };
  window.js_dialogRefresh = function (handle, title, text, keyType) {
    dlgTitle.textContent = getUnicodeStr(title);
    dlgText.value = getUnicodeStr(text);
    if (keyType == -1) return 0;
    dlgOk.style.visibility = 'hidden';
    dlgCancel.style.visibility = 'hidden';
    dlgOk.onclick = dlgCancel.onclick = null;
    if (keyType == MR_DIALOG_OK_CANCEL || keyType == MR_DIALOG_OK) {
      dlgOk.style.visibility = 'visible';
      dlgOk.onclick = function () { Module._c_event(MR_DIALOG_EVENT, MR_DIALOG_KEY_OK, 0); };
    }
    if (keyType == MR_DIALOG_OK_CANCEL || keyType == MR_DIALOG_CANCEL) {
      dlgCancel.style.visibility = 'visible';
      dlgCancel.onclick = function () { Module._c_event(MR_DIALOG_EVENT, MR_DIALOG_KEY_CANCEL, 0); };
    }
    return 0;
  };
  window.js_textCreate = function (title, text, type) {
    return dialogOpen(title, text, type, false, 0, 0);
  };
  window.js_textRelease = function () { dialogClose(); return 0; };
  window.js_textRefresh = function (handle, title, text) {
    dlgTitle.textContent = getUnicodeStr(title);
    dlgText.value = getUnicodeStr(text);
    return 0;
  };
  window.js_editCreate = function (title, text, type, maxSize) {
    return dialogOpen(title, text, MR_DIALOG_OK_CANCEL, true, type, maxSize);
  };
  window.js_editRelease = function () { dialogClose(); return 0; };
  var holdTextMem = 0;
  window.js_editGetText = function () {
    var str = getDialogText();
    var len = str.length + 1;
    if (holdTextMem != 0 && Module._my_freeExt) Module._my_freeExt(holdTextMem);
    holdTextMem = 0;
    if (Module._my_mallocExt) {
      holdTextMem = Module._my_mallocExt(len * 2);
      if (holdTextMem != 0) {
        var ptr = holdTextMem;
        for (var a = 0; a < str.length; a++) {
          var v = str.charCodeAt(a);
          Module.HEAPU8[ptr++] = (v >> 8) & 0xff;
          Module.HEAPU8[ptr++] = v & 0xff;
        }
        Module.HEAPU8[ptr++] = 0;
        Module.HEAPU8[ptr] = 0;
      }
    }
    return holdTextMem;
  };

  /* ---------- 音频 / 振动 ---------- */
  var midi = null;
  try { midi = MidiPlayer(); } catch (e) { midi = null; }
  window.js_playSound = function (type, data, dataLen, loop) {
    if (type == 0 && midi) {           // MR_SOUND_MIDI
      try { midi.play(Module.HEAPU8.slice(data, data + dataLen).buffer, loop); } catch (e) {}
    }
    // WAV/MP3：上游网页版也未实现，仅记日志
    return 0;
  };
  window.js_stopSound = function () {
    if (midi) { try { midi.stop(); } catch (e) {} }
    return 0;
  };
  var shakeTimer = 0;
  window.js_startShake = function (ms) {
    var start = Date.now();
    shakeTimer = setInterval(function () {
      if (Date.now() - start >= ms) {
        clearInterval(shakeTimer); shakeTimer = 0;
        canvas.style.marginLeft = '';
        return;
      }
      canvas.style.marginLeft = canvas.style.marginLeft === '-2px' ? '2px' : '-2px';
    }, 40);
    return 0;
  };
  window.js_stopShake = function () {
    if (shakeTimer) { clearInterval(shakeTimer); shakeTimer = 0; }
    canvas.style.marginLeft = '';
    return 0;
  };

  /* ---------- 加载态 ---------- */
  var loading = document.getElementById('mrp-loading');
  var loadingText = document.getElementById('mrp-loading-text');
  var progress = document.getElementById('mrp-progress');

  /* ---------- Module 配置 + FS 预载 ---------- */
  var mrpDebug = new URLSearchParams(window.location.search).get('mrpDebug') === '1';
  window.Module = {
    preRun: [],
    postRun: [
      function () {
        loading.classList.add('hide');
        try { canvas.focus(); } catch (_) {}
        fit();
      }
    ],
    print: mrpDebug ? function (t) { console.log(t); } : function () {},
    printErr: mrpDebug ? function (t) { console.error(t); } : function () {},
    canvas: canvas,
    setStatus: function (text) {
      if (!text) return;
      var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
      if (m) {
        progress.value = parseFloat(m[2]) * 100;
        progress.max = parseFloat(m[4]) * 100;
        loadingText.textContent = '下载内核中…';
      } else {
        loadingText.textContent = text;
      }
    },
    totalDependencies: 0,
    monitorRunDependencies: function (left) {
      this.totalDependencies = Math.max(this.totalDependencies, left);
      loadingText.textContent = left ? '准备文件…(' + (this.totalDependencies - left) + '/' + this.totalDependencies + ')' : '下载完成';
    }
  };
  window.onerror = function () {
    loading.classList.remove('hide');
    loadingText.textContent = '启动失败，请看浏览器控制台';
    if (window.toast) toast('冒泡内核启动失败', false);
  };

  if (!f) {
    loadingText.textContent = '缺少游戏参数：用 ?mrp=<文件名>.mrp 打开';
  } else {
    Module.preRun.push(function () {
      var FS_ROOT = BASE + '/vmrp_v1.0/fs';
      var dirs = ['/mythroad', '/mythroad/plugins', '/mythroad/plugins/ose', '/mythroad/system'];
      var files = [
        '/mythroad/dsm_gm.mrp', '/mythroad/mpc.mrp', '/mythroad/ydqtwo.mrp',
        '/mythroad/plugins/netpay.mrp', '/mythroad/plugins/flaengine.mrp',
        '/mythroad/plugins/ose/brwcore.mrp',
        '/mythroad/system/gb12.uc2', '/mythroad/system/gb16.uc2',
        '/cfunction.ext'
      ];
      dirs.forEach(function (v) { FS.mkdir(v); });
      files.forEach(function (v) {
        var parent = v.substring(0, v.lastIndexOf('/'));
        var name = v.substring(v.lastIndexOf('/') + 1);
        if (name === 'dsm_gm.mrp') {
          FS.createPreloadedFile(parent, name, f, true, true);   // 游戏本体
        } else {
          FS.createPreloadedFile(parent, name, FS_ROOT + v, true, true);
        }
      });
    });
    Module.setStatus('Downloading...');
  }
})();

var BtRoom = (function () {
  var WORDS = ["volk", "lisa", "sokol", "kedr", "rys", "bars", "los", "orel", "yozh", "sova"];
  var MODES = [["create", tr("Создать", "Create")], ["join", tr("Подключиться", "Join")], ["near", tr("Рядом", "Nearby")]];
  var NETS = [["auto", tr("Авто", "Auto")], ["p2p", "P2P"], ["turn", "TURN"]];
  var ACTION = { create: tr("Создать комнату", "Create room"), join: tr("Подключиться", "Join"), near: tr("Играть рядом", "Play nearby") };
  var overlay = el("div", "", { id: "btroom", hidden: true });
  var box = el("form", "panel-box bt-box", { noValidate: true, tabIndex: -1 });
  var current = { room: null, peers: 0, via: "" }, watchers = [];
  var handler = null, done = null, mode = "create", busy = false, stale = false;
  var form = { name: "", create: { room: "", pass: "" }, join: { room: "", pass: "" } };

  overlay.appendChild(box);

  function el(tag, cls, props) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (props) Object.keys(props).forEach(function (k) { e[k] = props[k]; });
    return e;
  }

  function txt(tag, cls, text) {
    return el(tag, cls, { textContent: text });
  }

  function rnd(n) {
    return String(Math.floor(Math.random() * Math.pow(10, n))).padStart(n, "0");
  }

  function stored() {
    try {
      return localStorage.getItem("btname");
    } catch (e) {
      return null;
    }
  }

  function remember(name) {
    try {
      if (name) localStorage.setItem("btname", name);
    } catch (e) {}
  }

  function fresh() {
    form.create = { room: WORDS[Math.floor(Math.random() * WORDS.length)] + "-" + rnd(2), pass: rnd(4), net: "auto" };
  }

  function field(label, value, props, onInput) {
    var wrap = el("label", "bt-field");
    var input = el("input", "", props);
    input.value = value;
    input.addEventListener("input", function () { onInput(input.value); });
    wrap.append(txt("span", "", label), input);
    return wrap;
  }

  function copy(btn, f) {
    var text = tr("Комната: ", "Room: ") + f.room + tr("\nПароль: ", "\nPassword: ") + f.pass;
    var ok = function () {
      btn.textContent = tr("Скопировано", "Copied");
      setTimeout(function () { btn.textContent = tr("Скопировать", "Copy"); }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, function () { fallback(text); ok(); });
    } else {
      fallback(text);
      ok();
    }
  }

  function fallback(text) {
    var t = el("textarea", "", { value: text });
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    try {
      document.execCommand("copy");
    } catch (e) {}
    t.remove();
  }

  function render(error) {
    box.textContent = "";
    var head = el("div", "pb-head");
    var title = el("div", "pb-title");
    title.append(txt("b", "", tr("Сетевая игра", "Multiplayer")));
    var x = el("button", "pb-close", { type: "button", title: tr("Закрыть", "Close"), textContent: "✕" });
    x.addEventListener("click", function () { close(false); });
    head.append(title, x);

    var who = el("section");
    who.append(field(tr("Ваше имя в игре", "Your name in game"), form.name, { maxLength: 16, autocomplete: "nickname", spellcheck: false }, function (v) { form.name = v; }));

    var seg = el("div", "seg");
    MODES.forEach(function (m) {
      var b = txt("button", mode === m[0] ? "on" : "", m[1]);
      b.type = "button";
      b.addEventListener("click", function () {
        mode = m[0];
        render();
      });
      seg.appendChild(b);
    });

    var body = el("section");
    body.appendChild(seg);
    if (mode === "near") {
      body.appendChild(txt("div", "sub", tr("Игроки из одной сети (один Wi‑Fi или один внешний IP) видят друг друга без комнаты и пароля.", "Players on the same network (same Wi‑Fi or public IP) see each other without a room or password.")));
    } else {
      var f = form[mode];
      body.append(
        field(tr("Название комнаты", "Room name"), f.room, { maxLength: 64, autocomplete: "off", spellcheck: false, autocapitalize: "none" }, function (v) { f.room = v; }),
        field(tr("Пароль", "Password"), f.pass, { maxLength: 64, autocomplete: "off", spellcheck: false, autocapitalize: "none" }, function (v) { f.pass = v; })
      );
      if (mode === "create") {
        var net = el("div", "bt-field");
        var ns = el("div", "seg");
        NETS.forEach(function (n) {
          var b = txt("button", f.net === n[0] ? "on" : "", n[1]);
          b.type = "button";
          b.addEventListener("click", function () {
            f.net = n[0];
            render();
          });
          ns.appendChild(b);
        });
        net.append(txt("span", "", tr("Соединение", "Connection")), ns);
        body.appendChild(net);
      }
      body.appendChild(txt("div", "sub", mode === "create"
        ? tr("Передайте второму игроку название и пароль любым способом. Он выберет «Подключиться».", "Send the room name and password to the other player any way you like. They choose “Join”.")
        : tr("Введите название и пароль, которые прислал создатель комнаты.", "Enter the name and password from the room creator.")));
    }
    if (error) body.appendChild(txt("div", "bt-error", error));

    var foot = el("div", "pb-foot bt-foot");
    var go = el("button", "bt-go", { type: "submit", textContent: busy ? tr("Подключение…", "Connecting…") : ACTION[mode], disabled: busy });
    foot.appendChild(go);
    if (mode === "create") {
      var cp = el("button", "ghost", { type: "button", textContent: tr("Скопировать", "Copy") });
      cp.addEventListener("click", function () { copy(cp, form[mode]); });
      foot.appendChild(cp);
    }
    box.append(head, who, body, foot);
    if (!overlay.hidden && !box.contains(document.activeElement)) box.focus({ preventScroll: true });
  }

  function close(ok) {
    if (busy) return;
    overlay.hidden = true;
    if (overlay.contains(document.activeElement)) document.activeElement.blur();
    var d = done;
    done = null;
    if (d) ok ? d.resolve() : d.reject();
  }

  function ask(r, error, attempt) {
    if (r) {
      mode = r.mode;
      form.name = r.name || form.name;
      if (mode !== "near") form[mode] = { room: r.room, pass: r.pass, net: r.net || "auto" };
    }
    if (done) done.reject();
    return new Promise(function (resolve, reject) {
      done = { resolve: resolve, reject: reject, attempt: attempt };
      busy = false;
      stale = true;
      overlay.hidden = false;
      render(error);
    });
  }

  function status(room, peers, via, rtt) {
    current = { room: room, peers: peers, via: via, rtt: rtt || 0 };
    watchers.forEach(function (fn) { fn(current); });
  }

  box.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || !done) return;
    var f = form[mode];
    form.name = form.name.trim();
    if (mode !== "near") {
      f.room = f.room.trim();
      if (!f.room) return render(tr("Введите название комнаты", "Enter a room name"));
    }
    busy = true;
    render();
    done.attempt({ mode: mode, room: mode === "near" ? "" : f.room, pass: mode === "near" ? "" : f.pass, net: mode === "create" ? f.net : "auto", name: form.name }).then(function () {
      remember(form.name);
      busy = false;
      close(true);
    }, function (msg) {
      busy = false;
      render(msg);
    });
  });
  var backdrop = false;
  overlay.addEventListener("pointerdown", function (e) {
    stale = false;
    backdrop = e.target === overlay;
  }, true);
  ["mousedown", "click"].forEach(function (type) {
    overlay.addEventListener(type, function (e) {
      if (!stale) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay && backdrop) close(false);
  });
  overlay.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Escape") close(false);
  });
  overlay.addEventListener("keyup", function (e) { e.stopPropagation(); });
  form.name = new URLSearchParams(location.search).get("btname") || stored() || "Player" + rnd(2);
  fresh();
  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(overlay);
  });

  return {
    ask: ask,
    status: status,
    state: function () { return current; },
    name: function () { return form.name; },
    watch: function (fn) { watchers.push(fn); },
    change: function () { if (handler && overlay.hidden) handler(); },
    copy: function (btn) { copy(btn, current.room); },
    onSwitch: function (fn) { handler = fn; }
  };
})();

var Files = (function () {
  var overlay = el("div", "", { id: "files", hidden: true });
  var box = el("div", "panel-box fm-box", { tabIndex: -1 });
  var picker = el("input", "", { type: "file", multiple: true, hidden: true });
  var cwd = "/", armed = null, making = false, error = "", backdrop = false, url = null;

  overlay.append(box, picker);

  function el(tag, cls, props) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (props) Object.keys(props).forEach(function (k) { e[k] = props[k]; });
    return e;
  }

  function txt(tag, cls, text) {
    return el(tag, cls, { textContent: text });
  }

  function btn(cls, text, title, fn) {
    var b = el("button", cls, { type: "button", textContent: text, title: title || "" });
    b.addEventListener("click", fn);
    return b;
  }

  function join(dir, name) {
    return (dir === "/" ? "" : dir) + "/" + name;
  }

  function human(n) {
    if (n < 1024) return n + tr(" Б", " B");
    if (n < 1048576) return (n / 1024).toFixed(1) + tr(" КБ", " KB");
    return (n / 1048576).toFixed(1) + tr(" МБ", " MB");
  }

  function entries(dir) {
    return fs.list(dir).map(function (n) {
      var isDir = n.slice(-1) === "/";
      var name = isDir ? n.slice(0, -1) : n;
      var st = fs.stat(join(dir, name)) || {};
      return { name: name, path: join(dir, name), isDir: isDir, size: st.size || 0, mtime: st.mtime };
    }).sort(function (a, b) {
      return a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name);
    });
  }

  function remove(path) {
    var st = fs.stat(path);
    if (st && st.isDir) {
      fs.list(path).forEach(function (n) {
        remove(join(path, n.replace(/\/$/, "")));
      });
    }
    return fs.remove(path);
  }

  function act(fn) {
    armed = null;
    error = "";
    fn();
    fs.syncStore();
    render();
  }

  function download(path) {
    myflushAll();
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(fs.getBlob(path));
    var a = el("a", "", { href: url, download: path.slice(path.lastIndexOf("/") + 1) });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function upload(list) {
    act(function () {
      Array.prototype.forEach.call(list, function (f) {
        var path = join(cwd, f.name), st = fs.stat(path);
        if (st && st.isDir) error = tr("Здесь уже есть папка «" + f.name + "»", "There is already a folder “" + f.name + "” here");
        else if (st && !fs.remove(path)) error = tr("«" + f.name + "» сейчас открыт игрой", "“" + f.name + "” is open by the game");
        else fs.create(path, f);
      });
    });
  }

  function folder(name) {
    name = name.trim();
    if (!name || /[\/\\]/.test(name)) return render(tr("Недопустимое имя папки", "Invalid folder name"));
    act(function () {
      if (!fs.mkdir(join(cwd, name))) error = tr("Не удалось создать папку", "Could not create folder");
      making = false;
    });
  }

  function crumbs() {
    var wrap = el("div", "fm-path");
    var parts = cwd === "/" ? [] : cwd.slice(1).split("/");
    wrap.appendChild(btn("fm-crumb", tr("Телефон", "Phone"), "", function () { cd("/"); }));
    parts.forEach(function (p, i) {
      var path = "/" + parts.slice(0, i + 1).join("/");
      wrap.append(txt("span", "fm-sep", "/"), btn("fm-crumb", p, "", function () { cd(path); }));
    });
    return wrap;
  }

  function row(e) {
    var r = el("div", "fm-row" + (e.isDir ? " fm-dir" : ""));
    var open = btn("fm-name", "", e.isDir ? tr("Открыть", "Open") : tr("Скачать", "Download"), function () {
      if (e.isDir) cd(e.path);
      else download(e.path);
    });
    open.append(txt("span", "fm-icon", e.isDir ? "📁" : "📄"), txt("span", "fm-label", e.name));
    if (!e.isDir) open.appendChild(txt("span", "fm-meta", human(e.size)));
    r.appendChild(open);
    if (!e.isDir) r.appendChild(btn("fm-act", "⬇", tr("Скачать", "Download"), function () { download(e.path); }));
    var del = btn("fm-act del" + (armed === e.path ? " confirm" : ""), armed === e.path ? tr("Удалить?", "Delete?") : "✕", tr("Удалить", "Delete"), function () {
      if (armed !== e.path) {
        armed = e.path;
        return render();
      }
      act(function () {
        if (!remove(e.path)) error = tr("«" + e.name + "» сейчас открыт игрой", "“" + e.name + "” is open by the game");
      });
    });
    r.appendChild(del);
    return r;
  }

  function render(msg) {
    if (msg) error = msg;
    var list;
    try {
      list = entries(cwd);
    } catch (e) {
      if (cwd !== "/") return cd("/");
      list = [];
      error = tr("Файловая система ещё не готова", "File system is not ready yet");
    }
    var scroll = box.scrollTop;
    box.textContent = "";

    var head = el("div", "pb-head");
    var title = el("div", "pb-title");
    title.append(txt("b", "", tr("Файлы телефона", "Phone files")), txt("span", "", tr("Общие для всех игр: карта памяти, память телефона, сохранения", "Shared by all games: memory card, phone memory, saves")));
    head.append(title, btn("pb-close", "✕", tr("Закрыть", "Close"), close));

    var tools = el("section", "fm-tools");
    tools.append(crumbs());
    var bar = el("div", "fm-bar");
    bar.append(btn("fm-btn", tr("Загрузить", "Upload"), tr("Загрузить файлы в эту папку", "Upload files to this folder"), function () { picker.click(); }),
      btn("fm-btn ghost", tr("Новая папка", "New folder"), "", function () {
        making = !making;
        armed = null;
        render();
      }));
    tools.appendChild(bar);
    if (making) {
      var form = el("form", "fm-new");
      var name = el("input", "", { placeholder: tr("Имя папки", "Folder name"), maxLength: 64, spellcheck: false, autocapitalize: "none" });
      form.append(name, el("button", "fm-btn", { type: "submit", textContent: tr("Создать", "Create") }));
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        folder(name.value);
      });
      tools.appendChild(form);
    }
    if (error) tools.appendChild(txt("div", "bt-error", error));

    var rows = el("section", "fm-list");
    if (cwd !== "/") {
      var up = btn("fm-name", "", tr("Наверх", "Up"), function () { cd(fs.dirname(cwd)); });
      up.append(txt("span", "fm-icon", "↩"), txt("span", "fm-label", ".."));
      var r = el("div", "fm-row fm-dir");
      r.appendChild(up);
      rows.appendChild(r);
    }
    list.forEach(function (e) { rows.appendChild(row(e)); });
    if (!list.length) rows.appendChild(txt("div", "sub fm-empty", tr("Папка пуста. Файлы можно перетащить сюда.", "Folder is empty. Drop files here.")));

    box.append(head, tools, rows);
    box.scrollTop = scroll;
    if (!overlay.hidden && !box.contains(document.activeElement)) box.focus({ preventScroll: true });
  }

  function cd(path) {
    cwd = path;
    armed = null;
    making = false;
    error = "";
    box.scrollTop = 0;
    render();
  }

  function open() {
    myflushAll();
    overlay.hidden = false;
    render();
  }

  function close() {
    overlay.hidden = true;
    armed = null;
    making = false;
    error = "";
    if (overlay.contains(document.activeElement)) document.activeElement.blur();
  }

  picker.addEventListener("change", function () {
    upload(picker.files);
    picker.value = "";
  });
  overlay.addEventListener("dragover", function (e) {
    e.preventDefault();
    overlay.classList.add("drop");
  });
  overlay.addEventListener("dragleave", function (e) {
    if (!e.relatedTarget || !overlay.contains(e.relatedTarget)) overlay.classList.remove("drop");
  });
  overlay.addEventListener("drop", function (e) {
    e.preventDefault();
    overlay.classList.remove("drop");
    upload(e.dataTransfer.files);
  });
  overlay.addEventListener("pointerdown", function (e) {
    backdrop = e.target === overlay;
  });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay && backdrop) close();
  });
  overlay.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Escape") close();
  });
  overlay.addEventListener("keyup", function (e) { e.stopPropagation(); });

  function mount(root) {
    var host = root || document.querySelector(".runtime-overlay-root") || document.body;
    host.appendChild(overlay);
  }
  window.__XIAOCHAO_FILES_MOUNT__ = mount;
  mount();

  return { open: open };
})();

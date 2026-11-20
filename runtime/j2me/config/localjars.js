var LocalJars = (function () {
  var PREFIX = "local:";
  var db = null;

  function open() {
    if (db) return db;
    var opening = new Promise(function (resolve, reject) {
      var req = indexedDB.open("j2me-local", 2);
      req.onupgradeneeded = function () {
        var store = req.result.objectStoreNames.contains("jars")
          ? req.transaction.objectStore("jars")
          : req.result.createObjectStore("jars", { keyPath: "file" });
        store.createIndex("sourceId", "sourceId");
        store.createIndex("sha256", "sha256");
      };
      req.onsuccess = function () {
        var connection = req.result;
        if (db !== opening) {
          connection.close();
          return;
        }
        connection.onversionchange = function () {
          connection.close();
          if (db === opening) db = null;
        };
        resolve(connection);
      };
      req.onerror = function () {
        reject(req.error);
      };
      req.onblocked = function () {
        if (db === opening) db = null;
        reject(new Error("本机 JAR 存储正被其他页面占用，请关闭旧页面后重试"));
      };
    });
    db = opening;
    opening.catch(function () {
      if (db === opening) db = null;
    });
    return opening;
  }

  function run(mode, fn) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction("jars", mode);
        var req = fn(tx.objectStore("jars"));
        tx.oncomplete = function () {
          resolve(req && req.result);
        };
        tx.onerror = tx.onabort = function () {
          reject(tx.error);
        };
      });
    });
  }

  function u16(v, i) {
    return v.getUint16(i, true);
  }

  function u32(v, i) {
    return v.getUint32(i, true);
  }

  function entries(buf) {
    var v = new DataView(buf), end = -1, i;
    for (i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (u32(v, i) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error("not a zip");
    var out = {}, count = u16(v, end + 10), p = u32(v, end + 16);
    for (i = 0; i < count && u32(v, p) === 0x02014b50; i++) {
      var nameLen = u16(v, p + 28);
      var name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
      out[name] = { method: u16(v, p + 10), size: u32(v, p + 20), offset: u32(v, p + 42) };
      p += 46 + nameLen + u16(v, p + 30) + u16(v, p + 32);
    }
    return out;
  }

  function extract(buf, e) {
    var v = new DataView(buf);
    var start = e.offset + 30 + u16(v, e.offset + 26) + u16(v, e.offset + 28);
    var raw = new Uint8Array(buf, start, e.size);
    if (e.method === 0) return Promise.resolve(raw);
    var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  }

  function manifest(text) {
    var attrs = {};
    text.replace(/\r?\n /g, "").split(/\r?\n/).forEach(function (line) {
      var i = line.indexOf(":");
      if (i > 0) attrs[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return attrs;
  }

  function identity(info) {
    function normalized(value) {
      return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    }
    return JSON.stringify([normalized(info.suiteName || info.name || info.file.replace(/\.jar$/i, "")), normalized(info.vendor), normalized(info.version)]);
  }

  function describe(file, buf) {
    var list = entries(buf);
    var mf = list["META-INF/MANIFEST.MF"];
    if (!mf) return Promise.reject(new Error("no manifest"));
    return extract(buf, mf).then(function (bytes) {
      var attrs = manifest(new TextDecoder().decode(bytes));
      var midlet = (attrs["MIDlet-1"] || "").split(",");
      var iconPath = (attrs["MIDlet-Icon"] || (midlet.length > 2 ? midlet[1] : "")).trim().replace(/^\//, "");
      var info = {
        file: file,
        name: midlet[0].trim() || attrs["MIDlet-Name"] || file.replace(/\.jar$/i, ""),
        vendor: attrs["MIDlet-Vendor"] || "",
        suiteName: attrs["MIDlet-Name"] || midlet[0].trim(),
        version: attrs["MIDlet-Version"] || "",
        data: new Blob([buf]),
        icon: null
      };
      if (!iconPath || !list[iconPath]) return info;
      return extract(buf, list[iconPath]).then(function (img) {
        info.icon = new Blob([img], { type: "image/png" });
        return info;
      }, function () {
        return info;
      });
    });
  }

  async function add(file, meta) {
    var bytes = await file.arrayBuffer();
    var info = await describe(file.name, bytes);
    if (meta && meta.sourceId != null) info.sourceId = String(meta.sourceId);
    if (globalThis.crypto && globalThis.crypto.subtle) {
      var digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      info.sha256 = Array.from(new Uint8Array(digest), function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("");
    }

    var historical = new Map((await list()).map(function (record) {
      return [record.file, record];
    }));
    var duplicate = false;
    await run("readwrite", function (store) {
      var checks = [];
      if (info.sourceId) checks.push([store.index("sourceId"), info.sourceId]);
      if (info.sha256) checks.push([store.index("sha256"), info.sha256]);
      checks.push([store, info.file]);

      function check(index) {
        if (index === checks.length) {
          store.add(info);
          return;
        }
        var lookup = checks[index];
        var req = lookup[0].getKey(lookup[1]);
        req.onsuccess = function () {
          if (req.result !== undefined) duplicate = true;
          else check(index + 1);
        };
      }

      var existing = store.openCursor();
      existing.onsuccess = function () {
        var cursor = existing.result;
        if (!cursor) return check(0);
        var record = cursor.value;
        if (record.suiteName === undefined) record = historical.get(record.file) || record;
        if (identity(record) === identity(info)) {
          duplicate = true;
          return;
        }
        cursor.continue();
      };
    });
    if (duplicate) {
      var error = new Error("该游戏已安装过");
      error.code = "already_installed";
      throw error;
    }
    return info;
  }

  function storageId(jar) {
    // Keep non-ASCII names distinct: collapsing them to "_" makes different CJK jars share one RMS store.
    return encodeURIComponent(jar).replace(/%/g, "_").replace(/[^A-Za-z0-9._-]/g, "_");
  }

  function clearData(jar) {
    var prefix = "/RecordStore/" + storageId(jar);
    return new Promise(function (resolve) {
      var req = indexedDB.open("asyncStorage");
      req.onsuccess = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains("fs4")) {
          d.close();
          resolve();
          return;
        }
        var tx = d.transaction("fs4", "readwrite"), store = tx.objectStore("fs4");
        store.delete(prefix);
        store.delete(IDBKeyRange.bound(prefix + "/", prefix + "/\uffff"));
        tx.oncomplete = tx.onerror = tx.onabort = function () {
          d.close();
          resolve();
        };
      };
      req.onerror = function () {
        resolve();
      };
    });
  }

  function list() {
    return run("readonly", function (s) {
      return s.getAll();
    }).then(function (records) {
      return Promise.all(records.map(async function (record) {
        if (record.suiteName !== undefined || !record.data) return record;
        try {
          var parsed = await describe(record.file, await record.data.arrayBuffer());
          record.suiteName = parsed.suiteName;
          record.version = parsed.version;
        } catch (_) {}
        return record;
      }));
    });
  }

  return {
    PREFIX: PREFIX,
    storageId: storageId,
    clearData: clearData,
    isLocal: function (jar) {
      return jar.indexOf(PREFIX) === 0;
    },
    add: add,
    identity: identity,
    list: list,
    describe: describe,
    removeGroup: function (files) {
      return run("readwrite", function (store) {
        files.forEach(function (file) { store.delete(file); });
      });
    },
    remove: function (file) {
      return run("readwrite", function (s) {
        return s.delete(file);
      });
    },
    load: function (jar) {
      return run("readonly", function (s) {
        return s.get(jar.slice(PREFIX.length));
      }).then(function (info) {
        if (!info) throw new Error(jar + " not found");
        return info.data.arrayBuffer();
      });
    }
  };
})();

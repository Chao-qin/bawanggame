var LANG = navigator.language || "";
var RU = /^(ru|uk|be|kk)\b/i.test(LANG);
var ZH = /^zh\b/i.test(LANG);

function tr(ru, en, zh) {
  return ZH && zh != null ? zh : RU ? ru : en;
}

document.documentElement.lang = ZH ? "zh" : RU ? "ru" : "en";
document.addEventListener("DOMContentLoaded", function () {
  if (RU) return;
  document.querySelectorAll("[data-en]").forEach(function (e) {
    e.textContent = ZH && e.dataset.zh ? e.dataset.zh : e.dataset.en;
  });
  document.querySelectorAll("[data-en-title]").forEach(function (e) {
    e.title = ZH && e.dataset.zhTitle ? e.dataset.zhTitle : e.dataset.enTitle;
  });
});

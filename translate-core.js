/* =====================================================================
   translate-core.js  -  shared translation engine for Rise code blocks
   ---------------------------------------------------------------------
   One shared file, loaded by every code block through a single script
   tag from the CDN. Change the engine here once and every block that
   loads this file switches with it. You never open the blocks.

   WHAT IT DOES
     - Reads the course language: from the parent course page when
       embedded, or from its own small selector when standalone.
     - Translates all learner-facing text in the block: HTML text,
       SVG <text>/<tspan>, and attributes (aria-label, title, alt,
       placeholder).
     - Catches content revealed later (click to open) with an observer.
     - Caches each phrase so it is fetched once per language.
     - Preserves anything marked data-notranslate, plus the KEEP list.

   ENGINE SWAP -> see the [ENGINE] section. One constant changes it for
   every block in the course.
   ===================================================================== */
(function () {
  "use strict";

  // Mark this document so a course-level bar (risecoursetranslate.js) knows
  // this block manages its own translation, and skips walking its insides.
  try { document.documentElement.setAttribute("data-tc-managed", "1"); } catch (e) {}

  /* ---------------------------- [CONFIG] ---------------------------- */
  var ENGINE = "google";                 // "google" or "deepl"
  var ATTRS  = ["aria-label", "title", "alt", "placeholder"];
  var KEEP   = ["TM Forum", "ODA", "AN", "SLA"];
  var LANGS  = [
    { code: "en", name: "English" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "es", name: "Spanish" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" }
  ];

  /* ---------------------------- [ENGINE] ----------------------------
     The one place to change the provider. Every block using this file
     picks up whatever is set here.
     ------------------------------------------------------------------ */
  function translateText(text, target) {
    if (ENGINE === "deepl") return deeplTranslate(text, target);
    return googleTranslate(text, target);
  }

  function googleTranslate(text, target) {
    var url = "https://translate.googleapis.com/translate_a/single"
      + "?client=gtx&sl=auto&tl=" + encodeURIComponent(target)
      + "&dt=t&q=" + encodeURIComponent(text);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("google " + r.status);
      return r.json();
    }).then(function (d) {
      return d[0].map(function (seg) { return seg[0]; }).join("");
    });
  }

  // Production: replace the body with a fetch to your DeepL proxy so the
  // API key stays server-side. Kept as a visible stub so the engine swap
  // is demonstrable before the proxy exists.
  function deeplTranslate(text, target) {
    return Promise.resolve("\u00BB " + text);   // marker shows the swap took effect
  }

  /* ---------------------------- state ------------------------------- */
  var root = null;
  var cache = {};                    // key: lang|source -> translation
  var originalText = new WeakMap();  // text node -> original value
  var originalAttr = new WeakMap();  // element -> { attr: original value }
  var currentLang = "en";
  var lastApplied = null;
  var translating = false;
  var rerunQueued = false;
  var parentControls = false;

  /* ---------------------------- [OBSERVE] --------------------------- */
  var observer = new MutationObserver(function () {
    if (currentLang === "en") return;
    if (translating) { rerunQueued = true; return; }
    clearTimeout(observer._t);
    observer._t = setTimeout(function () { applyLanguage(currentLang); }, 250);
  });

  /* ---------------------------- [REACH] ----------------------------- */
  function collectTextNodes() {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.tagName.toLowerCase();
        if (tag === "script" || tag === "style") return NodeFilter.FILTER_REJECT;
        if (p.closest("[data-notranslate]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var out = [], n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function collectAttrTargets() {
    var out = [];
    root.querySelectorAll("*").forEach(function (el) {
      if (el.closest("[data-notranslate]")) return;
      ATTRS.forEach(function (a) {
        if (el.hasAttribute(a) && el.getAttribute(a).trim()) out.push({ el: el, attr: a });
      });
    });
    return out;
  }

  /* ---------------------------- [APPLY] ----------------------------- */
  function lookup(src, lang) {
    var key = lang + "|" + src;
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return Promise.resolve({ value: cache[key], cached: true });
    }
    if (KEEP.indexOf(src) !== -1) {
      cache[key] = src;
      return Promise.resolve({ value: src, cached: false });
    }
    return translateText(src, lang).then(function (out) {
      cache[key] = out;
      return { value: out, cached: false };
    });
  }

  async function applyLanguage(lang) {
    if (!root) return;
    translating = true;
    var count = 0;
    try {
      var nodes = collectTextNodes();
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (!originalText.has(node)) originalText.set(node, node.nodeValue);
        var original = originalText.get(node);
        var src = original.trim();
        var r = await lookup(src, lang);
        node.nodeValue = original.replace(src, r.value);
        count++;
        setStatus("translating... " + count);
      }
      var attrs = collectAttrTargets();
      for (var j = 0; j < attrs.length; j++) {
        var t = attrs[j];
        if (!originalAttr.has(t.el)) originalAttr.set(t.el, {});
        var store = originalAttr.get(t.el);
        if (store[t.attr] === undefined) store[t.attr] = t.el.getAttribute(t.attr);
        var asrc = store[t.attr].trim();
        var ar = await lookup(asrc, lang);
        t.el.setAttribute(t.attr, ar.value);
      }
      setStatus(LANGS.filter(function (l) { return l.code === lang; }).map(function (l) { return l.name; })[0] || lang);
    } finally {
      translating = false;
      if (rerunQueued) {
        rerunQueued = false;
        clearTimeout(observer._t);
        observer._t = setTimeout(function () { applyLanguage(currentLang); }, 50);
      }
    }
  }

  function resetAll() {
    if (!root) return;
    translating = true;
    try {
      collectAttrTargets().forEach(function (t) {
        if (originalAttr.has(t.el)) {
          var store = originalAttr.get(t.el);
          if (store[t.attr] !== undefined) t.el.setAttribute(t.attr, store[t.attr]);
        }
      });
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        if (originalText.has(n)) n.nodeValue = originalText.get(n);
      }
      setStatus("English");
    } finally {
      translating = false;
    }
  }

  /* ---------------------- language selection ------------------------ */
  function setLang(lang) {
    currentLang = lang || "en";
    var sel = document.getElementById("tc-lang");
    if (sel && sel.value !== currentLang) sel.value = currentLang;
    if (currentLang === lastApplied) return;   // already showing this language
    lastApplied = currentLang;
    if (currentLang === "en") { resetAll(); return; }
    applyLanguage(currentLang).catch(function (e) {
      lastApplied = null;   // allow a retry after a failure
      setStatus("error: " + e.message + " (endpoint blocked or rate limited)");
    });
  }

  // Parent course page (the one-liner bar) drives the block.
  var gotLang = false;
  window.addEventListener("message", function (ev) {
    var d = ev.data || {};
    if (d.type === "rise-lang" && typeof d.lang === "string") {
      gotLang = true;
      parentControls = true;
      hideOwnSelector();
      setLang(d.lang);
    }
  });

  // Announce readiness to the course bar so it sends the current language.
  // Post to window.top so it arrives no matter how deeply Rise nests this
  // block, and retry until the bar answers, which covers blocks that mount
  // after the bar (Rise builds lessons on demand).
  function announceReady() {
    if (gotLang) return;
    try { (window.top || window.parent).postMessage({ type: "rise-ready" }, "*"); } catch (e) {}
  }
  if (window.parent && window.parent !== window) {
    announceReady();
    setTimeout(announceReady, 400);
    setTimeout(announceReady, 1200);
    setTimeout(announceReady, 3000);
  }

  /* ---------------------- own selector (standalone) ----------------- */
  function buildSelector() {
    var bar = document.createElement("div");
    bar.id = "tc-bar";
    bar.setAttribute("data-notranslate", "");
    bar.style.cssText = "font:14px Aptos,'Segoe UI',Arial,sans-serif;margin:0 0 14px;display:flex;gap:8px;align-items:center;color:#0D0B4D;";
    var label = document.createElement("label");
    label.textContent = "Language";
    label.setAttribute("for", "tc-lang");
    var sel = document.createElement("select");
    sel.id = "tc-lang";
    sel.style.cssText = "font:14px Aptos,'Segoe UI',Arial,sans-serif;padding:6px 10px;border:1px solid #E6E6EE;border-radius:8px;";
    LANGS.forEach(function (l) {
      var o = document.createElement("option");
      o.value = l.code; o.textContent = l.name; sel.appendChild(o);
    });
    sel.addEventListener("change", function () { setLang(sel.value); });
    var status = document.createElement("span");
    status.id = "tc-status";
    status.style.cssText = "color:#545A6E;font-size:12px;";
    bar.appendChild(label); bar.appendChild(sel); bar.appendChild(status);
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function hideOwnSelector() { var b = document.getElementById("tc-bar"); if (b) b.style.display = "none"; }
  function setStatus(m) { var s = document.getElementById("tc-status"); if (s) s.textContent = m; }

  /* ---------------------------- init -------------------------------- */
  function init() {
    root = document.body;
    buildSelector();
    observer.observe(root, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

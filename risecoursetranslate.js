/*!
 * risecoursetranslate.js — Rise & Storyline Course Translator
 * Drop-in (one line in index.html + copy Translation Glossary.csv into course folder):
 * <script src="https://cdn.jsdelivr.net/gh/Moyour/risecoursetranslate@main/risecoursetranslate.js" data-glossary="Translation Glossary.csv" defer></script>
 * v1.8.9 — CSV only: embedded glossary in index.html via Update Glossary (no .js files)
 */
(function () {
  'use strict';
  /* CODE-BLOCK-AWARE BUILD
     Additive changes only, safe to adopt:
       1. Broadcasts the chosen language to code-block iframes (postMessage
          type 'rise-lang'), on translate and on reset.
       2. Answers a block's 'rise-ready' message with the current language,
          so late-loading blocks catch up.
       3. Skips translating the insides of self-managed blocks, marked with
          data-tc-managed, so the bar and the block do not double-handle.
     Everything else is unchanged. Blocks without translate-core behave
     exactly as before. */

  if (window.__riseTranslateLoaded) return;
  window.__riseTranslateLoaded = true;
  window.__riseTranslateVersion = '1.8.9';
  var scriptElRef = document.currentScript;
  var GLOSSARY_FETCH_FILES = ['Translation Glossary.csv', 'glossary.csv'];

  var LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'af', label: 'Afrikaans' },
    { code: 'ar', label: 'Arabic', rtl: true },
    { code: 'zh', label: 'Chinese (Simplified)' },
    { code: 'zh-TW', label: 'Chinese (Traditional)' },
    { code: 'hr', label: 'Croatian' },
    { code: 'cs', label: 'Czech' },
    { code: 'da', label: 'Danish' },
    { code: 'nl', label: 'Dutch' },
    { code: 'fi', label: 'Finnish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'el', label: 'Greek' },
    { code: 'gu', label: 'Gujarati' },
    { code: 'ha', label: 'Hausa' },
    { code: 'hi', label: 'Hindi' },
    { code: 'hu', label: 'Hungarian' },
    { code: 'id', label: 'Indonesian' },
    { code: 'it', label: 'Italian' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'ms', label: 'Malay' },
    { code: 'mr', label: 'Marathi' },
    { code: 'ne', label: 'Nepali' },
    { code: 'no', label: 'Norwegian' },
    { code: 'fa', label: 'Persian', rtl: true },
    { code: 'pl', label: 'Polish' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'pa', label: 'Punjabi' },
    { code: 'ro', label: 'Romanian' },
    { code: 'ru', label: 'Russian' },
    { code: 'so', label: 'Somali' },
    { code: 'es', label: 'Spanish' },
    { code: 'sw', label: 'Swahili' },
    { code: 'sv', label: 'Swedish' },
    { code: 'tl', label: 'Tagalog' },
    { code: 'ta', label: 'Tamil' },
    { code: 'te', label: 'Telugu' },
    { code: 'th', label: 'Thai' },
    { code: 'tr', label: 'Turkish' },
    { code: 'uk', label: 'Ukrainian' },
    { code: 'ur', label: 'Urdu', rtl: true },
    { code: 'vi', label: 'Vietnamese' },
    { code: 'cy', label: 'Welsh' },
    { code: 'yo', label: 'Yoruba' },
    { code: 'zu', label: 'Zulu' }
  ];

  var STORAGE_KEY       = 'rise_course_lang';
  var BAR_ID            = 'rise-translate-bar';
  var START_SELECTORS   = [
    'a.cover__header-content-action-link',
    '.cover__header-content-action-link',
    'button.cover__header-content-action-link',
    '[class*="cover"][class*="action-link"]'
  ];
  var cache             = {};
  var originalMap       = new Map();
  var isObserving       = false;
  var observer          = null;
  var activeTranslation = null;
  var panelOpen         = false;
  var focusTimer        = null;
  var placementReady    = false;
  var barRef            = null;
  var placeBarPending   = false;
  var panelWrapRef      = null;
  var BLOCK_SEL         = 'h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,figcaption,dt,dd,button,a,label,span,[class*="blocks-"]';
  var glossary          = { keep: [], overrides: {} };

  /* ── STYLES ─────────────────────────────────────────────────────── */
  var css = [
    '#' + BAR_ID + '{',
    '  display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px 12px;',
    '  box-sizing:border-box;padding:0;',
    '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;',
    '  color:inherit;',
    '}',
    '#' + BAR_ID + '.rise-translate-bar--cover{',
    '  display:flex;flex-direction:column;align-items:stretch;gap:10px;',
    '  width:100%;max-width:320px;margin:16px auto 0;padding:0;',
    '}',
    '#' + BAR_ID + '.rise-translate-bar--cover .rt-wrap{width:100%;}',
    '#' + BAR_ID + '.rise-translate-bar--cover .rt-trigger{width:100%;min-width:0;}',
    '#' + BAR_ID + '.rise-translate-bar--floating{',
    '  position:fixed;bottom:16px;right:16px;left:auto;top:auto;z-index:2147483647;',
    '  width:auto;max-width:calc(100vw - 32px);margin-top:0;padding:10px 14px;',
    '  background:rgba(30,30,46,.94);color:#fff;border-radius:12px;',
    '  box-shadow:0 4px 20px rgba(0,0,0,.35);justify-content:flex-start;',
    '}',
    '#' + BAR_ID + ' .rt-wrap{position:relative;}',
    '#' + BAR_ID + ' .rt-trigger{',
    '  display:flex;align-items:center;gap:8px;',
    '  background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.15);',
    '  color:#222;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;',
    '  min-width:180px;justify-content:space-between;user-select:none;',
    '}',
    '#' + BAR_ID + ' .rt-trigger:hover{border-color:rgba(0,0,0,.3);box-shadow:0 0 0 2px rgba(0,0,0,.06);}',
    '#' + BAR_ID + '.rise-translate-bar--floating .rt-trigger{',
    '  background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;',
    '}',
    '#' + BAR_ID + '.rise-translate-bar--floating .rt-trigger:hover{background:rgba(255,255,255,.18);box-shadow:none;}',
    '#' + BAR_ID + ' .rt-caret{font-size:10px;opacity:.6;transition:transform .2s;display:inline-block;}',
    '#' + BAR_ID + ' .rt-panel{',
    '  visibility:hidden;opacity:0;',
    '  position:absolute;left:0;width:240px;overflow:hidden;',
    '  background:#fff;border:1px solid rgba(0,0,0,.12);color:#222;',
    '  border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:2147483647;',
    '  pointer-events:none;',
    '}',
    '#' + BAR_ID + ' .rt-panel.rt-panel--down{top:calc(100% + 6px);bottom:auto;}',
    '#' + BAR_ID + ' .rt-panel.rt-panel--up{bottom:calc(100% + 6px);top:auto;}',
    '#' + BAR_ID + ' .rt-panel.rt-open{visibility:visible;opacity:1;pointer-events:all;transition:opacity .15s;}',
    '#' + BAR_ID + '.rise-translate-bar--floating .rt-panel{',
    '  background:#1e1e2e;border:1px solid rgba(255,255,255,.2);color:#fff;',
    '  box-shadow:0 8px 24px rgba(0,0,0,.5);',
    '}',
    '#' + BAR_ID + ' .rt-search{',
    '  width:100%;box-sizing:border-box;padding:10px 12px;',
    '  background:transparent;border:none;border-bottom:1px solid rgba(0,0,0,.08);',
    '  color:inherit;font-size:13px;outline:none;',
    '}',
    '#' + BAR_ID + '.rise-translate-bar--floating .rt-search{',
    '  background:rgba(255,255,255,.08);border-bottom-color:rgba(255,255,255,.1);color:#fff;',
    '}',
    '#' + BAR_ID + ' .rt-search::placeholder{opacity:.45;}',
    '#' + BAR_ID + ' .rt-list{max-height:260px;overflow-y:auto;padding:4px 0;}',
    '#' + BAR_ID + ' .rt-list::-webkit-scrollbar{width:4px;}',
    '#' + BAR_ID + ' .rt-list::-webkit-scrollbar-thumb{background:rgba(127,127,127,.35);border-radius:4px;}',
    '#' + BAR_ID + ' .rt-option{',
    '  padding:9px 14px;cursor:pointer;font-size:13px;opacity:.85;',
    '}',
    '#' + BAR_ID + ' .rt-option:hover{background:rgba(0,0,0,.06);}',
    '#' + BAR_ID + '.rise-translate-bar--floating .rt-option:hover{background:rgba(255,255,255,.1);}',
    '#' + BAR_ID + ' .rt-option.rt-selected{font-weight:500;opacity:1;background:rgba(0,0,0,.08);}',
    '#' + BAR_ID + '.rise-translate-bar--floating .rt-option.rt-selected{background:rgba(255,255,255,.12);color:#fff;}',
    '#' + BAR_ID + ' .rt-option.rt-hidden{display:none;}',
    '#' + BAR_ID + ' .rt-reset{',
    '  background:transparent;border:1px solid rgba(127,127,127,.35);',
    '  border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap;color:inherit;',
    '}',
    '#' + BAR_ID + ' .rt-reset:hover{opacity:1;}',
    '#' + BAR_ID + '.rise-translate-bar--floating .rt-reset,',
    '#' + BAR_ID + '.rise-translate-bar--cover .rt-reset{',
    '  opacity:1;border:1px solid #fff;color:#fff;',
    '}',
    '#' + BAR_ID + '.rise-translate-bar--floating .rt-reset:hover,',
    '#' + BAR_ID + '.rise-translate-bar--cover .rt-reset:hover{',
    '  background:rgba(255,255,255,.12);border-color:#fff;color:#fff;',
    '}',
    '#' + BAR_ID + ' .rt-spinner{',
    '  width:14px;height:14px;border:2px solid rgba(127,127,127,.3);',
    '  border-top-color:currentColor;border-radius:50%;flex-shrink:0;',
    '  animation:rt-spin .6s linear infinite;display:none;',
    '}',
    '#' + BAR_ID + '.rise-translate-bar--floating .rt-spinner{',
    '  border-color:rgba(255,255,255,.25);border-top-color:#fff;',
    '}',
    /* portaled panel (moved to body while open — escapes Rise overflow clipping) */
    '.rt-panel.rt-panel--portaled{',
    '  visibility:hidden;opacity:0;position:fixed;width:240px;overflow:hidden;',
    '  background:#fff;border:1px solid rgba(0,0,0,.12);color:#222;',
    '  border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);',
    '  z-index:2147483647;pointer-events:none;',
    '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;',
    '}',
    '.rt-panel.rt-panel--portaled.rt-open{visibility:visible;opacity:1;pointer-events:all;}',
    '.rt-panel.rt-panel--portaled.rt-panel--dark{',
    '  background:#1e1e2e;border-color:rgba(255,255,255,.2);color:#fff;',
    '  box-shadow:0 8px 24px rgba(0,0,0,.5);',
    '}',
    '.rt-panel.rt-panel--portaled .rt-search{',
    '  width:100%;box-sizing:border-box;padding:10px 12px;',
    '  background:transparent;border:none;border-bottom:1px solid rgba(0,0,0,.08);',
    '  color:inherit;font-size:13px;outline:none;',
    '}',
    '.rt-panel.rt-panel--portaled.rt-panel--dark .rt-search{',
    '  background:rgba(255,255,255,.08);border-bottom-color:rgba(255,255,255,.1);color:#fff;',
    '}',
    '.rt-panel.rt-panel--portaled .rt-option{padding:9px 14px;cursor:pointer;opacity:.85;}',
    '.rt-panel.rt-panel--portaled .rt-option:hover{background:rgba(0,0,0,.06);}',
    '.rt-panel.rt-panel--portaled.rt-panel--dark .rt-option:hover{background:rgba(255,255,255,.1);}',
    '.rt-panel.rt-panel--portaled .rt-option.rt-selected{font-weight:500;opacity:1;background:rgba(0,0,0,.08);}',
    '.rt-panel.rt-panel--portaled.rt-panel--dark .rt-option.rt-selected{background:rgba(255,255,255,.12);color:#fff;}',
    '.rt-panel.rt-panel--portaled .rt-list{max-height:260px;overflow-y:auto;padding:4px 0;}',
    '@keyframes rt-spin{to{transform:rotate(360deg)}}'
  ].join('\n');

  /* ── INIT ──────────────────────────────────────────────────────── */
  function init() {
    // Keep code blocks in sync as Rise mounts them on scroll and on lesson
    // change. A block ignores a repeat of the language it already shows, so
    // this stays cheap.
    setInterval(function () {
      broadcastLangToBlocks(activeTranslation || getSavedLang() || 'en');
    }, 1500);
    injectStyles();
    loadGlossary(function () {
      if (!document.getElementById(BAR_ID)) injectBar();
      waitForCourseShell(function () {
        placeBar();
        scheduleCoverPlacementRetries();
        var saved = getSavedLang();
        if (saved) {
          setTriggerLabel(saved);
          translatePage(saved);
        }
        initObserver();
      });
      initPlacementObserver();
    });
  }

  function injectStyles() {
    if (document.getElementById('rise-translate-styles')) return;
    var s = document.createElement('style');
    s.id = 'rise-translate-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── BAR ────────────────────────────────────────────────────────── */
  function injectBar() {
    if (barRef) return barRef;
    var existing = document.getElementById(BAR_ID);
    if (existing) { barRef = existing; return barRef; }

    var bar = document.createElement('div');
    bar.id = BAR_ID;

    /* wrap holds trigger + panel */
    var wrap = document.createElement('div');
    wrap.className = 'rt-wrap';

    /* trigger button */
    var trigger = document.createElement('button');
    trigger.className = 'rt-trigger';
    trigger.type = 'button';
    trigger.innerHTML = '<span class="rt-trigger-text">English</span><span class="rt-caret">▼</span>';

    /* panel */
    var panel = document.createElement('div');
    panel.className = 'rt-panel rt-panel--down';

    /* search input inside panel */
    var search = document.createElement('input');
    search.className = 'rt-search';
    search.type = 'text';
    search.placeholder = 'Search language…';
    search.setAttribute('autocomplete', 'off');

    /* language list */
    var list = document.createElement('div');
    list.className = 'rt-list';

    LANGUAGES.forEach(function (lang) {
      var opt = document.createElement('div');
      opt.className = 'rt-option';
      opt.textContent = lang.label;
      opt.setAttribute('data-code', lang.code);
      opt.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        selectLanguage(lang.code, list);
      });
      list.appendChild(opt);
    });

    search.addEventListener('input', function () {
      var q = this.value.toLowerCase();
      list.querySelectorAll('.rt-option').forEach(function (o) {
        o.classList.toggle('rt-hidden', o.textContent.toLowerCase().indexOf(q) === -1);
      });
    });

    function togglePanel(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (panelOpen) {
        closePanel(trigger, panel);
      } else {
        openPanel(trigger, panel, search);
      }
    }

    trigger.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
    trigger.addEventListener('click', togglePanel);

    list.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    list.addEventListener('click', function (e) { e.stopPropagation(); });
    search.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    search.addEventListener('click', function (e) { e.stopPropagation(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panelOpen) closePanel(trigger, panel);
    });

    setTimeout(function () {
      document.addEventListener('mouseup', function (e) {
        var node = e.target;
        var path, i;
        if (!panelOpen) return;
        if (bar.contains(node) || panel.contains(node)) return;
        if (e.composedPath) {
          path = e.composedPath();
          for (i = 0; i < path.length; i++) {
            if (path[i] === bar || path[i] === panel || path[i] === trigger) return;
          }
        }
        closePanel(trigger, panel);
      });
    }, 0);

    window.addEventListener('scroll', function () {
      if (panelOpen) positionPortaledPanel(trigger, panel);
    }, true);
    window.addEventListener('resize', function () {
      if (panelOpen) positionPortaledPanel(trigger, panel);
    });

    panel.appendChild(search);
    panel.appendChild(list);
    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    /* spinner */
    var spinner = document.createElement('div');
    spinner.className = 'rt-spinner';

    /* reset button */
    var resetBtn = document.createElement('button');
    resetBtn.className = 'rt-reset';
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset';
    resetBtn.style.display = 'none';
    resetBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      restorePage();
      clearSavedLang();
      activeTranslation = null;
      broadcastLangToBlocks('en');
      setTriggerLabel(null);
      resetBtn.style.display = 'none';
      list.querySelectorAll('.rt-option').forEach(function (o) { o.classList.remove('rt-selected'); });
    });

    bar.appendChild(wrap);
    bar.appendChild(spinner);
    bar.appendChild(resetBtn);

    bar._trigger = trigger;
    bar._panel   = panel;
    bar._wrap    = wrap;
    bar._spinner = spinner;
    bar._reset   = resetBtn;
    bar._list    = list;
    barRef = bar;
    panelWrapRef = wrap;
    return bar;
  }

  function positionPortaledPanel(trigger, panel) {
    var bar, r, w, h, top, openUp;
    if (!trigger || !panel || !panel.classList.contains('rt-panel--portaled')) return;
    bar = barRef;
    r = trigger.getBoundingClientRect();
    w = Math.max(Math.round(r.width), 240);
    panel.style.position = 'fixed';
    panel.style.width = w + 'px';
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    panel.style.bottom = 'auto';
    h = panel.offsetHeight || 300;
    openUp = bar && bar.classList.contains('rise-translate-bar--floating');
    if (!openUp && r.bottom + h + 8 > window.innerHeight && r.top > h + 8) openUp = true;
    top = openUp ? r.top - h - 6 : r.bottom + 6;
    panel.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
  }

  function portalPanel(bar, wrap, trigger, panel) {
    var dark = bar.classList.contains('rise-translate-bar--floating');
    panel.classList.add('rt-panel--portaled');
    panel.classList.toggle('rt-panel--dark', dark);
    document.body.appendChild(panel);
    positionPortaledPanel(trigger, panel);
  }

  function unportalPanel(wrap, panel) {
    panel.classList.remove('rt-panel--portaled', 'rt-panel--dark');
    panel.style.top = '';
    panel.style.left = '';
    panel.style.width = '';
    panel.style.bottom = '';
    panel.style.position = '';
    if (wrap && panel.parentElement !== wrap) wrap.appendChild(panel);
  }

  function isPanelOpen() {
    return panelOpen;
  }

  function isBarPlacedOnCover(startBtn, bar) {
    var container;
    if (!startBtn || !bar) return false;
    if (startBtn.nextElementSibling === bar) return true;
    container = startBtn.closest('.cover__header-content, [class*="cover__header"]');
    return !!(container && container.contains(bar));
  }

  function schedulePlaceBar() {
    if (isPanelOpen()) {
      placeBarPending = true;
      return;
    }
    placeBar();
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findStartButton() {
    var i, el, candidates, txt, j, cover;
    cover = document.querySelector('#app .cover, .cover, [class*="cover-page"]');
    if (cover) {
      for (i = 0; i < START_SELECTORS.length; i++) {
        el = cover.querySelector(START_SELECTORS[i]);
        if (el && isVisible(el)) return el;
      }
    }
    for (i = 0; i < START_SELECTORS.length; i++) {
      el = document.querySelector(START_SELECTORS[i]);
      if (el && isVisible(el)) return el;
    }
    candidates = document.querySelectorAll('a, button');
    for (j = 0; j < candidates.length; j++) {
      txt = (candidates[j].textContent || '').trim().toLowerCase();
      if (/^(start|begin|resume|continue)(\s+(course|lesson))?$/i.test(txt) && isVisible(candidates[j])) {
        return candidates[j];
      }
    }
    return null;
  }

  function scheduleCoverPlacementRetries() {
    var attempts = 0;
    var timer = setInterval(function () {
      var bar = barRef;
      var startBtn = findStartButton();
      var placed = bar && (startBtn
        ? isBarPlacedOnCover(startBtn, bar)
        : bar.parentElement === document.body);
      if (!placed) schedulePlaceBar();
      attempts++;
      if (placed || attempts >= 30) clearInterval(timer);
    }, 400);
  }

  function waitForCourseShell(done) {
    var finished = false;
    var shellObserver = null;
    function finish() {
      if (finished) return;
      finished = true;
      if (shellObserver) shellObserver.disconnect();
      done();
    }
    if (findStartButton()) {
      finish();
      return;
    }
    shellObserver = new MutationObserver(function () {
      if (findStartButton()) finish();
    });
    shellObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(finish, 15000);
  }

  function placeBar() {
    var bar = barRef || document.getElementById(BAR_ID);
    if (!bar) return;
    if (isPanelOpen()) {
      placeBarPending = true;
      return;
    }

    var panel   = bar._panel   || bar.querySelector('.rt-panel');
    var startBtn = findStartButton();
    var needsMove = false;
    var needsModeSwitch = false;

    if (startBtn) {
      needsMove = !isBarPlacedOnCover(startBtn, bar);
      needsModeSwitch = bar.classList.contains('rise-translate-bar--floating');
      if (!needsMove && !needsModeSwitch) return;
      bar.classList.remove('rise-translate-bar--floating');
      bar.classList.add('rise-translate-bar--cover');
      if (panel) {
        panel.classList.remove('rt-panel--up');
        panel.classList.add('rt-panel--down');
      }
      if (needsMove) startBtn.insertAdjacentElement('afterend', bar);
      return;
    }

    needsMove = bar.parentElement !== document.body;
    needsModeSwitch = bar.classList.contains('rise-translate-bar--cover');
    if (!needsMove && !needsModeSwitch) return;
    bar.classList.remove('rise-translate-bar--cover');
    bar.classList.add('rise-translate-bar--floating');
    if (panel) {
      panel.classList.remove('rt-panel--down');
      panel.classList.add('rt-panel--up');
    }
    if (needsMove) document.body.appendChild(bar);
  }

  function initPlacementObserver() {
    if (placementReady) return;
    placementReady = true;

    window.addEventListener('hashchange', function () {
      schedulePlaceBar();
      if (activeTranslation) setTimeout(function () { translatePage(activeTranslation); }, 400);
    });

    var placementObserver = new MutationObserver(function (mutations) {
      if (isPanelOpen()) return;
      var relevant = mutations.some(function (m) {
        var t = m.target;
        if (t && t.closest && (t.closest('#' + BAR_ID) || t.closest('.rt-panel'))) return false;
        return true;
      });
      if (!relevant) return;
      clearTimeout(placementObserver._t);
      placementObserver._t = setTimeout(schedulePlaceBar, 300);
    });
    placementObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
    });
  }

  function openPanel(trigger, panel, search) {
    var bar = barRef;
    var wrap = (bar && bar._wrap) || panelWrapRef;
    if (panelOpen) return;
    if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
    panelOpen = true;
    panel.classList.add('rt-open');
    trigger.querySelector('.rt-caret').style.transform = 'rotate(180deg)';
    search.value = '';
    panel.querySelectorAll('.rt-option').forEach(function (o) { o.classList.remove('rt-hidden'); });
    if (bar && wrap) portalPanel(bar, wrap, trigger, panel);
    focusTimer = setTimeout(function () {
      focusTimer = null;
      if (panelOpen) {
        positionPortaledPanel(trigger, panel);
        search.focus({ preventScroll: true });
      }
    }, 50);
  }

  function closePanel(trigger, panel) {
    var wrap = (barRef && barRef._wrap) || panelWrapRef;
    if (!panelOpen) return;
    if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
    panelOpen = false;
    panel.classList.remove('rt-open');
    trigger.querySelector('.rt-caret').style.transform = '';
    unportalPanel(wrap, panel);
    var search = panel.querySelector('.rt-search');
    if (search && document.activeElement === search) search.blur();
    if (placeBarPending) {
      placeBarPending = false;
      setTimeout(placeBar, 0);
    }
  }

  function setTriggerLabel(code) {
    var bar = document.getElementById(BAR_ID);
    if (!bar) return;
    var txt = bar.querySelector('.rt-trigger-text');
    if (!txt) return;
    if (!code) { txt.textContent = 'English'; return; }
    var lang = LANGUAGES.find(function (l) { return l.code === code; });
    txt.textContent = lang ? lang.label : code;
  }

  function selectLanguage(code, list) {
    var bar = barRef || document.getElementById(BAR_ID);
    if (!bar) return;
    setTriggerLabel(code);
    list.querySelectorAll('.rt-option').forEach(function (o) {
      o.classList.toggle('rt-selected', o.getAttribute('data-code') === code);
    });
    if (bar._trigger && bar._panel) closePanel(bar._trigger, bar._panel);
    if (code === 'en') {
      // English is the source language: restore the original text and tell the
      // code blocks to reset, rather than sending English through translation.
      restorePage();
      clearSavedLang();
      activeTranslation = 'en';
      broadcastLangToBlocks('en');
      if (bar._reset) bar._reset.style.display = 'none';
      return;
    }
    saveLang(code);
    activeTranslation = code;
    translatePage(code, bar._spinner, null, bar._reset);
  }

  /* ── GLOSSARY ────────────────────────────────────────────────────── */
  function getScriptEl() {
    return scriptElRef
      || document.querySelector('script[data-glossary],script[data-glossary-url],script[data-glossary-element],script[src*="risecoursetranslate"],script[src*="Glossary"],script[src*="glossary"]');
  }

  function getPageBaseUrl() {
    var path = window.location.pathname || '/';
    if (path.slice(-1) === '/') return window.location.origin + path;
    var slash = path.lastIndexOf('/');
    if (slash === -1) return window.location.origin + '/';
    return window.location.origin + path.slice(0, slash + 1);
  }

  function getGlossaryCandidateUrls(path) {
    var urls = [];
    var base = getPageBaseUrl();
    var script = getScriptEl();
    var clean = path.replace(/^\.\//, '');
    function add(u) {
      if (u && urls.indexOf(u) === -1) urls.push(u);
    }
    try { add(new URL(clean, base).href); } catch (e) { add(clean); }
    try { add(new URL(clean, window.location.href).href); } catch (e) {}
    try { add(new URL('./' + clean, base).href); } catch (e) {}
    if (script && script.src) {
      try { add(new URL(clean, script.src).href); } catch (e) {}
    }
    return urls;
  }

  function getInlineGlossaryText() {
    var el, script, elId, prev, b64;
    if (window.__riseGlossaryCsv) return window.__riseGlossaryCsv;
    el = document.getElementById('rise-glossary');
    if (el) return el.textContent;
    script = getScriptEl();
    if (!script) return null;
    b64 = script.getAttribute('data-glossary-inline');
    if (b64) {
      try { return atob(b64); } catch (e) {}
    }
    elId = script.getAttribute('data-glossary-element');
    if (elId) {
      el = document.getElementById(elId);
      if (el) return el.textContent;
    }
    prev = script.previousElementSibling;
    if (prev && prev.getAttribute('data-rise-glossary') !== null) {
      return prev.textContent;
    }
    return null;
  }

  function extractCsvFromGlossaryJs(text) {
    var m = text.match(/window\.__riseGlossaryCsv\s*=\s*("(?:\\.|[^"\\])*")\s*;?/);
    if (m) return JSON.parse(m[1]);
    throw new Error('Invalid glossary .js file');
  }

  function applyGlossaryFromText(text, source, done) {
    var trimmed = text.trim();
    var csvText = text;
    try {
      /* Only parse as .js when content is a JS file, not when __riseGlossaryCsv is already plain CSV */
      if (/window\.__riseGlossaryCsv\s*=/.test(text)) {
        csvText = extractCsvFromGlossaryJs(text);
        trimmed = csvText.trim();
      }
      if (/\.json$/i.test(source) || trimmed.charAt(0) === '{') {
        glossary = normalizeGlossary(JSON.parse(trimmed));
      } else {
        glossary = parseGlossaryCSV(csvText);
      }
      if (!glossary.keep.length) {
        throw new Error('No terms found in glossary');
      }
      console.info('[risecoursetranslate] Glossary loaded:', glossary.keep.length, 'protected term(s) from', source);
      window.__riseGlossaryCount = glossary.keep.length;
      window.__riseGlossarySource = source;
      done();
    } catch (e) {
      glossary = emptyGlossary();
      window.__riseGlossaryCount = 0;
      console.warn('[risecoursetranslate] Glossary parse error (' + source + '):', e.message);
      done();
    }
  }

  function fetchUrlText(url) {
    return fetch(encodeURI(url).replace(/#/g, '%23'), { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function getGlossaryUrlsForFiles(files) {
    var urls = [];
    var i, candidates;
    for (i = 0; i < files.length; i++) {
      candidates = getGlossaryCandidateUrls(files[i]);
      candidates.forEach(function (u) {
        if (urls.indexOf(u) === -1) urls.push(u);
      });
    }
    return urls;
  }

  function loadGlossaryFromUrls(urls, idx, done) {
    if (glossary.keep.length > 0) return done();
    if (idx >= urls.length) {
      glossary = emptyGlossary();
      window.__riseGlossaryCount = 0;
      window.__riseGlossarySource = null;
      console.warn('[risecoursetranslate] Glossary not loaded. Run Update Glossary to sync Translation Glossary.csv into index.html.');
      return done();
    }
    fetchUrlText(urls[idx])
      .then(function (text) { applyGlossaryFromText(text, urls[idx], done); })
      .catch(function (e) {
        console.warn('[risecoursetranslate] Glossary fetch failed (' + urls[idx] + '):', e.message);
        loadGlossaryFromUrls(urls, idx + 1, done);
      });
  }

  function getGlossaryUrl() {
    var script = getScriptEl();
    var path;
    if (!script) return null;
    if (script.getAttribute('data-glossary-url')) {
      return script.getAttribute('data-glossary-url');
    }
    path = script.getAttribute('data-glossary');
    if (!path) return null;
    return getGlossaryCandidateUrls(path)[0] || null;
  }

  function emptyGlossary() {
    return { keep: [], overrides: {} };
  }

  function normalizeGlossary(data) {
    var g = emptyGlossary();
    var lang, term;
    if (!data || typeof data !== 'object') return g;
    if (Array.isArray(data.keep)) {
      g.keep = data.keep.filter(function (t) { return t && String(t).trim(); });
    }
    if (data.overrides && typeof data.overrides === 'object') {
      Object.keys(data.overrides).forEach(function (lang) {
        g.overrides[lang] = g.overrides[lang] || {};
        Object.keys(data.overrides[lang]).forEach(function (term) {
          g.overrides[lang][term] = data.overrides[lang][term];
        });
      });
    }
    return g;
  }

  function parseCSVLine(line) {
    var parts = [];
    var cur = '';
    var inQuotes = false;
    var i, c;
    for (i = 0; i < line.length; i++) {
      c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
        continue;
      }
      if (c === ',' && !inQuotes) {
        parts.push(cur.trim());
        cur = '';
        continue;
      }
      cur += c;
    }
    parts.push(cur.trim());
    return parts;
  }

  function trimTerm(t) {
    return String(t).replace(/\u00a0/g, ' ').trim();
  }

  function addKeepTerm(g, term) {
    term = trimTerm(term);
    if (!term || g.keep.indexOf(term) !== -1) return;
    g.keep.push(term);
  }

  function finalizeGlossary(g) {
    g.keep = g.keep.map(trimTerm).filter(Boolean);
    g.keep = g.keep.filter(function (t, i) { return g.keep.indexOf(t) === i; });
    return g;
  }

  function isSourceTargetHeader(cols) {
    return cols[0] && /^source\s*content$/i.test(trimTerm(cols[0]));
  }

  function isGlossaryType(value) {
    var type = trimTerm(value).toLowerCase();
    return type === 'keep' || type === 'skip' || type === 'donttranslate' || type === "don't translate"
      || type === 'override' || type === 'fix';
  }

  function isGlossaryHeader(cols, line) {
    if (/^term\s*,/i.test(line)) return true;
    if (isSourceTargetHeader(cols)) return true;
    if (cols.length === 1 && /^(term|word|words|glossary|terms?)$/i.test(trimTerm(cols[0]))) return true;
    return false;
  }

  function parseGlossaryCSV(text) {
    var g = emptyGlossary();
    var lines = text.split(/\r?\n/);
    var start = 0;
    var sourceTargetFormat = false;
    var i, cols, term, type, lang, translation;
    lines = lines.filter(function (l) { return l.trim(); });
    if (lines.length) {
      cols = parseCSVLine(lines[0]);
      if (isGlossaryHeader(cols, lines[0])) {
        sourceTargetFormat = isSourceTargetHeader(cols);
        start = 1;
      }
    }
    for (i = start; i < lines.length; i++) {
      cols = parseCSVLine(lines[i]);
      term = cols[0];
      if (!term) continue;
      if (sourceTargetFormat) {
        addKeepTerm(g, term);
        if (cols[1]) addKeepTerm(g, cols[1]);
        continue;
      }
      /* Single-column list, or type blank → protect term in every language */
      if (cols.length === 1 || !cols[1] || !trimTerm(cols[1])) {
        addKeepTerm(g, term);
        continue;
      }
      if (!isGlossaryType(cols[1])) {
        addKeepTerm(g, term);
        addKeepTerm(g, cols[1]);
        continue;
      }
      type = trimTerm(cols[1]).toLowerCase();
      if (type === 'keep' || type === 'skip' || type === 'donttranslate' || type === "don't translate") {
        addKeepTerm(g, term);
      } else if (type === 'override' || type === 'fix') {
        lang = (cols[2] || '').toLowerCase().trim();
        translation = cols[3] || '';
        if (lang && translation) {
          g.overrides[lang] = g.overrides[lang] || {};
          g.overrides[lang][term] = translation;
        }
      } else {
        addKeepTerm(g, term);
      }
    }
    return finalizeGlossary(g);
  }

  function loadGlossary(done) {
    var inline = getInlineGlossaryText();
    var script = getScriptEl();
    var path, urls;
    if (inline) {
      return applyGlossaryFromText(inline, 'embedded-csv', done);
    }
    if (script && script.getAttribute('data-glossary-url')) {
      return loadGlossaryFromUrls([script.getAttribute('data-glossary-url')], 0, done);
    }
    path = script && script.getAttribute('data-glossary');
    if (path) {
      urls = getGlossaryCandidateUrls(path);
      return loadGlossaryFromUrls(urls, 0, done);
    }
    urls = getGlossaryUrlsForFiles(GLOSSARY_FETCH_FILES);
    loadGlossaryFromUrls(urls, 0, done);
  }

  function getOverride(text, lang) {
    var map = glossary.overrides[lang];
    return map && map[text] ? map[text] : null;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findGlossaryMatches(text, keepList) {
    var all = [];
    var i, term, re, m;
    if (!text || !keepList.length) return [];
    for (i = 0; i < keepList.length; i++) {
      term = keepList[i];
      if (!term) continue;
      re = new RegExp(escapeRegex(term), 'gi');
      while ((m = re.exec(text)) !== null) {
        all.push({ start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    all.sort(function (a, b) {
      var lenDiff = (b.end - b.start) - (a.end - a.start);
      if (lenDiff !== 0) return lenDiff;
      return a.start - b.start;
    });
    var picked = [];
    all.forEach(function (match) {
      var overlaps = picked.some(function (p) {
        return !(match.end <= p.start || match.start >= p.end);
      });
      if (!overlaps) picked.push(match);
    });
    picked.sort(function (a, b) { return a.start - b.start; });
    return picked;
  }

  function buildSegments(text, matches) {
    var segments = [];
    var pos = 0;
    var i, m;
    for (i = 0; i < matches.length; i++) {
      m = matches[i];
      if (m.start > pos) segments.push({ type: 'text', value: text.slice(pos, m.start) });
      segments.push({ type: 'term', value: text.slice(m.start, m.end) });
      pos = m.end;
    }
    if (pos < text.length) segments.push({ type: 'text', value: text.slice(pos) });
    if (!segments.length) segments.push({ type: 'text', value: text });
    return segments;
  }

  function assembleFromSegments(segments, translatedParts) {
    var ti = 0;
    return segments.map(function (seg) {
      if (seg.type === 'term') return seg.value;
      if (trimTerm(seg.value).length < 2) return seg.value;
      return translatedParts[ti++] || seg.value;
    }).join('');
  }

  function prepareTranslationJob(orig, lang) {
    var override = getOverride(orig, lang);
    if (override) return { orig: orig, override: override };
    return {
      orig: orig,
      segments: buildSegments(orig, findGlossaryMatches(orig, glossary.keep))
    };
  }

  function getTranslateRoots() {
    var roots = [];
    if (document.body) roots.push(document.body);
    document.querySelectorAll('iframe').forEach(function (frame) {
      try {
        if (frame.contentDocument && frame.contentDocument.body) {
          // Skip code blocks that translate themselves. They mark their own
          // document and are driven by the rise-lang message instead, so the
          // bar must not also walk their insides (that would double-handle).
          var docEl = frame.contentDocument.documentElement;
          if (docEl && docEl.getAttribute('data-tc-managed')) return;
          roots.push(frame.contentDocument.body);
        }
      } catch (e) {}
    });
    return roots;
  }

  function getTranslateBlocks() {
    var blocks = [];
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    getTranslateRoots().forEach(function (root) {
      root.querySelectorAll(BLOCK_SEL).forEach(function (el) {
        if (seen && seen.has(el)) return;
        if (el.closest && (el.closest('#' + BAR_ID) || el.closest('.rt-panel'))) return;
        if (el.closest && el.closest('script,style,noscript')) return;
        if (el.querySelector(BLOCK_SEL)) return;
        var text = el.textContent;
        if (!text || trimTerm(text).length < 2) return;
        if (seen) seen.add(el);
        blocks.push(el);
      });
    });
    return blocks;
  }

  function setBlockTranslatedText(el, original, translated) {
    var lead = (original.match(/^\s*/) || [''])[0];
    var trail = (original.match(/\s*$/) || [''])[0];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    if (nodes.length === 1) {
      nodes[0].nodeValue = lead + translated + trail;
      return;
    }
    if (nodes.length > 1) {
      nodes[0].nodeValue = lead + translated;
      for (var i = 1; i < nodes.length; i++) nodes[i].nodeValue = '';
      return;
    }
    el.textContent = translated;
  }

  /* ── TEXT NODES ─────────────────────────────────────────────────── */
  /* ── TRANSLATION ─────────────────────────────────────────────────── */
  function translatePage(lang, spinner, status, resetBtn) {
    broadcastLangToBlocks(lang);
    var blocks = getTranslateBlocks();
    var toTranslate = [];
    blocks.forEach(function (el) {
      if (!originalMap.has(el)) originalMap.set(el, el.textContent);
      var orig = trimTerm(originalMap.get(el));
      if (orig.length < 2) return;
      cache[lang] = cache[lang] || {};
      if (cache[lang][orig]) return;
      if (getOverride(orig, lang)) {
        cache[lang][orig] = getOverride(orig, lang);
        return;
      }
      toTranslate.push(orig);
    });
    toTranslate = unique(toTranslate);

    var langObj = LANGUAGES.find(function (l) { return l.code === lang; });
    document.body.style.direction = (langObj && langObj.rtl) ? 'rtl' : '';

    if (toTranslate.length === 0) {
      applyTranslations(blocks, lang);
      if (resetBtn) resetBtn.style.display = 'inline-block';
      return;
    }

    if (spinner) spinner.style.display = 'block';
    if (status)  status.textContent = 'Translating…';

    pauseObserver();
    batchTranslate(toTranslate, lang, function (err) {
      if (spinner) spinner.style.display = 'none';
      if (err) {
        if (status) status.textContent = 'Translation failed';
        console.warn('[risecoursetranslate] Error:', err);
        resumeObserver();
        return;
      }
      applyTranslations(blocks, lang);
      if (status)   status.textContent = 'Translated: ' + (langObj ? langObj.label : lang);
      if (resetBtn) resetBtn.style.display = 'inline-block';
      resumeObserver();
    });
  }

  function applyTranslations(blocks, lang) {
    blocks.forEach(function (el) {
      var orig = originalMap.get(el);
      if (!orig) return;
      var key = trimTerm(orig);
      if (cache[lang] && cache[lang][key]) {
        setBlockTranslatedText(el, orig, cache[lang][key]);
      }
    });
  }

  /* ── GOOGLE TRANSLATE ────────────────────────────────────────────── */
  function batchTranslate(texts, lang, done) {
    var jobs = texts.map(function (orig) { return prepareTranslationJob(orig, lang); });
    var toSend = [];
    var i, j, job, seg;
    jobs.forEach(function (item) {
      if (item.override) return;
      item.segments.forEach(function (segment) {
        if (segment.type === 'text' && trimTerm(segment.value).length >= 2) {
          toSend.push(segment.value);
        }
      });
    });

    if (!toSend.length) {
      jobs.forEach(function (item) {
        cache[lang][item.orig] = item.override || item.orig;
      });
      return done(null);
    }

    var chunks = chunkArray(toSend, 50);
    var pending = chunks.length;
    var errored = null;
    var resultsByChunk = new Array(chunks.length);

    for (i = 0; i < chunks.length; i++) {
      (function (chunkIdx, chunk) {
        googleTranslate(chunk, lang, function (err, results) {
          if (errored) return;
          if (err) { errored = err; return done(err); }
          resultsByChunk[chunkIdx] = results || [];
          if (--pending === 0) {
            var pool = [];
            var cursor = 0;
            var parts;
            for (j = 0; j < resultsByChunk.length; j++) {
              pool = pool.concat(resultsByChunk[j]);
            }
            jobs.forEach(function (item) {
              if (item.override) {
                cache[lang][item.orig] = item.override;
                return;
              }
              parts = [];
              item.segments.forEach(function (segment) {
                if (segment.type === 'text' && trimTerm(segment.value).length >= 2) {
                  parts.push(pool[cursor++] || segment.value);
                }
              });
              cache[lang][item.orig] = assembleFromSegments(item.segments, parts);
            });
            done(null);
          }
        });
      })(i, chunks[i]);
    }
  }

  function googleTranslate(texts, targetLang, cb) {
    var SEP = '\n||||\n';
    var url = 'https://translate.googleapis.com/translate_a/single'
      + '?client=gtx&sl=auto&tl=' + encodeURIComponent(targetLang) + '&dt=t'
      + '&q=' + encodeURIComponent(texts.join(SEP));
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var raw = '';
        if (data && data[0]) data[0].forEach(function (s) { if (s && s[0]) raw += s[0]; });
        cb(null, raw.split('||||').map(function (s) { return s.replace(/^\n|\n$/g, ''); }));
      })
      .catch(function (e) { cb(e, null); });
  }

  /* ── RESTORE ─────────────────────────────────────────────────────── */
  function restorePage() {
    originalMap.forEach(function (orig, el) { el.textContent = orig; });
    document.body.style.direction = '';
  }

  /* ── OBSERVER ────────────────────────────────────────────────────── */
  function initObserver() {
    observer = new MutationObserver(function (mutations) {
      if (!activeTranslation || !isObserving) return;
      var relevant = mutations.some(function (m) {
        if (m.target && m.target.closest && m.target.closest('#' + BAR_ID)) return false;
        return m.addedNodes.length > 0;
      });
      if (relevant) {
        clearTimeout(observer._t);
        observer._t = setTimeout(function () {
          if (activeTranslation) translatePage(activeTranslation);
        }, 700);
      }
    });
    var target = document.querySelector('#app, #root, .content-wrapper') || document.body;
    observer.observe(target, { childList: true, subtree: true });
    isObserving = true;
  }

  function pauseObserver()  { isObserving = false; }
  function resumeObserver() { setTimeout(function () { isObserving = true; }, 800); }

  /* ── PERSISTENCE ─────────────────────────────────────────────────── */
  function saveLang(l)    { try { sessionStorage.setItem(STORAGE_KEY, l); }    catch(e){} }
  function clearSavedLang(){ try { sessionStorage.removeItem(STORAGE_KEY); }   catch(e){} }
  function getSavedLang() { try { return sessionStorage.getItem(STORAGE_KEY); } catch(e){ return null; } }

  /* ── UTILS ───────────────────────────────────────────────────────── */
  function unique(arr) { var s={}; return arr.filter(function(v){ return s[v]?false:(s[v]=true); }); }
  function chunkArray(arr, n) { var o=[]; for(var i=0;i<arr.length;i+=n) o.push(arr.slice(i,i+n)); return o; }

  /* ── SELF-MANAGED CODE BLOCKS ────────────────────────────────────── */
  /* Code blocks that carry their own translate-core.js manage their own
     insides. The bar does not translate them (see getTranslateRoots). It
     only tells them which language to show, by postMessage. */
  function broadcastLangToBlocks(code) {
    var lang = code || 'en';
    (function post(win) {
      var frames;
      try { frames = win.document.querySelectorAll('iframe'); } catch (e) { return; }
      frames.forEach(function (f) {
        try { if (f.contentWindow) f.contentWindow.postMessage({ type: 'rise-lang', lang: lang }, '*'); } catch (e) {}
        try { if (f.contentWindow) post(f.contentWindow); } catch (e) {}
      });
    })(window);
  }

  /* A block announces itself when its engine is ready. Answer with the
     current language so blocks that finish loading late still switch. */
  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (d && d.type === 'rise-ready' && ev.source) {
      var code = activeTranslation || getSavedLang() || 'en';
      try { ev.source.postMessage({ type: 'rise-lang', lang: code }, '*'); } catch (e) {}
    }
  });

  /* ── BOOT ────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

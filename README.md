# risecoursetranslate (text edit test only in these brackets)

Live, automatic translation for Articulate Rise courses, including custom code
blocks. Learners pick a language once and the whole course follows, translated
on the fly. English stays the source of truth.

---

## The two files

| File | Role | Goes |
| --- | --- | --- |
| `risecoursetranslate.js` | **The bar.** Adds the language dropdown and translates the standard Rise text. | In the exported course `index.html`, once. |
| `translate-core.js` | **The engine.** Translates a custom code block and follows the bar's language. | Inside every code block, as its last line. |

Both load from a Git **tag** (`@live`) on jsDelivr, so the version in the field
is controlled and one change updates every course. See Updating.

---

## Install

**Bar**, in the exported `index.html`, just before `</head>`:

```html
<script src="https://cdn.jsdelivr.net/gh/tmforumSW/Rise_Translate_Test_v1.0@live/risecoursetranslate.js" data-glossary="Translation Glossary.csv" defer></script>
```

**Engine**, as the last line inside each Rise code block:

```html
<script src="https://cdn.jsdelivr.net/gh/tmforumSW/Rise_Translate_Test_v1.0@live/translate-core.js" defer></script>
```

`data-glossary` is optional. Drop it if you have no glossary CSV.

---

## How the bar and the blocks talk

A Rise code block runs inside its own iframe, which the bar cannot reach into to
translate. So the two coordinate by message:

1. The bar **broadcasts** the chosen language into every frame, repeatedly, so
   blocks that load late (Rise builds lessons on demand, and on scroll) still
   get it.
2. Each block also **polls** the bar ("which language?") on a loop, and the bar
   answers. This is the reliable path, and it covers mid-lesson switches.
3. A block marks its document with `data-tc-managed` so the bar does **not**
   also translate the block's insides. The two never fight over the same text.

Net effect: pick a language once on the bar, and every block follows, including
on a mid-lesson change.

---

## What the engine translates

- HTML text
- SVG `<text>` and `<tspan>` (diagram labels)
- Attributes: `aria-label`, `title`, `alt`, `placeholder`
- Content revealed after load (click to open), caught by a mutation observer
- Each phrase is cached, so it is fetched once per language
- Anything marked `data-notranslate` is preserved, as are terms in the `KEEP` list

---

## Glossary (keeping terms untranslated)

The bar can load a glossary CSV so that named terms (product names, acronyms,
defined concepts) are kept in English rather than machine-translated. For
example, "Open Digital Architecture", "Intent", and "AIOps" stay as written.

**Where to put it.** Drop the CSV into the exported course, either next to
`index.html` (the export root) or in the `content` or `scormcontent` folder. The
bar searches all three. Accepted filenames are `Translation Glossary.csv`,
`Translation_Glossary.csv`, or `glossary.csv`. You can also name a specific file
with the `data-glossary` attribute on the bar's script tag.

**Format.** A CSV with `Source content` and `Target content` columns. Where the
two match, the term is kept untranslated. A leading byte-order mark is tolerated.

**Confirming it loaded.** The course console logs `Glossary loaded: N protected
term(s)`. If the file is missing you get a harmless `Glossary not loaded` warning
and translation still runs.

> **Known gap: the glossary is not yet connected to code blocks.** It currently
> applies only to the bar's translation of the standard Rise text. The engine
> (`translate-core.js`) has its own small built-in keep-list (`TM Forum`, `ODA`,
> `AN`, `SLA`) and does **not** yet read the full glossary. A term can therefore
> be kept in the main course text but still machine-translated inside a code
> block. The intended fix is for the bar to broadcast the parsed keep-list to the
> blocks alongside the language, so there is a single glossary and a single parse.
> Not yet built.

---

## Switching the translation engine

One constant near the top of `translate-core.js`:

```js
var ENGINE = "google";   // "google" or "deepl"
```

`deepl` is a stub until a server-side proxy is wired, so the API key stays off
the client. Because every block loads this one shared file, changing this line
once (and moving the tag) switches every block in every course.

---

## Flicker: how it is handled, and the one hard limit

A runtime translator and a self-rendering block can fight: the block paints
English, the engine re-translates, repeat. This is handled in two layers.

**Layer one, in the engine (built in).** On every DOM change, before the browser
paints, the engine instantly restores any text it has already translated, from
cache, with no network call. It also supersedes stale translations and skips
text already correct. This makes most re-renders invisible.

**Layer two, an authoring rule (required).** The engine cannot stop a block from
*repainting English*, and it cannot stop the block reacting to a size change.
Languages that render at a very different width (Chinese, Japanese, Korean,
Arabic) change a block's size a lot when translated. A block that re-measures or
re-renders on size change will then loop. The engine's own correct fix is itself
a size change, so it cannot break this from the outside. The block must behave.

The rule: **any code block that writes throwaway or measurement text into the
DOM must do it off-screen, or on a `data-notranslate` element, never on the
visible element.** Example: a height-lock that measures panels by swapping the
visible panel's content will flicker; measuring on a hidden `data-notranslate`
clone does not. A worked clone-based fix exists (the evolution/arrow block).

Also required per block: keep genuine code that must not translate inside a
`data-notranslate` element, and keep learner-facing text as real DOM or SVG text
(text drawn on a `<canvas>` or baked into an image cannot be translated).

---

## Updating (tags and purging)

Blocks and courses point at the `live` tag, a stable pointer moved on release.

1. Commit the change to `main`.
2. Move `live` to the new commit and push it:
   `git tag -f live && git push -f origin live`
   (or, on github.com, delete and recreate the `live` release on the latest commit).
3. Purge jsDelivr once so it drops the cached copy:
   - `https://purge.jsdelivr.net/gh/tmforumSW/Rise_Translate_Test_v1.0@live/translate-core.js`
   - `https://purge.jsdelivr.net/gh/tmforumSW/Rise_Translate_Test_v1.0@live/risecoursetranslate.js`

Every block then follows, nothing reopened. jsDelivr caches a tag as hard as a
branch, so moving the tag **without** purging looks like nothing changed.

A tag must be pushed to GitHub before jsDelivr can see it. Creating or moving a
tag only in an editor does it locally.

---

## Verifying the live build

- Open a block, and in its frame's console: `TRANSLATE_CORE_VERSION` returns the
  running engine version.
- `TC_STATS` returns live counters `{observerFires, cacheReapplies, fullPasses,
  netFetches}`. Set `window.TC_DEBUG = true` to log them every two seconds. A
  fast-climbing `cacheReapplies` means a block is fighting the engine (an
  authoring-rule problem); a near-flat count means it is stable.
- Or Ctrl+F the served file for a known function (for example `pollBar`).

---

## Known limitations and operational notes

- **Runtime dependency.** Blocks fetch the engine from GitHub/jsDelivr and
  translations from the translation endpoint at view time. Networks or countries
  that block those hosts will not translate. It **fails safe to English.** Test
  reachability in target regions before field release.
- **First appearance.** Brand-new text can show English briefly on first view,
  until its translation returns. Repeated text is instant from cache.
- **Size-change flicker.** See Layer two above. This is an authoring-rule issue,
  not an engine bug.
- **Glossary scope.** The glossary keeps terms untranslated in the standard Rise
  text only. It is **not yet connected to code blocks** (see Glossary), so a term
  can differ between the main text and a block until that is wired.
- **Quality.** Current engine is machine translation (conversational, not
  technical grade). English remains authoritative; a disclaimer to that effect
  should sit at the start of translated courses.

---

## Files

- `risecoursetranslate.js` — the bar (course level)
- `translate-core.js` — the engine (code-block level)
- `README.md` — this file

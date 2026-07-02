# risecoursetranslate

Shared translation engine for Rise code blocks. One file, loaded by every
code block from the CDN, so the whole course switches behavior from one place.

## Use it

Add this one line inside a Rise code block:

```html
<script src="https://cdn.jsdelivr.net/gh/YOUR-USER/YOUR-REPO@main/translate-core.js" defer></script>
```

The block then translates its own text, SVG labels, and attributes, and
picks up the course language automatically.

## What it does

- Translates HTML text, SVG `<text>`, and attributes (aria-label, title, alt, placeholder)
- Catches content revealed after load (click to open)
- Caches each phrase so it is fetched once per language
- Preserves anything marked `data-notranslate`, plus terms in the KEEP list
- Reads the language from the course page, or from its own selector when standalone

## Switch the engine

Change one constant near the top of `translate-core.js`:

```js
var ENGINE = "google";   // "google" or "deepl"
```

`deepl` is a stub until the proxy is wired. Point it at a server-side proxy
so the API key stays off the client.

## Note

jsDelivr caches the `@main` branch. After editing the file, bump a version
tag (for example `@v2`) or purge the jsDelivr URL, or the old copy keeps serving.

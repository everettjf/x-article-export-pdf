# Contributing

Thanks for helping make X Article Export better! 🎉

## Getting started

```bash
git clone https://github.com/everettjf/x-article-export-pdf.git
cd x-article-export-pdf
npm install
npm test
```

Then load the unpacked extension from `chrome://extensions` (Developer mode → **Load unpacked** → select the repo folder).

## Project structure

| Path | Purpose |
|------|---------|
| `src/content/detector.js` | Decides whether the page is an Article, a thread, or neither, and where the content lives. **Selectors live here.** |
| `src/content/extractor.js` | Walks the DOM into a neutral list of segments. **Selectors live here too.** |
| `src/content/sanitize.js` | Keeps a safe allowlist of inline tags (links, bold, italic, code). |
| `src/content/renderer.js` | Segments → printable HTML + the print stylesheet. |
| `src/content/markdown.js` | Segments → GitHub-flavored Markdown. |
| `src/content/main.js` | Message handling and output (print page / download). |
| `src/popup/` | Toolbar UI. |
| `src/print/` | The CSP-safe page that hosts the printable document. |
| `test/` | jsdom test suite. |

## When X changes its DOM

This is the most common reason the extension breaks. Fixes are usually small:

1. Inspect the article page and find the new `data-testid` / tag.
2. Add it as a **new candidate** (don't remove old ones — they help older clients) in `detector.js` (`ARTICLE_READVIEW_SELECTORS`) or `extractor.js`.
3. Add or update a case in `test/extension.test.js` so it can't silently regress.
4. `npm test`.

## Guidelines

- **No build step.** Keep the extension plain JS that loads unpacked.
- **No new runtime dependencies.** jsdom is dev-only.
- Match the existing style: small focused modules, comments that explain *why*.
- Add a test for any extraction/rendering change.
- Run `npm test` and `npm run lint` before opening a PR.

## Reporting bugs

Open an issue with the **article URL** (if public) and a description of what looked wrong. Screenshots of the output help a lot.

By contributing you agree your work is licensed under the project's [MIT License](LICENSE).

# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-06-06

### Added

- Initial release. 🎉
- **Article extraction** from X's Draft.js read view: headings (H1–H6),
  paragraphs, ordered/unordered lists, fenced code blocks with language,
  block-quotes, images (upgraded to original resolution), and KaTeX math.
- **Inline fidelity**: preserves links (resolving `t.co` to the visible URL),
  bold, italic, and inline code. Strips Draft.js `\n` filler and de-duplicates
  the plain-text echo of code blocks.
- **PDF export** via a CSP-safe in-extension print page with smart page breaks.
- **Markdown export** (GitHub-flavored) with `$…$` math recovered from KaTeX.
- **Thread fallback** for ordinary tweets/threads.
- Popup UI with Modern/Serif styles, A4/Letter page sizes, and a source-link
  toggle. Preferences persist via `chrome.storage`.
- jsdom-based test suite covering the full extraction pipeline.
- GitHub Pages website and CI.

[1.0.0]: https://github.com/everettjf/x-article-export-pdf/releases/tag/v1.0.0

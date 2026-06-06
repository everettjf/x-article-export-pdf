# Privacy Policy

**X Article Export** is designed to be private by default.

## What it does

- Runs entirely in your browser.
- Reads the content of the X (Twitter) article or tweet you are currently viewing, only when you click the extension and ask it to export.
- Builds a PDF (via your browser's print dialog) or a Markdown file from that content.

## What it does **not** do

- It does **not** send your data to any server. There is no backend.
- It does **not** include any analytics, tracking, telemetry, or advertising.
- It does **not** read your X account, credentials, cookies, DMs, or any page other than the article you export.
- It does **not** run in the background or collect data passively.

## Network requests

The only network activity is:

1. **Article images** — loaded from X's own media CDN (`pbs.twimg.com`) so they appear in your export. These are the same images the page already loaded.
2. **KaTeX stylesheet (optional)** — if an article contains math, the print page loads a stylesheet from a public CDN (`cdn.jsdelivr.net`) to render the formulas. No personal data is sent.

## Permissions

| Permission | Why it's needed |
|------------|-----------------|
| `activeTab` / `scripting` | Read the article content of the tab you explicitly export. |
| `downloads` | Save the Markdown file you request. |
| `storage` | Remember your style/page-size preferences and pass the rendered document to the print page. |
| host access to `x.com` / `twitter.com` | The extension only operates on X. |

## Storage

Your preferences (style, page size, source-link toggle) are stored locally via `chrome.storage`. The document being exported is held in local storage only momentarily and removed right after the print page renders it.

## Questions

Open an issue at <https://github.com/everettjf/x-article-export-pdf/issues>.

_Last updated: 2026-06-06_

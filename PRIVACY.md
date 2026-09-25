# Privacy Policy

**X Article Export** is designed to be private by default.

## What it does

- Runs entirely in your browser.
- Reads the content of the X (Twitter) article or tweet you are currently viewing, only when you click the extension and ask it to export.
- Builds a PDF (via your browser's print dialog) or a Markdown file from that content.

## What it does **not** do

- It does **not** send article content to any server operated by this project. There is no backend.
- It does **not** include any analytics, tracking, telemetry, or advertising.
- It does **not** read credentials, cookies, DMs, or pages outside the tab where you invoke it.
- It injects its content script only after you click the extension. It does not collect data passively.

## Network requests

Export-related network activity is:

1. **Article images** — loaded from X's own media CDN (`pbs.twimg.com`) so they appear in your export. These are the same images the page already loaded.
2. **KaTeX styling** — the stylesheet and fonts are packaged with the extension, so formula rendering needs no third-party request.

The extension also opens its website once after installation; links in the popup open only when you click them.

## Permissions

| Permission | Why it's needed |
|------------|-----------------|
| `activeTab` / `scripting` | Read the X tab only after you click the extension. |
| `storage` | Remember your style/page-size preferences and pass the rendered document to the print page. |

## Storage

Your preferences (style, page size, source-link toggle) are stored in `chrome.storage.sync`, which may sync through your browser account. The document being exported is held in temporary `chrome.storage.session` and removed right after its print page renders it.

## Questions

Open an issue at <https://github.com/everettjf/x-article-export-pdf/issues>.

_Last updated: 2026-09-24_

/*!
 * X Article Export — shared namespace
 *
 * Content scripts listed together in the manifest share a single isolated-world
 * `window`, so we hang every module off one global object. Each subsequent file
 * augments `window.XAEP` rather than redeclaring it.
 */
(function () {
  "use strict";

  const XAEP = (window.XAEP = window.XAEP || {});

  XAEP.VERSION = "1.0.1";

  // Escape a string for safe interpolation into HTML text/attribute context.
  XAEP.escapeHtml = function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Collapse runs of whitespace; used for de-duplication comparisons.
  XAEP.normalizeForCompare = function normalizeForCompare(str) {
    return String(str || "").replace(/\s+/g, " ").trim().toLowerCase();
  };

  // Draft.js sprinkles literal "\n" placeholder blocks through empty paragraphs.
  XAEP.isFillerText = function isFillerText(text) {
    const t = String(text || "").trim();
    return t === "" || t === "\\n" || t === "\\n\\n" || /^(\\n)+$/.test(t);
  };

  // Rendered text of an element. Prefers innerText (respects visibility) and
  // falls back to textContent (e.g. in non-browser test environments).
  XAEP.text = function text(el) {
    if (!el) return "";
    const it = el.innerText;
    return (it != null ? it : el.textContent || "").toString();
  };

  // A tiny logger that is easy to grep and silence.
  XAEP.log = function log(...args) {
    // eslint-disable-next-line no-console
    console.debug("[X Article Export]", ...args);
  };
})();

/*!
 * X Article Export — inline sanitizer
 *
 * X renders article body text with Draft.js, which means links, bold and italic
 * runs live inside the DOM. Using `innerText` (as most exporters do) throws all
 * of that away. Instead we walk the node tree and re-emit a *small* allowlist of
 * inline tags, escaping everything else. The result is safe HTML that keeps the
 * author's emphasis and — crucially — their hyperlinks.
 */
(function () {
  "use strict";

  const XAEP = (window.XAEP = window.XAEP || {});
  const escapeHtml = XAEP.escapeHtml;

  // Map of source tag -> output tag. Anything not listed is unwrapped (its text
  // content is kept, the tag itself is dropped).
  const INLINE_TAGS = {
    A: "a",
    B: "strong",
    STRONG: "strong",
    I: "em",
    EM: "em",
    U: "u",
    S: "s",
    STRIKE: "s",
    DEL: "s",
    CODE: "code",
    MARK: "mark",
    SUP: "sup",
    SUB: "sub",
    BR: "br",
  };

  function isSafeHref(href) {
    if (!href) return false;
    const v = href.trim().toLowerCase();
    return (
      v.startsWith("http://") ||
      v.startsWith("https://") ||
      v.startsWith("mailto:") ||
      v.startsWith("/")
    );
  }

  // X wraps outgoing links through t.co and shows the real destination in the
  // anchor's visible text. Prefer the human-readable text when it looks like a
  // URL so the exported document points somewhere meaningful.
  function resolveHref(anchor) {
    const raw = anchor.getAttribute("href") || "";
    const text = (anchor.textContent || "").trim();
    if (/^https?:\/\/\S+$/i.test(text)) return text;
    if (raw.startsWith("/")) return "https://x.com" + raw;
    return raw;
  }

  function serializeNode(node, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(escapeHtml(node.nodeValue));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = /** @type {Element} */ (node);
    const tag = el.tagName.toUpperCase();

    // Drop X's interactive chrome (emoji are <img>, keep their alt text).
    if (tag === "IMG") {
      const alt = el.getAttribute("alt");
      if (alt) out.push(escapeHtml(alt));
      return;
    }

    const mapped = INLINE_TAGS[tag];

    if (mapped === "br") {
      out.push("<br>");
      return;
    }

    if (mapped === "a") {
      const href = resolveHref(el);
      if (isSafeHref(href)) {
        out.push(`<a href="${escapeHtml(href)}">`);
        for (const child of el.childNodes) serializeNode(child, out);
        out.push("</a>");
        return;
      }
      // Unsafe/empty href -> keep the text only.
      for (const child of el.childNodes) serializeNode(child, out);
      return;
    }

    if (mapped) {
      out.push(`<${mapped}>`);
      for (const child of el.childNodes) serializeNode(child, out);
      out.push(`</${mapped}>`);
      return;
    }

    // Unknown element: unwrap, keep contents.
    for (const child of el.childNodes) serializeNode(child, out);
  }

  // Produce sanitized inline HTML for an element, preserving links + emphasis.
  XAEP.sanitizeInline = function sanitizeInline(el) {
    if (!el) return "";
    const out = [];
    for (const child of el.childNodes) serializeNode(child, out);
    return out.join("").replace(/\s+\n/g, "\n").trim();
  };

  // Plain-text version (no tags) for de-duplication and Markdown fallbacks.
  XAEP.plainText = function plainText(el) {
    return XAEP.text(el).trim();
  };
})();

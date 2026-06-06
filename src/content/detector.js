/*!
 * X Article Export — page detection
 *
 * Figures out *what* the current page is and *where* the content lives. X ships
 * two relevant surfaces: long-form Articles (the read view) and ordinary
 * tweet/thread pages. We look for the Article read view first and fall back to
 * thread extraction. Selectors are kept in one place so a future X redesign is a
 * one-file patch.
 */
(function () {
  "use strict";

  const XAEP = (window.XAEP = window.XAEP || {});

  // Candidate selectors for the Article read-view container, most-specific
  // first. The first match wins; later entries are resilience against renames.
  const ARTICLE_READVIEW_SELECTORS = [
    '[data-testid="twitterArticleReadView"]',
    '[data-testid="twitterArticleRichText"]',
    '[data-testid="articleNoteTweet"]',
    'article [data-testid="longformRichTextComponent"]',
  ];

  function findArticleReadView() {
    for (const sel of ARTICLE_READVIEW_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Heuristic fallback: the largest tweet-like article element that contains a
  // Draft.js block tree. Helps if the read-view testid disappears entirely.
  function findRichBlockContainer() {
    const blocks = document.querySelectorAll('[data-block="true"]');
    if (blocks.length < 3) return null;
    // Walk up from the first block to the nearest <article> ancestor.
    let node = blocks[0];
    while (node && node !== document.body) {
      if (node.tagName === "ARTICLE") return node;
      node = node.parentElement;
    }
    return null;
  }

  XAEP.detect = function detect() {
    const readView = findArticleReadView();
    if (readView) {
      return {
        mode: "article",
        container: readView,
        title: XAEP.getArticleTitle(readView),
      };
    }

    const fallback = findRichBlockContainer();
    if (fallback) {
      return {
        mode: "article",
        container: fallback,
        title: XAEP.getArticleTitle(fallback),
      };
    }

    if (document.querySelector("article")) {
      return { mode: "thread", container: document, title: cleanDocTitle() };
    }

    return { mode: "none", container: null, title: cleanDocTitle() };
  };

  // The first H1 inside the read view is the article title; otherwise fall back
  // to the (cleaned) document title.
  XAEP.getArticleTitle = function getArticleTitle(scope) {
    const root = scope || document;
    const h1 = root.querySelector("h1");
    const fromH1 = h1 && XAEP.text(h1).trim();
    if (fromH1) return fromH1;
    return cleanDocTitle();
  };

  function cleanDocTitle() {
    // Strip the trailing " / X" or " on X" suffixes X appends.
    return (document.title || "X Article")
      .replace(/\s*\/\s*X\s*$/i, "")
      .replace(/\s+on\s+X:?\s*$/i, "")
      .trim();
  }

  XAEP.cleanDocTitle = cleanDocTitle;

  // Best-effort author byline: the first user-name block on the page.
  XAEP.getByline = function getByline() {
    const nameEl = document.querySelector('[data-testid="User-Name"]');
    if (!nameEl) return null;
    const text = XAEP.text(nameEl)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!text.length) return null;
    const name = text[0];
    const handle = text.find((t) => t.startsWith("@")) || "";
    return { name, handle };
  };
})();

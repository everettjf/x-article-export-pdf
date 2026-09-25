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

  function findCurrentTweet() {
    const statusId = location.pathname.match(/\/status\/(\d+)/)?.[1];
    if (!statusId) return null;
    const articles = Array.from(document.querySelectorAll("article"));
    const matches = (art, requireTime) =>
      Array.from(art.querySelectorAll('a[href*="/status/"]')).some((a) => {
        if (requireTime && !a.querySelector("time")) return false;
        try {
          return new URL(a.href, location.href).pathname.match(/\/status\/(\d+)/)?.[1] === statusId;
        } catch (_) {
          return false;
        }
      });
    const matched = articles.find((art) => matches(art, true)) ||
      articles.find((art) => matches(art, false));
    return matched || (articles.length === 1 ? articles[0] : null);
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

    const articleRoute = /\/i\/articles\/|\/status\/\d+/.test(location.pathname);
    const fallback = articleRoute ? findRichBlockContainer() : null;
    if (fallback) {
      return {
        mode: "article",
        container: fallback,
        title: XAEP.getArticleTitle(fallback),
      };
    }

    const currentTweet = findCurrentTweet();
    if (currentTweet) {
      return { mode: "thread", container: currentTweet, title: cleanDocTitle() };
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

  // Best-effort author byline; scope tweet lookups to the selected tweet.
  XAEP.getByline = function getByline(scope) {
    const nameEl = (scope || document).querySelector('[data-testid="User-Name"]');
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

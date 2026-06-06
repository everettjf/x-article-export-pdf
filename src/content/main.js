/*!
 * X Article Export — content entry point
 *
 * Receives commands from the popup, drives extraction, and emits the result
 * (a print window for PDF, a file download for Markdown). All heavy lifting is
 * delegated to the sibling modules on `window.XAEP`.
 */
(function () {
  "use strict";

  const XAEP = (window.XAEP = window.XAEP || {});

  function buildMeta(detection) {
    return {
      title: detection.title || XAEP.cleanDocTitle(),
      url: location.href,
      byline: XAEP.getByline(),
    };
  }

  function safeFilename(title) {
    const base = (title || "x-article")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    return base || "x-article";
  }

  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function handleExport(message) {
    const detection = XAEP.detect();
    if (detection.mode === "none") {
      return { ok: false, error: "no-content" };
    }

    if (message.preload !== false) {
      try {
        await XAEP.preloadMedia();
      } catch (_) {
        /* non-fatal */
      }
    }

    const segments = XAEP.extract(detection);
    if (!segments.length) {
      return { ok: false, error: "empty" };
    }

    const meta = buildMeta(detection);
    const options = message.options || {};

    if (message.format === "markdown") {
      const md = XAEP.buildMarkdown(segments, meta, options);
      downloadText(md, safeFilename(meta.title) + ".md", "text/markdown");
      return { ok: true, mode: detection.mode, count: segments.length };
    }

    // PDF: hand the rendered content back to the popup, which opens a print page
    // we fully control (avoids x.com's CSP breaking inline styles/scripts).
    return {
      ok: true,
      mode: detection.mode,
      count: segments.length,
      doc: {
        title: meta.title,
        theme: options.theme || "modern",
        css: XAEP.buildStyles(options),
        body: XAEP.buildBody(segments, meta, options),
        filename: safeFilename(meta.title),
      },
    };
  }

  function handleProbe() {
    const detection = XAEP.detect();
    return {
      ok: true,
      mode: detection.mode,
      title: detection.title || XAEP.cleanDocTitle(),
      hasContent: detection.mode !== "none",
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === "XAEP_PROBE") {
      sendResponse(handleProbe());
      return; // synchronous
    }

    if (message.type === "XAEP_EXPORT") {
      handleExport(message)
        .then(sendResponse)
        .catch((err) => {
          XAEP.log("export failed", err);
          sendResponse({ ok: false, error: "exception", detail: String(err) });
        });
      return true; // async response
    }
  });

  XAEP.log("content modules ready", XAEP.VERSION);
})();

/* X Article Export — popup controller */
(function () {
  "use strict";

  const CONTENT_FILES = [
    "src/content/namespace.js",
    "src/content/sanitize.js",
    "src/content/detector.js",
    "src/content/extractor.js",
    "src/content/renderer.js",
    "src/content/markdown.js",
    "src/content/main.js",
  ];

  const DEFAULTS = { theme: "modern", pageSize: "a4", includeSource: true };

  const $ = (sel) => document.querySelector(sel);
  const els = {
    status: $("#status"),
    badge: $("#modeBadge"),
    title: $("#pageTitle"),
    theme: $("#theme"),
    pageSize: $("#pageSize"),
    includeSource: $("#includeSource"),
    pdf: $("#exportPdf"),
    md: $("#exportMd"),
    hint: $("#hint"),
  };

  let activeTab = null;
  let options = Object.assign({}, DEFAULTS);

  // ---- option helpers --------------------------------------------------------

  function wireSegment(group, key) {
    group.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      group.querySelectorAll(".seg-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", String(on));
      });
      options[key] = btn.dataset.value;
      saveOptions();
    });
  }

  function applyOptions() {
    [
      [els.theme, "theme"],
      [els.pageSize, "pageSize"],
    ].forEach(([group, key]) => {
      group.querySelectorAll(".seg-btn").forEach((b) => {
        const on = b.dataset.value === options[key];
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", String(on));
      });
    });
    els.includeSource.checked = !!options.includeSource;
  }

  function saveOptions() {
    try {
      chrome.storage.sync.set({ options });
    } catch (_) {
      /* storage may be unavailable */
    }
  }

  function loadOptions() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ options: DEFAULTS }, (data) => {
          options = Object.assign({}, DEFAULTS, data.options || {});
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
  }

  // ---- messaging -------------------------------------------------------------

  function sendMessage(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ __noReceiver: true, error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });
  }

  async function injectContentScript(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_FILES,
    });
  }

  // Probe the tab; if the content script isn't there yet, inject and retry once.
  async function ensureAndSend(message) {
    let res = await sendMessage(activeTab.id, message);
    if (res && res.__noReceiver) {
      try {
        await injectContentScript(activeTab.id);
        res = await sendMessage(activeTab.id, message);
      } catch (err) {
        return { ok: false, error: "inject-failed", detail: String(err) };
      }
    }
    return res;
  }

  // ---- UI state --------------------------------------------------------------

  function setStatus(text, kind) {
    els.status.textContent = text;
    els.status.className = "sub" + (kind ? " is-" + kind : "");
  }

  function setHint(text, kind) {
    els.hint.textContent = text || "";
    els.hint.className = "hint" + (kind ? " is-" + kind : "");
  }

  function setMode(mode, title) {
    const map = {
      article: ["Article", "", "Ready to export this X Article", "ok"],
      thread: ["Thread", "is-thread", "Tweet / thread — will export as text", "warn"],
      none: ["No content", "is-none", "Open an X Article or tweet first", "warn"],
    };
    const [label, cls, status, kind] = map[mode] || map.none;
    els.badge.textContent = label;
    els.badge.className = "badge " + cls;
    els.title.textContent = title || "—";
    setStatus(status, kind);
    const disabled = mode === "none";
    els.pdf.disabled = disabled;
    els.md.disabled = disabled;
  }

  function busy(button, on, label) {
    button.disabled = on;
    if (on) {
      button.dataset.label = button.querySelector("span").textContent;
      button.querySelector("span").textContent = label || "Working…";
      const svg = button.querySelector("svg");
      if (svg) svg.style.display = "none";
      button.insertAdjacentHTML("afterbegin", '<span class="spin"></span>');
    } else {
      const spin = button.querySelector(".spin");
      if (spin) spin.remove();
      const svg = button.querySelector("svg");
      if (svg) svg.style.display = "";
      if (button.dataset.label)
        button.querySelector("span").textContent = button.dataset.label;
    }
  }

  function describeError(res) {
    const code = (res && res.error) || "unknown";
    return (
      {
        "no-content": "No article or tweet found on this page.",
        empty: "Couldn't extract any content.",
        "inject-failed": "Can't run on this page. Try reloading X.",
        exception: "Something went wrong. Try reloading the page.",
      }[code] || "Export failed. Try reloading X."
    );
  }

  // ---- actions ---------------------------------------------------------------

  async function openPrintPage(doc) {
    await chrome.storage.local.set({ xaepPrintJob: doc });
    await chrome.tabs.create({
      url: chrome.runtime.getURL("src/print/printable.html"),
    });
  }

  async function doExport(format, button, workingLabel, okLabel) {
    setHint("");
    busy(button, true, workingLabel);
    try {
      const res = await ensureAndSend({
        type: "XAEP_EXPORT",
        format,
        options,
      });
      if (res && res.ok) {
        if (format === "pdf" && res.doc) {
          await openPrintPage(res.doc);
          setHint(okLabel, "ok");
          setTimeout(() => window.close(), 600);
        } else {
          setHint(okLabel, "ok");
        }
      } else {
        setHint(describeError(res), "err");
      }
    } catch (err) {
      setHint("Export failed. Try reloading X.", "err");
    } finally {
      busy(button, false);
    }
  }

  // ---- init ------------------------------------------------------------------

  async function init() {
    wireSegment(els.theme, "theme");
    wireSegment(els.pageSize, "pageSize");
    els.includeSource.addEventListener("change", () => {
      options.includeSource = els.includeSource.checked;
      saveOptions();
    });

    els.pdf.addEventListener("click", () =>
      doExport("pdf", els.pdf, "Building…", "Print dialog opened — Save as PDF")
    );
    els.md.addEventListener("click", () =>
      doExport("markdown", els.md, "Building…", "Markdown downloaded")
    );

    await loadOptions();
    applyOptions();

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    activeTab = tab;

    const host = tab && tab.url ? new URL(tab.url).hostname : "";
    if (!/(^|\.)(x|twitter)\.com$/.test(host)) {
      setMode("none", "Not an X page");
      setStatus("Open x.com to use this", "warn");
      return;
    }

    const probe = await ensureAndSend({ type: "XAEP_PROBE" });
    if (probe && probe.ok) {
      setMode(probe.mode, probe.title);
    } else {
      setMode("none", "Couldn't read this page");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

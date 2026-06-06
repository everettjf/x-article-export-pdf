/* X Article Export — print page controller
 *
 * Runs as a packaged extension page (CSP: scripts from 'self' only), so it can
 * safely render trusted, pre-sanitized content and trigger the print dialog
 * without fighting x.com's content-security policy.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "xaepPrintJob";

  function waitForImages(timeoutMs) {
    const imgs = Array.prototype.slice
      .call(document.images)
      .filter((i) => !i.complete);
    if (!imgs.length) return Promise.resolve();
    return Promise.race([
      Promise.all(
        imgs.map(
          (img) =>
            new Promise((res) => {
              img.addEventListener("load", res, { once: true });
              img.addEventListener("error", res, { once: true });
            })
        )
      ),
      new Promise((res) => setTimeout(res, timeoutMs)),
    ]);
  }

  function render(job) {
    document.title = job.filename || job.title || "X Article";
    document.documentElement.setAttribute("data-theme", job.theme || "modern");
    document.getElementById("xa-doc-style").textContent = job.css || "";
    // job.body is built by our own sanitizing renderer — safe to inject.
    document.getElementById("xa-root").innerHTML = job.body || "";
  }

  function fail(msg) {
    const root = document.getElementById("xa-root");
    root.innerHTML =
      '<div style="max-width:560px;margin:80px auto;padding:0 24px;font:16px/1.6 -apple-system,sans-serif;color:#0f1419">' +
      '<h1 style="font-size:22px">Nothing to print</h1>' +
      "<p style=\"color:#536471\">" +
      msg +
      " You can close this tab and try again from an X Article.</p></div>";
    const loading = document.getElementById("xa-loading");
    if (loading) loading.remove();
  }

  async function main() {
    let job;
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      job = data[STORAGE_KEY];
    } catch (e) {
      return fail("Could not read the export data.");
    }
    if (!job || !job.body) {
      return fail("The export data was empty or expired.");
    }

    render(job);

    // Clear the stored job so a later reload doesn't reprint stale content.
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }

    await waitForImages(5000);

    const loading = document.getElementById("xa-loading");
    if (loading) loading.remove();

    // Let layout settle, then open the print dialog.
    setTimeout(() => {
      window.focus();
      window.print();
    }, 250);
  }

  document.addEventListener("DOMContentLoaded", main);
})();

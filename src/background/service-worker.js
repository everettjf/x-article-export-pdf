/*!
 * X Article Export — background service worker
 *
 * The extension does its real work in the content script and popup. The worker
 * only handles lifecycle niceties: a one-time welcome on install.
 */

chrome.runtime.onInstalled.addListener((details) => {
  // v1.0.1 used a persistent single-key print job. New jobs use session
  // storage, so discard any article left behind by the old print flow.
  if (details.reason === "update") {
    chrome.storage.local.remove("xaepPrintJob");
  }
  if (details.reason === "install") {
    chrome.tabs.create({
      url: "https://everettjf.github.io/x-article-export-pdf/",
    });
  }
});

/*!
 * X Article Export — background service worker
 *
 * The extension does its real work in the content script and popup. The worker
 * only handles lifecycle niceties: a one-time welcome on install.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({
      url: "https://everettjf.github.io/x-article-export-pdf/",
    });
  }
});

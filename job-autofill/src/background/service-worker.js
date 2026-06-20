/* service-worker.js — minimal. Opens the manager on first install. */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
  }
});

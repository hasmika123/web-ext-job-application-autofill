/* content-script.js — entry point. Receives fill requests and a detection ping. */
(function () {
  const JAF = (window.JAF = window.JAF || {});

  function detectAdapter() {
    const list = JAF.adapters || [];
    const m = list.find((a) => a.id !== "generic" && (() => { try { return a.matches(); } catch (e) { return false; } })());
    return m ? m.id : "generic";
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === "JAF_PING") {
      let fieldCount = 0;
      try { fieldCount = (JAF.adapterBase.scanGeneric(document) || []).length; } catch (e) {}
      sendResponse({ ok: true, adapter: detectAdapter(), fieldCount, frame: location.href });
      return true;
    }
    if (msg.type === "JAF_FILL") {
      JAF.filler.start(msg.values, msg.file || null, msg.options || {})
        .then((r) => sendResponse({ ok: true, ...r }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true; // async
    }
  });
})();

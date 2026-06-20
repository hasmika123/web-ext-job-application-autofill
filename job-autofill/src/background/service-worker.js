/* service-worker.js — install hook + the answer-drafting backend.
 *
 *  Drafting runs here (not in the content script) so it isn't blocked by a page's
 *  Content-Security-Policy and the API key never travels through page world.
 *  Answers are cached by normalized question text and REUSED when the same
 *  question appears again — the user writes/approves an answer once.
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
  }
});

const ANSWER_KEY = "answerCache";
const normQ = (q) => String(q || "").toLowerCase().replace(/\s+/g, " ").replace(/[\s?:.!,;-]+$/g, "").trim();

function sGet(k) { return new Promise((res) => chrome.storage.local.get(k, (o) => res(o && o[k]))); }
function sSet(k, v) { return new Promise((res) => chrome.storage.local.set({ [k]: v }, () => res(true))); }

async function getCached(q) { const c = (await sGet(ANSWER_KEY)) || {}; return c[normQ(q)] || null; }
async function putCached(q, a) { const c = (await sGet(ANSWER_KEY)) || {}; c[normQ(q)] = a; await sSet(ANSWER_KEY, c); }

async function draftAnswer(question, context) {
  const settings = (await sGet("settings")) || {};
  const cached = await getCached(question);             // reuse identical question
  if (cached) return { answer: cached, cached: true };
  if (!settings.llmEnabled || !settings.apiKey) return { disabled: true };

  const system =
    "You write concise, professional, first-person answers to job application questions, " +
    "grounded ONLY in the candidate background provided. 2-4 sentences. No preamble, no markdown, " +
    "no placeholders, and do not invent employers or facts not present in the background.";
  const user = "Question:\n" + question + "\n\nCandidate background:\n" + (context || "").slice(0, 6000) + "\n\nWrite the answer:";
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (e) { return { error: String((e && e.message) || e) }; }
  if (!res.ok) { const t = await res.text().catch(() => ""); return { error: "API " + res.status + ": " + t.slice(0, 160) }; }
  const data = await res.json();
  const answer = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (answer) await putCached(question, answer);
  return { answer };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "JAF_DRAFT") return;
  draftAnswer(msg.question, msg.context).then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
  return true; // async
});

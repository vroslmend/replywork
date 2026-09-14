const chatButton = document.querySelector("#open-chat");
const chatStatus = document.querySelector("#chat-status");
const copyStatus = document.querySelector("#copy-status");
let websiteId = null;
let sessionId = null;
let loading = false;
let ready = false;
let copyTimer;

const copy = async (text, label) => {
  window.clearTimeout(copyTimer);
  try {
    await window.navigator.clipboard.writeText(text);
    copyStatus.textContent = `${label} copied. Paste it into ${label === "Question" ? "the test chat" : "a Replywork terminal"}.`;
  } catch {
    copyStatus.textContent = `Copy manually: ${text}`;
  }
  copyTimer = window.setTimeout(() => {
    copyStatus.textContent = "";
  }, 8_000);
};

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => copy(button.dataset.question, "Question"));
});

document.querySelectorAll("[data-control]").forEach((button) => {
  button.addEventListener("click", () => {
    if (sessionId === null) return;
    void copy(
      `corepack pnpm conversation:control ${button.dataset.control} ${sessionId}`,
      "Command",
    );
  });
});

chatButton.addEventListener("click", () => {
  if (websiteId === null || loading) return;
  if (ready) {
    window.$crisp.push(["do", "chat:open"]);
    return;
  }
  loading = true;
  chatButton.disabled = true;
  chatStatus.textContent = "Loading the Crisp widget. No message is being sent.";
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = websiteId;
  const loadingTimer = window.setTimeout(() => {
    chatStatus.textContent =
      "Still waiting for Crisp. Check your connection and allow client.crisp.chat, then reload if it cannot load.";
  }, 15_000);
  window.CRISP_READY_TRIGGER = () => {
    window.clearTimeout(loadingTimer);
    loading = false;
    ready = true;
    chatButton.disabled = false;
    chatStatus.textContent =
      "Widget ready. Send a sample question; the API and worker must be running for an automated reply.";
  };
  window.$crisp.push([
    "on",
    "session:loaded",
    (identifier) => {
      if (
        typeof identifier !== "string" ||
        !/^session_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(identifier)
      )
        return;
      sessionId = identifier;
      document.querySelector("#session-id").textContent = identifier;
      document.querySelectorAll("[data-control]").forEach((button) => {
        button.disabled = false;
      });
    },
  ]);
  window.$crisp.push(["do", "chat:open"]);
  const script = document.createElement("script");
  script.src = "https://client.crisp.chat/l.js";
  script.async = true;
  script.onerror = () => {
    window.clearTimeout(loadingTimer);
    chatStatus.dataset.state = "error";
    chatStatus.textContent =
      "Crisp could not load. Check your connection or browser blocking, then reload the page to retry.";
  };
  document.head.append(script);
});

try {
  const response = await window.fetch("/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Configuration unavailable");
  const config = await response.json();
  if (
    typeof config.websiteId === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(config.websiteId)
  ) {
    websiteId = config.websiteId;
    chatButton.disabled = false;
    chatStatus.textContent =
      "Chat is configured. Opening it connects to your Crisp test workspace.";
  } else {
    chatStatus.textContent =
      "Chat is not configured. Set the public CRISP_WEBSITE_ID in .env and restart demo:crisp. You can still copy the sample questions.";
  }
} catch {
  chatStatus.dataset.state = "error";
  chatStatus.textContent =
    "Local configuration could not load. Restart demo:crisp and reload this page.";
}

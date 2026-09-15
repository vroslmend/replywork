const chatButton = document.querySelector("#open-chat");
const chatStatus = document.querySelector("#chat-status");
const copyStatus = document.querySelector("#copy-status");
const sessionOutput = document.querySelector("#session-id");
const commandOutput = document.querySelector("#command");
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const crispSession = /^session_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
let websiteId = null;
let sessionId = null;
let loading = false;
let ready = false;

const setChatStatus = (text, state) => {
  chatStatus.textContent = text;
  if (state === undefined) delete chatStatus.dataset.state;
  else chatStatus.dataset.state = state;
};

const copy = async (button, text) => {
  window.clearTimeout(Number(button.dataset.timer));
  button.dataset.label ??= button.textContent.trim();
  try {
    await window.navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    copyStatus.textContent = `Copied: ${text}`;
  } catch {
    button.textContent = "Copy failed";
    copyStatus.textContent = `Copy failed. Select the text instead: ${text}`;
  }
  button.dataset.timer = String(
    window.setTimeout(() => {
      button.textContent = button.dataset.label;
    }, 2_000),
  );
};

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", () => copy(button, button.dataset.copy));
});

document.querySelectorAll("[data-control]").forEach((button) => {
  button.addEventListener("click", () => {
    if (sessionId === null) return;
    void copy(button, `corepack pnpm conversation:control ${button.dataset.control} ${sessionId}`);
  });
});

const showSession = (identifier) => {
  if (typeof identifier !== "string" || !crispSession.test(identifier)) return;
  sessionId = identifier;
  sessionOutput.textContent = identifier;
  sessionOutput.classList.add("session-id");
  commandOutput.textContent = `corepack pnpm conversation:control <action> ${identifier}`;
  document.querySelectorAll("[data-control]").forEach((button) => {
    button.disabled = false;
  });
};

chatButton.addEventListener("click", () => {
  if (websiteId === null || loading) return;
  if (ready) {
    window.$crisp.push(["do", "chat:open"]);
    return;
  }
  loading = true;
  chatButton.disabled = true;
  setChatStatus("Loading Crisp…");
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = websiteId;
  const slowTimer = window.setTimeout(() => {
    setChatStatus(
      "Crisp is taking a while. Check that client.crisp.chat is not blocked, then reload.",
      "error",
    );
  }, 15_000);
  window.CRISP_READY_TRIGGER = () => {
    window.clearTimeout(slowTimer);
    loading = false;
    ready = true;
    chatButton.disabled = false;
    chatButton.textContent = "Show test chat";
    setChatStatus("Chat is open. Paste a question and send it.", "ready");
  };
  window.$crisp.push(["on", "session:loaded", showSession]);
  window.$crisp.push(["do", "chat:open"]);
  const script = document.createElement("script");
  script.src = "https://client.crisp.chat/l.js";
  script.async = true;
  script.onerror = () => {
    window.clearTimeout(slowTimer);
    setChatStatus("Crisp did not load. Check your connection or blocker, then reload.", "error");
  };
  document.head.append(script);
});

try {
  const response = await window.fetch("/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Configuration unavailable");
  const config = await response.json();
  if (typeof config.websiteId === "string" && uuid.test(config.websiteId)) {
    websiteId = config.websiteId;
    chatButton.disabled = false;
    setChatStatus("Chat is set up. Nothing loads from Crisp until you open it.");
  } else {
    setChatStatus(
      "Chat is off. Add your test workspace's CRISP_WEBSITE_ID to .env and restart demo:crisp.",
      "off",
    );
  }
} catch {
  setChatStatus("Could not read local settings. Restart demo:crisp and reload.", "error");
}

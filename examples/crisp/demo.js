const chatButton = document.querySelector("#open-chat");
const chatStatus = document.querySelector("#chat-status");
const copyStatus = document.querySelector("#copy-status");
let websiteId = null;
let sessionId = null;
let loading = false;
let ready = false;
let copyTimer;

const previews = {
  tote: {
    question: "What is the price and availability of the canvas tote?",
    routing: "Replywork identifies the product and the question.",
    sourceLabel: "Approved source",
    title: "Canvas tote",
    id: "example-canvas-tote",
    fields: [
      ["Stored price", "PKR 1,800"],
      ["Availability", "Listed available"],
      ["Description", "Natural cotton bag with two handles."],
    ],
    sourceNote: "Read only. No checkout or stock write.",
    resultLabel: "Stored-fact reply",
    result: "The canvas tote is PKR 1,800; listed as available.",
    resultNote: "Recorded availability, not a reservation.",
  },
  notebook: {
    question: "Do you have the pocket notebook?",
    routing: "The catalog record says this product is unavailable.",
    sourceLabel: "Approved source",
    title: "Pocket notebook",
    id: "example-pocket-notebook",
    fields: [
      ["Stored price", "PKR 450"],
      ["Availability", "Listed unavailable"],
      ["Description", "A6 notebook with 64 plain pages."],
    ],
    sourceNote: "Unavailable records remain visible. No stock claim.",
    resultLabel: "Stored-fact reply",
    result: "The pocket notebook is listed as unavailable in the catalog.",
    resultNote: "Recorded availability, not a stock reservation.",
  },
  handoff: {
    question: "I need a human.",
    routing: "The customer asks for a person. Automation stops for this conversation.",
    sourceLabel: "Bounded decision",
    title: "Human takeover",
    id: "handoff-intent / example-session",
    fields: [
      ["Request", "Human help"],
      ["Local state", "Automation paused"],
      ["Inbox state", "Unresolved"],
    ],
    sourceNote: "No catalog lookup or business write.",
    resultLabel: "Handoff decision",
    result: "Leave this conversation with a human operator.",
    resultNote: "A decision preview, not a customer-facing reply.",
  },
};

const previewElements = {
  question: document.querySelector("#preview-question"),
  routing: document.querySelector("#preview-routing"),
  sourceLabel: document.querySelector("#preview-source-label"),
  title: document.querySelector("#preview-title"),
  id: document.querySelector("#preview-id"),
  sourceNote: document.querySelector("#preview-source-note"),
  resultLabel: document.querySelector("#preview-result-label"),
  result: document.querySelector("#preview-result"),
  resultNote: document.querySelector("#preview-result-note"),
};

document.querySelectorAll("[data-preview]").forEach((button) => {
  button.addEventListener("click", () => {
    const preview = previews[button.dataset.preview];
    if (preview === undefined) return;
    document.querySelectorAll("[data-preview]").forEach((option) => {
      option.setAttribute("aria-pressed", String(option === button));
    });
    Object.entries(previewElements).forEach(([key, element]) => {
      element.textContent = preview[key];
    });
    preview.fields.forEach(([label, value], index) => {
      document.querySelector(`#preview-label-${index + 1}`).textContent = label;
      document.querySelector(`#preview-value-${index + 1}`).textContent = value;
    });
    document.querySelector("#preview-status").textContent =
      `${button.textContent} illustrative example selected.`;
  });
});

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

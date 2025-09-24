
const DEFAULT_MINTS = [
  "EyiVQN5W1s2z3DPrbZnQuxyzQBPpzvc1inyScUxxpump",
  "3sLSDYfmbu5ZdmC7wbBUzvwRFE6S1dtrTUafuhhApump",
  "2GX27q7vmNSUx7P3Xpu9HfD7KP8VZXqGcPcK7bxpump",
  "Bk8bozHooHNkUDaeXqydtA3NpUuDavhKqBHD3a6Xpump"
];

const STORAGE_KEY = "solana-token-favs:mints";
const MINT_PATTERN = /[1-9A-HJ-NP-Za-km-z]{32,}/g;
const SINGLE_MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,}$/;

const TOKEN_INFO_API = "https://lite-api.jup.ag/tokens/v2/search";
const TOKEN_PRICE_API = "https://lite-api.jup.ag/price/v3";
const QUERY_LIMIT_INFO = 100;
const QUERY_LIMIT_PRICE = 50;

const tokenGrid = document.getElementById("token-grid");
const template = document.getElementById("token-card-template");
const refreshButton = document.getElementById("refresh-button");
const refreshSelect = document.getElementById("refresh-select");
const lastUpdated = document.getElementById("last-updated");
const mintForm = document.getElementById("mint-form");
const mintInput = document.getElementById("mint-input");
const mintFeedback = document.getElementById("mint-feedback");
const toastRoot = document.getElementById("toast-root");

let refreshTimerId = null;
const previousPrices = new Map();
let trackedMints = loadTrackedMints();
let latestSnapshot = [];
let feedbackTimerId = null;
let toastTimerId = null;
let activeToast = null;

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("\u65e0\u6cd5\u8bbf\u95ee localStorage\uff0c\u5c06\u4e0d\u4f1a\u6301\u4e45\u5316\u6536\u85cf\u3002", error);
    return null;
  }
}

function isLikelyMint(value) {
  return typeof value === "string" && SINGLE_MINT_PATTERN.test(value.trim());
}

function loadTrackedMints() {
  const storage = getStorage();
  if (!storage) {
    return [...DEFAULT_MINTS];
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_MINTS];
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const deduped = [];
      for (const value of parsed) {
        if (!isLikelyMint(value)) continue;
        const mint = value.trim();
        if (!deduped.includes(mint)) {
          deduped.push(mint);
        }
      }
      return deduped;
    }
  } catch (error) {
    console.warn("\u8bfb\u53d6\u672c\u5730\u6536\u85cf\u5931\u8d25\uff0c\u4f7f\u7528\u9ed8\u8ba4\u5217\u8868\u3002", error);
  }

  return [...DEFAULT_MINTS];
}

function saveTrackedMints(mints) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(mints));
  } catch (error) {
    console.warn("\u4fdd\u5b58\u6536\u85cf\u5217\u8868\u5931\u8d25\u3002", error);
  }
}

function extractMints(text) {
  if (!text) return [];
  const matches = text.match(MINT_PATTERN) ?? [];
  const normalized = matches
    .map((value) => value.trim())
    .filter(isLikelyMint);
  return Array.from(new Set(normalized));
}

function getPriceChange(stats) {
  if (stats == null) return null;
  if (typeof stats === "number") return stats;
  if (typeof stats.priceChange === "number") return stats.priceChange;
  if (typeof stats.price_change === "number") return stats.price_change;
  if (typeof stats.change === "number") return stats.change;
  return null;
}

function showFeedback(message, status = "info") {

  if (!mintFeedback) return;
  if (feedbackTimerId) {
    clearTimeout(feedbackTimerId);
  }

  mintFeedback.textContent = message;
  mintFeedback.dataset.status = status;
  mintFeedback.hidden = false;

  feedbackTimerId = setTimeout(() => {
    mintFeedback.textContent = "";
    mintFeedback.dataset.status = "";
    mintFeedback.hidden = true;
    feedbackTimerId = null;
  }, 4000);
}

function clearFeedback() {
  if (!mintFeedback) return;
  if (feedbackTimerId) {
    clearTimeout(feedbackTimerId);
    feedbackTimerId = null;
  }
  mintFeedback.textContent = "";
  mintFeedback.dataset.status = "";
  mintFeedback.hidden = true;
}

async function fetchTokenInfos(mints) {
  const infoMap = new Map();
  for (const mintChunk of chunk(mints, QUERY_LIMIT_INFO)) {
    const url = new URL(TOKEN_INFO_API);
    url.searchParams.set("query", mintChunk.join(","));

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`\u83b7\u53d6 Token \u57fa\u7840\u4fe1\u606f\u5931\u8d25: ${response.status}`);
    }

    const data = await response.json();
    for (const token of data) {
      infoMap.set(token.id, token);
    }
  }
  return infoMap;
}

async function fetchTokenPrices(mints) {
  const priceMap = new Map();
  for (const mintChunk of chunk(mints, QUERY_LIMIT_PRICE)) {
    const url = new URL(TOKEN_PRICE_API);
    url.searchParams.set("ids", mintChunk.join(","));

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`\u83b7\u53d6 Token \u4ef7\u683c\u5931\u8d25: ${response.status}`);
    }

    const data = await response.json();
    for (const [mint, value] of Object.entries(data)) {
      priceMap.set(mint, value);
    }
  }
  return priceMap;
}

function formatNumber(value, options = {}) {
  if (value == null || Number.isNaN(value)) return "--";
  const { style = "decimal", maximumFractionDigits = 2 } = options;
  return new Intl.NumberFormat("en-US", {
    ...options,
    style,
    maximumFractionDigits,
    currency: style === "currency" ? "USD" : options.currency
  }).format(value);
}

function formatCurrency(value, { compact = false } = {}) {
  if (value == null || Number.isNaN(value)) return "--";
  const digits = value < 1 ? 6 : value < 10 ? 4 : 2;
  const useCompact = compact || value >= 1_000_000;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    notation: useCompact ? "compact" : undefined
  }).format(value);
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatMintPreview(mint) {
  if (!mint) return "--";
  if (mint.length <= 10) return mint;
  return `${mint.slice(0, 6)}...${mint.slice(-4)}`;
}

function showToast(message, status = "info") {
  if (!toastRoot) return;

  if (toastTimerId) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }

  if (activeToast) {
    activeToast.classList.remove("visible");
    activeToast.addEventListener(
      "transitionend",
      () => {
        if (activeToast && activeToast.parentElement) {
          activeToast.remove();
        }
      },
      { once: true }
    );
    activeToast = null;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.status = status;
  toast.textContent = message;
  toastRoot.appendChild(toast);
  activeToast = toast;

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  toastTimerId = setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener(
      "transitionend",
      () => {
        if (toast.parentElement) {
          toast.remove();
        }
      },
      { once: true }
    );
    activeToast = null;
    toastTimerId = null;
  }, 3200);
}

async function copyMintToClipboard(mint) {
  if (!mint) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(mint);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = mint;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    const label = formatMintPreview(mint);
    showToast(`\u5df2\u590d\u5236 ${label}`, "success");
  } catch (error) {
    console.error("\u590d\u5236 mint \u5931\u8d25", error);
    showToast("\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5", "error");
  }
}

function addTrackedMints(newMints) {
  if (!newMints.length) {
    showFeedback("\u672a\u8bc6\u522b\u5230\u6709\u6548 mint \u5730\u5740\u3002", "error");
    return { added: 0, duplicates: 0 };
  }

  const uniqueNew = [];
  const duplicates = [];

  for (const mint of newMints) {
    if (trackedMints.includes(mint)) {
      duplicates.push(mint);
    } else {
      uniqueNew.push(mint);
    }
  }

  if (!uniqueNew.length) {
    showFeedback("\u8fd9\u4e9b mint \u5df2\u7ecf\u5728\u5173\u6ce8\u5217\u8868\u4e2d\u4e86\u3002", "info");
    return { added: 0, duplicates: duplicates.length };
  }

  trackedMints = [...uniqueNew, ...trackedMints];
  saveTrackedMints(trackedMints);

  for (const mint of uniqueNew) {
    previousPrices.delete(mint);
  }

  const addedText = `\u5df2\u6dfb\u52a0 ${uniqueNew.length} \u4e2a Token\u3002`;
  const message = duplicates.length
    ? `${addedText} \u5ffd\u7565 ${duplicates.length} \u4e2a\u91cd\u590d\u9879\u3002`
    : addedText;
  showFeedback(message, "success");

  refresh();

  return { added: uniqueNew.length, duplicates: duplicates.length };
}

function removeTrackedMint(mint) {
  if (!trackedMints.includes(mint)) {
    return;
  }

  trackedMints = trackedMints.filter((value) => value !== mint);
  saveTrackedMints(trackedMints);
  previousPrices.delete(mint);

  latestSnapshot = latestSnapshot.filter((token) => token.mint !== mint);
  renderTokens(latestSnapshot);

  if (!trackedMints.length) {
    lastUpdated.textContent = "\u8bf7\u5148\u6dfb\u52a0\u9700\u8981\u8ddf\u8e2a\u7684 Token mint \u5730\u5740";
  }

  const label = formatMintPreview(mint);
  showFeedback(`\u5df2\u79fb\u9664 ${label}`, "info");
}

function setLink(anchor, href) {
  if (href) {
    anchor.href = href;
    anchor.hidden = false;
  } else {
    anchor.hidden = true;
  }
}

function renderTokens(tokens) {
  latestSnapshot = tokens;
  tokenGrid.replaceChildren();

  if (!tokens.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "\u6682\u65e0\u6536\u85cf Token\uff0c\u8bf7\u5728\u4e0a\u65b9\u8f93\u5165 mint \u5730\u5740\u4ee5\u5f00\u59cb\u5173\u6ce8\u3002";
    tokenGrid.append(empty);
    return;
  }

  for (const token of tokens) {
    const { info, price } = token;
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.mint = token.mint;

    const icon = node.querySelector(".token-icon");
    icon.loading = "lazy";
    icon.src = info?.icon ?? "https://placehold.co/80x80/20232a/8b949e?text=Token";
    icon.alt = info?.symbol ? `${info.symbol} \u56fe\u6807` : "Token \u56fe\u6807";

    const symbolField = node.querySelector(".symbol");
    if (symbolField) {
      const fallback = token.mint.slice(0, 6).toUpperCase();
      const rawSymbol = info?.symbol ? `$${info.symbol}` : fallback;
      symbolField.textContent = rawSymbol;
    }

    const nameField = node.querySelector(".token-name");
    if (nameField) {
      nameField.textContent = info?.name ?? "\u672a\u77e5 Token";
    }

    const mintField = node.querySelector(".mint");
    if (mintField) {
      mintField.textContent = formatMintPreview(token.mint);
      mintField.title = token.mint;
    }

    const copyButton = node.querySelector(".copy-mint");
    if (copyButton) {
      copyButton.dataset.mint = token.mint;
    }

    const marketCap = info?.mcap;
    const marketField = node.querySelector(".market-cap");
    const metaContainer = node.querySelector(".token-meta");
    if (marketField) {
      const displayValue = marketCap != null ? formatCurrency(marketCap, { compact: true }) : "--";
      marketField.textContent = displayValue;
    }
    if (metaContainer) {
      metaContainer.hidden = marketCap == null;
    }

    const statsTargets = [
      { selector: ".stat-1h", label: "1H", value: info?.stats1h ?? price?.stats1h },
      { selector: ".stat-6h", label: "6H", value: info?.stats6h ?? price?.stats6h },
      { selector: ".stat-24h", label: "24H", value: info?.stats24h ?? price?.stats24h }
    ];

    for (const { selector, label, value } of statsTargets) {
      const nodeTarget = node.querySelector(selector);
      if (!nodeTarget) continue;
      let change = getPriceChange(value);
      if (change == null && selector == ".stat-24h" && typeof (price?.priceChange24h) === "number") {
        change = price.priceChange24h;
      }
      nodeTarget.textContent = change != null ? `${label} ${formatPercent(change)}` : `${label} --`;
      nodeTarget.classList.remove("gain", "loss");
      if (change != null && change !== 0) {
        nodeTarget.classList.add(change > 0 ? "gain" : "loss");
      }
    }

    const links = {
      website: info?.website,
      twitter: info?.twitter,
      telegram: info?.telegram
    };
    setLink(node.querySelector(".website"), links.website);
    setLink(node.querySelector(".twitter"), links.twitter);
    setLink(node.querySelector(".telegram"), links.telegram);

    const removeButton = node.querySelector(".token-remove");
    if (removeButton) {
      removeButton.dataset.mint = token.mint;
    }

    tokenGrid.append(node);
  }
}

async function refresh() {
  const mints = trackedMints.slice();
  if (!mints.length) {
    renderTokens([]);
    lastUpdated.textContent = "\u8bf7\u5148\u6dfb\u52a0\u9700\u8981\u8ddf\u8e2a\u7684 Token mint \u5730\u5740";
    return;
  }

  lastUpdated.textContent = "\u6570\u636e\u52a0\u8f7d\u4e2d\u2026";
  tokenGrid.classList.add("loading");

  try {
    const [infoMap, priceMap] = await Promise.all([
      fetchTokenInfos(mints),
      fetchTokenPrices(mints)
    ]);

    const merged = mints.map((mint) => ({
      mint,
      info: infoMap.get(mint) ?? null,
      price: priceMap.get(mint) ?? null
    }));

    renderTokens(merged);

    for (const { mint, price, info } of merged) {
      const value = price?.usdPrice ?? info?.usdPrice;
      if (value != null) {
        previousPrices.set(mint, value);
      }
    }

    const now = new Date();
    lastUpdated.textContent = `\u6700\u540e\u66f4\u65b0\uff1a${now.toLocaleString("zh-CN", {
      hour12: false
    })}`;
  } catch (error) {
    console.error(error);
    const errorBox = document.createElement("div");
    errorBox.className = "empty-state";
    errorBox.textContent = `\u52a0\u8f7d\u5931\u8d25\uff1a${error.message}`;
    tokenGrid.replaceChildren(errorBox);
    lastUpdated.textContent = "\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5";
  } finally {
    tokenGrid.classList.remove("loading");
  }
}

function scheduleRefresh() {
  if (refreshTimerId) {
    clearInterval(refreshTimerId);
  }
  const interval = Number.parseInt(refreshSelect.value, 10);
  if (Number.isFinite(interval) && interval > 0) {
    refreshTimerId = setInterval(refresh, interval);
  }
}

if (mintForm) {
  mintForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const rawInput = mintInput?.value ?? "";
    const mints = extractMints(rawInput);
    const result = addTrackedMints(mints);
    if (mintInput) {
      if (result?.added) {
        mintInput.value = "";
      }
      mintInput.focus();
    }
  });
}

if (mintInput) {
  mintInput.addEventListener("input", () => {
    clearFeedback();
  });
}

tokenGrid.addEventListener("click", (event) => {
  const copyButton = event.target.closest(".copy-mint");
  if (copyButton) {
    const { mint } = copyButton.dataset;
    if (mint) {
      copyMintToClipboard(mint);
    }
    return;
  }

  const removeButton = event.target.closest(".token-remove");
  if (!removeButton) return;
  const { mint } = removeButton.dataset;
  if (!mint) return;
  removeTrackedMint(mint);
});

refreshButton.addEventListener("click", () => {
  refresh();
});

refreshSelect.addEventListener("change", () => {
  scheduleRefresh();
  refresh();
});

refresh().then(() => {
  scheduleRefresh();
});

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

let refreshTimerId = null;
const previousPrices = new Map();
let trackedMints = loadTrackedMints();
let latestSnapshot = [];
let feedbackTimerId = null;

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
    console.warn("无法访问 localStorage，将不会持久化收藏。", error);
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
    console.warn("读取本地收藏失败，使用默认列表。", error);
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
    console.warn("保存收藏列表失败。", error);
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
      throw new Error(`获取 Token 基础信息失败: ${response.status}`);
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
      throw new Error(`获取 Token 价格失败: ${response.status}`);
    }

    const data = await response.json();
    for (const [mint, value] of Object.entries(data)) {
      priceMap.set(mint, value);
    }
  }
  return priceMap;
}

function formatNumber(value, { style = "decimal", maximumFractionDigits = 2 } = {}) {
  if (value == null || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    style,
    currency: style === "currency" ? "USD" : undefined,
    maximumFractionDigits,
    notation: style === "currency" && value >= 1_000_000 ? "compact" : undefined
  }).format(value);
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return "--";
  const opts = {
    style: "currency",
    maximumFractionDigits: value < 1 ? 6 : value < 10 ? 4 : 2
  };
  return formatNumber(value, opts);
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function addTrackedMints(newMints) {
  if (!newMints.length) {
    showFeedback("未识别到有效的 mint 地址。", "error");
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
    showFeedback("这些 mint 已经在关注列表中。", "info");
    return { added: 0, duplicates: duplicates.length };
  }

  trackedMints = [...uniqueNew, ...trackedMints];
  saveTrackedMints(trackedMints);

  for (const mint of uniqueNew) {
    previousPrices.delete(mint);
  }

  const addedText = `已添加 ${uniqueNew.length} 个 Token。`;
  const message = duplicates.length
    ? `${addedText} 忽略 ${duplicates.length} 个重复项。`
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
    lastUpdated.textContent = "请先添加需要跟踪的 Token mint 地址";
  }

  const label = `${mint.slice(0, 4)}…${mint.slice(-4)}`;
  showFeedback(`已移除 ${label}。`, "info");
}

function buildAuditList(audit) {
  if (!audit) return [];
  const result = [];
  if (audit.mintAuthorityDisabled != null) {
    result.push(`Mint Authority ${audit.mintAuthorityDisabled ? "已禁用" : "未禁用"}`);
  }
  if (audit.freezeAuthorityDisabled != null) {
    result.push(`Freeze Authority ${audit.freezeAuthorityDisabled ? "已禁用" : "未禁用"}`);
  }
  if (audit.topHoldersPercentage != null) {
    result.push(`前十大持币占比 ${audit.topHoldersPercentage.toFixed(2)}%`);
  }
  if (audit.devBalancePercentage != null) {
    result.push(`开发者持币占比 ${(audit.devBalancePercentage * 100).toFixed(4)}%`);
  }
  if (audit.devMigrations != null) {
    result.push(`开发者迁移次数 ${audit.devMigrations}`);
  }
  if (audit.highSingleOwnership != null) {
    result.push(`单一地址高持币：${audit.highSingleOwnership ? "是" : "否"}`);
  }
  return result;
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
    empty.textContent = "暂无收藏 Token，请在上方输入 mint 地址以开始关注。";
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
    icon.alt = info?.symbol ? `${info.symbol} 图标` : "Token 图标";

    node.querySelector("h2").textContent = info?.name ?? "未知 Token";
    node.querySelector(".symbol").textContent = info?.symbol ? `#${info.symbol}` : token.mint.slice(0, 6);
    const mintField = node.querySelector(".mint");
    if (mintField) {
      mintField.textContent = token.mint;
      mintField.title = token.mint;
    }

    const usdPrice = price?.usdPrice ?? info?.usdPrice;
    const marketCap = info?.mcap;
    const liquidity = info?.liquidity;
    const priceChange = price?.priceChange24h ?? info?.stats24h?.priceChange;

    const priceField = node.querySelector(".price");
    priceField.textContent = formatCurrency(usdPrice);
    const previous = previousPrices.get(token.mint);
    if (previous != null && usdPrice != null) {
      const diff = usdPrice - previous;
      if (Math.abs(diff) > 0) {
        const trend = document.createElement("span");
        trend.className = "price-trend";
        trend.textContent = ` (${diff > 0 ? "↑" : "↓"}${formatNumber(Math.abs(diff), {
          style: "currency",
          maximumFractionDigits: usdPrice < 1 ? 6 : 4
        })})`;
        priceField.appendChild(trend);
      }
    }

    node.querySelector(".market-cap").textContent = marketCap != null ? formatCurrency(marketCap) : "--";
    node.querySelector(".liquidity").textContent = liquidity != null ? formatCurrency(liquidity) : "--";

    const changeField = node.querySelector(".price-change");
    changeField.textContent = formatPercent(priceChange);
    if (priceChange != null) {
      changeField.classList.add(priceChange >= 0 ? "gain" : "loss");
    }

    const links = {
      website: info?.website,
      twitter: info?.twitter,
      telegram: info?.telegram
    };
    setLink(node.querySelector(".website"), links.website);
    setLink(node.querySelector(".twitter"), links.twitter);
    setLink(node.querySelector(".telegram"), links.telegram);

    const auditContainer = node.querySelector(".audit");
    const auditItems = buildAuditList(info?.audit);
    if (auditItems.length) {
      const list = auditContainer.querySelector("ul");
      for (const item of auditItems) {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      }
      auditContainer.hidden = false;
    }

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
    lastUpdated.textContent = "请先添加需要跟踪的 Token mint 地址";
    return;
  }

  lastUpdated.textContent = "数据加载中…";
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
    lastUpdated.textContent = `最后更新：${now.toLocaleString("zh-CN", {
      hour12: false
    })}`;
  } catch (error) {
    console.error(error);
    const errorBox = document.createElement("div");
    errorBox.className = "empty-state";
    errorBox.textContent = `加载失败：${error.message}`;
    tokenGrid.replaceChildren(errorBox);
    lastUpdated.textContent = "加载失败，请稍后重试";
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
  const button = event.target.closest(".token-remove");
  if (!button) return;
  const { mint } = button.dataset;
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

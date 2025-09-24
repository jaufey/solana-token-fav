const DEFAULT_MINTS = [
  "EyiVQN5W1s2z3DPrbZnQuxyzQBPpzvc1inyScUxxpump",
  "3sLSDYfmbu5ZdmC7wbBUzvwRFE6S1dtrTUafuhhApump",
  "2GX27q7vmNSUx7P3Xpu9HfD7KP8VZXqGcPcK7bxpump",
  "Bk8bozHooHNkUDaeXqydtA3NpUuDavhKqBHD3a6Xpump"
];

const STORAGE_KEY = "solana-token-favs:mints";
const THEME_STORAGE_KEY = "solana-token-favs:theme";
const VIEW_STORAGE_KEY = "solana-token-favs:view";
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
const themeToggle = document.getElementById("theme-toggle");
const viewToggle = document.getElementById("view-toggle");
const toastRoot = document.getElementById("toast-root");
const searchInput = document.getElementById("token-search");

let refreshTimerId = null;
const previousPrices = new Map();
let trackedMints = loadTrackedMints();
let latestSnapshot = [];
let searchQuery = '';
let feedbackTimerId = null;
let toastTimerId = null;
let activeToast = null;

let lastClipboardText = null;
let clipboardReadInFlight = false;

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function isDocumentVisible() {
  if (typeof document === 'undefined') {
    return false;
  }
  if (typeof document.visibilityState === 'string') {
    return document.visibilityState === 'visible';
  }
  if (typeof document.hasFocus === 'function') {
    return document.hasFocus();
  }
  return true;
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

function loadThemePreference() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch (error) {
    console.warn("读取主题偏好失败，将根据系统设置显示主题。", error);
  }
  return null;
}

function saveThemePreference(theme) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn("保存主题偏好失败。", error);
  }
}

function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  const body = document.body;
  if (!body) {
    return;
  }
  body.dataset.theme = normalized;
  if (themeToggle) {
    const isLight = normalized === "light";
    themeToggle.setAttribute("aria-pressed", isLight ? "true" : "false");
    themeToggle.textContent = isLight ? "🌙" : "☀️";
    const label = isLight ? "切换到暗色主题" : "切换到亮色主题";
    themeToggle.setAttribute("aria-label", label);
    themeToggle.title = label;
  }
}

function resolvePreferredTheme() {
  const stored = loadThemePreference();
  if (stored) {
    return { theme: stored, fromStorage: true };
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)");
    return { theme: prefersLight.matches ? "light" : "dark", fromStorage: false, mediaQuery: prefersLight };
  }
  return { theme: "dark", fromStorage: false, mediaQuery: null };
}

const preferredTheme = resolvePreferredTheme();
let userHasThemePreference = preferredTheme.fromStorage;
applyTheme(preferredTheme.theme);

if (preferredTheme.mediaQuery) {
  const handleThemeMediaChange = (event) => {
    if (userHasThemePreference) {
      return;
    }
    applyTheme(event.matches ? "light" : "dark");
  };
  if (typeof preferredTheme.mediaQuery.addEventListener === "function") {
    preferredTheme.mediaQuery.addEventListener("change", handleThemeMediaChange);
  } else if (typeof preferredTheme.mediaQuery.addListener === "function") {
    preferredTheme.mediaQuery.addListener(handleThemeMediaChange);
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.body?.dataset.theme === "light" ? "light" : "dark";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    userHasThemePreference = true;
    applyTheme(nextTheme);
    saveThemePreference(nextTheme);
  });
}

function loadViewPreference() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    const stored = storage.getItem(VIEW_STORAGE_KEY);
    if (stored === "compact" || stored === "expanded") {
      return stored;
    }
  } catch (error) {
    console.warn("读取卡片视图偏好失败。", error);
  }
  return null;
}

function saveViewPreference(view) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(VIEW_STORAGE_KEY, view);
  } catch (error) {
    console.warn("保存卡片视图偏好失败。", error);
  }
}

function applyView(view) {
  const body = document.body;
  if (!body) {
    return;
  }
  const normalized = view === "compact" ? "compact" : "expanded";
  body.dataset.view = normalized;
  if (viewToggle) {
    const isCompact = normalized === "compact";
    viewToggle.setAttribute("aria-pressed", isCompact ? "true" : "false");
    const label = isCompact ? "切换到完整模式" : "切换到紧凑模式";
    viewToggle.textContent = isCompact ? "完整" : "紧凑";
    viewToggle.setAttribute("aria-label", label);
    viewToggle.title = label;
  }
  updateSymbolDisplays(normalized);
}

const preferredView = loadViewPreference() ?? "expanded";
applyView(preferredView);

if (viewToggle) {
  viewToggle.addEventListener("click", () => {
    const current = document.body?.dataset.view === "compact" ? "compact" : "expanded";
    const next = current === "compact" ? "expanded" : "compact";
    applyView(next);
    saveViewPreference(next);
  });
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

async function tryImportMintsFromClipboard() {
  if (clipboardReadInFlight) {
    return;
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    return;
  }

  clipboardReadInFlight = true;

  try {
    const text = await navigator.clipboard.readText();
    if (typeof text !== 'string') {
      lastClipboardText = null;
      return;
    }
    if (!text.trim()) {
      lastClipboardText = null;
      return;
    }
    if (text === lastClipboardText) {
      return;
    }

    const mints = extractMints(text);
    if (!mints.length) {
      lastClipboardText = text;
      return;
    }

    lastClipboardText = text;
    addTrackedMints(mints);
  } catch (error) {
    console.warn('读取剪贴板内容失败', error);
  } finally {
    clipboardReadInFlight = false;
  }
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

function normalizeSymbol(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().replace(/^\$/u, "");
  return trimmed ? trimmed.toUpperCase() : "";
}

function formatSymbolForView(symbol, viewMode) {
  const view = viewMode === "compact" ? "compact" : "expanded";
  if (!symbol) return symbol;
  return view === "compact" ? symbol : (symbol.startsWith("$") ? symbol : `$${symbol}`);
}

function updateSymbolDisplays(viewMode) {
  if (typeof document === "undefined") {
    return;
  }
  const view = viewMode === "compact" ? "compact" : "expanded";
  const symbols = document.querySelectorAll(".token-card .symbol");
  symbols.forEach((element) => {
    const baseSymbol = element.dataset.baseSymbol;
    if (!baseSymbol) return;
    element.textContent = formatSymbolForView(baseSymbol, view);
  });
}

function applySearchFilter(tokens, query) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return [];
  }
  if (!query) {
    return tokens;
  }
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return tokens;
  }
  return tokens.filter(({ mint, info }) => {
    const mintValue = typeof mint === "string" ? mint.toLowerCase() : "";
    const symbolRaw = normalizeSymbol(info?.symbol);
    const symbolValue = symbolRaw ? symbolRaw.toLowerCase() : "";
    return mintValue.includes(normalized) || symbolValue.includes(normalized);
  });
}

function updateTokenView() {
  const filtered = applySearchFilter(latestSnapshot, searchQuery);
  renderTokens(filtered);
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
    showToast(`已复制 ${label}`, "success");
  } catch (error) {
    console.error("复制 mint 失败", error);
    showToast("复制失败，请稍后重试", "error");
  }
}

function addTrackedMints(newMints) {
  if (!newMints.length) {
    showFeedback("未识别到有效 mint 地址。", "error");
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
    showFeedback("这些 mint 已经在关注列表中了。", "info");
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
  updateTokenView();

  if (!trackedMints.length) {
    lastUpdated.textContent = "请先添加需要跟踪的 Token mint 地址";
  }

  const label = formatMintPreview(mint);
  showFeedback(`已移除 ${label}`, "info");
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
  tokenGrid.replaceChildren();

  const activeQuery = typeof searchQuery === "string" ? searchQuery.trim() : "";
  const isFiltering = activeQuery.length > 0;
  if (!tokens.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = isFiltering && latestSnapshot.length
      ? "未找到匹配的 Token，换个 mint 或 symbol 试试"
      : "暂无收藏 Token，请在上方输入 mint 地址以开始关注。";
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

    const symbolField = node.querySelector(".symbol");
    if (symbolField) {
      const fallback = token.mint.slice(0, 6).toUpperCase();
      const baseSymbol = normalizeSymbol(info?.symbol) || fallback;
      symbolField.dataset.baseSymbol = baseSymbol;
      symbolField.textContent = formatSymbolForView(baseSymbol, document.body?.dataset.view);
    }

    const nameField = node.querySelector(".token-name");
    if (nameField) {
      nameField.textContent = info?.name ?? "未知 Token";
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

  updateSymbolDisplays(document.body?.dataset.view);
}

async function refresh() {
  const mints = trackedMints.slice();
  if (!mints.length) {
    latestSnapshot = [];
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

    latestSnapshot = merged;
    updateTokenView();

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

if (searchInput) {
  searchQuery = searchInput.value.trim();
  const handleSearchInput = () => {
    searchQuery = searchInput.value.trim();
    updateTokenView();
  };
  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("search", handleSearchInput);
}

const handlePageActivation = () => {
  if (!isDocumentVisible()) {
    return;
  }
  void tryImportMintsFromClipboard();
};

window.addEventListener('focus', handlePageActivation, false);
window.addEventListener('pageshow', handlePageActivation, false);

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', handlePageActivation, false);
}

if (isDocumentVisible()) {
  void tryImportMintsFromClipboard();
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
  if (removeButton) {
    const { mint } = removeButton.dataset;
    if (mint) {
      removeTrackedMint(mint);
    }
    return;
  }

  if (document.body?.dataset.view === "compact") {
    const interactive = event.target.closest("button, a");
    if (interactive) {
      return;
    }
    const card = event.target.closest(".token-card");
    if (!card) {
      return;
    }
    const mint = card.dataset.mint;
    if (mint) {
      copyMintToClipboard(mint);
    }
  }
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
const DEFAULT_MINTS = [
  "Eppcp4FhG6wmaRno3omWWvKsZHbzucVLR316SdXopump",
  "wCtiCRJz69a5Mqkk2nHmvQwBGQCrUvM8fELoFGqpump",
  "H8xQ6poBjB9DTPMDTKWzWPrnxu4bDEhybxiouF8Ppump",
  "623fhWRdnYVxQKe1RcZvVHxTDeAftRGBApUtzrRKpump"
];

const STORAGE_KEY = "solana-token-favs:mints";
const THEME_STORAGE_KEY = "solana-token-favs:theme";
const VIEW_STORAGE_KEY = "solana-token-favs:view";
const STYLE_STORAGE_KEY = "solana-token-favs:style";
const STYLE_OPTIONS = [
  "styles.css",
  "styles-gemini.css",
  "styles-gemini-2.css",
  "styles-gemini-3.css"
];
const DEFAULT_STYLE = STYLE_OPTIONS[0];
const MINT_PATTERN = /[1-9A-HJ-NP-Za-km-z]{32,}/g;
const SINGLE_MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,}$/;

const VIEW_TRANSITION_CARD_LIMIT = 36;

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
const styleSelect = document.getElementById("style-select");
const styleSheetLink = document.getElementById("app-style-sheet");
const toastRoot = document.getElementById("toast-root");
const searchInput = document.getElementById("token-search");
const backToTopButton = document.getElementById("back-to-top-button");
const loader = document.getElementById("loader");

if (toastRoot) {
  toastRoot.style.position = 'fixed';
  toastRoot.style.display = 'grid';
  toastRoot.style.pointerEvents = 'none';
  toastRoot.style.zIndex = '1000';
  toastRoot.style.top = '2rem';
  toastRoot.style.left = '50%';
  toastRoot.style.right = 'auto';
  toastRoot.style.bottom = 'auto';
  toastRoot.style.transform = 'translateX(-50%)';
  toastRoot.style.width = 'min(90vw, 420px)';
  toastRoot.style.setProperty('justify-items', 'center');
}

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

function normalizeStyleId(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return STYLE_OPTIONS.includes(trimmed) ? trimmed : null;
}

function loadStylePreference() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    const stored = storage.getItem(STYLE_STORAGE_KEY);
    return normalizeStyleId(stored);
  } catch (error) {
    console.warn("读取样式偏好失败。", error);
  }
  return null;
}

function saveStylePreference(style) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STYLE_STORAGE_KEY, style);
  } catch (error) {
    console.warn("保存样式偏好失败。", error);
  }
}

function applyStyleSheet(style, options = {}) {
  const { persist = true, updateControl = true } = options;
  const normalized = normalizeStyleId(style) ?? DEFAULT_STYLE;
  if (styleSheetLink) {
    styleSheetLink.setAttribute("href", normalized);
  } else {
    console.warn("未找到样式链接节点，无法切换样式。");
  }
  const body = document.body;
  if (body) {
    const styleName = normalized.replace(/\.css$/i, "");
    body.dataset.style = styleName;
  }
  if (updateControl && styleSelect) {
    if (styleSelect.value !== normalized) {
      styleSelect.value = normalized;
    }
  }
  if (persist) {
    saveStylePreference(normalized);
  }
  return normalized;
}

const preferredStyle = loadStylePreference() ?? DEFAULT_STYLE;
applyStyleSheet(preferredStyle, { persist: false });

if (styleSelect) {
  styleSelect.addEventListener("change", (event) => {
    const target = event.target;
    const value = typeof target?.value === "string" ? target.value : DEFAULT_STYLE;
    const nextStyle = normalizeStyleId(value) ?? DEFAULT_STYLE;
    applyStyleSheet(nextStyle, { updateControl: false });
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

function shouldUseViewTransition() {
  if (typeof document === 'undefined') {
    return false;
  }
  if (typeof document.visibilityState === 'string' && document.visibilityState !== 'visible') {
    return false;
  }
  if (!tokenGrid) {
    return true;
  }
  if (Number.isFinite(VIEW_TRANSITION_CARD_LIMIT) && tokenGrid.childElementCount > VIEW_TRANSITION_CARD_LIMIT) {
    return false;
  }
  return true;
}

function switchViewWithTransition(view) {
  const start = typeof document !== "undefined" ? document.startViewTransition : null;
  if (typeof start === "function" && shouldUseViewTransition()) {
    start.call(document, () => {
      applyView(view);
      saveViewPreference(view);
    });
    return;
  }
  applyView(view);
  saveViewPreference(view);
}

const preferredView = loadViewPreference() ?? "expanded";
applyView(preferredView);

if (viewToggle) {
  viewToggle.addEventListener("click", () => {
    const current = document.body?.dataset.view === "compact" ? "compact" : "expanded";
    const next = current === "compact" ? "expanded" : "compact";
    switchViewWithTransition(next);
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
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
}

function buildViewTransitionName(prefix, mint) {
  if (!prefix || !mint) {
    return '';
  }
  const safePrefix = String(prefix).trim();
  if (!safePrefix) {
    return '';
  }
  const sanitized = mint.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safePrefix}-${sanitized}`;
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
  const canAnimate = filtered.length <= VIEW_TRANSITION_CARD_LIMIT && shouldUseViewTransition();
  if (typeof document.startViewTransition === 'function' && canAnimate) {
    document.startViewTransition(() => renderTokens(filtered, {canAnimate}));
    return;
  }
  renderTokens(filtered, {canAnimate});
}
function showToast(message, status = "info") {
  if (!toastRoot) return;

  const staleToasts = Array.from(toastRoot.children).filter((node) => node !== activeToast && !node.classList.contains('visible'));
  for (const node of staleToasts) {
    node.remove();
  }

  if (toastTimerId) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }

  const previous = activeToast;
  if (previous) {
    previous.classList.remove("visible");
    previous.addEventListener(
      "transitionend",
      () => {
        if (previous.parentElement) {
          previous.remove();
        }
      },
      { once: true }
    );
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
    if (activeToast === toast) {
      activeToast = null;
    }
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

async function removeTrackedMint(mint) {
  if (!trackedMints.includes(mint)) {
    return;
  }

  const card = tokenGrid.querySelector(`.token-card[data-mint="${mint}"]`);

  // 如果找到了卡片并且 anime.js 可用，则播放退场动画
  if (card && typeof anime === "function") {
    await anime({
      targets: card,
      opacity: 0,
      scale: 0.9,
      translateY: 20,
      duration: 300,
      easing: "easeInExpo",
    }).finished;
  }

  // 动画结束后，更新数据并重新渲染
  trackedMints = trackedMints.filter((m) => m !== mint);
  saveTrackedMints(trackedMints);
  latestSnapshot = latestSnapshot.filter((token) => token.mint !== mint);
  updateTokenView(); // 重新渲染以确保布局正确

  if (!trackedMints.length) {
    lastUpdated.textContent = "请先添加需要跟踪的 Token mint 地址";
  }

  const label = formatMintPreview(mint);
  showToast(`已移除 ${label}`, "info");
}

function setLink(anchor, href) {
  if (href) {
    anchor.href = href;
    anchor.hidden = false;
  } else {
    anchor.hidden = true;
  }
}

function renderTokens(tokens, {canAnimate} = {canAnimate:false}) {
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

    const cardTransitionName = canAnimate ? buildViewTransitionName('token-card', token.mint) : '';
    if (cardTransitionName) {
      node.style.viewTransitionName = cardTransitionName;
    } else {
      node.style.removeProperty('view-transition-name');
    }

    node.dataset.mint = token.mint;
    const imageWrapper = node.querySelector(".token-image");
    if (imageWrapper) {
      imageWrapper.style.viewTransitionName = buildViewTransitionName("token-image", token.mint);
    }

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
      telegram: info?.telegram,
      axiom: token.mint ? `https://axiom.trade/t/${token.mint}` : null
    };
    setLink(node.querySelector(".website"), links.website);
    setLink(node.querySelector(".twitter"), links.twitter);
    setLink(node.querySelector(".telegram"), links.telegram);
    setLink(node.querySelector(".axiom"), links.axiom);

    const removeButton = node.querySelector(".token-remove");
    if (removeButton) {
      removeButton.dataset.mint = token.mint;
    }

    tokenGrid.append(node);
  }

  updateSymbolDisplays(document.body?.dataset.view);

  // 使用 anime.js 为卡片添加入场动画
  if (typeof anime === "function") {
    anime({
      targets: ".token-card",
      translateY: [50, 0],
      opacity: [0, 1],
      delay: anime.stagger(50, { grid: [Math.ceil(tokens.length / 3), 3], from: "first" }),
      duration: 800,
      easing: "easeOutElastic(1, .8)",
      // 初始时隐藏卡片，等待动画开始
      begin: (anim) => {
        anim.animatables.forEach(a => a.target.style.opacity = '0');
      }
    });
  }
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
  if (loader) loader.hidden = false;
  tokenGrid.classList.add("loading"); // 保留此类以兼容旧逻辑或样式

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
    if (loader) loader.hidden = true;
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

const shouldAutoFocusSearch = (event) => {
  if (!searchInput) {
    return false;
  }
  if (event.defaultPrevented) {
    return false;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  const target = event.target;
  if (!target) {
    return true;
  }
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return false;
  }
  if (target.isContentEditable) {
    return false;
  }
  if (event.key.length === 1) {
    return true;
  }
  return event.key === 'Backspace' || event.key === 'Delete';
};

window.addEventListener('keydown', (event) => {
  if (!shouldAutoFocusSearch(event)) {
    return;
  }
  searchInput.focus({ preventScroll: true });
  const value = searchInput.value || '';
  if (typeof searchInput.setSelectionRange === 'function') {
    const pos = value.length;
    searchInput.setSelectionRange(pos, pos);
  }
});

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
      void removeTrackedMint(mint);
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

// 页面加载时，为标题和工具栏添加入场动画
if (typeof anime === "function") {
  // 1. 将标题文字分割成独立的 span，为逐字动画做准备
  const titleEl = document.querySelector('.app-header h1');
  if (titleEl) {
    const text = titleEl.textContent.trim();
    titleEl.innerHTML = text.split('').map(letter =>
      // 使用 display: inline-block 确保 transform 生效
      `<span class="letter" style="display: inline-block; white-space: pre;">${letter}</span>`
    ).join('');
  }

  // 2. 创建标题逐字动画
  anime({
    targets: '.app-header h1 .letter', // 动画目标为每个独立的字母
    translateY: [-40, 0], // 从上方缓缓落下
    opacity: [0, 1],
    duration: 800, // 缩短动画时长，使其更快
    delay: anime.stagger(50), // 减小每个字母的延迟，节奏更紧凑
    easing: 'easeOutExpo'
  });
}

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
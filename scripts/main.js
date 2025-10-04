import {
  applyTheme, applyView, applyDisplayMode, applyClipboardWatchState, applyStyleSheet,
  loadTrackedMints, saveTrackedMints,
  getDisplayMode, getSortState, getFilterState, setSortState, setFilterState,
  loadClipboardWatchPreference, getClipboardWatchState
} from './ui-state.js';
import { fetchTokenInfos, fetchTokenPrices } from './api.js';
import { showToast, closeActiveToast, isCleanupToastActive, showFeedback, clearFeedback } from './ui-interactions.js';



const MINT_PATTERN = /[1-9A-HJ-NP-Za-km-z]{32,}/g;
const SINGLE_MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,}$/;
const VIEW_TRANSITION_CARD_LIMIT = 36;

const tokenGrid = document.getElementById("token-grid");
const template = document.getElementById("token-card-template");
const refreshButton = document.getElementById("refresh-button");
const refreshSelect = document.getElementById("refresh-select");
const lastUpdated = document.getElementById("last-updated");
const mintForm = document.getElementById("mint-form");
const mintInput = document.getElementById("mint-input");
const removeDeadButton = document.getElementById("remove-dead-button");
const searchInput = document.getElementById("token-search");
const loader = document.getElementById("loader");
const sortBySelect = document.getElementById("sort-by");
const sortDirectionButton = document.getElementById("sort-direction");
const filterMcapSelect = document.getElementById("filter-mcap");
const filterGraduationSelect = document.getElementById("filter-graduation");
const tokenCounter = document.getElementById("token-counter");
const tokenCounterContainer = document.getElementById("token-counter-container");
const filteredTokenCounterEl = document.getElementById("filtered-token-counter");
const totalTokenCounterEl = document.getElementById("total-token-counter");
const addTokenButton = document.getElementById('add-token-button');
const addTokenPopover = document.getElementById('add-token-popover');
const searchTokenButton = document.getElementById('search-token-button');
const searchTokenPopover = document.getElementById('search-token-popover');
const backToTopButton = document.getElementById('back-to-top-button');

let refreshTimerId = null;
const previousPrices = new Map();
let trackedMints = loadTrackedMints();
let latestSnapshot = [];
let searchQuery = '';
let isCleanupModeActive = false;
let tokensToDelete = [];
let isQuickSearchActive = false; // 标记是否由快捷方式触发了搜索

export let filteredCounter = null;
export let totalCounter = null;

if (typeof Counter !== 'undefined' && filteredTokenCounterEl && totalTokenCounterEl) {
  const counterOptions = {
    fontSize: 120, // 大幅增加字体大小
    digitHeight: 130, // 相应增加数字容器高度
    fadeHeight: 30, // 增加渐变遮罩的高度
    duration: 1200, // 延长动画时间，使其更平缓
    digitGap: -15, // 调整间距以适应大字体
    easing: "easeOutElastic(1, .8)"
  };
  filteredCounter = new Counter(filteredTokenCounterEl, counterOptions);
  totalCounter = new Counter(totalTokenCounterEl, counterOptions);
}

const REFRESH_INTERVAL_STORAGE_KEY = 'solana-token-favs:refresh-interval';

function loadRefreshInterval() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY);
  } catch (error) {
    console.warn('读取刷新间隔失败', error);
    return null;
  }
}

function saveRefreshInterval(value) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (value == null) {
      window.localStorage.removeItem(REFRESH_INTERVAL_STORAGE_KEY);
    } else {
      window.localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, String(value));
    }
  } catch (error) {
    console.warn('保存刷新间隔失败', error);
  }
}


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

function isLikelyMint(value) {
  return typeof value === "string" && SINGLE_MINT_PATTERN.test(value.trim());
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

export async function tryImportMintsFromClipboard(force = false) {
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
    if (text === lastClipboardText && !force) {
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
  return value.trim();
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
  if (!symbol) return symbol;
  return symbol;
}

function applyFilters(tokens) {
  const filterState = getFilterState();
  if (!Array.isArray(tokens)) return [];
  let filtered = tokens;

  // 如果处于清理模式，则忽略所有其他筛选，只显示待删除的 Token
  // TODO: Move cleanup mode logic out of this pure function
  if (isCleanupModeActive) {
    return tokensToDelete;
  }

  // 市值筛选
  if (filterState.mcap !== "all") {
    filtered = filtered.filter(token => {
      const mcap = token.info?.mcap;
      if (mcap == null) return false;
      switch (filterState.mcap) {
        case "under_1m": return mcap < 1_000_000;
        case "1m_10m": return mcap >= 1_000_000 && mcap < 10_000_000;
        case "10m_100m": return mcap >= 10_000_000 && mcap < 100_000_000;
        case "over_100m": return mcap >= 100_000_000;
        default: return true;
      }
    });
  }

  // 毕业状态筛选
  if (filterState.graduation !== "all") {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    filtered = filtered.filter(token => {
      const graduatedAt = token.info?.graduatedAt;
      const isGraduated = graduatedAt != null;

      switch (filterState.graduation) {
        case "not-graduated":
          return !isGraduated;
        case "graduated_1d":
          return isGraduated && (now - graduatedAt) <= oneDay;
        case "graduated_3d":
          return isGraduated && (now - graduatedAt) <= 3 * oneDay;
        case "graduated_7d":
          return isGraduated && (now - graduatedAt) <= 7 * oneDay;
        case "graduated_30d":
          return isGraduated && (now - graduatedAt) <= 30 * oneDay;
        case "graduated_over_30d":
          return isGraduated && (now - graduatedAt) > 30 * oneDay;
        default:
          // This case should not be reached if filterState.graduation is not "all",
          // but as a fallback, we don't filter.
          return true;
      }
    });
  }

  // 搜索筛选
  if (searchQuery) {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery) {
      filtered = filtered.filter(({ mint, info }) => {
        const mintValue = typeof mint === "string" ? mint.toLowerCase() : "";
        const symbolRaw = normalizeSymbol(info?.symbol);
        const symbolValue = symbolRaw ? symbolRaw.toLowerCase() : "";
        return mintValue.includes(normalizedQuery) || symbolValue.includes(normalizedQuery);
      });
    }
  }

  return filtered;
}

function applySort(tokens) {
  const sortState = getSortState();
  if (!Array.isArray(tokens)) {
    return tokens;
  }

  if (sortState.by === "default") {
    // 当为默认排序时，升序/降序应该反转数组
    return sortState.direction === "asc" ? [...tokens].reverse() : tokens;
  }

  const dir = sortState.direction === "asc" ? 1 : -1;

  const getSortValue = (token, sortBy) => {
    switch (sortBy) {
      case "mcap": return token.info?.mcap;
      case "graduatedAt": return token.info?.graduatedAt;
      case "1h": return getPriceChange(token.info?.stats1h ?? token.price?.stats1h);
      case "6h": return getPriceChange(token.info?.stats6h ?? token.price?.stats6h);
      case "24h": return getPriceChange(token.info?.stats24h ?? token.price?.stats24h);
      default: return null;
    }
  };

  return [...tokens].sort((a, b) => {
    const valA = getSortValue(a, sortState.by);
    const valB = getSortValue(b, sortState.by);

    if (valA == null && valB == null) return 0;
    if (valA == null) return 1; // nulls at the end
    if (valB == null) return -1;

    if (valA < valB) return -1 * dir;
    if (valA > valB) return 1 * dir;
    return 0;
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

export function updateTokenView() {
  let processedTokens = applyFilters(latestSnapshot);

  const uniqueMints = new Set(
    latestSnapshot
      .map((token) => (typeof token?.mint === 'string' ? token.mint : null))
      .filter((mint) => mint)
  );
  const totalCount = uniqueMints.size;
  const filteredUniqueMints = new Set(
    processedTokens
      .map((token) => (typeof token?.mint === 'string' ? token.mint : null))
      .filter((mint) => mint)
  );
  const filteredCount = filteredUniqueMints.size;

  if (tokenCounterContainer) {
    if (totalCount > 0) {
      if (filteredCounter && totalCounter) {
        filteredCounter.setValue(filteredCount);
        totalCounter.setValue(totalCount);
      } else if (tokenCounter) { // Fallback for old element
        tokenCounter.textContent = `${filteredCount} / ${totalCount}`;
      }
      tokenCounterContainer.hidden = false;
    } else {
      tokenCounterContainer.hidden = true;
    }
  }

  processedTokens = applySort(processedTokens);

  const filtered = processedTokens; // for clarity
  const canAnimate = filtered.length <= VIEW_TRANSITION_CARD_LIMIT && shouldUseViewTransition();

  if (typeof document.startViewTransition === "function" && canAnimate) {
    document.startViewTransition(() => renderTokens(filtered, { canAnimate }));
  } else {
    renderTokens(filtered, { canAnimate });
  }
}
export async function copyMintToClipboard(mint) {
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

export async function fetchAndPrependTokens(newMints) {
  if (!newMints || newMints.length === 0) return;

  // 仅为新 Token 显示加载状态
  lastUpdated.textContent = `正在获取 ${newMints.length} 个新 Token...`;
  if (loader) loader.hidden = false;
  tokenGrid.classList.add("loading");

  try {
    const [infoMap, priceMap] = await Promise.all([
      fetchTokenInfos(newMints),
      fetchTokenPrices(newMints)
    ]);

    const newTokensData = newMints.map((mint) => {
      const info = infoMap.get(mint) ?? null;
      const price = priceMap.get(mint) ?? null;
      if (info?.graduatedAt && typeof info.graduatedAt === 'string') {
        const timestamp = new Date(info.graduatedAt).getTime();
        if (!isNaN(timestamp)) {
          info.graduatedAt = timestamp;
        }
      }
      return { mint, info, price };
    });

    // 将新获取的 Token 数据添加到现有快照的开头
    latestSnapshot = [...newTokensData, ...latestSnapshot];
    updateTokenView(); // 更新视图

  } catch (error) {
    console.error("获取新 Token 数据失败", error);
    showToast(`获取新 Token 数据失败: ${error.message}`, 'error');
    // 即使失败，也恢复到之前的状态
    refresh();
  } finally {
    // 确保加载状态被移除
    if (loader) loader.hidden = true;
    tokenGrid.classList.remove("loading");
    // 更新时间戳
    const now = new Date();
    lastUpdated.textContent = `最后更新：${now.toLocaleString("zh-CN", { hour12: false })}`;
  }
}

export function addTrackedMints(newMints) {
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

  // 不再全局刷新，而是只获取新添加的 Token 数据
  void fetchAndPrependTokens(uniqueNew);

  return { added: uniqueNew.length, duplicates: duplicates.length };
}

export async function removeTrackedMint(mint) {
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
      duration: 150,
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

function renderTokens(tokens, { canAnimate } = { canAnimate: false }) {
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

  const displayMode = getDisplayMode();

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
      const imageTransitionName = canAnimate ? buildViewTransitionName("token-image", token.mint) : '';
      if (imageTransitionName) {
        imageWrapper.style.viewTransitionName = imageTransitionName;
      } else {
        imageWrapper.style.removeProperty('view-transition-name');
      }
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
      const symbolTransitionName = canAnimate ? buildViewTransitionName("token-symbol", token.mint) : '';
      if (symbolTransitionName) {
        symbolField.style.viewTransitionName = symbolTransitionName;
      } else {
        symbolField.style.removeProperty('view-transition-name');
      }
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

    const metaContainer = node.querySelector(".token-meta");
    const metaLabel = node.querySelector(".meta-label");
    const metaValue = node.querySelector(".market-cap"); // This element will show either mcap or price

    if (metaContainer && metaLabel && metaValue) {
      if (displayMode === 'price') {
        const priceValue = token.price?.usdPrice ?? info?.usdPrice;
        metaLabel.textContent = '价格';
        metaValue.textContent = priceValue != null ? formatCurrency(priceValue) : '--';
        metaContainer.hidden = priceValue == null;
      } else { // 'mcap'
        const marketCap = info?.mcap;
        metaLabel.textContent = '市值';
        metaValue.textContent = marketCap != null ? formatCurrency(marketCap, { compact: true }) : '--';
        metaContainer.hidden = marketCap == null;
      }
      // 为视图切换动画设置唯一的名称
      const metaTransitionName = buildViewTransitionName(`token-meta-${displayMode}`, token.mint);
      if (metaTransitionName) {
        metaContainer.style.viewTransitionName = metaTransitionName;
      }
    }

    const statsRow = node.querySelector(".token-stats-row");
    const statsTargets = [
      { selector: ".stat-1h", label: "1H", value: info?.stats1h ?? price?.stats1h },
      { selector: ".stat-6h", label: "6H", value: info?.stats6h ?? price?.stats6h },
      { selector: ".stat-24h", label: "24H", value: info?.stats24h ?? price?.stats24h },
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

    // 仅当毕业时才创建并添加毕业标签
    if (info?.graduatedAt && statsRow) {
      const gradStat = document.createElement('span');
      gradStat.className = 'stat stat-graduated';
      const gradDate = new Date(info.graduatedAt);
      gradStat.textContent = `🎓 ${gradDate.toLocaleDateString('en-CA')}`;
      gradStat.title = `毕业于 ${gradDate.toLocaleString()}`;
      // 将毕业标签追加到末尾
      statsRow.appendChild(gradStat);
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

    // 为 IntersectionObserver 设置初始不可见状态
    if (typeof anime === "function") {
      node.style.opacity = '0';
    }

    tokenGrid.append(node);
  }

  // 使用 anime.js 为卡片添加入场动画
  if (typeof anime === "function") {
    const cards = tokenGrid.querySelectorAll('.token-card');
    const observer = new IntersectionObserver((entries, obs) => {
      const targetsToAnimate = [];
      for (const entry of entries) {
        if (entry.isIntersecting) {
          targetsToAnimate.push(entry.target);
          obs.unobserve(entry.target); // 触发后即停止观察
        }
      }

      if (targetsToAnimate.length > 0) {
        anime({
          targets: targetsToAnimate,
          translateY: [50, 0],
          opacity: [1], // 从 0 (在 style 中设置) 到 1
          delay: anime.stagger(30),
          duration: 400,
          easing: 'easeOutExpo',
        });
      }
    }, {
      rootMargin: '0px 0px -50px 0px' // 元素进入视口底部 50px 时触发
    });

    cards.forEach(card => observer.observe(card));
  }
}

export async function refresh() {
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

    const merged = mints.map((mint) => {
      const info = infoMap.get(mint) ?? null;
      const price = priceMap.get(mint) ?? null;

      // Pre-process graduatedAt from string to a numeric timestamp for reliable sorting and filtering.
      if (info?.graduatedAt && typeof info.graduatedAt === 'string') {
        const timestamp = new Date(info.graduatedAt).getTime();
        if (!isNaN(timestamp)) {
          info.graduatedAt = timestamp;
        }
      }
      return { mint, info, price };
    });

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

export function scheduleRefresh() {
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
    const newQuery = searchInput.value;
    searchQuery = newQuery.trim();
    updateTokenView();

    // 如果是由快捷方式打开，并且输入框被清空，则自动关闭
    if (isQuickSearchActive && newQuery === '') {
      closeSearchPopover();
    }
  };
  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("search", handleSearchInput);
}

if (sortBySelect) {
  sortBySelect.addEventListener("change", (e) => {
    setSortState({ by: e.target.value });
    updateTokenView();
  });
}

if (sortDirectionButton) {
  sortDirectionButton.addEventListener("click", () => {
    const currentSort = getSortState();
    const newDirection = currentSort.direction === "asc" ? "desc" : "asc";
    setSortState({ direction: newDirection });
    sortDirectionButton.dataset.direction = newDirection;
    const newLabel = newDirection === "asc" ? "切换为降序" : "切换为升序";
    sortDirectionButton.setAttribute("aria-label", newLabel);
    sortDirectionButton.setAttribute("title", newLabel);
    updateTokenView();
  });
}

if (filterMcapSelect) {
  filterMcapSelect.addEventListener("change", (e) => {
    setFilterState({ mcap: e.target.value });
    updateTokenView();
  });
}

if (filterGraduationSelect) {
  filterGraduationSelect.addEventListener("change", (e) => {
    setFilterState({ graduation: e.target.value });
    updateTokenView();
  });
}

export function cancelCleanupMode() {
  if (!isCleanupModeActive) return;
  isCleanupModeActive = false;
  tokensToDelete = [];
  updateCleanupButtonState(false);
  // 退出模式后，需要重新应用筛选和排序
  updateTokenView();
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
  // 忽略单独的修饰键（Shift, Control, Alt, Meta）和功能键
  const isModifierOnly = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock'].includes(event.key);
  if (isModifierOnly) {
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

const handlePageActivation = () => {
  if (isDocumentVisible() && getClipboardWatchState() && !isCleanupModeActive) {
    void tryImportMintsFromClipboard();
  }
};

window.addEventListener('focus', handlePageActivation, false);
window.addEventListener('pageshow', handlePageActivation, false);

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', handlePageActivation, false);
}

if (isDocumentVisible() && getClipboardWatchState()) {
  void tryImportMintsFromClipboard();
}

window.addEventListener('keydown', (event) => {
  // 1. 处理 Escape 键
  if (event.key === 'Escape') {
    // 优先退出清理模式
    if (isCleanupModeActive) {
      event.preventDefault();
      cancelCleanupMode();
      return;
    }
    // 其次关闭可见的浮层
    if (addTokenPopover && !addTokenPopover.hidden && addTokenPopover.classList.contains('visible')) {
      event.preventDefault();
      closeAddPopover();
    } else if (searchTokenPopover && !searchTokenPopover.hidden && searchTokenPopover.classList.contains('visible')) {
      event.preventDefault();
      closeSearchPopover();
    }
    return; // Escape 键处理完毕
  }

  // 2. 处理搜索自动聚焦
  if (shouldAutoFocusSearch(event)) {
    if (isCleanupModeActive) cancelCleanupMode(); // 开始搜索时，退出清理模式

    // 打开搜索浮层，它会自动处理聚焦
    openSearchPopover();
    isQuickSearchActive = true; // 标记为快捷方式打开

    // 将当前按键的值传递给输入框，防止第一个字符丢失
    if (event.key.length === 1 && searchInput.value === '') {
      searchInput.value = event.key;
      // 手动触发 input 事件以更新搜索结果
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
});

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

function updateCleanupButtonState(isActive) {
  if (!removeDeadButton) return;
  const useTag = removeDeadButton.querySelector('use');
  if (isActive) {
    removeDeadButton.dataset.cleanupActive = 'true';
    removeDeadButton.classList.add('is-active');
    removeDeadButton.title = '确认删除';
    if (useTag) useTag.setAttribute('href', '#confirm-path');
    const message = `找到 ${tokensToDelete.length} 个不活跃 Token。<br><small>(标准：市值 &lt; $20k 或无价格)</small><br>再次点击确认删除，或点击其他地方取消。`;
    showToast(message, 'info', { duration: 0, type: 'cleanup-prompt' });
  } else {
    removeDeadButton.dataset.cleanupActive = 'false';
    removeDeadButton.classList.remove('is-active');
    removeDeadButton.title = '清理不活跃的 Token';
    if (useTag) useTag.setAttribute('href', '#trash-path');
    // 如果当前是清理提示，则关闭它
    if (isCleanupToastActive()) {
      closeActiveToast();
    }
  }
}

if (removeDeadButton) {
  removeDeadButton.addEventListener('click', () => {
    // 如果当前已处于清理模式，则执行删除
    if (isCleanupModeActive) {
      const deadMints = new Set(tokensToDelete.map(t => t.mint));
      trackedMints = trackedMints.filter(mint => !deadMints.has(mint));
      saveTrackedMints(trackedMints);
      latestSnapshot = latestSnapshot.filter(token => !deadMints.has(token.mint));

      const count = tokensToDelete.length;
      cancelCleanupMode(); // 退出清理模式并刷新视图
      showToast(`已成功移除 ${count} 个不活跃的 Token`, 'success');
      return;
    }

    // 否则，进入清理模式
    if (!latestSnapshot || latestSnapshot.length === 0) {
      showToast('请先等待数据加载完成', 'info');
      return;
    }

    // 定义“死亡”Token：市值低于 $20,000 或无法获取价格
    tokensToDelete = latestSnapshot.filter(token => {
      const isPriceMissing = !token.price;
      const isMcapLow = token.info?.mcap != null && token.info.mcap < 20000;
      return isPriceMissing || isMcapLow;
    });

    if (tokensToDelete.length === 0) {
      showToast('未发现不活跃的 Token<br><small>(标准：市值 &lt; $20k 或无价格)</small>', 'info');
      tokensToDelete = [];
      return;
    }

    isCleanupModeActive = true;
    updateCleanupButtonState(true);
    updateTokenView();
  });
}

if (addTokenButton && addTokenPopover) {
  addTokenButton.addEventListener("click", (event) => {
    event.stopPropagation();

    // 如果搜索浮层是打开的，则执行交换动画
    if (searchTokenPopover && !searchTokenPopover.hidden && typeof anime === "function") {
      addTokenButton.classList.add('is-active');
      closeSearchPopover(); // 使用标准函数关闭
      searchTokenButton.classList.remove('is-active');

      // 在开始新动画前，移除所有相关的正在进行的动画，防止冲突
      anime.remove(addTokenPopover);
      anime.remove(searchTokenPopover);

      searchTokenPopover.style.zIndex = '9';
      addTokenPopover.style.zIndex = '10';
      addTokenPopover.hidden = false;

      const tl = anime.timeline({
        easing: 'easeOutExpo',
        duration: 150
      });

      tl.add({
        targets: addTokenPopover,
        translateY: [-20, 0],
        opacity: [0, 1],
        scale: [0.95, 1],
        begin: () => mintInput?.focus(),
      });

      addTokenPopover.classList.add("visible");
      return;
    }

    // 否则，执行常规的打开/关闭动画
    if (addTokenPopover.hidden) {
      addTokenPopover.hidden = false;
      addTokenButton.classList.add('is-active');
      requestAnimationFrame(() => {
        addTokenPopover.classList.add("visible");
        mintInput?.focus();
      });
    } else {
      closeAddPopover();
    }
  });

  addTokenPopover.addEventListener("transitionend", () => {
    if (!addTokenPopover.classList.contains("visible") && !anime.running.some(a => a.animatables.some(an => an.target === addTokenPopover))) {
      addTokenPopover.hidden = true;
    }
  });

  addTokenPopover.addEventListener('click', e => e.stopPropagation());
}

function closeAddPopover() {
  if (!addTokenPopover || addTokenPopover.hidden || !addTokenPopover.classList.contains('visible')) return;

  addTokenPopover.addEventListener('transitionend', () => {
    if (!addTokenPopover.classList.contains('visible')) addTokenPopover.hidden = true;
  }, { once: true });
  addTokenPopover.classList.remove("visible");
  addTokenButton.classList.remove('is-active');
}
if (searchTokenButton && searchTokenPopover) {
  searchTokenButton.addEventListener("click", (event) => {
    event.stopPropagation();

    // 如果添加浮层是打开的，则执行交换动画
    if (addTokenPopover && !addTokenPopover.hidden && typeof anime === "function") {
      searchTokenButton.classList.add('is-active');
      const useTag = searchTokenButton.querySelector('use');
      if (useTag) useTag.setAttribute('href', '#close-path');
      closeAddPopover();
      openSearchPopover();
      return;
    }

    // 否则，执行常规的打开/关闭动画
    if (searchTokenPopover.hidden) {
      openSearchPopover();
      isQuickSearchActive = false; // 手动打开，不是快捷方式
    } else {
      closeSearchPopover();
    }
  });

  searchTokenPopover.addEventListener("transitionend", () => {
    if (!searchTokenPopover.classList.contains("visible") && !anime.running.some(a => a.animatables.some(an => an.target === searchTokenPopover))) {
      searchTokenPopover.hidden = true;
    }
  });

  searchTokenPopover.addEventListener('click', e => e.stopPropagation());
}

function openSearchPopover() {
  if (!searchTokenPopover || !searchTokenPopover.hidden) return;
  searchTokenPopover.hidden = false;
  const useTag = searchTokenButton.querySelector('use');
  if (useTag) useTag.setAttribute('href', '#close-path');
  searchTokenButton.classList.add('is-active');
  requestAnimationFrame(() => {
    searchTokenPopover.classList.add("visible");
    searchInput?.focus();
  });
}
function closeSearchPopover() {
  if (!searchTokenPopover || searchTokenPopover.hidden || !searchTokenPopover.classList.contains('visible')) return;
  const useTag = searchTokenButton.querySelector('use');
  searchTokenPopover.addEventListener('transitionend', () => {
    if (useTag && !searchTokenPopover.classList.contains('visible')) useTag.setAttribute('href', '#search-path');
    if (!searchTokenPopover.classList.contains("visible")) searchTokenPopover.hidden = true;
  }, { once: true });
  searchTokenPopover.classList.remove("visible");
  searchTokenButton.classList.remove('is-active');
  isQuickSearchActive = false; // 关闭时重置标记
}
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
    duration: 250,
    delay: anime.stagger(15),
    easing: 'easeOutExpo'
  });
}

refreshButton.addEventListener("click", () => {
  refresh();
});

refreshSelect.addEventListener("change", () => {
  const newInterval = refreshSelect.value;
  saveRefreshInterval(newInterval);
  scheduleRefresh();
  refresh();
});

restoreUiControls();

refresh().then(() => {
  scheduleRefresh();
});

if (backToTopButton) {
  const header = document.querySelector('.app-header');

  if (header && typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // 当 header 元素不再与视口交叉时 (即滚出屏幕)，显示按钮
        backToTopButton.classList.toggle('visible', !entry.isIntersecting);
      },
      {
        root: null, // 相对于视口
        threshold: 0, // 目标元素一离开视口就触发
      }
    );
    observer.observe(header);
  } else {
    // Fallback for older browsers or if header is not found
    window.addEventListener('scroll', () => {
      backToTopButton.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });
  }

  // 监听点击事件，平滑滚动到页面顶部
  backToTopButton.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}

document.addEventListener("click", (event) => {
  if (addTokenPopover && !addTokenPopover.hidden && !addTokenPopover.contains(event.target) && !addTokenButton.contains(event.target)) {
    closeAddPopover();
  }
  if (searchTokenPopover && !searchTokenPopover.hidden) {
    if (!searchTokenPopover.contains(event.target) && !searchTokenButton.contains(event.target)) {
      closeSearchPopover();
    }
  }

  // 如果处于清理模式，并且点击的不是清理按钮本身，则取消清理模式
  if (isCleanupModeActive) {
    const isClickOnCleanupButton = removeDeadButton && removeDeadButton.contains(event.target);
    if (!isClickOnCleanupButton) {
      cancelCleanupMode();
    }
  }
});

// 在页面加载时恢复UI控件的状态
export function updateFilterAndSortControls() {
  // 恢复排序控件
  const currentSort = getSortState();
  if (sortBySelect) sortBySelect.value = currentSort.by;
  if (sortDirectionButton) {
    sortDirectionButton.dataset.direction = currentSort.direction;
    const label = currentSort.direction === "asc" ? "切换为降序" : "切换为升序";
    sortDirectionButton.setAttribute("aria-label", label);
    sortDirectionButton.setAttribute("title", label);
  }

  // 恢复筛选控件
  const currentFilters = getFilterState();
  if (filterMcapSelect) filterMcapSelect.value = currentFilters.mcap;
  if (filterGraduationSelect) filterGraduationSelect.value = currentFilters.graduation;
}

// 在页面加载时恢复UI控件的状态
function restoreUiControls() {
  updateFilterAndSortControls();
}
// 在页面加载时恢复剪贴板监听和刷新间隔设置
const storedClipboardWatchPreference = loadClipboardWatchPreference();
applyClipboardWatchState(storedClipboardWatchPreference);

if (refreshSelect) {
  const storedRefreshInterval = loadRefreshInterval();
  if (storedRefreshInterval) {
    const options = Array.from(refreshSelect.options);
    const matchedOption = options.find((option) => option.value === storedRefreshInterval);
    if (matchedOption) {
      refreshSelect.value = storedRefreshInterval;
    } else {
      const parsed = Number(storedRefreshInterval);
      const minutes = Number.isFinite(parsed) ? Math.round(parsed / 60000) : null;
      const label = minutes && minutes > 0 ? `${minutes} 分钟` : `${storedRefreshInterval} ms`;
      const customOption = new Option(label, storedRefreshInterval, true, true);
      refreshSelect.add(customOption);
    }
  }
}
// 吸顶工具栏状态检测
const stickyWrapper = document.querySelector('.sticky-wrapper');
const sentinel = document.querySelector('.sticky-sentinel'); // This now refers to the new, independent sentinel

if (sentinel && stickyWrapper && typeof IntersectionObserver !== 'undefined') {
  const observer = new IntersectionObserver(
    ([entry]) => {
      // 当哨兵元素不再与我们定义的（带有 rootMargin 的）视口区域相交时，激活吸顶状态
      stickyWrapper.classList.toggle('is-stuck', !entry.isIntersecting);
    },
    {
      root: null, // 相对于视口
      threshold: 0,
      // 当哨兵元素的底部边缘与视口顶部对齐时触发
      rootMargin: `-16px 0px 0px 0px`
    }
  );

  observer.observe(sentinel);
}

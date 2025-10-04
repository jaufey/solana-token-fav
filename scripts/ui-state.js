const THEME_STORAGE_KEY = "solana-token-favs:theme";
const VIEW_STORAGE_KEY = "solana-token-favs:view";
const DEFAULT_MINTS = [
  "Eppcp4FhG6wmaRno3omWWvKsZHbzucVLR316SdXopump",
  "wCtiCRJz69a5Mqkk2nHmvQwBGQCrUvM8fELoFGqpump",
  "H8xQ6poBjB9DTPMDTKWzWPrnxu4bDEhybxiouF8Ppump",
  "623fhWRdnYVxQKe1RcZvVHxTDeAftRGBApUtzrRKpump"
];

const DISPLAY_STORAGE_KEY = "solana-token-favs:display";
const CLIPBOARD_WATCH_STORAGE_KEY = "solana-token-favs:clipboardWatch";
const STYLE_STORAGE_KEY = "solana-token-favs:style";
const STORAGE_KEY = "solana-token-favs:mints";
const SORT_STATE_STORAGE_KEY = "solana-token-favs:sort";
const FILTER_STATE_STORAGE_KEY = "solana-token-favs:filter";

const STYLE_OPTIONS = [
  "styles.css",
  "styles-neumorphism.css",
  "styles-glassmorphism.css",
  "styles-maximalism.css",
  "styles-cyberpunk.css",
  "styles-pixel.css",
  "styles-doodle.css"
];
const DEFAULT_STYLE = STYLE_OPTIONS[0];

const themeToggle = document.getElementById("theme-toggle");
const viewToggle = document.getElementById("view-toggle");
const displayToggle = document.getElementById("display-toggle");
const clipboardToggleButton = document.getElementById("clipboard-toggle-button");
const styleSelect = document.getElementById("style-select");
const styleSheetLink = document.getElementById("app-style-sheet");
const defaultSortState = { by: "default", direction: "desc" };
const defaultFilterState = { mcap: "all", graduation: "all" };
let sortState = loadSortState();
let filterState = loadFilterState();
let displayMode = 'mcap';
let isClipboardWatchActive = false;

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("无法访问 localStorage。", error);
    return null;
  }
}

function loadPreference(key, validValues) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const stored = storage.getItem(key);
    if (validValues && Array.isArray(validValues)) {
      return validValues.includes(stored) ? stored : null;
    }
    return stored;
  } catch (error) {
    console.warn(`读取偏好失败: ${key}`, error);
  }
  return null;
}

function savePreference(key, value) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch (error) {
    console.warn(`保存偏好失败: ${key}`, error);
  }
}

// --- Theme ---
export function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = normalized;
  if (themeToggle) {
    const isLight = normalized === "light";
    themeToggle.setAttribute("aria-pressed", String(isLight));
    themeToggle.textContent = isLight ? "🌙" : "☀️";
    const label = isLight ? "切换到暗色主题" : "切换到亮色主题";
    themeToggle.setAttribute("aria-label", label);
    themeToggle.title = label;
  }
}

export function saveThemePreference(theme) {
  savePreference(THEME_STORAGE_KEY, theme);
}

export function loadThemePreference() {
  return loadPreference(THEME_STORAGE_KEY, ["light", "dark"]);
}

// --- View ---
export function applyView(view) {
  const normalized = view === "compact" ? "compact" : "expanded";
  document.body.dataset.view = normalized;
  if (viewToggle) {
    const segments = viewToggle.querySelectorAll('[data-view]');
    segments.forEach((segment) => {
      const active = segment.dataset.view === normalized;
      segment.classList.toggle('is-active', active);
      segment.setAttribute('aria-selected', String(active));
      segment.setAttribute('tabindex', active ? '0' : '-1');
    });
    viewToggle.setAttribute('data-active-view', normalized);
  }
}

export function saveViewPreference(view) {
  savePreference(VIEW_STORAGE_KEY, view);
}

export function loadViewPreference() {
  return loadPreference(VIEW_STORAGE_KEY, ["compact", "expanded"]);
}

// --- Display Mode (Mcap/Price) ---
export function applyDisplayMode(mode, { updateView = true } = {}) {
  displayMode = mode === 'price' ? 'price' : 'mcap';
  if (displayToggle) {
    const segments = displayToggle.querySelectorAll('[data-mode]');
    segments.forEach((segment) => {
      const active = segment.dataset.mode === displayMode;
      segment.classList.toggle('is-active', active);
      segment.setAttribute('aria-selected', String(active));
      segment.setAttribute('tabindex', active ? '0' : '-1');
    });
    displayToggle.setAttribute('data-active-mode', displayMode);
  }
  document.body.dataset.displayMode = displayMode;
  if (updateView) {
    // This needs to be handled by the main logic, so we just set the state here.
  }
}

export function saveDisplayPreference(mode) {
  savePreference(DISPLAY_STORAGE_KEY, mode);
}

export function loadDisplayPreference() {
  return loadPreference(DISPLAY_STORAGE_KEY, ["mcap", "price"]);
}

export function getDisplayMode() {
  return displayMode;
}

// --- Clipboard Watch ---
export function applyClipboardWatchState(isActive) {
  isClipboardWatchActive = !!isActive;
  if (clipboardToggleButton) {
    clipboardToggleButton.dataset.clipboardActive = String(isClipboardWatchActive);
    clipboardToggleButton.classList.toggle('is-active', isClipboardWatchActive);
    const label = isClipboardWatchActive ? '关闭剪贴板监听' : '开启剪贴板监听';
    clipboardToggleButton.setAttribute('aria-label', label);
    clipboardToggleButton.title = label;
  }
}

export function saveClipboardWatchPreference(isActive) {
  savePreference(CLIPBOARD_WATCH_STORAGE_KEY, String(isActive));
}

export function loadClipboardWatchPreference() {
  return loadPreference(CLIPBOARD_WATCH_STORAGE_KEY) === 'true';
}

export function getClipboardWatchState() {
    return isClipboardWatchActive;
}

// --- Style ---
export function applyStyleSheet(style, options = {}) {
  const { persist = true, updateControl = true } = options;
  const normalized = STYLE_OPTIONS.includes(style) ? style : DEFAULT_STYLE;
  if (styleSheetLink) {
    styleSheetLink.href = normalized;
  }
  document.body.dataset.style = normalized.replace(/\.css$/i, "");
  if (updateControl && styleSelect) {
    styleSelect.value = normalized;
  }
  if (persist) {
    savePreference(STYLE_STORAGE_KEY, normalized);
  }
}

export function loadStylePreference() {
  return loadPreference(STYLE_STORAGE_KEY, STYLE_OPTIONS);
}

// --- Mints ---
export function loadTrackedMints() {
  const raw = loadPreference(STORAGE_KEY);
  if (!raw) return [...DEFAULT_MINTS]; // 如果没有存储，返回默认列表
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const validMints = [...new Set(parsed.filter(m => typeof m === 'string' && m.length > 30))];
      if (validMints.length > 0) return validMints;
    }
  } catch (e) {
    console.warn("读取收藏列表失败", e);
  }
  // 如果存储的数据无效或为空数组，也返回默认列表
  return [...DEFAULT_MINTS];
}

export function saveTrackedMints(mints) {
  savePreference(STORAGE_KEY, JSON.stringify(mints));
}

// --- Sort State ---
function loadSortState() {
  const raw = loadPreference(SORT_STATE_STORAGE_KEY);
  if (!raw) return { ...defaultSortState };
  try {
    const parsed = JSON.parse(raw);
    // 确保加载的数据结构是正确的
    return { ...defaultSortState, ...parsed };
  } catch (e) {
    console.warn("读取排序状态失败", e);
    return { ...defaultSortState };
  }
}

function saveSortState(state) {
  savePreference(SORT_STATE_STORAGE_KEY, JSON.stringify(state));
}

export function getSortState() {
  return { ...sortState };
}

export function setSortState(newState) {
  sortState = { ...sortState, ...newState };
  saveSortState(sortState);
}

export function resetSortState() {
  sortState = { ...defaultSortState };
  saveSortState(sortState);
  return getSortState();
}

// --- Filter State ---
function loadFilterState() {
  const raw = loadPreference(FILTER_STATE_STORAGE_KEY);
  if (!raw) return { ...defaultFilterState };
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultFilterState, ...parsed };
  } catch (e) {
    console.warn("读取筛选状态失败", e);
    return { ...defaultFilterState };
  }
}

function saveFilterState(state) {
  savePreference(FILTER_STATE_STORAGE_KEY, JSON.stringify(state));
}
export function getFilterState() {
  return { ...filterState };
}

export function setFilterState(newState) {
  filterState = { ...filterState, ...newState };
  saveFilterState(filterState);
}

export function resetFilterState() {
  filterState = { ...defaultFilterState };
  saveFilterState(filterState);
  return getFilterState();
}
import {
  applyTheme, saveThemePreference, loadThemePreference,
  applyView, saveViewPreference, loadViewPreference,
  applyDisplayMode, saveDisplayPreference, loadDisplayPreference,
  applyClipboardWatchState, saveClipboardWatchPreference, getClipboardWatchState,
  applyStyleSheet, loadStylePreference
} from './ui-state.js';
import { tryImportMintsFromClipboard, updateTokenView, filteredCounter, totalCounter } from './main.js';

const themeToggle = document.getElementById("theme-toggle");
const viewToggle = document.getElementById("view-toggle");
const displayToggle = document.getElementById("display-toggle");
const clipboardToggleButton = document.getElementById("clipboard-toggle-button");
const styleSelect = document.getElementById("style-select");
const mintFeedback = document.getElementById("mint-feedback");
const toastRoot = document.getElementById("toast-root");

const storedStylePreference = loadStylePreference();
if (storedStylePreference) {
  applyStyleSheet(storedStylePreference, { persist: false, updateControl: true });
} else if (styleSelect) {
  applyStyleSheet(styleSelect.value, { persist: false, updateControl: true });
}

const storedThemePreference = loadThemePreference();
const resolvedTheme = storedThemePreference ?? (document.body.dataset.theme === 'light' ? 'light' : 'dark');
applyTheme(resolvedTheme);
let feedbackTimerId = null;
let toastTimerId = null;
let activeToast = null;

function isDocumentVisible() {
  return document.visibilityState === 'visible';
}

function shouldUseViewTransition() {
  if (typeof document.visibilityState === 'string' && document.visibilityState !== 'visible') {
    return false;
  }
  return true;
}

// --- Toast Notifications ---
export function showToast(message, status = "info", options = {}) {
  const { duration = 3200, type = 'normal' } = options;

  if (activeToast && activeToast.dataset.toastType === 'cleanup-prompt' && type !== 'cleanup-prompt') {
    if (status !== 'success' && status !== 'error') {
      return;
    }
  }

  if (!toastRoot) return;

  if (toastTimerId) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }

  if (activeToast) {
    closeActiveToast();
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.status = status;
  toast.dataset.toastType = type;
  toast.innerHTML = message; // 允许在提示信息中使用 HTML，例如 <br>
  toastRoot.appendChild(toast);
  activeToast = toast;

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  if (duration > 0) {
    toastTimerId = setTimeout(() => {
      closeActiveToast();
    }, duration);
  }
}

export function closeActiveToast() {
  if (!activeToast) return;
  const toastToClose = activeToast;
  activeToast = null;
  toastToClose.classList.remove("visible");
  toastToClose.addEventListener("transitionend", () => toastToClose.remove(), { once: true });
}

export function isCleanupToastActive() {
  return !!(activeToast && activeToast.dataset.toastType === 'cleanup-prompt');
}

// --- Form Feedback ---
export function showFeedback(message, status = "info") {
  if (!mintFeedback) return;
  clearTimeout(feedbackTimerId);
  mintFeedback.textContent = message;
  mintFeedback.dataset.status = status;
  mintFeedback.hidden = false;
  feedbackTimerId = setTimeout(clearFeedback, 4000);
}

export function clearFeedback() {
  if (!mintFeedback) return;
  clearTimeout(feedbackTimerId);
  mintFeedback.textContent = "";
  mintFeedback.dataset.status = "";
  mintFeedback.hidden = true;
}

// --- Event Listeners Setup ---

// Theme Toggle
let userHasThemePreference = storedThemePreference != null;
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isDark = document.body.dataset.theme === "dark";
    const nextTheme = isDark ? "light" : "dark";
    userHasThemePreference = true;
    applyTheme(nextTheme);
    saveThemePreference(nextTheme);
  });
}

// View Toggle
if (viewToggle) {
  viewToggle.addEventListener("click", (event) => {
    const target = event.target.closest("[data-view]");
    if (!target || !viewToggle.contains(target)) return;
    const requested = target.dataset.view;
    if (!requested || requested === document.body.dataset.view) return;
    const activate = () => {
      applyView(requested);
      saveViewPreference(requested);
    };
    if (typeof document.startViewTransition === "function" && shouldUseViewTransition()) {
      document.startViewTransition(activate);
    } else {
      activate();
    }
  });
  viewToggle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const segments = Array.from(viewToggle.querySelectorAll("[data-view]"));
    const activeIndex = segments.findIndex((segment) => segment.classList.contains("is-active"));
    if (activeIndex === -1) return;
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    const nextIndex = (activeIndex + delta + segments.length) % segments.length;
    segments[nextIndex].focus({ preventScroll: true });
    segments[nextIndex].click();
    event.preventDefault();
  });
}

// Display Mode Toggle
if (displayToggle) {
  displayToggle.addEventListener("click", (event) => {
    const target = event.target.closest("[data-mode]");
    if (!target || !displayToggle.contains(target)) return;
    const requested = target.dataset.mode;
    if (!requested || requested === document.body.dataset.displayMode) return;
    const activate = () => {
      applyDisplayMode(requested);
      updateTokenView();
      saveDisplayPreference(requested);
    };
    if (typeof document.startViewTransition === "function" && shouldUseViewTransition()) {
      document.startViewTransition(activate);
    } else {
      activate();
    }
  });
  displayToggle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const segments = Array.from(displayToggle.querySelectorAll("[data-mode]"));
    const activeIndex = segments.findIndex((segment) => segment.classList.contains("is-active"));
    if (activeIndex === -1) return;
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    const nextIndex = (activeIndex + delta + segments.length) % segments.length;
    segments[nextIndex].focus({ preventScroll: true });
    segments[nextIndex].click();
    event.preventDefault();
  });
}

// Ensure segmented controls reflect current state on load
const initialView = loadViewPreference() || document.body.dataset.view || "expanded";
applyView(initialView);

const initialDisplayMode = loadDisplayPreference() || document.body.dataset.displayMode || "mcap";
applyDisplayMode(initialDisplayMode, { updateView: false });

// Style Select
if (styleSelect) {
  styleSelect.addEventListener("change", (event) => {
    applyStyleSheet(event.target.value, { persist: true, updateControl: false });
    // 切换样式后，给一点时间让 CSS 变量生效，然后更新计数器
    setTimeout(() => {
      if (filteredCounter) filteredCounter.update();
      if (totalCounter) totalCounter.update();
    }, 50);
  });
}

// Clipboard Toggle
if (clipboardToggleButton) {
  clipboardToggleButton.addEventListener('click', async () => {
    const nextState = !getClipboardWatchState();
    if (nextState) {
      try {
        if (navigator.permissions?.query) {
          const result = await navigator.permissions.query({ name: 'clipboard-read' });
          if (result.state === 'denied') {
            showToast('无法访问剪贴板，请检查浏览器权限设置。', 'error');
            return;
          }
        }
        await tryImportMintsFromClipboard(true);
      } catch (error) {
        console.warn('请求剪贴板权限时发生错误:', error);
      }
    }
    applyClipboardWatchState(nextState);
    saveClipboardWatchPreference(nextState);
  });
}

// Page Activation (Focus, Visibility)
const handlePageActivation = () => {
  if (isDocumentVisible() && getClipboardWatchState()) {
    void tryImportMintsFromClipboard();
  }
};
window.addEventListener('focus', handlePageActivation, false);
window.addEventListener('pageshow', handlePageActivation, false);
document.addEventListener('visibilitychange', handlePageActivation, false);

// Initial check
if (isDocumentVisible() && getClipboardWatchState()) {
  void tryImportMintsFromClipboard();
}

// Title Animation
if (typeof anime === "function") {
  const titleEl = document.querySelector('.app-header h1');
  if (titleEl) {
    const text = titleEl.textContent.trim();
    titleEl.innerHTML = text.split('').map(letter =>
      `<span class="letter" style="display: inline-block; white-space: pre;">${letter}</span>`
    ).join('');
    anime({
      targets: '.app-header h1 .letter',
      translateY: [-40, 0],
      opacity: [0, 1],
      duration: 250,
      delay: anime.stagger(15),
      easing: 'easeOutExpo'
    });
  }
}

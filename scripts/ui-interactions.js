import {
  applyTheme, saveThemePreference,
  applyView, saveViewPreference, loadViewPreference,
  applyDisplayMode, saveDisplayPreference, loadDisplayPreference,
  applyClipboardWatchState, saveClipboardWatchPreference, getClipboardWatchState,
  applyStyleSheet
} from './ui-state.js';
import { tryImportMintsFromClipboard, updateTokenView } from './main.js';

const themeToggle = document.getElementById("theme-toggle");
const viewToggle = document.getElementById("view-toggle");
const displayToggle = document.getElementById("display-toggle");
const clipboardToggleButton = document.getElementById("clipboard-toggle-button");
const styleSelect = document.getElementById("style-select");
const mintFeedback = document.getElementById("mint-feedback");
const toastRoot = document.getElementById("toast-root");

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
  toast.textContent = message;
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

// --- Animated Counter ---
export function updateAnimatedCounter(container, newNumber) {
  const newStr = String(newNumber);
  const oldStr = container.dataset.value || '';
  if (newStr === oldStr && container.children.length > 0) return;
  container.dataset.value = newStr;

  const maxLength = Math.max(newStr.length, oldStr.length);
  const paddedNew = newStr.padStart(maxLength, ' ');
  const paddedOld = oldStr.padStart(maxLength, ' ');

  for (let i = 0; i < maxLength; i++) {
    let slot = container.children[i];
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'digit-slot';
      container.appendChild(slot);
    }

    if (paddedOld[i] === paddedNew[i] && slot.children.length > 0) continue;

    const reel = document.createElement('div');
    reel.className = 'digit-reel';

    const oldDigitSpan = document.createElement('span');
    oldDigitSpan.className = 'digit';
    oldDigitSpan.textContent = paddedOld[i] === ' ' ? '\u00A0' : paddedOld[i];

    const newDigitSpan = document.createElement('span');
    newDigitSpan.className = 'digit';
    newDigitSpan.textContent = paddedNew[i] === ' ' ? '\u00A0' : paddedNew[i];

    const isIncreasing = paddedNew[i] > paddedOld[i];

    if (isIncreasing) {
      reel.appendChild(oldDigitSpan);
      reel.appendChild(newDigitSpan);
      reel.classList.add('slide-up');
    } else {
      reel.appendChild(newDigitSpan);
      reel.appendChild(oldDigitSpan);
      reel.classList.add('slide-down');
    }

    slot.innerHTML = '';
    slot.appendChild(reel);
  }
}

// --- Event Listeners Setup ---

// Theme Toggle
let userHasThemePreference = false; // Will be set by main.js
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
    applyStyleSheet(event.target.value);
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

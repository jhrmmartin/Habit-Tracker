// ============================================================
// DAYMARK — ACCESSIBLE TOP-LAYER TOASTS (popover="manual")
// Uses native Popover API + ariaNotify() with live-region fallback.
// ============================================================

const POPOVER_POLYFILL_URL = 'https://unpkg.com/@oddbird/popover-polyfill@0.5.0/dist/popover.min.js';

let polyfillLoaded = false;
let activeToastEl = null;
let dismissTimer = null;
let lastFocusedBeforeToast = null;

/**
 * Conditionally loads @oddbird/popover-polyfill ONLY when native Popover API is missing.
 */
export function ensurePopoverSupport() {
  if (polyfillLoaded) return;
  if (typeof HTMLElement !== 'undefined' && !Object.hasOwn(HTMLElement.prototype, 'popover')) {
    polyfillLoaded = true;
    import(POPOVER_POLYFILL_URL).catch(() => {
      // Graceful fallback handled by CSS display toggle
    });
  }
}

/**
 * Announces status messages to assistive technology using ariaNotify() when available,
 * falling back to pre-mounted polite/assertive ARIA live regions.
 */
export function announce(message, { urgent = false } = {}) {
  if (!message) return;
  try {
    if (typeof document.ariaNotify === 'function') {
      document.ariaNotify(message, { priority: urgent ? 'high' : 'normal' });
      return;
    }
  } catch {
    // fallback below
  }

  const regionId = urgent ? 'liveAssertive' : 'livePolite';
  const region = document.getElementById(regionId);
  if (!region) return;
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

function clearToastTimer() {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

export function hideToast({ restoreFocus = false } = {}) {
  clearToastTimer();
  if (!activeToastEl) return;

  const el = activeToastEl;
  const wasFocused = el.contains(document.activeElement);
  const isInlineDialogToast = el.classList.contains('dm-dialog-toast');
  activeToastEl = null;

  if (isInlineDialogToast) {
    el.remove();
    if (restoreFocus && wasFocused && lastFocusedBeforeToast && typeof lastFocusedBeforeToast.focus === 'function') {
      lastFocusedBeforeToast.focus();
    }
    return;
  }

  try {
    if (typeof el.hidePopover === 'function') {
      el.hidePopover();
    } else {
      el.classList.remove(':popover-open');
    }
  } catch {
    el.classList.remove(':popover-open');
  }

  setTimeout(() => {
    el.remove();
    if (restoreFocus && wasFocused && lastFocusedBeforeToast && typeof lastFocusedBeforeToast.focus === 'function') {
      lastFocusedBeforeToast.focus();
    }
  }, 200);
}

/**
 * Displays a non-blocking top-layer toast using popover="manual".
 * When a modal <dialog> is open, mounts inside that dialog so notices and Undo remain visible and interactive.
 */
export function showToast(message, {
  tone = 'info',
  duration = 4200,
  actionLabel = null,
  onAction = null
} = {}) {
  if (!message) return;

  const openModal = document.querySelector('dialog:modal');
  const stack = document.getElementById('toastStack');
  if (!openModal && !stack) return;

  if (activeToastEl) {
    hideToast({ restoreFocus: false });
  }

  lastFocusedBeforeToast = document.activeElement;

  const toast = document.createElement('div');
  toast.className = openModal ? 'dm-dialog-toast' : 'dm-toast';
  if (!openModal) {
    toast.setAttribute('popover', 'manual');
  }
  toast.dataset.tone = tone;
  toast.id = `dm-toast-${Date.now()}`;

  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-message';
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  if (actionLabel && typeof onAction === 'function') {
    const actBtn = document.createElement('button');
    actBtn.type = 'button';
    actBtn.className = 'btn btn-soft';
    actBtn.textContent = actionLabel;
    actBtn.addEventListener('click', () => {
      onAction();
      hideToast({ restoreFocus: true });
    });
    toast.appendChild(actBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'icon-btn';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => hideToast({ restoreFocus: true }));
  toast.appendChild(closeBtn);

  // Pause auto-dismiss while focused or hovered so keyboard/motor users never lose Undo
  let remaining = duration;
  let startedAt = Date.now();

  const scheduleHide = () => {
    if (remaining <= 0) return;
    startedAt = Date.now();
    clearToastTimer();
    dismissTimer = setTimeout(() => {
      if (toast.contains(document.activeElement)) return;
      hideToast({ restoreFocus: false });
    }, remaining);
  };

  const pauseHide = () => {
    clearToastTimer();
    remaining = Math.max(1200, remaining - (Date.now() - startedAt));
  };

  toast.addEventListener('mouseenter', pauseHide);
  toast.addEventListener('focusin', pauseHide);
  toast.addEventListener('mouseleave', scheduleHide);
  toast.addEventListener('focusout', () => {
    if (!toast.contains(document.activeElement)) scheduleHide();
  });

  if (openModal) {
    const footer = openModal.querySelector('.dialog-footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(toast, footer);
    else openModal.appendChild(toast);
    openModal.addEventListener('close', () => {
      if (activeToastEl === toast) hideToast({ restoreFocus: false });
    }, { once: true });
  } else {
    stack.appendChild(toast);
  }
  activeToastEl = toast;

  if (!openModal) {
    try {
      if (typeof toast.showPopover === 'function') {
        toast.showPopover();
      } else {
        toast.classList.add(':popover-open');
      }
    } catch {
      toast.classList.add(':popover-open');
    }
  }

  const announcement = actionLabel ? `${message}. Actions available.` : message;
  announce(announcement, { urgent: tone === 'error' });

  if (duration > 0) {
    scheduleHide();
  }
}

export const toast = {
  info: (msg, opts = {}) => showToast(msg, { ...opts, tone: 'info' }),
  success: (msg, opts = {}) => showToast(msg, { ...opts, tone: 'success' }),
  error: (msg, opts = {}) => showToast(msg, { ...opts, tone: 'error', duration: opts.duration ?? 6000 })
};

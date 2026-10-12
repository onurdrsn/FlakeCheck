export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ActiveToast {
  id: string;
  el: HTMLElement;
  progressEl: HTMLElement;
  duration: number;
  remaining: number;
  startedAt: number;
  timerId: number | null;
  dismissing: boolean;
}

const MAX_VISIBLE_TOASTS = 5;
const DEFAULT_DURATION = 5000;

const ICONS: Record<ToastType, string> = {
  success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

let containerEl: HTMLElement | null = null;
let counter = 0;
const activeToasts = new Map<string, ActiveToast>();

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function getContainer(): HTMLElement {
  if (containerEl && document.body.contains(containerEl)) {
    return containerEl;
  }
  const existing = document.getElementById('fc-toast-stack');
  if (existing) {
    containerEl = existing;
    return existing;
  }
  const el = document.createElement('div');
  el.id = 'fc-toast-stack';
  el.className = 'toast-stack';
  el.setAttribute('role', 'log');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-label', 'Notifications');
  document.body.appendChild(el);
  containerEl = el;
  return el;
}

function startTimer(item: ActiveToast) {
  if (item.duration <= 0 || item.dismissing) return;
  item.startedAt = performance.now();
  item.progressEl.style.transition = prefersReducedMotion()
    ? 'none'
    : `width ${item.remaining}ms linear`;
  // Trigger reflow so the browser registers current width before animating to 0%
  void item.progressEl.offsetWidth;
  item.progressEl.style.width = '0%';

  item.timerId = window.setTimeout(() => {
    dismiss(item.id);
  }, item.remaining);
}

function pauseTimer(item: ActiveToast) {
  if (item.dismissing || item.timerId === null) return;
  window.clearTimeout(item.timerId);
  item.timerId = null;
  const elapsed = performance.now() - item.startedAt;
  item.remaining = Math.max(0, item.remaining - elapsed);
  const pct = item.duration > 0 ? Math.max(0, Math.min(100, (item.remaining / item.duration) * 100)) : 0;
  item.progressEl.style.transition = 'none';
  item.progressEl.style.width = `${pct}%`;
}

export function dismiss(id: string): void {
  const item = activeToasts.get(id);
  if (!item || item.dismissing) return;
  item.dismissing = true;

  if (item.timerId !== null) {
    window.clearTimeout(item.timerId);
    item.timerId = null;
  }

  if (prefersReducedMotion()) {
    item.el.remove();
    activeToasts.delete(id);
    return;
  }

  item.el.style.maxHeight = `${item.el.offsetHeight}px`;
  void item.el.offsetHeight;
  item.el.classList.remove('is-entering');
  item.el.classList.add('is-exiting');

  window.setTimeout(() => {
    item.el.remove();
    activeToasts.delete(id);
  }, 300);
}

export function show(options: ToastOptions): string {
  if (typeof document === 'undefined') return '';
  const type: ToastType = options.type ?? 'info';
  const duration = options.duration ?? DEFAULT_DURATION;
  const id = `toast-${Date.now()}-${++counter}`;
  const container = getContainer();

  // Enforce maximum 5 visible toasts — dismiss oldest active toasts when limit is exceeded
  const nonDismissing = Array.from(activeToasts.values()).filter((t) => !t.dismissing);
  while (nonDismissing.length >= MAX_VISIBLE_TOASTS) {
    const oldest = nonDismissing.shift();
    if (oldest) dismiss(oldest.id);
  }

  const card = document.createElement('div');
  card.className = `toast-card toast-card--${type}`;
  card.setAttribute('role', 'status');
  card.dataset.toastId = id;

  const iconWrap = document.createElement('div');
  iconWrap.className = 'toast-card__icon';
  iconWrap.innerHTML = ICONS[type];

  const body = document.createElement('div');
  body.className = 'toast-card__body';

  const titleEl = document.createElement('div');
  titleEl.className = 'toast-card__title';
  titleEl.textContent = options.title;
  body.appendChild(titleEl);

  if (options.message) {
    const msgEl = document.createElement('div');
    msgEl.className = 'toast-card__message';
    msgEl.textContent = options.message;
    body.appendChild(msgEl);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-card__close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss(id);
  });

  const progressTrack = document.createElement('div');
  progressTrack.className = 'toast-card__progress-track';
  const progressBar = document.createElement('div');
  progressBar.className = 'toast-card__progress-bar';
  progressBar.style.width = '100%';
  progressTrack.appendChild(progressBar);

  card.appendChild(iconWrap);
  card.appendChild(body);
  card.appendChild(closeBtn);
  card.appendChild(progressTrack);

  // Newest toast appears at the top, older toasts push down
  container.prepend(card);

  const item: ActiveToast = {
    id,
    el: card,
    progressEl: progressBar,
    duration,
    remaining: duration,
    startedAt: performance.now(),
    timerId: null,
    dismissing: false,
  };

  activeToasts.set(id, item);

  card.addEventListener('mouseenter', () => pauseTimer(item));
  card.addEventListener('mouseleave', () => startTimer(item));

  if (!prefersReducedMotion()) {
    requestAnimationFrame(() => {
      card.classList.add('is-entering');
    });
  } else {
    card.classList.add('is-entering');
  }

  startTimer(item);
  return id;
}

export const toast = {
  show,
  dismiss,
  success: (title: string, message?: string, duration?: number) =>
    show({ type: 'success', title, message, duration }),
  error: (title: string, message?: string, duration?: number) =>
    show({ type: 'error', title, message, duration }),
  warning: (title: string, message?: string, duration?: number) =>
    show({ type: 'warning', title, message, duration }),
  info: (title: string, message?: string, duration?: number) =>
    show({ type: 'info', title, message, duration }),
};

if (typeof window !== 'undefined') {
  (window as unknown as { toast: typeof toast }).toast = toast;
}

// @ts-check
/**
 * トースト通知モジュール
 */

/** @type {HTMLElement | null} */
let container = null;

function ensureContainer() {
  if (!container) {
    container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  }
  return container;
}

/**
 * トーストを表示
 * @param {string} message
 * @param {'info' | 'success' | 'warning' | 'error'} [type]
 * @param {number} [durationMs]
 */
export function showToast(message, type = 'info', durationMs = 3000) {
  const c = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    info: '💡',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '💡'}</span>
    <span class="toast-message">${message}</span>
  `;

  c.appendChild(toast);

  // Trigger entry animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-leaving');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, durationMs);
}

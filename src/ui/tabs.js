// @ts-check
/**
 * タブ切り替え制御
 */

/** @typedef {'workout' | 'nutrition' | 'analytics' | 'settings'} TabId */

/** @type {TabId} */
let currentTab = 'workout';

/**
 * @param {(tabId: TabId) => void} [onTabChanged]
 */
export function initTabs(onTabChanged) {
  const tabButtons = document.querySelectorAll('.nav-tab-btn');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = /** @type {TabId} */ (btn.getAttribute('data-tab'));
      if (target) {
        switchTab(target);
        if (onTabChanged) onTabChanged(target);
      }
    });
  });
}

/**
 * @param {TabId} tabId
 */
export function switchTab(tabId) {
  currentTab = tabId;

  // Update navigation buttons
  document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
    const isActive = btn.getAttribute('data-tab') === tabId;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  // Update tab panel visibility
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const isTarget = panel.id === `tab-${tabId}`;
    panel.classList.toggle('is-active', isTarget);
  });

  // Scroll to top on tab switch
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function getCurrentTab() {
  return currentTab;
}

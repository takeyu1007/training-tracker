// @ts-check
/**
 * Training Tracker エントリーポイント
 */

import { createStore } from './store.js';
import { initTabs, getCurrentTab } from './ui/tabs.js';
import { initTimerUI } from './ui/timer.js';
import { initWorkoutUI, renderWorkout } from './ui/workout.js';
import { initNutritionUI, renderNutrition } from './ui/nutrition.js';
import { initAnalyticsUI, renderAnalytics } from './ui/analytics.js';
import { initSettingsUI, renderSettings } from './ui/settings.js';
import { showToast } from './ui/toast.js';

window.addEventListener('DOMContentLoaded', () => {
  const store = createStore(window.localStorage);

  // 破損データ退避の警告
  if (store.recoveredBackupKey) {
    showToast(
      `⚠️ 破損データを検出したため退避キー「${store.recoveredBackupKey}」に保存し初期化しました。`,
      'warning',
      8000,
    );
  }

  // 容量超過などの保存エラー監視
  store.onSaveError(() => {
    showToast('❌ ローカルストレージの空き容量が不足しているため保存できませんでした。', 'error', 6000);
  });

  // UI モジュールの初期化
  initTimerUI();
  initWorkoutUI(store);
  initNutritionUI(store);
  initAnalyticsUI(store);
  initSettingsUI(store);

  // タブ切り替え時の再描画コールバック
  initTabs((tabId) => {
    switch (tabId) {
      case 'workout':
        renderWorkout();
        break;
      case 'nutrition':
        renderNutrition();
        break;
      case 'analytics':
        renderAnalytics();
        break;
      case 'settings':
        renderSettings();
        break;
    }
  });

  // ストア更新時に現在表示中のタブを自動再描画
  store.subscribe(() => {
    const activeTab = getCurrentTab();
    switch (activeTab) {
      case 'workout':
        renderWorkout();
        break;
      case 'nutrition':
        renderNutrition();
        break;
      case 'analytics':
        renderAnalytics();
        break;
      case 'settings':
        renderSettings();
        break;
    }
  });

  // 別タブでのデータ変更を同期
  window.addEventListener('storage', (e) => {
    if (e.key === 'trainingTracker.data') {
      store.reloadFromStorage();
    }
  });

  // Service Worker の登録
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((err) => {
        console.warn('Service Worker registration failed:', err);
      });
  }
});

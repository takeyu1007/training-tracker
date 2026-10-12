// @ts-check
/**
 * PFC・栄養管理 UI モジュール
 */

import { calculateRemainingPFC, pfcToCalories, calculateWeeklyNutritionAverage } from '../calc.js';
import { escapeHtml, formatCalories, formatDate, formatTime } from '../format.js';
import { playSuccessChime } from '../sound.js';
import { showToast } from './toast.js';

/** @type {import('../store.js').Store} */
let storeInstance;
let selectedDateStr = new Date().toISOString().slice(0, 10);

/**
 * @param {import('../store.js').Store} store
 */
export function initNutritionUI(store) {
  storeInstance = store;
  bindEvents();
  renderNutrition();
}

function bindEvents() {
  const container = document.getElementById('tab-nutrition');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // クイック加算ボタン
    if (target.closest('#btn-quick-add-pfc')) {
      handleQuickAdd();
      return;
    }

    // マイルーティン加算ボタン
    const routineBtn = target.closest('.btn-routine-quick');
    if (routineBtn) {
      const routineId = routineBtn.getAttribute('data-routine-id');
      const routine = storeInstance.getState().routines.find((r) => r.id === routineId);
      if (routine) {
        storeInstance.addNutritionLog(selectedDateStr, {
          name: routine.name,
          p: routine.p,
          f: routine.f,
          c: routine.c,
        });
        playSuccessChime();
        showToast(`「${routine.name}」を加算しました！`, 'success');
        renderNutrition();
      }
      return;
    }

    // サプリメント完了トグル
    const suppBtn = target.closest('.supp-toggle-btn');
    if (suppBtn) {
      const suppName = suppBtn.getAttribute('data-supp-name');
      if (suppName) {
        storeInstance.toggleDailySupplement(selectedDateStr, suppName);
        playSuccessChime();
        renderNutrition();
      }
      return;
    }

    // ログ削除
    const deleteLogBtn = target.closest('.btn-delete-nutrition-log');
    if (deleteLogBtn) {
      const logId = deleteLogBtn.getAttribute('data-log-id');
      if (logId) {
        storeInstance.deleteNutritionLog(selectedDateStr, logId);
        renderNutrition();
      }
      return;
    }
  });

  // 日付変更
  container.addEventListener('change', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.id === 'input-nutrition-date') {
      const val = /** @type {HTMLInputElement} */ (target).value;
      if (val) {
        selectedDateStr = val;
        renderNutrition();
      }
    }
  });
}

function handleQuickAdd() {
  const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('quick-food-name'));
  const pInput = /** @type {HTMLInputElement | null} */ (document.getElementById('quick-p'));
  const fInput = /** @type {HTMLInputElement | null} */ (document.getElementById('quick-f'));
  const cInput = /** @type {HTMLInputElement | null} */ (document.getElementById('quick-c'));

  const name = nameInput?.value.trim() || 'クイック入力';
  const p = Number(pInput?.value) || 0;
  const f = Number(fInput?.value) || 0;
  const c = Number(cInput?.value) || 0;

  if (p === 0 && f === 0 && c === 0) {
    showToast('いずれかの栄養素（P, F, C）を入力してください', 'warning');
    return;
  }

  storeInstance.addNutritionLog(selectedDateStr, { name, p, f, c });
  playSuccessChime();
  showToast(`PFCを記録しました (+${pfcToCalories(p, f, c)} kcal)`, 'success');

  // フォームクリア
  if (nameInput) nameInput.value = '';
  if (pInput) pInput.value = '';
  if (fInput) fInput.value = '';
  if (cInput) cInput.value = '';

  renderNutrition();
}

export function renderNutrition() {
  const container = document.getElementById('tab-nutrition');
  if (!container || !storeInstance) return;

  const state = storeInstance.getState();
  const profile = state.profile;
  const daily = storeInstance.getOrCreateDailyNutrition(selectedDateStr);

  const targets = {
    targetCalories: profile.targetCalories,
    targetP: profile.targetP,
    targetF: profile.targetF,
    targetC: profile.targetC,
  };

  const metrics = calculateRemainingPFC(targets, daily);
  const weeklyAvg = calculateWeeklyNutritionAverage(state.dailyNutrition, new Date(selectedDateStr));
  const routines = state.routines;

  container.innerHTML = `
    <!-- 日付セレクター -->
    <div class="nutrition-date-bar">
      <span class="icon">📅</span>
      <input type="date" id="input-nutrition-date" class="input input-date-picker" value="${selectedDateStr}">
      <span class="text-muted text-sm">${formatDate(selectedDateStr)}</span>
    </div>

    <!-- PFCサマリーメーター -->
    <section class="card pfc-dashboard-card">
      <div class="calories-main-hero">
        <div class="calories-circle">
          <span class="calories-number font-mono">${metrics.currentCalories.toLocaleString()}</span>
          <span class="calories-unit">/ ${profile.targetCalories.toLocaleString()} kcal</span>
        </div>
        <div class="calories-diff-badge ${metrics.diffCalories >= 0 ? 'is-under' : 'is-over'}">
          ${metrics.diffCalories >= 0 ? `残り ${metrics.diffCalories.toLocaleString()} kcal` : `${Math.abs(metrics.diffCalories).toLocaleString()} kcal 超過`}
        </div>
      </div>

      <!-- P / F / C プログレスバー -->
      <div class="pfc-bars-grid">
        <!-- Protein -->
        <div class="macro-card macro-p">
          <div class="macro-header">
            <span class="macro-name">Protein (P)</span>
            <span class="macro-diff">${metrics.remainingP >= 0 ? `あと ${metrics.remainingP}g` : `+${Math.abs(metrics.remainingP)}g`}</span>
          </div>
          <div class="macro-numbers font-mono">
            <strong>${daily.totalP}</strong> <small>/ ${profile.targetP}g</small>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill fill-p" style="width: ${metrics.percentP}%"></div>
          </div>
        </div>

        <!-- Fat -->
        <div class="macro-card macro-f">
          <div class="macro-header">
            <span class="macro-name">Fat (F)</span>
            <span class="macro-diff">${metrics.remainingF >= 0 ? `あと ${metrics.remainingF}g` : `+${Math.abs(metrics.remainingF)}g`}</span>
          </div>
          <div class="macro-numbers font-mono">
            <strong>${daily.totalF}</strong> <small>/ ${profile.targetF}g</small>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill fill-f" style="width: ${metrics.percentF}%"></div>
          </div>
        </div>

        <!-- Carb -->
        <div class="macro-card macro-c">
          <div class="macro-header">
            <span class="macro-name">Carb (C)</span>
            <span class="macro-diff">${metrics.remainingC >= 0 ? `あと ${metrics.remainingC}g` : `+${Math.abs(metrics.remainingC)}g`}</span>
          </div>
          <div class="macro-numbers font-mono">
            <strong>${daily.totalC}</strong> <small>/ ${profile.targetC}g</small>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill fill-c" style="width: ${metrics.percentC}%"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 直近7日間の平均栄養実績 -->
    <section class="card weekly-nutrition-card">
      <div class="card-header-flex">
        <div>
          <h3 class="card-title">📊 直近7日間の平均栄養実績</h3>
          <span class="text-muted text-sm">週平均カロリーと目標PFCのバランス (${weeklyAvg.daysLogged}日記録)</span>
        </div>
        <div class="weekly-avg-badge ${weeklyAvg.avgCalories > profile.targetCalories ? 'is-over' : 'is-under'}">
          ${weeklyAvg.daysLogged > 0 ? `平均 ${weeklyAvg.avgCalories.toLocaleString()} kcal/日` : 'データ収集中'}
        </div>
      </div>

      ${
        weeklyAvg.daysLogged === 0
          ? `
        <p class="text-sm text-muted mt-2">過去7日間の食事記録が登録されると、週平均のPFCバランスが表示されます。</p>
      `
          : `
        <div class="weekly-macros-grid mt-3">
          <div class="weekly-macro-item">
            <span class="label text-p">平均 Protein</span>
            <span class="val font-mono"><strong>${weeklyAvg.avgP}</strong>g</span>
            <span class="sub text-xs text-muted">目標: ${profile.targetP}g</span>
          </div>
          <div class="weekly-macro-item">
            <span class="label text-f">平均 Fat</span>
            <span class="val font-mono"><strong>${weeklyAvg.avgF}</strong>g</span>
            <span class="sub text-xs text-muted">目標: ${profile.targetF}g</span>
          </div>
          <div class="weekly-macro-item">
            <span class="label text-c">平均 Carb</span>
            <span class="val font-mono"><strong>${weeklyAvg.avgC}</strong>g</span>
            <span class="sub text-xs text-muted">目標: ${profile.targetC}g</span>
          </div>
        </div>
      `
      }
    </section>

    <!-- マイルーティン（ワンタップ加算） -->
    <section class="card routines-quick-card">
      <h3 class="card-title">⚡ マイルーティン（ワンタップ加算）</h3>
      <div class="routines-btn-grid">
        ${
          routines.length === 0
            ? `<p class="text-muted text-sm">設定タブから「いつものプロテイン」などを登録できます。</p>`
            : routines
                .map(
                  (r) => `
                <button type="button" class="btn btn-routine-quick" data-routine-id="${r.id}">
                  <span class="routine-title">${escapeHtml(r.name)}</span>
                  <span class="routine-macros text-sm font-mono">P:${r.p} F:${r.f} C:${r.c}</span>
                </button>
              `,
                )
                .join('')
        }
      </div>
    </section>

    <!-- クイック数値入力 -->
    <section class="card quick-adder-card">
      <h3 class="card-title">＋ クイックPFC入力</h3>
      <div class="quick-adder-form">
        <input type="text" id="quick-food-name" class="input" placeholder="品目名 (例: 鶏胸肉300g, 卵2個)">
        <div class="quick-inputs-row">
          <div class="input-with-label">
            <label for="quick-p">P (g)</label>
            <input type="number" id="quick-p" class="input" step="0.5" placeholder="0">
          </div>
          <div class="input-with-label">
            <label for="quick-f">F (g)</label>
            <input type="number" id="quick-f" class="input" step="0.5" placeholder="0">
          </div>
          <div class="input-with-label">
            <label for="quick-c">C (g)</label>
            <input type="number" id="quick-c" class="input" step="0.5" placeholder="0">
          </div>
        </div>
        <button type="button" id="btn-quick-add-pfc" class="btn btn-primary btn-glow">
          ＋ 記録に追加
        </button>
      </div>
    </section>

    <!-- サプリメント・チェッカー -->
    <section class="card supplements-card">
      <h3 class="card-title">💊 本日のサプリメントチェック</h3>
      <div class="supp-list">
        ${profile.supplements
          .map((s) => {
            const isChecked = daily.completedSupplements.includes(s);
            return `
              <button type="button" class="supp-toggle-btn ${isChecked ? 'is-checked' : ''}" data-supp-name="${escapeHtml(s)}">
                <span class="check-box">${isChecked ? '✓' : ''}</span>
                <span class="supp-text">${escapeHtml(s)}</span>
              </button>
            `;
          })
          .join('')}
      </div>
    </section>

    <!-- 今日の入力履歴 -->
    <section class="card nutrition-history-card">
      <h3 class="card-title">本日の摂取内訳 (${daily.logs.length})</h3>
      ${
        daily.logs.length === 0
          ? `<p class="empty-hint text-center text-muted">まだ記録がありません。</p>`
          : `
          <ul class="nutrition-logs-list">
            ${daily.logs
              .map(
                (log) => `
              <li class="nutrition-log-row">
                <div class="log-info">
                  <span class="log-name font-bold">${escapeHtml(log.name)}</span>
                  <span class="log-time text-faint text-sm">${formatTime(log.loggedAt)}</span>
                </div>
                <div class="log-macros font-mono text-sm">
                  <span class="tag-p">P:${log.p}g</span>
                  <span class="tag-f">F:${log.f}g</span>
                  <span class="tag-c">C:${log.c}g</span>
                  <span class="log-cals">${pfcToCalories(log.p, log.f, log.c)} kcal</span>
                </div>
                <button type="button" class="btn-icon btn-delete-nutrition-log" data-log-id="${log.id}" title="削除">
                  🗑
                </button>
              </li>
            `,
              )
              .join('')}
          </ul>
        `
      }
    </section>
  `;
}

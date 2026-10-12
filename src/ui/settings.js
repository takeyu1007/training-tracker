// @ts-check
/**
 * 設定・プロファイル・バックアップ UI モジュール
 */

import { calculateTargetPFC, checkPaceSafety } from '../calc.js';
import { escapeHtml } from '../format.js';
import { showToast } from './toast.js';

/** @type {import('../store.js').Store} */
let storeInstance;
let isResetArmed = false;

/** @type {Set<string>} */
const collapsedSections = new Set();

/** @type {any} */
let pendingPayload = null;
/** @type {any} */
let pendingSafetyCheck = null;
let pendingPayloadIsProject = false;

/**
 * @param {import('../store.js').Store} store
 */
export function initSettingsUI(store) {
  storeInstance = store;
  bindEvents();
  bindSafetyModalEvents();
  renderSettings();
}

function bindSafetyModalEvents() {
  const modal = document.getElementById('safety-modal');
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // 推奨ペースに自動修正して保存
    if (target.closest('#btn-safety-auto-adjust')) {
      if (pendingPayload && pendingSafetyCheck) {
        const adjustedPayload = {
          ...pendingPayload,
          targetDate: pendingSafetyCheck.recommendedTargetDate,
        };
        if (pendingPayloadIsProject) {
          storeInstance.updateActiveProject(adjustedPayload);
          showToast('推奨安全ペース（期日を延長）に修正してプロジェクトを保存しました！', 'success');
        } else {
          storeInstance.updateProfile(adjustedPayload);
          showToast('推奨安全ペース（期日を延長）に修正して保存しました！', 'success');
        }
        hideSafetyModal();
        renderSettings();
      }
      return;
    }

    // リスクを理解してこのまま設定（ユーザー要望: 強制保存可能）
    if (target.closest('#btn-safety-proceed-anyway')) {
      if (pendingPayload) {
        if (pendingPayloadIsProject) {
          storeInstance.updateActiveProject(pendingPayload);
          showToast('リスクを理解した上でプロジェクト設定を保存しました', 'warning');
        } else {
          storeInstance.updateProfile(pendingPayload);
          showToast('リスクを理解した上で設定を保存しました', 'warning');
        }
        hideSafetyModal();
        renderSettings();
      }
      return;
    }

    // キャンセル
    if (target.closest('#btn-safety-cancel')) {
      hideSafetyModal();
      return;
    }
  });
}

/**
 * @param {ReturnType<typeof checkPaceSafety>} check
 * @param {any} payload
 * @param {boolean} [isProject=false]
 */
function showSafetyModal(check, payload, isProject = false) {
  pendingPayload = payload;
  pendingSafetyCheck = check;
  pendingPayloadIsProject = isProject;
  const modal = document.getElementById('safety-modal');
  const body = document.getElementById('safety-modal-body');
  const title = document.getElementById('safety-modal-title');
  if (!modal || !body || !title) return;

  title.textContent = check.severity === 'danger' ? '🚨 危険な目標ペースの警告' : '⚠️ 急激な目標ペースへの注意';
  body.innerHTML = `
    <div class="safety-alert-banner banner-${check.severity}">
      <p class="font-bold text-sm mb-1">${escapeHtml(check.reason)}</p>
    </div>
    <div class="safety-stats-grid mt-3">
      <div class="safety-stat-box">
        <span class="label">設定ペース換算</span>
        <span class="val font-mono text-rose">${check.monthlyRatePercent > 0 ? `${check.monthlyRatePercent}% / 月` : '期限不正'}</span>
      </div>
      <div class="safety-stat-box">
        <span class="label">必要調整カロリー</span>
        <span class="val font-mono text-rose">${check.dailyCalorieAdjustment > 0 ? `${check.dailyCalorieAdjustment.toLocaleString()} kcal/日` : '---'}</span>
      </div>
    </div>
    <div class="safety-advice-card mt-3">
      <h5 class="font-bold text-cyan text-sm">💡 医学・スポーツ栄養学の推奨安全ペース</h5>
      <p class="text-sm text-muted mt-1 leading-relaxed">
        無理のないペース（月間2〜5%以内）で代謝と筋肉を維持する場合、目標期日を <strong>${check.recommendedTargetDate}</strong>（あと${check.recommendedDays}日）に設定するか、今回の目標期日までに <strong>${check.suggestedWeightForDate}kg</strong> を目指すことを強く推奨します。
      </p>
    </div>
  `;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

function hideSafetyModal() {
  const modal = document.getElementById('safety-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
  pendingPayload = null;
  pendingSafetyCheck = null;
  pendingPayloadIsProject = false;
}

function bindEvents() {
  const container = document.getElementById('tab-settings');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // アコーディオン折りたたみトグル
    const accordionHeader = target.closest('.settings-accordion-header');
    if (accordionHeader) {
      const card = accordionHeader.closest('.settings-accordion-card');
      const sectionId = card?.getAttribute('data-section-id');
      if (card && sectionId) {
        if (collapsedSections.has(sectionId)) {
          collapsedSections.delete(sectionId);
          card.classList.remove('is-collapsed');
          accordionHeader.setAttribute('aria-expanded', 'true');
        } else {
          collapsedSections.add(sectionId);
          card.classList.add('is-collapsed');
          accordionHeader.setAttribute('aria-expanded', 'false');
        }
      }
      return;
    }

    // 全種目へ標準休憩タイマーを一括反映
    if (target.closest('#btn-batch-apply-rest')) {
      const up = Math.max(5, Number(/** @type {HTMLInputElement} */ (document.getElementById('batch-rest-up'))?.value) || 60);
      const main = Math.max(5, Number(/** @type {HTMLInputElement} */ (document.getElementById('batch-rest-main'))?.value) || 120);
      const heavy = Math.max(5, Number(/** @type {HTMLInputElement} */ (document.getElementById('batch-rest-heavy'))?.value) || 180);
      const down = Math.max(5, Number(/** @type {HTMLInputElement} */ (document.getElementById('batch-rest-down'))?.value) || 60);

      const batchRest = { UP: up, MAIN: main, HEAVY: heavy, DOWN: down };
      storeInstance.updateProfile({ defaultRestSeconds: batchRest });
      storeInstance.batchUpdateExerciseRestSeconds(batchRest);
      showToast('全種目のセット別休憩タイマーを一括更新しました！', 'success');
      renderSettings();
      return;
    }

    // 基本プロファイル保存
    if (target.closest('#btn-save-profile')) {
      handleSaveProfile();
      return;
    }

    // プロジェクト設定保存
    if (target.closest('#btn-save-project')) {
      handleSaveProject();
      return;
    }

    // プロジェクト目標PFCの自動再計算
    if (target.closest('#btn-autocalc-project-pfc')) {
      handleAutoCalcProjectPFC();
      return;
    }

    // 進行中プロジェクトの完了・アーカイブ
    if (target.closest('#btn-complete-project')) {
      storeInstance.completeActiveProject();
      showToast('🎉 プロジェクトを完了・アーカイブしました！お疲れ様でした', 'success');
      renderSettings();
      return;
    }

    // 新規プロジェクト開始ボタン
    if (target.closest('#btn-start-new-project')) {
      const active = storeInstance.getState().activeProject;
      if (active) {
        showConfirmNewProjectModal(active.title || active.name || '進行中プロジェクト');
      } else {
        startNewProjectQuickly();
      }
      return;
    }

    // 新規プロジェクト確認モーダル: 承認
    if (target.closest('#btn-modal-confirm-new-project')) {
      storeInstance.completeActiveProject();
      startNewProjectQuickly();
      hideConfirmNewProjectModal();
      return;
    }

    // 新規プロジェクト確認モーダル: キャンセル
    if (target.closest('#btn-modal-cancel-new-project') || target.closest('#modal-new-project-close')) {
      hideConfirmNewProjectModal();
      return;
    }

    // 過去体重の追加
    if (target.closest('#btn-add-weight-log')) {
      const dInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-add-weight-date'));
      const wInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-add-weight-val'));
      const d = dInput?.value || new Date().toISOString().slice(0, 10);
      const w = Number(wInput?.value) || 0;
      if (w > 0) {
        storeInstance.logWeight(d, w);
        showToast(`${d} の体重 ${w}kg を記録しました！`, 'success');
        renderSettings();
      } else {
        showToast('体重を正しく入力してください', 'warning');
      }
      return;
    }

    // 過去体重ログの更新
    const saveWeightBtn = target.closest('.btn-save-weight-log');
    if (saveWeightBtn) {
      const id = saveWeightBtn.getAttribute('data-log-id');
      if (id) {
        const dInput = /** @type {HTMLInputElement | null} */ (document.querySelector(`.weight-log-date[data-log-id="${id}"]`));
        const wInput = /** @type {HTMLInputElement | null} */ (document.querySelector(`.weight-log-weight[data-log-id="${id}"]`));
        const d = dInput?.value;
        const w = Number(wInput?.value);
        if (d && w > 0) {
          storeInstance.updateWeightLog(id, { date: d, weight: w });
          showToast('体重記録を更新しました！', 'success');
          renderSettings();
        }
      }
      return;
    }

    // 過去体重ログの削除
    const delWeightBtn = target.closest('.btn-delete-weight-log');
    if (delWeightBtn) {
      const id = delWeightBtn.getAttribute('data-log-id');
      if (id) {
        storeInstance.deleteWeightLog(id);
        showToast('体重記録を削除しました', 'info');
        renderSettings();
      }
      return;
    }

    // 新規ルーティン追加
    if (target.closest('#btn-add-routine')) {
      handleAddRoutine();
      return;
    }

    // ルーティン削除
    const delRoutineBtn = target.closest('.btn-delete-routine');
    if (delRoutineBtn) {
      const id = delRoutineBtn.getAttribute('data-routine-id');
      if (id) {
        storeInstance.deleteRoutine(id);
        showToast('ルーティンを削除しました', 'info');
        renderSettings();
      }
      return;
    }

    // 種目マスター新規追加
    if (target.closest('#btn-add-exercise-template')) {
      const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-new-exercise-name'));
      const restInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-new-exercise-rest'));
      const catSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('input-new-exercise-category'));
      const name = nameInput?.value.trim() || '';
      const rest = Number(restInput?.value) || 120;
      const category = /** @type {import('../model.js').MuscleCategory} */ (catSelect?.value || 'その他');

      if (!name) {
        showToast('種目名を入力してください', 'warning');
        return;
      }
      const curDefaults = storeInstance.getState().profile.defaultRestSeconds || { UP: 60, MAIN: 120, HEAVY: 180, DOWN: 60 };
      const newRest = {
        UP: curDefaults.UP,
        MAIN: rest,
        HEAVY: curDefaults.HEAVY,
        DOWN: curDefaults.DOWN,
      };
      if (storeInstance.addExerciseTemplate(name, rest, category, newRest)) {
        showToast(`種目「${name} (${category})」を追加しました`, 'success');
        if (nameInput) nameInput.value = '';
        renderSettings();
      } else {
        showToast('既に同名の種目が登録されています', 'warning');
      }
      return;
    }

    // 種目マスター削除
    const delExBtn = target.closest('.btn-delete-exercise-template');
    if (delExBtn) {
      const id = delExBtn.getAttribute('data-exercise-id');
      if (id) {
        storeInstance.deleteExerciseTemplate(id);
        showToast('種目を削除しました', 'info');
        renderSettings();
      }
      return;
    }

    // サプリ追加
    if (target.closest('#btn-add-supplement')) {
      const suppInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-new-supplement'));
      const val = suppInput?.value.trim();
      if (val) {
        const cur = storeInstance.getState().profile.supplements;
        if (!cur.includes(val)) {
          storeInstance.updateProfile({ supplements: [...cur, val] });
          showToast(`サプリ「${val}」を追加しました`, 'success');
          if (suppInput) suppInput.value = '';
          renderSettings();
        }
      }
      return;
    }

    // サプリ削除
    const delSuppBtn = target.closest('.btn-delete-supplement');
    if (delSuppBtn) {
      const name = delSuppBtn.getAttribute('data-supp-name');
      if (name) {
        const cur = storeInstance.getState().profile.supplements;
        storeInstance.updateProfile({ supplements: cur.filter((s) => s !== name) });
        showToast(`サプリ「${name}」を削除しました`, 'info');
        renderSettings();
      }
      return;
    }

    // JSON エクスポート
    if (target.closest('#btn-export-json')) {
      const dataStr = storeInstance.exportData();
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `trainingTracker_backup_${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('バックアップJSONをダウンロードしました', 'success');
      return;
    }

    // JSON インポート
    if (target.closest('#btn-import-json')) {
      const fileInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-file-import'));
      fileInput?.click();
      return;
    }

    // 全データ初期化（2段階安全確認）
    if (target.closest('#btn-reset-all')) {
      const resetBtn = /** @type {HTMLButtonElement} */ (target.closest('#btn-reset-all'));
      if (!isResetArmed) {
        isResetArmed = true;
        resetBtn.textContent = '⚠️ 本当に初期化しますか？もう一度タップ';
        resetBtn.classList.add('btn-danger-armed');
        setTimeout(() => {
          isResetArmed = false;
          resetBtn.textContent = '全データを初期化';
          resetBtn.classList.remove('btn-danger-armed');
        }, 4000);
      } else {
        storeInstance.resetAll();
        isResetArmed = false;
        showToast('全データを初期化しました', 'warning');
        renderSettings();
      }
      return;
    }
  });

  // 種目別・セット種別ごとの休憩時間のインライン変更
  container.addEventListener('change', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.classList.contains('input-exercise-set-rest')) {
      const input = /** @type {HTMLInputElement} */ (target);
      const exId = input.getAttribute('data-exercise-id');
      const setType = /** @type {import('../model.js').SetType | null} */ (input.getAttribute('data-set-type'));
      const val = Math.max(5, Number(input.value) || 60);
      if (exId && setType) {
        const ex = storeInstance.getState().exerciseTemplates.find((t) => t.id === exId);
        const updatedRest = {
          ...(ex?.restSeconds || { UP: 60, MAIN: 120, HEAVY: 180, DOWN: 60 }),
          [setType]: val,
        };
        storeInstance.updateExerciseTemplate(exId, {
          restSeconds: updatedRest,
          defaultRestSeconds: updatedRest.MAIN || val,
        });
        showToast(`「${ex?.name || '種目'}」の${setType}休憩を ${val}秒 に更新しました`, 'success');
      }
    }

    if (target.id === 'input-file-import') {
      const file = /** @type {HTMLInputElement} */ (target).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const content = String(evt.target?.result || '');
          if (storeInstance.importData(content)) {
            showToast('データを正常に復元しました！', 'success');
            renderSettings();
          } else {
            showToast('JSONファイルの形式が不正です', 'error');
          }
        };
        reader.readAsText(file);
      }
    }
  });
}

function handleSaveProfile() {
  const name = /** @type {HTMLInputElement} */ (document.getElementById('profile-name'))?.value || '';
  const height = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-height'))?.value) || 172;
  const age = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-age'))?.value) || 28;
  const gender = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('profile-gender'))?.value || 'male');
  const activityLevel = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('profile-activity'))?.value || 'moderate');

  storeInstance.updateProfile({
    name,
    height,
    age,
    gender,
    activityLevel,
  });
  showToast('基本プロファイルを保存しました！', 'success');
  renderSettings();
}

function handleSaveProject() {
  const title = /** @type {HTMLInputElement} */ (document.getElementById('proj-title'))?.value || 'ボディメイクPJ';
  const goalType = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('proj-goal'))?.value || 'cut');
  const startDate = /** @type {HTMLInputElement} */ (document.getElementById('proj-start-date'))?.value || new Date().toISOString().slice(0, 10);
  const startWeight = Number(/** @type {HTMLInputElement} */ (document.getElementById('proj-start-weight'))?.value) || storeInstance.getLatestWeight();
  const targetDate = /** @type {HTMLInputElement} */ (document.getElementById('proj-target-date'))?.value || '';
  const targetWeight = Number(/** @type {HTMLInputElement} */ (document.getElementById('proj-target-weight'))?.value) || startWeight;
  const targetCalories = Number(/** @type {HTMLInputElement} */ (document.getElementById('proj-calories'))?.value) || 2200;
  const targetP = Number(/** @type {HTMLInputElement} */ (document.getElementById('proj-p'))?.value) || 150;
  const targetF = Number(/** @type {HTMLInputElement} */ (document.getElementById('proj-f'))?.value) || 55;
  const targetC = Number(/** @type {HTMLInputElement} */ (document.getElementById('proj-c'))?.value) || 250;
  const notes = /** @type {HTMLTextAreaElement} */ (document.getElementById('proj-notes'))?.value || '';

  const payload = {
    title,
    goalType,
    startDate,
    startWeight,
    targetDate,
    targetWeight,
    targetCalories,
    targetP,
    targetF,
    targetC,
    notes,
  };

  // ペースの安全性チェック（無理な減量・増量時の警告ポップアップ）
  if (targetDate) {
    const safetyCheck = checkPaceSafety(startWeight, targetWeight, targetDate);
    if (safetyCheck.isUnsafe) {
      showSafetyModal(safetyCheck, payload, true);
      return;
    }
  }

  storeInstance.updateActiveProject(payload);
  showToast('プロジェクト設定を保存しました！🎯', 'success');
  renderSettings();
}

function handleAutoCalcProjectPFC() {
  const profile = storeInstance.getState().profile;
  const startWeight = Number(/** @type {HTMLInputElement} */ (document.getElementById('proj-start-weight'))?.value) || storeInstance.getLatestWeight();
  const goalType = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('proj-goal'))?.value || 'cut');

  const result = calculateTargetPFC({
    height: profile.height,
    currentWeight: startWeight,
    age: profile.age,
    gender: profile.gender,
    goalType,
    activityLevel: profile.activityLevel,
  });

  const calInput = /** @type {HTMLInputElement | null} */ (document.getElementById('proj-calories'));
  const pInput = /** @type {HTMLInputElement | null} */ (document.getElementById('proj-p'));
  const fInput = /** @type {HTMLInputElement | null} */ (document.getElementById('proj-f'));
  const cInput = /** @type {HTMLInputElement | null} */ (document.getElementById('proj-c'));

  if (calInput) calInput.value = String(result.targetCalories);
  if (pInput) pInput.value = String(result.targetP);
  if (fInput) fInput.value = String(result.targetF);
  if (cInput) cInput.value = String(result.targetC);

  showToast('目標PFCを推奨値で自動計算しました！「プロジェクト設定を保存」で適用してください', 'info');
}

function startNewProjectQuickly() {
  const profile = storeInstance.getState().profile;
  const curW = storeInstance.getLatestWeight();
  const today = new Date().toISOString().slice(0, 10);
  const targetD = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const defaultTargetW = Math.round((curW - 3) * 10) / 10;
  const pfc = calculateTargetPFC({
    height: profile.height,
    currentWeight: curW,
    age: profile.age,
    gender: profile.gender,
    goalType: 'cut',
    activityLevel: profile.activityLevel,
  });

  storeInstance.createProject({
    title: '減量フェーズ (Cut)',
    goalType: 'cut',
    startDate: today,
    startWeight: curW,
    targetDate: targetD,
    targetWeight: defaultTargetW,
    targetCalories: pfc.targetCalories,
    targetP: pfc.targetP,
    targetF: pfc.targetF,
    targetC: pfc.targetC,
    notes: '',
  });
  showToast('新規プロジェクトを開始しました！目標値を調整してください 🎯', 'success');
  renderSettings();
}

/** @param {string} activeTitle */
function showConfirmNewProjectModal(activeTitle) {
  const modal = document.getElementById('modal-confirm-new-project');
  const text = document.getElementById('modal-confirm-active-title');
  if (text) text.textContent = activeTitle;
  if (modal) {
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }
}

function hideConfirmNewProjectModal() {
  const modal = document.getElementById('modal-confirm-new-project');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

function handleAddRoutine() {
  const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('routine-new-name'));
  const pInput = /** @type {HTMLInputElement | null} */ (document.getElementById('routine-new-p'));
  const fInput = /** @type {HTMLInputElement | null} */ (document.getElementById('routine-new-f'));
  const cInput = /** @type {HTMLInputElement | null} */ (document.getElementById('routine-new-c'));

  const name = nameInput?.value.trim() || '';
  const p = Number(pInput?.value) || 0;
  const f = Number(fInput?.value) || 0;
  const c = Number(cInput?.value) || 0;

  if (!name) {
    showToast('ルーティン名を入力してください', 'warning');
    return;
  }

  storeInstance.addRoutine({ name, p, f, c, isSupplement: false });
  showToast(`ルーティン「${name}」を追加しました`, 'success');

  if (nameInput) nameInput.value = '';
  if (pInput) pInput.value = '';
  if (fInput) fInput.value = '';
  if (cInput) cInput.value = '';

  renderSettings();
}

export function renderSettings() {
  const container = document.getElementById('tab-settings');
  if (!container || !storeInstance) return;

  const state = storeInstance.getState();
  const profile = state.profile;
  const activeProj = state.activeProject;
  const pastProjects = state.projects;
  const weightLogs = [...state.weightLogs].sort((a, b) => b.date.localeCompare(a.date));
  const routines = state.routines;
  const exerciseTemplates = state.exerciseTemplates;
  const today = new Date().toISOString().slice(0, 10);

  const isProfileCollapsed = collapsedSections.has('profile');
  const isProjectsCollapsed = collapsedSections.has('projects');
  const isExercisesCollapsed = collapsedSections.has('exercises');
  const isRoutinesCollapsed = collapsedSections.has('routines');
  const isSupplementsCollapsed = collapsedSections.has('supplements');
  const isBackupCollapsed = collapsedSections.has('backup');

  container.innerHTML = `
    <!-- ユーザー基本プロファイル -->
    <section class="card settings-card settings-accordion-card ${isProfileCollapsed ? 'is-collapsed' : ''}" data-section-id="profile">
      <button type="button" class="settings-accordion-header" aria-expanded="${!isProfileCollapsed}">
        <div class="accordion-title-wrap">
          <span class="accordion-icon">👤</span>
          <h3 class="card-title">ユーザー基本プロファイル</h3>
        </div>
        <span class="settings-accordion-chevron">▾</span>
      </button>

      <div class="settings-accordion-body">
        <p class="text-muted text-sm mb-3">
          身長や年齢などの不変・基本属性です。体重増減目標は下の「体重・増減量プロジェクト管理」で管理します。
        </p>
        <div class="form-grid">
          <div class="form-group">
            <label for="profile-name">お名前 / ニックネーム</label>
            <input type="text" id="profile-name" class="input" value="${escapeHtml(profile.name)}">
          </div>
          <div class="form-group">
            <label for="profile-gender">性別</label>
            <select id="profile-gender" class="input">
              <option value="male" ${profile.gender === 'male' ? 'selected' : ''}>男性</option>
              <option value="female" ${profile.gender === 'female' ? 'selected' : ''}>女性</option>
            </select>
          </div>
          <div class="form-group">
            <label for="profile-height">身長 (cm)</label>
            <input type="number" id="profile-height" class="input" step="0.5" value="${profile.height}">
          </div>
          <div class="form-group">
            <label for="profile-age">年齢</label>
            <input type="number" id="profile-age" class="input" value="${profile.age}">
          </div>
          <div class="form-group form-group-full">
            <label for="profile-activity">普段の活動レベル</label>
            <select id="profile-activity" class="input">
              <option value="sedentary" ${profile.activityLevel === 'sedentary' ? 'selected' : ''}>デスクワーク・運動少なめ</option>
              <option value="light" ${profile.activityLevel === 'light' ? 'selected' : ''}>軽い運動 (週1〜2回)</option>
              <option value="moderate" ${profile.activityLevel === 'moderate' ? 'selected' : ''}>適度な運動 (週3〜5回トレ)</option>
              <option value="active" ${profile.activityLevel === 'active' ? 'selected' : ''}>激しい運動・肉体労働</option>
            </select>
          </div>
        </div>

        <button type="button" id="btn-save-profile" class="btn btn-primary btn-large btn-glow mt-4">
          💾 基本プロファイルを保存
        </button>
      </div>
    </section>

    <!-- 体重・増減量プロジェクト管理＆過去体重編集 -->
    <section class="card settings-card settings-accordion-card ${isProjectsCollapsed ? 'is-collapsed' : ''}" data-section-id="projects">
      <button type="button" class="settings-accordion-header" aria-expanded="${!isProjectsCollapsed}">
        <div class="accordion-title-wrap">
          <span class="accordion-icon">🎯</span>
          <h3 class="card-title">体重・増減量プロジェクト管理</h3>
        </div>
        <span class="settings-accordion-chevron">▾</span>
      </button>

      <div class="settings-accordion-body">
        <p class="text-muted text-sm mb-3">
          増量・減量をプロジェクトとして期日・開始体重・目標体重で独立管理します。過去の体重履歴も直接修正可能です。
        </p>

        <!-- 進行中のプロジェクト -->
        <div class="active-project-box">
          <div class="active-project-header">
            <div>
              <span class="font-bold text-cyan text-sm">🎯 進行中のプロジェクト</span>
              ${
                activeProj
                  ? `<span class="badge ${activeProj.goalType === 'cut' ? 'badge-primary' : activeProj.goalType === 'bulk' ? 'badge-success' : 'badge-muted'} ml-2">
                      ${activeProj.goalType === 'cut' ? '減量 (Cut)' : activeProj.goalType === 'bulk' ? '増量 (Bulk)' : '維持 (Maintain)'}
                     </span>`
                  : '<span class="badge badge-muted ml-2">なし</span>'
              }
            </div>
            <button type="button" id="btn-start-new-project" class="btn btn-sm btn-outline-cyan">
              ＋ 新規プロジェクトを開始
            </button>
          </div>

          ${
            activeProj
              ? `
            <div class="form-grid mt-3">
              <div class="form-group form-group-full">
                <label for="proj-title">プロジェクト名</label>
                <input type="text" id="proj-title" class="input" value="${escapeHtml(activeProj.title)}">
              </div>

              <div class="form-group">
                <label for="proj-goal">目的</label>
                <select id="proj-goal" class="input">
                  <option value="cut" ${activeProj.goalType === 'cut' ? 'selected' : ''}>減量 (Cut / カロリー制限)</option>
                  <option value="maintain" ${activeProj.goalType === 'maintain' ? 'selected' : ''}>維持 (Maintain / 体型キープ)</option>
                  <option value="bulk" ${activeProj.goalType === 'bulk' ? 'selected' : ''}>増量 (Bulk / 筋肥大・カロリー余剰)</option>
                </select>
              </div>

              <div class="form-group">
                <label for="proj-start-date">開始日</label>
                <input type="date" id="proj-start-date" class="input" value="${activeProj.startDate}">
              </div>

              <div class="form-group">
                <label for="proj-start-weight">開始時体重 (kg)</label>
                <input type="number" id="proj-start-weight" class="input font-mono" step="0.1" value="${activeProj.startWeight}">
              </div>

              <div class="form-group">
                <label for="proj-target-date">目標達成予定日</label>
                <input type="date" id="proj-target-date" class="input" value="${activeProj.targetDate}">
              </div>

              <div class="form-group">
                <label for="proj-target-weight">目標体重 (kg)</label>
                <input type="number" id="proj-target-weight" class="input font-mono" step="0.1" value="${activeProj.targetWeight}">
              </div>
            </div>

            <!-- 目標PFCセクション -->
            <div class="pfc-calc-section mt-3">
              <div class="pfc-calc-header">
                <h4 class="font-bold text-sm">目標カロリー＆PFCバランス</h4>
                <button type="button" id="btn-autocalc-project-pfc" class="btn btn-xs btn-outline-cyan">
                  ⚡ 推奨PFCを自動計算
                </button>
              </div>

              <div class="pfc-inputs-grid">
                <div class="form-group">
                  <label for="proj-calories">目標総カロリー (kcal)</label>
                  <input type="number" id="proj-calories" class="input font-mono" value="${activeProj.targetCalories}">
                </div>
                <div class="form-group">
                  <label for="proj-p">タンパク質 P (g)</label>
                  <input type="number" id="proj-p" class="input font-mono" value="${activeProj.targetP}">
                </div>
                <div class="form-group">
                  <label for="proj-f">脂質 F (g)</label>
                  <input type="number" id="proj-f" class="input font-mono" value="${activeProj.targetF}">
                </div>
                <div class="form-group">
                  <label for="proj-c">炭水化物 C (g)</label>
                  <input type="number" id="proj-c" class="input font-mono" value="${activeProj.targetC}">
                </div>
              </div>
            </div>

            <div class="form-group mt-3 text-left">
              <label for="proj-notes">📝 プロジェクト作戦・メモ（任意）</label>
              <textarea id="proj-notes" class="input input-textarea" rows="2" placeholder="カーボサイクルの計画、有酸素の導入、チートデイの条件など...">${escapeHtml(activeProj.notes || '')}</textarea>
            </div>

            <div class="project-actions-row mt-4">
              <button type="button" id="btn-save-project" class="btn btn-primary btn-glow">
                💾 プロジェクト設定を保存
              </button>
              <button type="button" id="btn-complete-project" class="btn btn-outline-cyan btn-sm">
                🏁 現在のプロジェクトを完了・終了
              </button>
            </div>
          `
              : `
            <div class="empty-hint text-center py-4">
              <p class="text-sm text-muted">現在アクティブなプロジェクトはありません。「＋ 新規プロジェクトを開始」から目標を設定してください。</p>
            </div>
          `
          }
        </div>

        <!-- 過去のプロジェクトアーカイブ一覧 -->
        ${
          pastProjects.length > 0
            ? `
          <div class="past-projects-section mt-4">
            <h4 class="font-bold text-sm text-muted mb-2">📜 過去のプロジェクト一覧（アーカイブ）</h4>
            <div class="past-projects-list">
              ${pastProjects
                .map(
                  (p) => `
                <div class="past-project-card">
                  <div class="past-project-header">
                    <span class="font-bold">${escapeHtml(p.title)}</span>
                    <span class="badge ${p.goalType === 'cut' ? 'badge-primary' : 'badge-success'}">${p.goalType === 'cut' ? '減量' : p.goalType === 'bulk' ? '増量' : '維持'}</span>
                  </div>
                  <div class="past-project-details text-xs text-muted mt-1">
                    <span>期間: ${p.startDate} 〜 ${p.targetDate || '未定'}</span>
                    <span class="ml-2">体重: <strong>${p.startWeight}kg</strong> ➔ 目標 <strong>${p.targetWeight}kg</strong></span>
                  </div>
                  ${p.notes ? `<p class="text-xs text-faint mt-1">${escapeHtml(p.notes)}</p>` : ''}
                </div>
              `,
                )
                .join('')}
            </div>
          </div>
        `
            : ''
        }

        <!-- 過去の体重記録・編集テーブル -->
        <div class="weight-logs-editor-section mt-4">
          <div class="flex-between items-center mb-2">
            <div>
              <h4 class="font-bold text-sm text-cyan">⚖️ 過去の体重記録・編集</h4>
              <p class="text-xs text-muted">誤入力の修正や測り忘れ日の追加・削除が可能です</p>
            </div>
          </div>

          <!-- 新規体重追加フォーム -->
          <div class="add-weight-inline-box">
            <div class="add-weight-inputs">
              <input type="date" id="input-add-weight-date" class="input input-sm" value="${today}">
              <div class="input-with-unit-inline">
                <input type="number" id="input-add-weight-val" class="input input-sm font-mono text-center" step="0.1" placeholder="例: 68.2">
                <span class="unit">kg</span>
              </div>
              <button type="button" id="btn-add-weight-log" class="btn btn-sm btn-outline-cyan">
                ＋ 追加
              </button>
            </div>
          </div>

          <!-- 体重履歴テーブル -->
          <div class="weight-logs-table-wrap mt-3">
            <table class="sets-table weight-logs-table">
              <thead>
                <tr>
                  <th>記録日</th>
                  <th>体重 (kg)</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${
                  weightLogs.length === 0
                    ? `<tr><td colspan="3" class="text-center text-muted text-sm py-3">体重記録はありません</td></tr>`
                    : weightLogs
                        .slice(0, 20)
                        .map(
                          (l) => `
                  <tr>
                    <td>
                      <input type="date" class="input input-table weight-log-date font-mono" data-log-id="${l.id}" value="${l.date}">
                    </td>
                    <td>
                      <div class="input-with-unit-inline">
                        <input type="number" step="0.1" class="input input-table weight-log-weight font-mono text-center" data-log-id="${l.id}" value="${l.weight}">
                        <span class="unit">kg</span>
                      </div>
                    </td>
                    <td>
                      <div class="table-actions">
                        <button type="button" class="btn btn-xs btn-outline-cyan btn-save-weight-log" data-log-id="${l.id}" title="保存">
                          💾 保存
                        </button>
                        <button type="button" class="btn-icon btn-delete-weight-log" data-log-id="${l.id}" title="削除">
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                `,
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- 新規プロジェクト開始 確認モーダル -->
    <div id="modal-confirm-new-project" class="timer-modal" role="dialog" aria-modal="true" style="display: none;">
      <div class="timer-modal-dialog">
        <button type="button" id="modal-new-project-close" class="timer-modal-close">✕</button>
        <div class="modal-dialog-icon">⚠️</div>
        <h3 class="card-title justify-center mt-2">新しいプロジェクトを開始しますか？</h3>
        <div class="mt-3 text-center">
          <p class="text-sm text-muted leading-relaxed">
            現在「<strong id="modal-confirm-active-title" class="text-cyan">進行中のプロジェクト</strong>」が存在します。<br>
            新しいプロジェクトを開始すると、現在のプロジェクトは<strong>完了・アーカイブ</strong>され、過去の履歴として保存されます。
          </p>
        </div>
        <div class="modal-actions-stacked mt-4">
          <button type="button" id="btn-modal-confirm-new-project" class="btn btn-primary btn-large btn-glow">
            ✅ 現在のPJを完了して新規開始
          </button>
          <button type="button" id="btn-modal-cancel-new-project" class="btn btn-ghost mt-2">
            キャンセル（現在のPJを継続）
          </button>
        </div>
      </div>
    </div>

    <!-- 種目マスター＆種目別休憩タイマー管理 -->
    <section class="card settings-card settings-accordion-card ${isExercisesCollapsed ? 'is-collapsed' : ''}" data-section-id="exercises">
      <button type="button" class="settings-accordion-header" aria-expanded="${!isExercisesCollapsed}">
        <div class="accordion-title-wrap">
          <span class="accordion-icon">🏋️</span>
          <h3 class="card-title">種目マスター＆種目別休憩タイマー</h3>
        </div>
        <span class="settings-accordion-chevron">▾</span>
      </button>

      <div class="settings-accordion-body">
        <p class="text-muted text-sm mb-3">
          種目ごとにUP / MAIN / HEAVY / DOWNの休憩時間を個別に秒数で設定できます。ワークアウトのセット記録時に自動適用されます。
        </p>

        <!-- 一括設定＆標準タイマー設定 -->
        <div class="batch-rest-box">
          <div class="batch-rest-header">
            <div>
              <span class="font-bold text-sm text-cyan">⚡ セット種別ごとの標準休憩タイマー（一括反映）</span>
              <p class="text-xs text-muted mt-0.5">全種目のUP/MAIN/HEAVY/DOWN休憩秒数を一括で上書き・統一します</p>
            </div>
            <button type="button" id="btn-batch-apply-rest" class="btn btn-sm btn-outline-cyan">
              全種目に一括反映
            </button>
          </div>
          <div class="batch-rest-inputs-grid mt-2">
            <div class="batch-rest-item">
              <label for="batch-rest-up"><span class="badge badge-set-type badge-up">UP</span></label>
              <div class="input-with-unit-inline">
                <input type="number" id="batch-rest-up" class="input input-sm font-mono" value="${profile.defaultRestSeconds?.UP ?? 60}" min="5" step="5">
                <span class="unit">秒</span>
              </div>
            </div>
            <div class="batch-rest-item">
              <label for="batch-rest-main"><span class="badge badge-set-type badge-main">MAIN</span></label>
              <div class="input-with-unit-inline">
                <input type="number" id="batch-rest-main" class="input input-sm font-mono" value="${profile.defaultRestSeconds?.MAIN ?? 120}" min="5" step="5">
                <span class="unit">秒</span>
              </div>
            </div>
            <div class="batch-rest-item">
              <label for="batch-rest-heavy"><span class="badge badge-set-type badge-heavy">HEAVY</span></label>
              <div class="input-with-unit-inline">
                <input type="number" id="batch-rest-heavy" class="input input-sm font-mono" value="${profile.defaultRestSeconds?.HEAVY ?? 180}" min="5" step="5">
                <span class="unit">秒</span>
              </div>
            </div>
            <div class="batch-rest-item">
              <label for="batch-rest-down"><span class="badge badge-set-type badge-down">DOWN</span></label>
              <div class="input-with-unit-inline">
                <input type="number" id="batch-rest-down" class="input input-sm font-mono" value="${profile.defaultRestSeconds?.DOWN ?? 60}" min="5" step="5">
                <span class="unit">秒</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 種目一覧 -->
        <div class="exercise-manager-list">
          ${exerciseTemplates
            .map((ex) => {
              const restUp = ex.restSeconds?.UP ?? profile.defaultRestSeconds?.UP ?? 60;
              const restMain = ex.restSeconds?.MAIN ?? ex.defaultRestSeconds ?? profile.defaultRestSeconds?.MAIN ?? 120;
              const restHeavy = ex.restSeconds?.HEAVY ?? profile.defaultRestSeconds?.HEAVY ?? 180;
              const restDown = ex.restSeconds?.DOWN ?? profile.defaultRestSeconds?.DOWN ?? 60;
              return `
            <div class="exercise-manager-item" data-exercise-id="${ex.id}">
              <div class="exercise-item-header">
                <div class="exercise-info">
                  <span class="badge badge-category badge-cat-${ex.category || 'その他'}">${escapeHtml(ex.category || 'その他')}</span>
                  <span class="font-bold ml-2">${escapeHtml(ex.name)}</span>
                </div>
                <button type="button" class="btn-icon btn-delete-exercise-template" data-exercise-id="${ex.id}" title="種目削除">
                  🗑
                </button>
              </div>
              <div class="exercise-set-rest-row mt-2">
                <div class="rest-type-input-group">
                  <span class="rest-type-badge badge-up">UP</span>
                  <input type="number" class="input input-sm font-mono input-exercise-set-rest" data-exercise-id="${ex.id}" data-set-type="UP" value="${restUp}" min="5" step="5">
                  <span class="unit">秒</span>
                </div>
                <div class="rest-type-input-group">
                  <span class="rest-type-badge badge-main">MAIN</span>
                  <input type="number" class="input input-sm font-mono input-exercise-set-rest" data-exercise-id="${ex.id}" data-set-type="MAIN" value="${restMain}" min="5" step="5">
                  <span class="unit">秒</span>
                </div>
                <div class="rest-type-input-group">
                  <span class="rest-type-badge badge-heavy">HEAVY</span>
                  <input type="number" class="input input-sm font-mono input-exercise-set-rest" data-exercise-id="${ex.id}" data-set-type="HEAVY" value="${restHeavy}" min="5" step="5">
                  <span class="unit">秒</span>
                </div>
                <div class="rest-type-input-group">
                  <span class="rest-type-badge badge-down">DOWN</span>
                  <input type="number" class="input input-sm font-mono input-exercise-set-rest" data-exercise-id="${ex.id}" data-set-type="DOWN" value="${restDown}" min="5" step="5">
                  <span class="unit">秒</span>
                </div>
              </div>
            </div>
          `;
            })
            .join('')}
        </div>

        <div class="add-exercise-form mt-4">
          <h4 class="font-bold text-sm text-muted">新規種目の追加</h4>
          <div class="add-exercise-grid mt-2">
            <input type="text" id="input-new-exercise-name" class="input" placeholder="例: インクラインダンベルフライ">
            <select id="input-new-exercise-category" class="input" style="max-width: 95px;">
              <option value="胸">胸</option>
              <option value="背中">背中</option>
              <option value="脚">脚</option>
              <option value="肩">肩</option>
              <option value="腕">腕</option>
              <option value="腹">腹</option>
              <option value="その他" selected>その他</option>
            </select>
            <div class="input-with-unit-inline">
              <input type="number" id="input-new-exercise-rest" class="input font-mono" style="max-width: 85px;" value="${profile.defaultRestSeconds?.MAIN ?? 120}" min="10" step="5">
              <span class="text-muted text-sm">秒</span>
            </div>
            <button type="button" id="btn-add-exercise-template" class="btn btn-outline-cyan">追加</button>
          </div>
        </div>
      </div>
    </section>

    <!-- マイルーティン設定 -->
    <section class="card settings-card settings-accordion-card ${isRoutinesCollapsed ? 'is-collapsed' : ''}" data-section-id="routines">
      <button type="button" class="settings-accordion-header" aria-expanded="${!isRoutinesCollapsed}">
        <div class="accordion-title-wrap">
          <span class="accordion-icon">🍽️</span>
          <h3 class="card-title">マイルーティン（ワンタップ食事）の管理</h3>
        </div>
        <span class="settings-accordion-chevron">▾</span>
      </button>

      <div class="settings-accordion-body">
        <div class="routine-manager-list">
          ${routines
            .map(
              (r) => `
            <div class="routine-manager-item">
              <div>
                <span class="font-bold">${escapeHtml(r.name)}</span>
                <span class="text-sm font-mono text-muted ml-2">P:${r.p}g / F:${r.f}g / C:${r.c}g</span>
              </div>
              <button type="button" class="btn-icon btn-delete-routine" data-routine-id="${r.id}" title="削除">
                🗑
              </button>
            </div>
          `,
            )
            .join('')}
        </div>

        <div class="add-routine-form mt-4">
          <h4 class="font-bold text-sm text-muted">新規ルーティンの追加</h4>
          <div class="add-routine-grid">
            <input type="text" id="routine-new-name" class="input" placeholder="例: プロテインバー">
            <input type="number" id="routine-new-p" class="input" placeholder="P (g)">
            <input type="number" id="routine-new-f" class="input" placeholder="F (g)">
            <input type="number" id="routine-new-c" class="input" placeholder="C (g)">
            <button type="button" id="btn-add-routine" class="btn btn-outline-cyan">追加</button>
          </div>
        </div>
      </div>
    </section>

    <!-- サプリメント管理 -->
    <section class="card settings-card settings-accordion-card ${isSupplementsCollapsed ? 'is-collapsed' : ''}" data-section-id="supplements">
      <button type="button" class="settings-accordion-header" aria-expanded="${!isSupplementsCollapsed}">
        <div class="accordion-title-wrap">
          <span class="accordion-icon">💊</span>
          <h3 class="card-title">サプリメントチェックリスト管理</h3>
        </div>
        <span class="settings-accordion-chevron">▾</span>
      </button>

      <div class="settings-accordion-body">
        <div class="supp-manager-chips">
          ${profile.supplements
            .map(
              (s) => `
            <span class="chip chip-with-delete">
              ${escapeHtml(s)}
              <button type="button" class="chip-delete-btn btn-delete-supplement" data-supp-name="${escapeHtml(s)}">×</button>
            </span>
          `,
            )
            .join('')}
        </div>

        <div class="add-supp-row mt-3">
          <input type="text" id="input-new-supplement" class="input" placeholder="例: アシュワガンダ">
          <button type="button" id="btn-add-supplement" class="btn btn-outline-cyan">サプリ追加</button>
        </div>
      </div>
    </section>

    <!-- データ管理＆バックアップ -->
    <section class="card settings-card settings-accordion-card ${isBackupCollapsed ? 'is-collapsed' : ''}" data-section-id="backup">
      <button type="button" class="settings-accordion-header" aria-expanded="${!isBackupCollapsed}">
        <div class="accordion-title-wrap">
          <span class="accordion-icon">💾</span>
          <h3 class="card-title">データ管理＆バックアップ</h3>
        </div>
        <span class="settings-accordion-chevron">▾</span>
      </button>

      <div class="settings-accordion-body">
        <p class="text-muted text-sm">
          データはブラウザの localStorage に完全保存されています。
          機種変更時や端末間での引き継ぎには JSON エクスポート / インポートをご利用ください。
        </p>

        <div class="backup-actions-grid mt-3">
          <button type="button" id="btn-export-json" class="btn btn-outline-cyan">
            📥 JSON エクスポート (バックアップ)
          </button>
          <button type="button" id="btn-import-json" class="btn btn-outline-cyan">
            📤 JSON インポート (復元)
          </button>
          <input type="file" id="input-file-import" accept=".json" style="display: none;">
        </div>

        <div class="danger-zone mt-6">
          <h4 class="text-rose text-sm font-bold">危険ゾーン</h4>
          <button type="button" id="btn-reset-all" class="btn btn-outline-danger mt-2">
            全データを初期化
          </button>
        </div>
      </div>
    </section>
  `;
}

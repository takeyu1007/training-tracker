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

/** @type {any} */
let pendingProfilePayload = null;
/** @type {any} */
let pendingSafetyCheck = null;

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
      if (pendingProfilePayload && pendingSafetyCheck) {
        const adjustedPayload = {
          ...pendingProfilePayload,
          targetDate: pendingSafetyCheck.recommendedTargetDate,
        };
        storeInstance.updateProfile(adjustedPayload);
        hideSafetyModal();
        showToast('推奨安全ペース（期日を延長）に修正して保存しました！', 'success');
        renderSettings();
      }
      return;
    }

    // リスクを理解してこのまま設定（ユーザー要望: 強制保存可能）
    if (target.closest('#btn-safety-proceed-anyway')) {
      if (pendingProfilePayload) {
        storeInstance.updateProfile(pendingProfilePayload);
        hideSafetyModal();
        showToast('リスクを理解した上で設定を保存しました', 'warning');
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
 */
function showSafetyModal(check, payload) {
  pendingProfilePayload = payload;
  pendingSafetyCheck = check;
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
  pendingProfilePayload = null;
  pendingSafetyCheck = null;
}

function bindEvents() {
  const container = document.getElementById('tab-settings');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // プロファイル保存
    if (target.closest('#btn-save-profile')) {
      handleSaveProfile();
      return;
    }

    // 目標PFCの自動再計算
    if (target.closest('#btn-autocalc-pfc')) {
      handleAutoCalcPFC();
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
      if (storeInstance.addExerciseTemplate(name, rest, category)) {
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

  // 種目別休憩時間のインライン変更
  container.addEventListener('change', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.classList.contains('input-exercise-template-rest')) {
      const exId = target.getAttribute('data-exercise-id');
      const val = Number(/** @type {HTMLInputElement} */ (target).value) || 120;
      if (exId) {
        storeInstance.updateExerciseTemplate(exId, { defaultRestSeconds: val });
        showToast('種目の休憩時間を更新しました', 'success');
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
  const name = /** @type {HTMLInputElement} */ (document.getElementById('profile-name'))?.value;
  const height = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-height'))?.value);
  const startWeight = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-start-weight'))?.value);
  const currentWeight = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-weight'))?.value);
  const targetWeight = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-target-weight'))?.value);
  const targetDate = /** @type {HTMLInputElement} */ (document.getElementById('profile-target-date'))?.value || '';
  const age = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-age'))?.value);
  const gender = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('profile-gender'))?.value);
  const goalType = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('profile-goal'))?.value);
  const activityLevel = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('profile-activity'))?.value);

  const targetCalories = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-calories'))?.value);
  const targetP = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-p'))?.value);
  const targetF = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-f'))?.value);
  const targetC = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-c'))?.value);

  const restUp = Number(/** @type {HTMLInputElement} */ (document.getElementById('rest-up'))?.value) || 60;
  const restMain = Number(/** @type {HTMLInputElement} */ (document.getElementById('rest-main'))?.value) || 120;
  const restHeavy = Number(/** @type {HTMLInputElement} */ (document.getElementById('rest-heavy'))?.value) || 180;
  const restDown = Number(/** @type {HTMLInputElement} */ (document.getElementById('rest-down'))?.value) || 60;

  const payload = {
    name,
    height,
    startWeight: startWeight || currentWeight,
    currentWeight,
    targetWeight,
    targetDate,
    age,
    gender,
    goalType,
    activityLevel,
    targetCalories,
    targetP,
    targetF,
    targetC,
    defaultRestSeconds: {
      UP: restUp,
      MAIN: restMain,
      HEAVY: restHeavy,
      DOWN: restDown,
    },
  };

  // ペースの安全性チェック（無理な減量・増量時の警告ポップアップ）
  if (targetDate) {
    const safetyCheck = checkPaceSafety(currentWeight, targetWeight, targetDate);
    if (safetyCheck.isUnsafe) {
      showSafetyModal(safetyCheck, payload);
      return;
    }
  }

  storeInstance.updateProfile(payload);
  showToast('プロファイルを更新しました！', 'success');
  renderSettings();
}

function handleAutoCalcPFC() {
  const height = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-height'))?.value) || 172;
  const currentWeight = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-weight'))?.value) || 68;
  const age = Number(/** @type {HTMLInputElement} */ (document.getElementById('profile-age'))?.value) || 28;
  const gender = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('profile-gender'))?.value) || 'male';
  const goalType = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('profile-goal'))?.value) || 'cut';
  const activityLevel = /** @type {any} */ (/** @type {HTMLSelectElement} */ (document.getElementById('profile-activity'))?.value) || 'moderate';

  const result = calculateTargetPFC({ height, currentWeight, age, gender, goalType, activityLevel });

  const calInput = /** @type {HTMLInputElement | null} */ (document.getElementById('profile-calories'));
  const pInput = /** @type {HTMLInputElement | null} */ (document.getElementById('profile-p'));
  const fInput = /** @type {HTMLInputElement | null} */ (document.getElementById('profile-f'));
  const cInput = /** @type {HTMLInputElement | null} */ (document.getElementById('profile-c'));

  if (calInput) calInput.value = String(result.targetCalories);
  if (pInput) pInput.value = String(result.targetP);
  if (fInput) fInput.value = String(result.targetF);
  if (cInput) cInput.value = String(result.targetC);

  showToast('目標PFCを推奨値で自動計算しました！「設定を保存」で適用してください', 'info');
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
  const routines = state.routines;
  const exerciseTemplates = state.exerciseTemplates;

  container.innerHTML = `
    <!-- プロファイル設定 -->
    <section class="card settings-card">
      <h3 class="card-title">👤 ユーザープロファイル＆目標設定</h3>

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
        <div class="form-group">
          <label for="profile-start-weight">開始時体重 (kg)</label>
          <input type="number" id="profile-start-weight" class="input" step="0.1" value="${profile.startWeight !== undefined ? profile.startWeight : profile.currentWeight}">
        </div>
        <div class="form-group">
          <label for="profile-weight">現在体重 (kg)</label>
          <input type="number" id="profile-weight" class="input" step="0.1" value="${profile.currentWeight}">
        </div>
        <div class="form-group">
          <label for="profile-target-weight">目標体重 (kg)</label>
          <input type="number" id="profile-target-weight" class="input" step="0.1" value="${profile.targetWeight}">
        </div>
        <div class="form-group">
          <label for="profile-target-date">目標達成予定日</label>
          <input type="date" id="profile-target-date" class="input" value="${profile.targetDate || ''}">
        </div>
        <div class="form-group">
          <label for="profile-goal">目的</label>
          <select id="profile-goal" class="input">
            <option value="cut" ${profile.goalType === 'cut' ? 'selected' : ''}>減量 (Cut / カロリー制限)</option>
            <option value="maintain" ${profile.goalType === 'maintain' ? 'selected' : ''}>維持 (Maintain / 体型キープ)</option>
            <option value="bulk" ${profile.goalType === 'bulk' ? 'selected' : ''}>増量 (Bulk / 筋肥大・カロリー余剰)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="profile-activity">活動レベル</label>
          <select id="profile-activity" class="input">
            <option value="sedentary" ${profile.activityLevel === 'sedentary' ? 'selected' : ''}>デスクワーク・運動少なめ</option>
            <option value="light" ${profile.activityLevel === 'light' ? 'selected' : ''}>軽い運動 (週1〜2回)</option>
            <option value="moderate" ${profile.activityLevel === 'moderate' ? 'selected' : ''}>適度な運動 (週3〜5回トレ)</option>
            <option value="active" ${profile.activityLevel === 'active' ? 'selected' : ''}>激しい運動・肉体労働</option>
          </select>
        </div>
      </div>

      <!-- 目標PFCセクション -->
      <div class="pfc-calc-section">
        <div class="pfc-calc-header">
          <h4 class="font-bold">目標カロリー＆PFCバランス</h4>
          <button type="button" id="btn-autocalc-pfc" class="btn btn-sm btn-outline-cyan">
            ⚡ 自動計算して反映
          </button>
        </div>

        <div class="pfc-inputs-grid">
          <div class="form-group">
            <label for="profile-calories">目標総カロリー (kcal)</label>
            <input type="number" id="profile-calories" class="input font-mono" value="${profile.targetCalories}">
          </div>
          <div class="form-group">
            <label for="profile-p">タンパク質 P (g)</label>
            <input type="number" id="profile-p" class="input font-mono" value="${profile.targetP}">
          </div>
          <div class="form-group">
            <label for="profile-f">脂質 F (g)</label>
            <input type="number" id="profile-f" class="input font-mono" value="${profile.targetF}">
          </div>
          <div class="form-group">
            <label for="profile-c">炭水化物 C (g)</label>
            <input type="number" id="profile-c" class="input font-mono" value="${profile.targetC}">
          </div>
        </div>
      </div>

      <!-- セット種別ごとの標準休憩タイマー設定 -->
      <div class="rest-timer-settings">
        <h4 class="font-bold">セット種別ごとの標準休憩タイマー (秒)</h4>
        <div class="rest-inputs-grid">
          <div class="form-group">
            <label for="rest-up">UPセット (秒)</label>
            <input type="number" id="rest-up" class="input font-mono" value="${profile.defaultRestSeconds.UP}">
          </div>
          <div class="form-group">
            <label for="rest-main">MAINセット (秒)</label>
            <input type="number" id="rest-main" class="input font-mono" value="${profile.defaultRestSeconds.MAIN}">
          </div>
          <div class="form-group">
            <label for="rest-heavy">HEAVYセット (秒)</label>
            <input type="number" id="rest-heavy" class="input font-mono" value="${profile.defaultRestSeconds.HEAVY}">
          </div>
          <div class="form-group">
            <label for="rest-down">DOWNセット (秒)</label>
            <input type="number" id="rest-down" class="input font-mono" value="${profile.defaultRestSeconds.DOWN}">
          </div>
        </div>
      </div>

      <button type="button" id="btn-save-profile" class="btn btn-primary btn-large btn-glow mt-4">
        💾 プロファイル設定を保存
      </button>
    </section>

    <!-- 種目マスター＆種目別休憩タイマー管理 -->
    <section class="card settings-card">
      <h3 class="card-title">🏋️ 種目マスター＆種目別休憩タイマー (${exerciseTemplates.length})</h3>
      <p class="text-muted text-sm mb-3">
        種目ごとに部位カテゴリおよび個別の休憩時間を秒数で設定できます。ワークアウト中に自動適用されます。
      </p>

      <div class="exercise-manager-list">
        ${exerciseTemplates
          .map(
            (ex) => `
          <div class="exercise-manager-item">
            <div class="exercise-info">
              <span class="badge badge-category badge-cat-${ex.category || 'その他'}">${escapeHtml(ex.category || 'その他')}</span>
              <span class="font-bold ml-2">${escapeHtml(ex.name)}</span>
            </div>
            <div class="exercise-rest-control">
              <span class="text-sm text-muted">休憩:</span>
              <input type="number" class="input input-sm input-exercise-template-rest font-mono" style="max-width: 80px;" data-exercise-id="${ex.id}" value="${ex.defaultRestSeconds}" min="10" step="5">
              <span class="text-sm text-muted">秒</span>
              <button type="button" class="btn-icon btn-delete-exercise-template" data-exercise-id="${ex.id}" title="種目削除">
                🗑
              </button>
            </div>
          </div>
        `,
          )
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
            <input type="number" id="input-new-exercise-rest" class="input font-mono" style="max-width: 85px;" value="120" min="10" step="5">
            <span class="text-muted text-sm">秒</span>
          </div>
          <button type="button" id="btn-add-exercise-template" class="btn btn-outline-cyan">追加</button>
        </div>
      </div>
    </section>

    <!-- マイルーティン設定 -->
    <section class="card settings-card">
      <h3 class="card-title">🍽️ マイルーティン（ワンタップ食事）の管理</h3>
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
    </section>

    <!-- サプリメント管理 -->
    <section class="card settings-card">
      <h3 class="card-title">💊 サプリメントチェックリスト管理</h3>
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
    </section>

    <!-- データ管理＆バックアップ -->
    <section class="card settings-card">
      <h3 class="card-title">💾 データ管理＆バックアップ</h3>
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
    </section>
  `;
}

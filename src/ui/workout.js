// @ts-check
/**
 * ワークアウト記録 UI モジュール（予実管理＆種目別休憩タイマー対応）
 */

import {
  calculate1RM,
  calculateSessionVolume,
  calculatePlannedVolume,
  suggestProgressiveOverload,
} from '../calc.js';
import { escapeHtml, formatDate, formatTime } from '../format.js';
import { playSuccessChime } from '../sound.js';
import { startTimer } from './timer.js';
import { showToast } from './toast.js';

/** @type {import('../store.js').Store} */
let storeInstance;
/** @type {string | null} */
let activeWorkoutId = null;

/**
 * @param {import('../store.js').Store} store
 */
export function initWorkoutUI(store) {
  storeInstance = store;
  bindEvents();
  renderWorkout();
}

function bindEvents() {
  const container = document.getElementById('tab-workout');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // ワークアウト開始
    if (target.closest('#btn-start-workout')) {
      const today = new Date().toISOString().slice(0, 10);
      const session = storeInstance.addWorkout({
        date: today,
        sleepCategory: '6-7h',
        preWorkoutCarb: true,
        conditionScore: 4,
      });
      activeWorkoutId = session.id;
      showToast('ワークアウトを開始しました！集中していきましょう 💪', 'success');
      renderWorkout();
      return;
    }

    // ワークアウト完了
    if (target.closest('#btn-finish-workout')) {
      if (!activeWorkoutId) return;
      const workout = storeInstance.getState().workouts.find((w) => w.id === activeWorkoutId);
      if (!workout) return;

      const vol = calculateSessionVolume(workout.sets);
      storeInstance.finishWorkout(activeWorkoutId);
      showToast(`🎉 ワークアウト完了！ 実績ボリューム: ${vol.toLocaleString()}kg お疲れ様でした！`, 'success', 5000);
      renderWorkout();
      return;
    }

    // 1セット即時記録
    if (target.closest('#btn-add-single-set')) {
      handleAddSingleSet();
      return;
    }

    // 予定セット一括作成（例: 70kg*10回*3セット）
    if (target.closest('#btn-add-batch-sets')) {
      handleAddBatchSets();
      return;
    }

    // 新規種目の追加モーダル開閉
    if (target.closest('#btn-open-add-exercise')) {
      const modal = document.getElementById('modal-add-exercise');
      if (modal) modal.classList.add('is-active');
      return;
    }

    if (target.closest('#btn-close-add-exercise')) {
      const modal = document.getElementById('modal-add-exercise');
      if (modal) modal.classList.remove('is-active');
      return;
    }

    if (target.closest('#btn-save-new-exercise')) {
      handleSaveNewExercise();
      return;
    }

    // 予定セットの「完了」ボタンタップ
    const completeSetBtn = target.closest('.btn-complete-set');
    if (completeSetBtn && activeWorkoutId) {
      const setId = completeSetBtn.getAttribute('data-set-id');
      if (setId) {
        handleCompleteSet(setId);
      }
      return;
    }

    // 完了セットの「未完了に戻す」ボタンタップ
    const undoSetBtn = target.closest('.btn-undo-set');
    if (undoSetBtn && activeWorkoutId) {
      const setId = undoSetBtn.getAttribute('data-set-id');
      if (setId) {
        storeInstance.uncompleteSet(activeWorkoutId, setId);
        renderWorkout();
      }
      return;
    }

    // セット削除
    const deleteSetBtn = target.closest('.btn-delete-set');
    if (deleteSetBtn && activeWorkoutId) {
      const setId = deleteSetBtn.getAttribute('data-set-id');
      if (setId) {
        storeInstance.deleteSetFromWorkout(activeWorkoutId, setId);
        renderWorkout();
      }
      return;
    }

    // 種目クイックチップ
    const exChip = target.closest('.exercise-chip');
    if (exChip) {
      const name = exChip.getAttribute('data-name');
      const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('input-exercise-name'));
      if (select && name) {
        select.value = name;
        handleExerciseChange(name);
      }
      return;
    }

    // 睡眠チップ
    const sleepChip = target.closest('.sleep-chip');
    if (sleepChip && activeWorkoutId) {
      const cat = /** @type {any} */ (sleepChip.getAttribute('data-sleep'));
      if (cat) {
        storeInstance.updateWorkout(activeWorkoutId, { sleepCategory: cat });
        renderWorkout();
      }
      return;
    }

    // 体調スコア
    const condScoreBtn = target.closest('.condition-score-btn');
    if (condScoreBtn && activeWorkoutId) {
      const score = Number(condScoreBtn.getAttribute('data-score')) || 4;
      storeInstance.updateWorkout(activeWorkoutId, { conditionScore: score });
      renderWorkout();
      return;
    }

    // 糖質補給トグル
    const carbToggle = target.closest('#btn-toggle-carb');
    if (carbToggle && activeWorkoutId) {
      const workout = storeInstance.getState().workouts.find((w) => w.id === activeWorkoutId);
      if (workout) {
        storeInstance.updateWorkout(activeWorkoutId, { preWorkoutCarb: !workout.preWorkoutCarb });
        renderWorkout();
      }
      return;
    }

    // 重量クイック調整
    const weightAdj = target.closest('.weight-adjust-btn');
    if (weightAdj) {
      const delta = Number(weightAdj.getAttribute('data-delta')) || 0;
      const weightInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-weight'));
      if (weightInput) {
        const cur = Number(weightInput.value) || 0;
        weightInput.value = String(Math.max(0, Math.round((cur + delta) * 10) / 10));
        update1RMPreview();
      }
      return;
    }

    // 回数クイック調整
    const repsAdj = target.closest('.reps-adjust-btn');
    if (repsAdj) {
      const delta = Number(repsAdj.getAttribute('data-delta')) || 0;
      const repsInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-reps'));
      if (repsInput) {
        const cur = Number(repsInput.value) || 0;
        repsInput.value = String(Math.max(1, cur + delta));
        update1RMPreview();
      }
      return;
    }

    // 種目の既定休憩時間保存
    if (target.closest('#btn-save-exercise-rest')) {
      handleSaveExerciseRest();
      return;
    }
  });

  // 変更イベント
  container.addEventListener('change', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.id === 'input-exercise-name') {
      const sel = /** @type {HTMLSelectElement} */ (target);
      handleExerciseChange(sel.value);
    }
    if (target.id === 'input-body-weight' && activeWorkoutId) {
      const bw = Number(/** @type {HTMLInputElement} */ (target).value);
      storeInstance.updateWorkout(activeWorkoutId, { bodyWeight: bw > 0 ? bw : null });
    }
    // セット数変更で一括追加ボタンの文言更新
    if (target.id === 'input-set-count') {
      updateBatchButtonText();
    }
  });

  // リアルタイム入力
  container.addEventListener('input', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.id === 'input-weight' || target.id === 'input-reps') {
      update1RMPreview();
    }
    if (target.id === 'input-set-count') {
      updateBatchButtonText();
    }
  });
}

function updateBatchButtonText() {
  const countInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-set-count'));
  const btn = document.getElementById('btn-add-batch-sets');
  if (btn) {
    const c = Math.max(1, Math.min(20, Number(countInput?.value) || 3));
    btn.textContent = `⚡ ${c}セットを一括予約 (計画)`;
  }
}

/** @param {string} exerciseName */
function handleExerciseChange(exerciseName) {
  if (!exerciseName) return;
  const prev = storeInstance.getPreviousSetValues(exerciseName);
  const weightInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-weight'));
  const repsInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-reps'));
  const restInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-exercise-rest'));
  const hintEl = document.getElementById('exercise-prev-hint');
  const overloadEl = document.getElementById('exercise-overload-suggestion');

  // 種目マスターの休憩時間をセット
  const template = storeInstance.getExerciseTemplate(exerciseName);
  if (restInput && template) {
    restInput.value = String(template.defaultRestSeconds);
  }

  if (prev && weightInput && repsInput) {
    weightInput.value = String(prev.weight);
    repsInput.value = String(prev.reps);
    if (hintEl) {
      hintEl.innerHTML = `💡 前回記録: <strong>${prev.weight}kg × ${prev.reps}回</strong> (推定1RM: ${prev.estimated1rm}kg)`;
      hintEl.style.display = 'block';
    }
  } else {
    if (hintEl) {
      hintEl.innerHTML = `💡 この種目の過去記録はありません。新規重量を入力してください。`;
      hintEl.style.display = 'block';
    }
  }

  // 漸進性過負荷（オーバーロード）サジェスト
  const overload = suggestProgressiveOverload(exerciseName, storeInstance.getState().workouts);
  if (overloadEl) {
    if (overload.shouldIncrease) {
      overloadEl.innerHTML = `🔥 <strong>過負荷サジェスト:</strong> ${escapeHtml(overload.message)}`;
      overloadEl.style.display = 'block';
    } else {
      overloadEl.style.display = 'none';
    }
  }

  update1RMPreview();
}

function update1RMPreview() {
  const weightInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-weight'));
  const repsInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-reps'));
  const badge = document.getElementById('preview-1rm-badge');
  if (!badge || !weightInput || !repsInput) return;

  const w = Number(weightInput.value) || 0;
  const r = Number(repsInput.value) || 0;
  if (w > 0 && r > 0) {
    const est = calculate1RM(w, r);
    badge.innerHTML = `推定1RM: <strong>${est} kg</strong>`;
    badge.classList.add('is-visible');
  } else {
    badge.innerHTML = `推定1RM: <strong>0 kg</strong>`;
    badge.classList.remove('is-visible');
  }
}

/** 新規種目の保存 */
function handleSaveNewExercise() {
  const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('new-exercise-name'));
  const restInput = /** @type {HTMLInputElement | null} */ (document.getElementById('new-exercise-rest'));
  const name = nameInput?.value.trim() || '';
  const rest = Number(restInput?.value) || 120;

  if (!name) {
    showToast('種目名を入力してください', 'warning');
    return;
  }

  const added = storeInstance.addExerciseTemplate(name, rest);
  if (!added) {
    showToast('その種目名は既に登録されています', 'warning');
    return;
  }

  showToast(`種目「${name}」を追加しました！`, 'success');
  const modal = document.getElementById('modal-add-exercise');
  if (modal) modal.classList.remove('is-active');

  renderWorkout();

  // 追加した種目を自動選択
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('input-exercise-name'));
  if (select) {
    select.value = name;
    handleExerciseChange(name);
  }
}

/** 種目の既定休憩時間を保存 */
function handleSaveExerciseRest() {
  const exSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('input-exercise-name'));
  const restInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-exercise-rest'));
  const name = exSelect?.value.trim() || '';
  const rest = Number(restInput?.value) || 120;

  const template = storeInstance.getExerciseTemplate(name);
  if (template) {
    storeInstance.updateExerciseTemplate(template.id, { defaultRestSeconds: rest });
    showToast(`「${template.name}」の既定休憩時間を ${rest}秒 に更新しました`, 'success');
  } else if (name) {
    storeInstance.addExerciseTemplate(name, rest);
    showToast(`「${name}」を登録し休憩時間を ${rest}秒 に設定しました`, 'success');
  }
}

/** 1セットを即時完了で記録 */
function handleAddSingleSet() {
  if (!activeWorkoutId) return;

  const exSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('input-exercise-name'));
  const weightInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-weight'));
  const repsInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-reps'));
  const restInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-exercise-rest'));
  const setTypeSelect = /** @type {HTMLInputElement | null} */ (
    document.querySelector('input[name="set-type"]:checked')
  );

  const exerciseName = exSelect?.value.trim() || '';
  const weight = Number(weightInput?.value) || 0;
  const reps = Number(repsInput?.value) || 0;
  const setType = /** @type {import('../model.js').SetType} */ (setTypeSelect?.value || 'MAIN');

  if (!exerciseName) {
    showToast('種目を選択してください', 'warning');
    return;
  }
  if (weight <= 0 || reps <= 0) {
    showToast('重量と回数を正しく入力してください', 'warning');
    return;
  }

  const set = storeInstance.addSetToWorkout(activeWorkoutId, {
    exerciseName,
    weight,
    reps,
    setType,
    isCompleted: true,
  });

  if (set) {
    playSuccessChime();
    showToast(`${set.exerciseName} #${setType} (${set.weight}kg × ${set.reps}回) を完了！`, 'success');

    // 種目の休憩時間（またはセット種別の既定）をタイマーで起動
    const template = storeInstance.getExerciseTemplate(exerciseName);
    const restSeconds = Number(restInput?.value) || template?.defaultRestSeconds || storeInstance.getState().profile.defaultRestSeconds[setType] || 120;
    startTimer(restSeconds, `${exerciseName} 休憩 (${restSeconds}秒)`);

    renderWorkout();
  }
}

/** 複数セットを一括予約（計画追加） */
function handleAddBatchSets() {
  if (!activeWorkoutId) return;

  const exSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('input-exercise-name'));
  const weightInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-weight'));
  const repsInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-reps'));
  const countInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-set-count'));
  const setTypeSelect = /** @type {HTMLInputElement | null} */ (
    document.querySelector('input[name="set-type"]:checked')
  );

  const exerciseName = exSelect?.value.trim() || '';
  const weight = Number(weightInput?.value) || 0;
  const reps = Number(repsInput?.value) || 0;
  const count = Number(countInput?.value) || 3;
  const setType = /** @type {import('../model.js').SetType} */ (setTypeSelect?.value || 'MAIN');

  if (!exerciseName) {
    showToast('種目を選択してください', 'warning');
    return;
  }
  if (weight <= 0 || reps <= 0) {
    showToast('予定重量と回数を正しく入力してください', 'warning');
    return;
  }

  const newSets = storeInstance.addPlannedSets(activeWorkoutId, {
    exerciseName,
    weight,
    reps,
    count,
    setType,
  });

  if (newSets.length > 0) {
    showToast(`${exerciseName} ${weight}kg × ${reps}回 を ${newSets.length}セット予約しました！`, 'success');
    renderWorkout();
  }
}

/** 予定セットの完了処理 */
/** @param {string} setId */
function handleCompleteSet(setId) {
  if (!activeWorkoutId) return;
  const workout = storeInstance.getState().workouts.find((w) => w.id === activeWorkoutId);
  if (!workout) return;
  const targetSet = workout.sets.find((s) => s.id === setId);
  if (!targetSet) return;

  // 実績入力値（各行の input または targetSet.targetWeight）を取得
  const rowWeightInput = /** @type {HTMLInputElement | null} */ (document.getElementById(`row-weight-${setId}`));
  const rowRepsInput = /** @type {HTMLInputElement | null} */ (document.getElementById(`row-reps-${setId}`));

  const actualW = rowWeightInput ? Number(rowWeightInput.value) : targetSet.targetWeight;
  const actualR = rowRepsInput ? Number(rowRepsInput.value) : targetSet.targetReps;

  const completed = storeInstance.completeSet(activeWorkoutId, setId, actualW, actualR);
  if (completed) {
    playSuccessChime();
    showToast(`セット完了！ ${completed.weight}kg × ${completed.reps}回 (1RM: ${completed.estimated1rm}kg)`, 'success');

    // 種目の既定休憩時間でタイマー起動！
    const template = storeInstance.getExerciseTemplate(completed.exerciseName);
    const restSeconds = template?.defaultRestSeconds || storeInstance.getState().profile.defaultRestSeconds[completed.setType] || 120;
    startTimer(restSeconds, `${completed.exerciseName} 休憩 (${restSeconds}秒)`);

    renderWorkout();
  }
}

export function renderWorkout() {
  const container = document.getElementById('tab-workout');
  if (!container || !storeInstance) return;

  const state = storeInstance.getState();
  const workouts = state.workouts;

  // 現在アクティブなセッションを探す
  let activeWorkout = activeWorkoutId ? workouts.find((w) => w.id === activeWorkoutId) : null;
  if (!activeWorkout) {
    const today = new Date().toISOString().slice(0, 10);
    activeWorkout = workouts.find((w) => w.date === today && !w.endTime) || null;
    activeWorkoutId = activeWorkout ? activeWorkout.id : null;
  }

  // ワークアウト未開始の画面
  if (!activeWorkout) {
    const latestWorkout = workouts[0];
    container.innerHTML = `
      <section class="card session-starter-card">
        <div class="session-starter-header">
          <span class="icon-hero">🏋️</span>
          <h2>ワークアウトの開始</h2>
          <p class="text-muted">予定セットを一括セットし、予実を管理しながらトレーニングを進められます。</p>
        </div>
        <button id="btn-start-workout" class="btn btn-primary btn-large btn-glow">
          🔥 本日のワークアウトを開始する
        </button>
      </section>

      ${renderRecentWorkoutSummary(latestWorkout)}
    `;
    return;
  }

  // 進行中のワークアウト画面
  const actualVolume = calculateSessionVolume(activeWorkout.sets);
  const plannedVolume = calculatePlannedVolume(activeWorkout.sets);
  const completedSetsCount = activeWorkout.sets.filter((s) => s.isCompleted !== false).length;
  const totalSetsCount = activeWorkout.sets.length;
  const exerciseTemplates = state.exerciseTemplates;

  container.innerHTML = `
    <!-- ワークアウトヘッダー＆コンディション -->
    <section class="card workout-active-card">
      <div class="workout-header-row">
        <div>
          <span class="badge badge-pulse">進行中</span>
          <h2 class="session-title">${formatDate(activeWorkout.date)} ワークアウト</h2>
          <span class="text-muted text-sm">開始: ${formatTime(activeWorkout.startTime)}</span>
        </div>
        <div class="volume-badge">
          <span class="volume-label">ボリューム予実</span>
          <span class="volume-value font-mono">
            ${actualVolume.toLocaleString()} <small>/ ${plannedVolume.toLocaleString()} kg</small>
          </span>
          <span class="text-faint text-sm display-block">
            ${totalSetsCount > 0 ? `${completedSetsCount} / ${totalSetsCount} セット完了` : '0 セット'}
          </span>
        </div>
      </div>

      <!-- トレ前コンディション・バイタル入力 -->
      <div class="condition-tracker-box">
        <div class="condition-row">
          <span class="condition-label">💤 睡眠時間:</span>
          <div class="chip-group">
            ${['<5h', '5-6h', '6-7h', '7h+']
              .map(
                (s) => `
                <button type="button" class="chip sleep-chip ${activeWorkout.sleepCategory === s ? 'is-selected' : ''}" data-sleep="${s}">
                  ${s}
                </button>
              `,
              )
              .join('')}
          </div>
        </div>

        <div class="condition-row">
          <span class="condition-label">🍌 トレ前糖質補給:</span>
          <button type="button" id="btn-toggle-carb" class="btn btn-sm ${activeWorkout.preWorkoutCarb ? 'btn-carb-on' : 'btn-carb-off'}">
            ${activeWorkout.preWorkoutCarb ? '✅ 補給済み (エネルギー充実)' : '❌ 未補給 (空腹気味)'}
          </button>
        </div>

        <div class="condition-row">
          <span class="condition-label">🎯 体調スコア:</span>
          <div class="score-stars">
            ${[1, 2, 3, 4, 5]
              .map(
                (num) => `
                <button type="button" class="condition-score-btn ${activeWorkout.conditionScore >= num ? 'is-lit' : ''}" data-score="${num}">
                  ★
                </button>
              `,
              )
              .join('')}
            <span class="text-muted text-sm">${activeWorkout.conditionScore}/5</span>
          </div>
        </div>

        <div class="condition-row">
          <span class="condition-label">⚖️ 当日体重:</span>
          <div class="input-with-unit-inline">
            <input type="number" id="input-body-weight" class="input input-sm" step="0.1" placeholder="例: 68.2" value="${activeWorkout.bodyWeight ?? ''}">
            <span class="unit">kg</span>
          </div>
        </div>
      </div>
    </section>

    <!-- セット作成・予約フォーム -->
    <section class="card set-logger-card">
      <div class="card-header-flex">
        <h3 class="card-title">＋ セットの計画・記録</h3>
        <button type="button" id="btn-open-add-exercise" class="btn btn-sm btn-outline-cyan">
          ＋ 新規種目を追加
        </button>
      </div>

      <!-- クイック種目選択チップ -->
      <div class="quick-exercises-scroll">
        ${exerciseTemplates
          .slice(0, 8)
          .map((ex) => `<button type="button" class="chip exercise-chip" data-name="${escapeHtml(ex.name)}">${escapeHtml(ex.name)}</button>`)
          .join('')}
      </div>

      <div class="form-grid">
        <!-- 種目選択 -->
        <div class="form-group form-group-full">
          <label for="input-exercise-name">種目名</label>
          <select id="input-exercise-name" class="input">
            <option value="">種目を選択...</option>
            ${exerciseTemplates.map((ex) => `<option value="${escapeHtml(ex.name)}">${escapeHtml(ex.name)} (${ex.defaultRestSeconds}s)</option>`).join('')}
          </select>
          <div id="exercise-prev-hint" class="prev-hint" style="display: none;"></div>
          <div id="exercise-overload-suggestion" class="overload-hint" style="display: none;"></div>
        </div>

        <!-- 種目別休憩タイマー設定 -->
        <div class="form-group form-group-full">
          <div class="exercise-rest-row">
            <label for="input-exercise-rest" class="rest-label">⏱ この種目の休憩時間:</label>
            <div class="input-with-unit-inline">
              <input type="number" id="input-exercise-rest" class="input input-sm font-mono text-center" style="max-width: 90px;" value="120" min="10" step="5">
              <span class="unit">秒</span>
              <button type="button" id="btn-save-exercise-rest" class="btn btn-xs btn-outline-cyan" title="この種目の既定休憩時間として保存">既定として保存</button>
            </div>
          </div>
        </div>

        <!-- セット種別チップ -->
        <div class="form-group form-group-full">
          <label>セット種別</label>
          <div class="set-type-radios">
            <label class="set-type-label set-up">
              <input type="radio" name="set-type" value="UP">
              <span>UP (準備)</span>
            </label>
            <label class="set-type-label set-main">
              <input type="radio" name="set-type" value="MAIN" checked>
              <span>MAIN (基本)</span>
            </label>
            <label class="set-type-label set-heavy">
              <input type="radio" name="set-type" value="HEAVY">
              <span>HEAVY (MAX)</span>
            </label>
            <label class="set-type-label set-down">
              <input type="radio" name="set-type" value="DOWN">
              <span>DOWN (調整)</span>
            </label>
          </div>
        </div>

        <!-- 重量 -->
        <div class="form-group">
          <label for="input-weight">重量 (kg)</label>
          <div class="input-stepper">
            <input type="number" id="input-weight" class="input input-lg font-mono" step="0.5" placeholder="70">
            <div class="stepper-buttons">
              <button type="button" class="btn btn-xs weight-adjust-btn" data-delta="-2.5">-2.5</button>
              <button type="button" class="btn btn-xs weight-adjust-btn" data-delta="2.5">+2.5</button>
              <button type="button" class="btn btn-xs weight-adjust-btn" data-delta="5">+5</button>
            </div>
          </div>
        </div>

        <!-- 回数 -->
        <div class="form-group">
          <label for="input-reps">回数 (Reps)</label>
          <div class="input-stepper">
            <input type="number" id="input-reps" class="input input-lg font-mono" min="1" placeholder="10">
            <div class="stepper-buttons">
              <button type="button" class="btn btn-xs reps-adjust-btn" data-delta="-1">-1</button>
              <button type="button" class="btn btn-xs reps-adjust-btn" data-delta="1">+1</button>
            </div>
          </div>
        </div>

        <!-- セット数（一括追加用） -->
        <div class="form-group form-group-full">
          <label for="input-set-count">予定セット数（一括作成）</label>
          <div class="set-count-row">
            <input type="number" id="input-set-count" class="input input-sm font-mono text-center" style="max-width: 100px;" min="1" max="10" value="3">
            <span class="text-muted text-sm">セット（例: 70kg × 10回 × 3セット）</span>
          </div>
        </div>
      </div>

      <!-- アクションボタン -->
      <div class="logger-action-bar">
        <div id="preview-1rm-badge" class="preview-1rm-badge font-mono">
          推定1RM: <strong>0 kg</strong>
        </div>
        <div class="logger-buttons-group">
          <button type="button" id="btn-add-batch-sets" class="btn btn-primary btn-glow">
            ⚡ 3セットを一括予約 (計画)
          </button>
          <button type="button" id="btn-add-single-set" class="btn btn-outline-cyan">
            ＋ 1セットを即時完了
          </button>
        </div>
      </div>
    </section>

    <!-- 実施・予実セット一覧 -->
    <section class="card recorded-sets-card">
      <div class="card-header-flex">
        <div>
          <h3 class="card-title">セット予実管理 (${activeWorkout.sets.length})</h3>
          <span class="text-muted text-sm">予定セットは「✔ 完了」で実測値を確定・タイマー起動</span>
        </div>
        <button type="button" id="btn-finish-workout" class="btn btn-outline-success btn-sm">
          🏁 ワークアウト完了
        </button>
      </div>

      ${
        activeWorkout.sets.length === 0
          ? `<p class="empty-hint text-center text-muted">まだセットが登録されていません。上のフォームから一括予約または記録してください。</p>`
          : `
          <div class="sets-table-wrap">
            <table class="sets-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>状態</th>
                  <th>種目</th>
                  <th>重量 (kg)</th>
                  <th>回数</th>
                  <th>推定1RM</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${activeWorkout.sets
                  .map((s, index) => {
                    const isDone = s.isCompleted !== false;
                    return `
                  <tr class="set-row set-row-${s.setType.toLowerCase()} ${isDone ? 'is-completed' : 'is-planned'}">
                    <td class="font-mono">${index + 1}</td>
                    <td>
                      <span class="badge ${isDone ? 'badge-set-' + s.setType.toLowerCase() : 'badge-planned'}">
                        ${isDone ? '✔ ' + s.setType : '予定 ' + s.setType}
                      </span>
                    </td>
                    <td class="font-bold">${escapeHtml(s.exerciseName)}</td>
                    <td>
                      ${
                        isDone
                          ? `<span class="font-mono text-lg">${s.weight} kg</span>`
                          : `<input type="number" id="row-weight-${s.id}" class="input input-table font-mono" step="0.5" value="${s.targetWeight || s.weight}">`
                      }
                    </td>
                    <td>
                      ${
                        isDone
                          ? `<span class="font-mono text-lg">${s.reps} 回</span>`
                          : `<input type="number" id="row-reps-${s.id}" class="input input-table font-mono" min="1" value="${s.targetReps || s.reps}">`
                      }
                    </td>
                    <td class="font-mono ${isDone ? 'text-cyan' : 'text-faint'}">
                      ${isDone ? `${s.estimated1rm} kg` : '-'}
                    </td>
                    <td>
                      <div class="table-actions">
                        ${
                          isDone
                            ? `
                            <button type="button" class="btn btn-xs btn-undo-set" data-set-id="${s.id}" title="未完了に戻す">
                              ↩ 戻す
                            </button>
                          `
                            : `
                            <button type="button" class="btn btn-sm btn-primary btn-complete-set" data-set-id="${s.id}">
                              ✔ 完了
                            </button>
                          `
                        }
                        <button type="button" class="btn-icon btn-delete-set" data-set-id="${s.id}" title="削除">
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        `
      }
    </section>

    <!-- 新規種目追加モーダル -->
    <div id="modal-add-exercise" class="timer-modal" role="dialog" aria-modal="true">
      <div class="timer-modal-dialog">
        <button type="button" id="btn-close-add-exercise" class="timer-modal-close">✕</button>
        <h3 class="card-title justify-center">＋ 新規種目の追加</h3>
        <div class="add-exercise-modal-body mt-3">
          <div class="form-group text-left">
            <label for="new-exercise-name">種目名</label>
            <input type="text" id="new-exercise-name" class="input" placeholder="例: インクラインダンベルフライ">
          </div>
          <div class="form-group text-left mt-3">
            <label for="new-exercise-rest">この種目の既定休憩時間 (秒)</label>
            <input type="number" id="new-exercise-rest" class="input font-mono" value="120" min="10" step="5">
          </div>
          <button type="button" id="btn-save-new-exercise" class="btn btn-primary btn-large btn-glow mt-4">
            💾 種目を登録する
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 前回のワークアウトサマリーカード
 * @param {import('../model.js').WorkoutSession} [latest]
 */
function renderRecentWorkoutSummary(latest) {
  if (!latest) return '';
  const vol = calculateSessionVolume(latest.sets);
  return `
    <section class="card recent-summary-card">
      <h3 class="card-title">前回の記録 (${formatDate(latest.date)})</h3>
      <div class="summary-metrics">
        <div class="metric-item">
          <span class="metric-label">実績ボリューム</span>
          <span class="metric-value font-mono">${vol.toLocaleString()} kg</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">完了セット数</span>
          <span class="metric-value font-mono">${latest.sets.filter((s) => s.isCompleted !== false).length} セット</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">コンディション</span>
          <span class="metric-value">${'★'.repeat(latest.conditionScore)}${'☆'.repeat(5 - latest.conditionScore)}</span>
        </div>
      </div>
    </section>
  `;
}

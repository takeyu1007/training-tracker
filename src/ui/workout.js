// @ts-check
/**
 * ワークアウト記録 UI モジュール
 */

import { calculate1RM, calculateSessionVolume, suggestProgressiveOverload } from '../calc.js';
import { escapeHtml, formatDate, formatTime, formatWeight } from '../format.js';
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

  // ワークアウト新規開始
  container.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // 開始ボタン
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

    // ワークアウト完了ボタン
    if (target.closest('#btn-finish-workout')) {
      if (!activeWorkoutId) return;
      const workout = storeInstance.getState().workouts.find((w) => w.id === activeWorkoutId);
      if (!workout) return;

      const vol = calculateSessionVolume(workout.sets);
      storeInstance.finishWorkout(activeWorkoutId);
      showToast(`🎉 ワークアウト完了！ 総ボリューム: ${vol.toLocaleString()}kg お疲れ様でした！`, 'success', 5000);
      renderWorkout();
      return;
    }

    // セット追加ボタン
    if (target.closest('#btn-add-set')) {
      handleAddSet();
      return;
    }

    // セット削除ボタン
    const deleteSetBtn = target.closest('.btn-delete-set');
    if (deleteSetBtn) {
      const setId = deleteSetBtn.getAttribute('data-set-id');
      if (setId && activeWorkoutId) {
        storeInstance.deleteSetFromWorkout(activeWorkoutId, setId);
        renderWorkout();
      }
      return;
    }

    // 種目クイックチップ選択
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

    // 睡眠チップ選択
    const sleepChip = target.closest('.sleep-chip');
    if (sleepChip && activeWorkoutId) {
      const cat = /** @type {any} */ (sleepChip.getAttribute('data-sleep'));
      if (cat) {
        storeInstance.updateWorkout(activeWorkoutId, { sleepCategory: cat });
        renderWorkout();
      }
      return;
    }

    // 体調スコア選択
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
  });

  // 種目変更イベント
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
  });

  // 重量・回数のリアルタイム1RMプレビュー
  container.addEventListener('input', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.id === 'input-weight' || target.id === 'input-reps') {
      update1RMPreview();
    }
  });
}

/** @param {string} exerciseName */
function handleExerciseChange(exerciseName) {
  if (!exerciseName) return;
  const prev = storeInstance.getPreviousSetValues(exerciseName);
  const weightInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-weight'));
  const repsInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-reps'));
  const hintEl = document.getElementById('exercise-prev-hint');
  const overloadEl = document.getElementById('exercise-overload-suggestion');

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

  // 漸進性過負荷（オーバーロード）サジェストの算出
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

function handleAddSet() {
  if (!activeWorkoutId) return;

  const exSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('input-exercise-name'));
  const weightInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-weight'));
  const repsInput = /** @type {HTMLInputElement | null} */ (document.getElementById('input-reps'));
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
  });

  if (set) {
    playSuccessChime();
    showToast(`${set.exerciseName} #${setType} (${set.weight}kg × ${set.reps}回) を記録しました！`, 'success');

    // スマートインターバルタイマーの自動サジェスト開始
    const restSeconds = storeInstance.getState().profile.defaultRestSeconds[setType] || 120;
    startTimer(restSeconds, `${setType}セット休憩 (${restSeconds}秒)`);

    renderWorkout();
  }
}

export function renderWorkout() {
  const container = document.getElementById('tab-workout');
  if (!container || !storeInstance) return;

  const state = storeInstance.getState();
  const workouts = state.workouts;

  // 現在アクティブな（未完了または本日）セッションを探す
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
          <p class="text-muted">日々の睡眠・栄養状態と出力を記録し、最大パフォーマンスを引き出します。</p>
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
  const totalVolume = calculateSessionVolume(activeWorkout.sets);
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
          <span class="volume-label">総ボリューム</span>
          <span class="volume-value">${totalVolume.toLocaleString()} <small>kg</small></span>
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
          <span class="condition-label">⚖️ 当日体重 (任意):</span>
          <div class="input-with-unit-inline">
            <input type="number" id="input-body-weight" class="input input-sm" step="0.1" placeholder="例: 68.2" value="${activeWorkout.bodyWeight ?? ''}">
            <span class="unit">kg</span>
          </div>
        </div>
      </div>
    </section>

    <!-- セット記録フォーム -->
    <section class="card set-logger-card">
      <h3 class="card-title">＋ セットの記録</h3>

      <!-- クイック種目選択チップ -->
      <div class="quick-exercises-scroll">
        ${exerciseTemplates
          .slice(0, 6)
          .map((ex) => `<button type="button" class="chip exercise-chip" data-name="${escapeHtml(ex)}">${escapeHtml(ex)}</button>`)
          .join('')}
      </div>

      <div class="form-grid">
        <div class="form-group form-group-full">
          <label for="input-exercise-name">種目名</label>
          <select id="input-exercise-name" class="input">
            <option value="">種目を選択...</option>
            ${exerciseTemplates.map((ex) => `<option value="${escapeHtml(ex)}">${escapeHtml(ex)}</option>`).join('')}
          </select>
          <div id="exercise-prev-hint" class="prev-hint" style="display: none;"></div>
          <div id="exercise-overload-suggestion" class="overload-hint" style="display: none;"></div>
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
            <input type="number" id="input-weight" class="input input-lg" step="0.5" placeholder="80">
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
            <input type="number" id="input-reps" class="input input-lg" min="1" placeholder="10">
            <div class="stepper-buttons">
              <button type="button" class="btn btn-xs reps-adjust-btn" data-delta="-1">-1</button>
              <button type="button" class="btn btn-xs reps-adjust-btn" data-delta="1">+1</button>
            </div>
          </div>
        </div>
      </div>

      <!-- リアルタイム1RMバッジ ＆ 追加ボタン -->
      <div class="logger-action-bar">
        <div id="preview-1rm-badge" class="preview-1rm-badge">
          推定1RM: <strong>0 kg</strong>
        </div>
        <button type="button" id="btn-add-set" class="btn btn-primary btn-glow">
          ＋ セットを記録 (タイマー起動)
        </button>
      </div>
    </section>

    <!-- 記録済みセット一覧 -->
    <section class="card recorded-sets-card">
      <div class="card-header-flex">
        <h3 class="card-title">実施セット (${activeWorkout.sets.length})</h3>
        <button type="button" id="btn-finish-workout" class="btn btn-outline-success btn-sm">
          🏁 ワークアウト完了
        </button>
      </div>

      ${
        activeWorkout.sets.length === 0
          ? `<p class="empty-hint text-center text-muted">まだセットが記録されていません。上のフォームから記録してください。</p>`
          : `
          <div class="sets-table-wrap">
            <table class="sets-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>種別</th>
                  <th>種目</th>
                  <th>重量 × 回数</th>
                  <th>推定1RM</th>
                  <th>時間</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${activeWorkout.sets
                  .map(
                    (s, index) => `
                  <tr class="set-row set-row-${s.setType.toLowerCase()}">
                    <td class="font-mono">${index + 1}</td>
                    <td><span class="badge badge-set-${s.setType.toLowerCase()}">${s.setType}</span></td>
                    <td class="font-bold">${escapeHtml(s.exerciseName)}</td>
                    <td class="font-mono text-lg">${s.weight}kg × ${s.reps}</td>
                    <td class="font-mono text-cyan">${s.estimated1rm}kg</td>
                    <td class="text-faint text-sm">${formatTime(s.completedAt)}</td>
                    <td>
                      <button type="button" class="btn-icon btn-delete-set" data-set-id="${s.id}" title="セット削除">
                        🗑
                      </button>
                    </td>
                  </tr>
                `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `
      }
    </section>
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
          <span class="metric-label">総ボリューム</span>
          <span class="metric-value font-mono">${vol.toLocaleString()} kg</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">実施セット数</span>
          <span class="metric-value font-mono">${latest.sets.length} セット</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">コンディション</span>
          <span class="metric-value">${'★'.repeat(latest.conditionScore)}${'☆'.repeat(5 - latest.conditionScore)}</span>
        </div>
      </div>
    </section>
  `;
}

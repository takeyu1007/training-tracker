// @ts-check
/**
 * 分析・ダッシュボード UI モジュール
 * - 体重 vs 推定1RM オーバーレイチャート (HTML5 Canvas)
 * - コンディション警告アラート＆相関インサイト
 * - 漸進性過負荷（オーバーロード）サジェスト
 * - ワークアウト履歴タイムライン
 */

import {
  analyzeConditionInsights,
  calculateSessionVolume,
  suggestProgressiveOverload,
  calculateWeightPace,
  calculate7DayMovingAverage,
  calculateBig3Total,
} from '../calc.js';
import { escapeHtml, formatDate, formatTime } from '../format.js';

/** @type {import('../store.js').Store} */
let storeInstance;
let selectedExercise = 'ベンチプレス';

/**
 * @param {import('../store.js').Store} store
 */
export function initAnalyticsUI(store) {
  storeInstance = store;
  bindEvents();
  renderAnalytics();
}

function bindEvents() {
  const container = document.getElementById('tab-analytics');
  if (!container) return;

  container.addEventListener('change', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.id === 'chart-exercise-select') {
      selectedExercise = /** @type {HTMLSelectElement} */ (target).value;
      renderChart();
    }
  });

  // 履歴項目の展開トグル
  container.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const header = target.closest('.history-session-header');
    if (header) {
      const details = header.nextElementSibling;
      if (details) {
        details.classList.toggle('is-open');
      }
    }
  });

  window.addEventListener('resize', () => {
    renderChart();
  });
}

export function renderAnalytics() {
  const container = document.getElementById('tab-analytics');
  if (!container || !storeInstance) return;

  const state = storeInstance.getState();
  const profile = state.profile;
  const activeProj = state.activeProject;
  const workouts = state.workouts;
  const latestWeight = storeInstance.getLatestWeight();
  const insights = analyzeConditionInsights(workouts);
  const exerciseTemplates = state.exerciseTemplates;

  // 1. プロジェクト目標マイルストーン＆カロリー計算
  const startWeight = activeProj?.startWeight ?? profile.startWeight ?? latestWeight;
  const currentWeight = latestWeight;
  const targetWeight = Number(activeProj?.targetWeight ?? profile.targetWeight) || 65;
  const targetDate = activeProj?.targetDate || profile.targetDate || '';
  const projTitle = activeProj?.title || activeProj?.name || (targetDate ? '目標管理' : 'プロジェクト未設定');

  const pace = calculateWeightPace(
    startWeight,
    currentWeight,
    targetWeight,
    targetDate,
  );

  // 2. BIG3 トータル推定MAXスコア
  const big3 = calculateBig3Total(workouts);

  const exerciseNames = exerciseTemplates.map((e) => e.name);

  // デフォルト種目の初期化
  if (!exerciseNames.includes(selectedExercise) && exerciseNames.length > 0) {
    selectedExercise = exerciseNames[0];
  }

  // 主要種目のオーバーロード提案
  const overloadCards = exerciseNames.slice(0, 4).map((ex) => {
    const sugg = suggestProgressiveOverload(ex, workouts);
    return { exercise: ex, ...sugg };
  });

  container.innerHTML = `
    <!-- 減量・増量マイルストーン＆必要カロリー追跡 -->
    <section class="card milestone-card">
      <div class="card-header-flex">
        <div>
          <div class="flex-row items-center gap-2">
            <h3 class="card-title">🎯 減量・増量マイルストーン</h3>
            ${activeProj ? `<span class="badge ${activeProj.goalType === 'cut' ? 'badge-primary' : activeProj.goalType === 'bulk' ? 'badge-success' : 'badge-muted'}">${escapeHtml(projTitle)}</span>` : ''}
          </div>
          <span class="text-muted text-sm">目標達成期日と消費カロリー（7,200kcal/kg則）の予実管理</span>
        </div>
        <div class="milestone-days-badge ${pace.daysRemaining > 0 ? 'badge-primary' : 'badge-muted'}">
          ${pace.daysRemaining > 0 ? `あと ${pace.daysRemaining}日` : (targetDate ? '本日目標日' : '期日未設定')}
        </div>
      </div>

      ${
        !targetDate
          ? `
        <div class="milestone-empty-box mt-3 text-center">
          <p class="text-sm text-muted">「⚙️ 設定」タブのプロジェクト管理で目標体重と目標達成予定日を設定すると、進捗率と必要カロリー消費ペースがリアルタイム表示されます。</p>
        </div>
      `
          : `
        <!-- 体重進捗ゲージ -->
        <div class="milestone-progress-section mt-3">
          <div class="milestone-weights-row font-mono text-sm">
            <span class="weight-point">開始: <strong>${startWeight}kg</strong></span>
            <span class="weight-point text-cyan">現在: <strong>${currentWeight}kg</strong></span>
            <span class="weight-point text-emerald">目標: <strong>${targetWeight}kg</strong></span>
          </div>

          <div class="progress-bar-track milestone-track mt-2">
            <div class="progress-bar-fill fill-cyan" style="width: ${pace.progressPercent}%"></div>
          </div>

          <div class="milestone-percent-row mt-1 text-xs text-muted flex-between">
            <span>進捗率: <strong class="text-cyan font-mono">${pace.progressPercent}%</strong></span>
            <span>残り重量: <strong class="font-mono ${pace.direction === 'cut' ? 'text-amber' : 'text-emerald'}">${pace.weightRemaining}kg</strong> (${pace.direction === 'cut' ? '減量' : pace.direction === 'bulk' ? '増量' : '維持'})</span>
          </div>
        </div>

        <!-- 必要カロリー計算サマリー -->
        <div class="calorie-budget-grid mt-4">
          <div class="calorie-box">
            <span class="calorie-box-label">目標達成までの総調整熱量</span>
            <span class="calorie-box-val font-mono text-cyan">${pace.totalCaloriesNeeded.toLocaleString()} <small>kcal</small></span>
            <span class="calorie-box-sub text-xs text-muted">${pace.weightRemaining}kg × 7,200kcal</span>
          </div>
          <div class="calorie-box">
            <span class="calorie-box-label">1日あたりの目標カロリー調整</span>
            <span class="calorie-box-val font-mono ${pace.direction === 'cut' ? 'text-rose' : 'text-emerald'}">
              ${pace.daysRemaining > 0 ? `${pace.direction === 'cut' ? '-' : '+'}${pace.dailyCalorieAdjustment.toLocaleString()}` : '0'} <small>kcal/日</small>
            </span>
            <span class="calorie-box-sub text-xs text-muted">${pace.daysRemaining > 0 ? `残り${pace.daysRemaining}日均等ペース` : '期日終了'}</span>
          </div>
        </div>
      `
      }
    </section>

    <!-- チャートセクション (体重 + 7日移動平均 + 推定1RM) -->
    <section class="card chart-card">
      <div class="card-header-flex">
        <div>
          <h3 class="card-title">📈 体重推移 vs 推定1RM (7日移動平均線つき)</h3>
          <span class="text-muted text-sm">日々の水分変動を平滑化した実質トレンドと筋出力を追跡</span>
        </div>
        <select id="chart-exercise-select" class="input input-sm">
          ${exerciseNames.map((ex) => `<option value="${escapeHtml(ex)}" ${ex === selectedExercise ? 'selected' : ''}>${escapeHtml(ex)}</option>`).join('')}
        </select>
      </div>

      <div class="chart-legend">
        <span class="legend-item text-cyan">● 体重 (kg)</span>
        <span class="legend-item text-sky font-mono">┄ 7日移動平均</span>
        <span class="legend-item text-orange">● 推定1RM (kg)</span>
      </div>

      <div class="canvas-container">
        <canvas id="analytics-canvas" width="800" height="340"></canvas>
      </div>
    </section>

    <!-- BIG3 トータル推定MAXスコア -->
    <section class="card big3-card">
      <div class="card-header-flex">
        <div>
          <h3 class="card-title">🏆 BIG3 トータル推定MAXスコア</h3>
          <span class="text-muted text-sm">ベンチプレス + スクワット + デッドリフト の最高推定1RM合計</span>
        </div>
        <div class="big3-club-badge ${big3.clubLevel === '500kg Club' ? 'club-500kg' : big3.clubLevel === '400kg Club' ? 'club-400kg' : big3.clubLevel === '300kg Club' ? 'club-300kg' : 'club-road'}">
          ${escapeHtml(big3.clubLevel)}
        </div>
      </div>

      <div class="big3-score-hero mt-3">
        <div class="big3-total-number font-mono">
          ${big3.total > 0 ? big3.total : 0} <span class="unit">kg</span>
        </div>
      </div>

      <div class="big3-breakdown-grid mt-3">
        <div class="big3-item">
          <span class="big3-label">ベンチプレス</span>
          <span class="big3-val font-mono text-cyan">${big3.benchMax > 0 ? `${big3.benchMax} kg` : '未記録'}</span>
        </div>
        <div class="big3-item">
          <span class="big3-label">スクワット</span>
          <span class="big3-val font-mono text-cyan">${big3.squatMax > 0 ? `${big3.squatMax} kg` : '未記録'}</span>
        </div>
        <div class="big3-item">
          <span class="big3-label">デッドリフト</span>
          <span class="big3-val font-mono text-cyan">${big3.deadliftMax > 0 ? `${big3.deadliftMax} kg` : '未記録'}</span>
        </div>
      </div>
    </section>

    <!-- コンディション警告＆インサイト -->
    <section class="card insights-card">
      <h3 class="card-title">🧠 コンディション相関インサイト</h3>
      <div class="insights-list">
        ${insights
          .map(
            (ins) => `
          <div class="insight-banner insight-${ins.type}">
            <h4 class="insight-title">${escapeHtml(ins.title)}</h4>
            <p class="insight-desc">${escapeHtml(ins.description)}</p>
          </div>
        `,
          )
          .join('')}
      </div>
    </section>

    <!-- 漸進性過負荷サジェスト -->
    <section class="card overload-section-card">
      <h3 class="card-title">🔥 漸進性過負荷（オーバーロード）サジェスト</h3>
      <div class="overload-cards-grid">
        ${overloadCards
          .map(
            (item) => `
          <div class="overload-badge-card ${item.shouldIncrease ? 'card-highlight-green' : ''}">
            <div class="overload-card-header">
              <span class="font-bold">${escapeHtml(item.exercise)}</span>
              ${item.shouldIncrease ? '<span class="badge badge-success">重量アップ推奨！</span>' : '<span class="badge badge-muted">現状維持</span>'}
            </div>
            <p class="text-sm ${item.shouldIncrease ? 'text-emerald' : 'text-muted'}">
              ${escapeHtml(item.message || 'データなし')}
            </p>
          </div>
        `,
          )
          .join('')}
      </div>
    </section>

    <!-- ワークアウト・休息日履歴タイムライン -->
    <section class="card history-timeline-card">
      <h3 class="card-title">📜 アクティビティ履歴（トレ日＆休息日）</h3>
      ${
        workouts.length === 0
          ? `<p class="empty-hint text-center text-muted">まだ記録されたセッションはありません。</p>`
          : `
          <div class="history-list">
            ${workouts
              .map((w) => {
                if (w.sessionType === 'rest') {
                  return `
                  <div class="history-item history-item-rest">
                    <div class="history-session-header">
                      <div>
                        <span class="font-bold">${formatDate(w.date)}</span>
                        <span class="badge badge-rest ml-2">🛋️ 休息日</span>
                      </div>
                      <div class="history-badges">
                        <span class="tag tag-sleep">💤 ${w.sleepCategory}</span>
                        <span class="tag tag-cond">体調 ★${w.conditionScore}</span>
                        ${w.bodyWeight ? `<span class="font-mono text-cyan">${w.bodyWeight} kg</span>` : ''}
                      </div>
                    </div>
                    <div class="history-session-details">
                      ${
                        w.notes
                          ? `<div class="history-rest-notes"><p class="text-sm text-muted">📝 ${escapeHtml(w.notes)}</p></div>`
                          : `<p class="text-xs text-muted">休息日リカバリー完了</p>`
                      }
                    </div>
                  </div>
                `;
                }

                const vol = calculateSessionVolume(w.sets);
                return `
                <div class="history-item">
                  <div class="history-session-header">
                    <div>
                      <span class="font-bold">${formatDate(w.date)}</span>
                      <span class="text-muted text-sm ml-2">${formatTime(w.startTime)}</span>
                    </div>
                    <div class="history-badges">
                      <span class="tag tag-sleep">💤 ${w.sleepCategory}</span>
                      <span class="tag tag-carb">${w.preWorkoutCarb ? '🍌 糖質あり' : '空腹'}</span>
                      ${w.bodyWeight ? `<span class="font-mono text-muted text-xs mr-1">${w.bodyWeight}kg</span>` : ''}
                      <span class="font-mono text-cyan">${vol.toLocaleString()} kg</span>
                    </div>
                  </div>
                  <div class="history-session-details">
                    ${w.notes ? `<div class="history-notes-box text-xs text-muted mb-2">📝 ${escapeHtml(w.notes)}</div>` : ''}
                    <ul class="history-sets-list">
                      ${w.sets
                        .map(
                          (s) => `
                        <li>
                          <span class="badge badge-set-${s.setType.toLowerCase()}">${s.setType}</span>
                          <strong>${escapeHtml(s.exerciseName)}</strong>:
                          ${s.weight}kg × ${s.reps}回
                          <small class="text-muted">(1RM: ${s.estimated1rm}kg)</small>
                        </li>
                      `,
                        )
                        .join('')}
                    </ul>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        `
      }
    </section>
  `;

  // Canvas 描画の実行
  setTimeout(renderChart, 50);
}

/**
 * Canvas による高解像度オーバーレイグラフの描画（実測体重 + 7日移動平均線 + 推定1RM）
 */
export function renderChart() {
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('analytics-canvas'));
  if (!canvas || !storeInstance) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Retina / High-DPI スケーリング
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  const state = storeInstance.getState();
  const workouts = [...state.workouts].sort(
    (a, b) => Date.parse(a.date) - Date.parse(b.date),
  );

  // 体重ログとワークアウト体重を統合したマップを作成
  /** @type {Map<string, number>} */
  const weightMap = new Map();
  state.weightLogs.forEach((l) => weightMap.set(l.date, l.weight));
  workouts.forEach((w) => {
    if (w.bodyWeight && !weightMap.has(w.date)) {
      weightMap.set(w.date, w.bodyWeight);
    }
  });

  const weightTimeline = Array.from(weightMap.entries())
    .sort(([d1], [d2]) => d1.localeCompare(d2))
    .map(([date, bodyWeight]) => ({ date, bodyWeight }));

  // 7日移動平均の算出
  const maRecords = calculate7DayMovingAverage(weightTimeline);
  const maMap = new Map(maRecords.map((r) => [r.date, r.ma7]));

  // 全日付セットの統合
  const allDates = new Set();
  workouts.forEach((w) => allDates.add(w.date));
  state.weightLogs.forEach((l) => allDates.add(l.date));

  /** @type {Array<{ date: string, weight: number | null, ma7: number | null, max1rm: number | null }>} */
  const points = [];
  const sortedDates = Array.from(allDates).sort();

  sortedDates.forEach((d) => {
    const matchWorkouts = workouts.filter((w) => w.date === d);
    const matchSets = matchWorkouts.flatMap((w) => w.sets.filter((s) => s.exerciseName === selectedExercise));
    const max1rm = matchSets.length > 0 ? Math.max(...matchSets.map((s) => s.estimated1rm)) : null;
    const bodyWeight = weightMap.get(/** @type {string} */ (d)) || null;
    const ma7 = maMap.get(/** @type {string} */ (d)) || null;

    if (max1rm !== null || bodyWeight !== null) {
      points.push({
        date: String(d).slice(5), // "MM-DD"
        weight: bodyWeight,
        ma7,
        max1rm,
      });
    }
  });

  if (points.length < 2) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('グラフ表示には、この種目または体重の記録が2件以上必要です。', width / 2, height / 2);
    return;
  }

  // マージン
  const paddingLeft = 50;
  const paddingRight = 50;
  const paddingTop = 30;
  const paddingBottom = 40;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  // 左軸 (体重 / MA) の最小・最大
  const allWeights = points
    .flatMap((p) => [p.weight, p.ma7])
    .filter(/** @type {(v: any) => v is number} */ (v) => v !== null && v !== undefined);
  const minW = allWeights.length > 0 ? Math.floor(Math.min(...allWeights) - 2) : 60;
  const maxW = allWeights.length > 0 ? Math.ceil(Math.max(...allWeights) + 2) : 80;

  // 右軸 (1RM) の最小・最大
  const max1rms = points.map((p) => p.max1rm).filter(/** @type {(v: any) => v is number} */ (v) => v !== null);
  const minR = max1rms.length > 0 ? Math.floor(Math.min(...max1rms) - 5) : 40;
  const maxR = max1rms.length > 0 ? Math.ceil(Math.max(...max1rms) + 5) : 120;

  // グリッド線の描画
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = paddingTop + (chartH / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();

    // 左Y軸ラベル (体重 kg)
    const valW = Math.round(maxW - ((maxW - minW) / gridSteps) * i);
    ctx.fillStyle = '#06b6d4';
    ctx.font = '11px SF Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${valW}`, paddingLeft - 8, y + 4);

    // 右Y軸ラベル (1RM kg)
    const valR = Math.round(maxR - ((maxR - minR) / gridSteps) * i);
    ctx.fillStyle = '#f97316';
    ctx.textAlign = 'left';
    ctx.fillText(`${valR}`, width - paddingRight + 8, y + 4);
  }

  const stepX = chartW / (points.length - 1);

  // X軸ラベル (日付)
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px SF Mono, monospace';
  ctx.textAlign = 'center';
  points.forEach((p, idx) => {
    const x = paddingLeft + idx * stepX;
    ctx.fillText(p.date, x, height - 12);
  });

  // 1. 実測体重ライン (シアン・透過細線 + ドット)
  const validWeightPoints = points
    .map((p, idx) => {
      if (p.weight === null) return null;
      const x = paddingLeft + idx * stepX;
      const y = paddingTop + chartH * (1 - (p.weight - minW) / (maxW - minW));
      return { x, y, val: p.weight };
    })
    .filter(/** @type {(v: any) => v is { x: number, y: number, val: number }} */ (v) => v !== null);

  if (validWeightPoints.length > 1) {
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    validWeightPoints.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // 実測値のドット
    ctx.fillStyle = '#06b6d4';
    validWeightPoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 2. 7日間移動平均線 (スカイブルー・破線太線)
  const validMaPoints = points
    .map((p, idx) => {
      if (p.ma7 === null) return null;
      const x = paddingLeft + idx * stepX;
      const y = paddingTop + chartH * (1 - (p.ma7 - minW) / (maxW - minW));
      return { x, y, val: p.ma7 };
    })
    .filter(/** @type {(v: any) => v is { x: number, y: number, val: number }} */ (v) => v !== null);

  if (validMaPoints.length > 1) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    validMaPoints.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.setLineDash([]); // リセット
  }

  // 3. 推定1RMライン (オレンジ)
  const valid1rmPoints = points
    .map((p, idx) => {
      if (p.max1rm === null) return null;
      const x = paddingLeft + idx * stepX;
      const y = paddingTop + chartH * (1 - (p.max1rm - minR) / (maxR - minR));
      return { x, y, val: p.max1rm };
    })
    .filter(/** @type {(v: any) => v is { x: number, y: number, val: number }} */ (v) => v !== null);

  if (valid1rmPoints.length > 1) {
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 3;
    ctx.beginPath();
    valid1rmPoints.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // 点を描画
    ctx.fillStyle = '#f97316';
    valid1rmPoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}


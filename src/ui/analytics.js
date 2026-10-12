// @ts-check
/**
 * 分析・ダッシュボード UI モジュール
 * - 体重 vs 推定1RM オーバーレイチャート (HTML5 Canvas)
 * - コンディション警告アラート＆相関インサイト
 * - 漸進性過負荷（オーバーロード）サジェスト
 * - ワークアウト履歴タイムライン
 */

import { analyzeConditionInsights, calculateSessionVolume, suggestProgressiveOverload } from '../calc.js';
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
  const workouts = state.workouts;
  const insights = analyzeConditionInsights(workouts);
  const exerciseTemplates = state.exerciseTemplates;

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
    <!-- チャートセクション -->
    <section class="card chart-card">
      <div class="card-header-flex">
        <div>
          <h3 class="card-title">📈 体重推移 vs 推定1RM</h3>
          <span class="text-muted text-sm">減量/増量幅と筋出力（推定MAX）の相関を追跡</span>
        </div>
        <select id="chart-exercise-select" class="input input-sm">
          ${exerciseNames.map((ex) => `<option value="${escapeHtml(ex)}" ${ex === selectedExercise ? 'selected' : ''}>${escapeHtml(ex)}</option>`).join('')}
        </select>
      </div>

      <div class="chart-legend">
        <span class="legend-item text-cyan">● 体重 (kg / 左軸)</span>
        <span class="legend-item text-orange">● 推定1RM (kg / 右軸)</span>
      </div>

      <div class="canvas-container">
        <canvas id="analytics-canvas" width="800" height="340"></canvas>
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

    <!-- ワークアウト履歴タイムライン -->
    <section class="card history-timeline-card">
      <h3 class="card-title">📜 ワークアウト履歴 (${workouts.length})</h3>
      ${
        workouts.length === 0
          ? `<p class="empty-hint text-center text-muted">まだ完了したセッションはありません。</p>`
          : `
          <div class="history-list">
            ${workouts
              .map((w) => {
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
                      <span class="font-mono text-cyan">${vol.toLocaleString()} kg</span>
                    </div>
                  </div>
                  <div class="history-session-details">
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
 * Canvas による高解像度オーバーレイグラフの描画
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

  // ワークアウトデータを古い順（時系列）にソート
  const workouts = [...storeInstance.getState().workouts].sort(
    (a, b) => Date.parse(a.date) - Date.parse(b.date),
  );

  // データポイントの抽出 (日付, 体重, 指定種目の最高1RM)
  /** @type {Array<{ date: string, weight: number | null, max1rm: number | null }>} */
  const points = [];

  workouts.forEach((w) => {
    const matchSets = w.sets.filter((s) => s.exerciseName === selectedExercise);
    const max1rm = matchSets.length > 0 ? Math.max(...matchSets.map((s) => s.estimated1rm)) : null;
    const bodyWeight = w.bodyWeight || null;

    if (max1rm !== null || bodyWeight !== null) {
      points.push({
        date: w.date.slice(5), // "MM-DD"
        weight: bodyWeight,
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

  // 左軸 (体重) の最小・最大
  const weights = points.map((p) => p.weight).filter(/** @type {(v: any) => v is number} */ (v) => v !== null);
  const minW = weights.length > 0 ? Math.floor(Math.min(...weights) - 2) : 60;
  const maxW = weights.length > 0 ? Math.ceil(Math.max(...weights) + 2) : 80;

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

  // 1. 体重ライン (シアン)
  const validWeightPoints = points
    .map((p, idx) => {
      if (p.weight === null) return null;
      const x = paddingLeft + idx * stepX;
      const y = paddingTop + chartH * (1 - (p.weight - minW) / (maxW - minW));
      return { x, y, val: p.weight };
    })
    .filter(/** @type {(v: any) => v is { x: number, y: number, val: number }} */ (v) => v !== null);

  if (validWeightPoints.length > 1) {
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    validWeightPoints.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // 点を描画
    ctx.fillStyle = '#06b6d4';
    validWeightPoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 2. 推定1RMライン (オレンジ)
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

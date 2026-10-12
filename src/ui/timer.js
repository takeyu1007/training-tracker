// @ts-check
/**
 * スマートインターバルタイマー
 * - セット種別に応じた既定秒数サジェスト
 * - フローティングミニタイマーバー（タブを移動しても常駐表示）
 * - モーダル表示での秒数調整・円形プログレス
 * - Web Audio API 音響通知
 */

import { formatDurationMMSS } from '../format.js';
import { playCountdownTick, playTimerCompleteSound } from '../sound.js';
import { showToast } from './toast.js';

let totalDuration = 120;
let remainingSeconds = 0;
/** @type {any} */
let intervalId = null;
let isPaused = false;
let currentLabel = 'MAINセット休憩';

/** @type {HTMLElement | null} */
let miniBarEl = null;
/** @type {HTMLElement | null} */
let modalEl = null;

export function initTimerUI() {
  miniBarEl = document.getElementById('timer-mini-bar');
  modalEl = document.getElementById('timer-modal');

  // Mini bar click opens modal
  if (miniBarEl) {
    miniBarEl.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('.timer-mini-stop')) {
        stopTimer();
        return;
      }
      openTimerModal();
    });
  }

  // Modal close
  const closeBtn = document.getElementById('timer-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeTimerModal);
  }

  // Modal action buttons
  document.getElementById('timer-btn-pause')?.addEventListener('click', togglePause);
  document.getElementById('timer-btn-plus30')?.addEventListener('click', () => addSeconds(30));
  document.getElementById('timer-btn-minus30')?.addEventListener('click', () => addSeconds(-30));
  document.getElementById('timer-btn-stop')?.addEventListener('click', () => {
    stopTimer();
    closeTimerModal();
  });

  // Preset chip buttons in modal
  document.querySelectorAll('.timer-preset-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sec = Number(btn.getAttribute('data-seconds')) || 60;
      startTimer(sec, `${sec}秒 インターバル`);
    });
  });
}

/**
 * タイマーを開始
 * @param {number} seconds
 * @param {string} [label]
 */
export function startTimer(seconds, label = 'インターバル') {
  stopTimer();

  totalDuration = Math.max(5, seconds);
  remainingSeconds = totalDuration;
  currentLabel = label;
  isPaused = false;

  updateDisplay();
  showMiniBar();

  intervalId = setInterval(() => {
    if (isPaused) return;

    remainingSeconds -= 1;
    updateDisplay();

    // ラスト3秒でカウントダウン音
    if (remainingSeconds > 0 && remainingSeconds <= 3) {
      playCountdownTick();
    }

    if (remainingSeconds <= 0) {
      stopTimer();
      playTimerCompleteSound();
      showToast('🔔 インターバル終了！次のセットへGO！', 'success', 5000);
      closeTimerModal();
    }
  }, 1000);
}

export function stopTimer() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  remainingSeconds = 0;
  isPaused = false;
  hideMiniBar();
  updateDisplay();
}

export function togglePause() {
  if (remainingSeconds <= 0) return;
  isPaused = !isPaused;
  const pauseBtn = document.getElementById('timer-btn-pause');
  if (pauseBtn) {
    pauseBtn.textContent = isPaused ? '▶ 再開' : '⏸ 一時停止';
  }
  if (miniBarEl) {
    miniBarEl.classList.toggle('timer-paused', isPaused);
  }
}

/** @param {number} delta */
export function addSeconds(delta) {
  remainingSeconds = Math.max(5, remainingSeconds + delta);
  if (remainingSeconds > totalDuration) {
    totalDuration = remainingSeconds;
  }
  updateDisplay();
}

export function openTimerModal() {
  if (modalEl) {
    modalEl.classList.add('is-active');
  }
}

export function closeTimerModal() {
  if (modalEl) {
    modalEl.classList.remove('is-active');
  }
}

function showMiniBar() {
  if (miniBarEl) {
    miniBarEl.classList.add('is-active');
  }
}

function hideMiniBar() {
  if (miniBarEl) {
    miniBarEl.classList.remove('is-active');
  }
}

function updateDisplay() {
  const timeText = formatDurationMMSS(remainingSeconds);
  const progressRatio = totalDuration > 0 ? (totalDuration - remainingSeconds) / totalDuration : 0;
  const percent = Math.min(100, Math.max(0, Math.round(progressRatio * 100)));

  // Mini bar
  const miniTime = document.getElementById('timer-mini-time');
  const miniLabel = document.getElementById('timer-mini-label');
  const miniProgress = document.getElementById('timer-mini-progress');

  if (miniTime) miniTime.textContent = timeText;
  if (miniLabel) miniLabel.textContent = currentLabel;
  if (miniProgress) miniProgress.style.width = `${percent}%`;

  // Modal
  const modalTime = document.getElementById('timer-modal-time');
  const modalLabel = document.getElementById('timer-modal-label');
  const modalCircle = document.getElementById('timer-progress-circle');

  if (modalTime) modalTime.textContent = timeText;
  if (modalLabel) modalLabel.textContent = currentLabel;

  if (modalCircle) {
    // Circumference = 2 * PI * 90 = ~565.48
    const circumference = 565.48;
    const offset = circumference * (1 - remainingSeconds / totalDuration);
    modalCircle.style.strokeDashoffset = String(offset);
  }
}

// @ts-check
/**
 * Web Audio API によるシンセ音（外部音声ファイル依存ゼロ）。
 * タイマー完了、カウントダウン、セット記録完了時の音響フィードバック。
 */

/** @type {AudioContext | null} */
let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * 簡易ビープ音の再生
 * @param {number} freq 周波数 (Hz)
 * @param {number} duration 秒
 * @param {'sine' | 'square' | 'triangle'} [type]
 * @param {number} [gainValue] 音量
 */
function playTone(freq, duration, type = 'sine', gainValue = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // 音声再生エラーは無視
  }
}

/** カウントダウンのピピピ音 */
export function playCountdownTick() {
  playTone(880, 0.08, 'sine', 0.12);
}

/** タイマー終了時のファンファーレ／アラーム音 */
export function playTimerCompleteSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    setTimeout(() => {
      playTone(freq, 0.25, 'triangle', 0.2);
    }, idx * 110);
  });

  // Haptic feedback (モバイル端末)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([150, 80, 200]);
    } catch {
      // ignore
    }
  }
}

/** セット記録時の心地よいタップ音 */
export function playSuccessChime() {
  playTone(587.33, 0.12, 'sine', 0.1);
  setTimeout(() => {
    playTone(880, 0.18, 'sine', 0.15);
  }, 90);

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(40);
    } catch {
      // ignore
    }
  }
}

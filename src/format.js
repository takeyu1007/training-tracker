// @ts-check
/**
 * 表示用フォーマッタ（SPEC.md および セキュリティ対策）。
 * DOM非依存。
 */

/**
 * XSS 防止のための HTML エスケープ
 * @param {string | number | null | undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 日付フォーマット（例: "2026/10/12 (月)"）
 * @param {string | Date} dateInput
 * @returns {string}
 */
export function formatDate(dateInput) {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const w = weekdays[d.getDay()];
  return `${y}/${m}/${day} (${w})`;
}

/**
 * 時間フォーマット（例: "18:30"）
 * @param {string | Date} dateInput
 * @returns {string}
 */
export function formatTime(dateInput) {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * 秒数を "MM:SS" または "X分Y秒" にフォーマット
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatDurationMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 重量フォーマット（整数ならそのまま、小数なら第1位まで）
 * @param {number} weight
 * @returns {string}
 */
export function formatWeight(weight) {
  const num = Number(weight) || 0;
  return Number.isInteger(num) ? `${num} kg` : `${num.toFixed(1)} kg`;
}

/**
 * カロリーフォーマット（カンマ区切り）
 * @param {number} kcal
 * @returns {string}
 */
export function formatCalories(kcal) {
  const num = Math.round(Number(kcal) || 0);
  return `${num.toLocaleString()} kcal`;
}

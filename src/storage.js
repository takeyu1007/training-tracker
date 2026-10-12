// @ts-check
/**
 * localStorage への保存・読み込み・スキーマ移行。
 *
 * ルール:
 * - 保存形式を変えたら SCHEMA_VERSION を上げ、migrate() に「旧 → 新」の変換を追加する。
 * - 読み込めないデータは絶対に黙って捨てない。退避キーに生データを保存してから初期化する。
 */

import { createProfile, DEFAULT_EXERCISES, DEFAULT_SUPPLEMENTS, newId } from './model.js';

export const STORAGE_KEY = 'trainingTracker.data';
export const BACKUP_KEY_PREFIX = 'trainingTracker.backup.';
export const SCHEMA_VERSION = 1;

/**
 * @typedef {Pick<Storage, 'getItem' | 'setItem'>} StorageLike
 */

/** @returns {import('./model.js').AppData} */
export function emptyData() {
  return {
    version: SCHEMA_VERSION,
    profile: createProfile(),
    workouts: [],
    dailyNutrition: [],
    routines: [
      {
        id: newId(),
        name: 'いつものホエイプロテイン (1杯)',
        p: 24,
        f: 2,
        c: 3,
        isSupplement: false,
      },
      {
        id: newId(),
        name: 'トレ前バナナ＆エネルギー',
        p: 1,
        f: 0,
        c: 30,
        isSupplement: false,
      },
      {
        id: newId(),
        name: 'クレアチン (5g)',
        p: 0,
        f: 0,
        c: 0,
        isSupplement: true,
      },
      {
        id: newId(),
        name: 'マルチビタミン',
        p: 0,
        f: 0,
        c: 0,
        isSupplement: true,
      },
    ],
    exerciseTemplates: [...DEFAULT_EXERCISES],
  };
}

/**
 * 生データ退避（データ消失防止）。
 * @param {StorageLike} storage
 * @param {string} raw
 * @param {Date} [now]
 * @returns {string} 退避先キー
 */
function backupRaw(storage, raw, now = new Date()) {
  const key = `${BACKUP_KEY_PREFIX}${now.toISOString()}`;
  try {
    storage.setItem(key, raw);
  } catch {
    // 容量不足時も安全にスルー
  }
  return key;
}

/**
 * @param {any} p
 * @returns {import('./model.js').UserProfile}
 */
function normalizeProfile(p) {
  return createProfile(p || {});
}

/**
 * @param {any} w
 * @returns {import('./model.js').WorkoutSession | null}
 */
function normalizeWorkout(w) {
  if (!w || typeof w !== 'object' || typeof w.id !== 'string') return null;
  return {
    id: w.id,
    date: typeof w.date === 'string' ? w.date : new Date().toISOString().slice(0, 10),
    startTime: typeof w.startTime === 'string' ? w.startTime : new Date().toISOString(),
    endTime: typeof w.endTime === 'string' ? w.endTime : null,
    bodyWeight: w.bodyWeight !== undefined && w.bodyWeight !== null ? Number(w.bodyWeight) : null,
    sleepCategory: ['<5h', '5-6h', '6-7h', '7h+'].includes(w.sleepCategory) ? w.sleepCategory : '6-7h',
    preWorkoutCarb: Boolean(w.preWorkoutCarb),
    conditionScore: Number(w.conditionScore) >= 1 && Number(w.conditionScore) <= 5 ? Number(w.conditionScore) : 4,
    sets: Array.isArray(w.sets)
      ? w.sets
          .filter(/** @param {any} s */ (s) => s && typeof s === 'object' && typeof s.exerciseName === 'string')
          .map(/** @param {any} s */ (s) => ({
            id: typeof s.id === 'string' ? s.id : newId(),
            exerciseName: s.exerciseName.trim(),
            weight: Number(s.weight) || 0,
            reps: Number(s.reps) || 1,
            setType: ['UP', 'MAIN', 'HEAVY', 'DOWN'].includes(s.setType) ? s.setType : 'MAIN',
            estimated1rm: Number(s.estimated1rm) || 0,
            completedAt: typeof s.completedAt === 'string' ? s.completedAt : new Date().toISOString(),
          }))
      : [],
    notes: typeof w.notes === 'string' ? w.notes : '',
  };
}

/**
 * @param {any} n
 * @returns {import('./model.js').DailyNutrition | null}
 */
function normalizeDailyNutrition(n) {
  if (!n || typeof n !== 'object' || typeof n.date !== 'string') return null;
  return {
    id: typeof n.id === 'string' ? n.id : newId(),
    date: n.date,
    totalP: Number(n.totalP) || 0,
    totalF: Number(n.totalF) || 0,
    totalC: Number(n.totalC) || 0,
    completedSupplements: Array.isArray(n.completedSupplements)
      ? n.completedSupplements.filter(/** @param {any} s */ (s) => typeof s === 'string')
      : [],
    logs: Array.isArray(n.logs)
      ? n.logs
          .filter(/** @param {any} l */ (l) => l && typeof l === 'object')
          .map(/** @param {any} l */ (l) => ({
            id: typeof l.id === 'string' ? l.id : newId(),
            name: typeof l.name === 'string' ? l.name : '',
            p: Number(l.p) || 0,
            f: Number(l.f) || 0,
            c: Number(l.c) || 0,
            loggedAt: typeof l.loggedAt === 'string' ? l.loggedAt : new Date().toISOString(),
          }))
      : [],
  };
}

/**
 * @param {any} r
 * @returns {import('./model.js').RoutineItem | null}
 */
function normalizeRoutine(r) {
  if (!r || typeof r !== 'object' || typeof r.name !== 'string') return null;
  return {
    id: typeof r.id === 'string' ? r.id : newId(),
    name: r.name.trim(),
    p: Math.max(0, Number(r.p) || 0),
    f: Math.max(0, Number(r.f) || 0),
    c: Math.max(0, Number(r.c) || 0),
    isSupplement: Boolean(r.isSupplement),
  };
}

/**
 * 任意バージョンの保存データを現行スキーマへ変換する。
 * @param {any} raw
 * @returns {import('./model.js').AppData}
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number') {
    throw new Error('invalid data shape');
  }
  if (raw.version > SCHEMA_VERSION) {
    throw new Error(`unsupported future version: ${raw.version}`);
  }

  const data = raw;
  return {
    version: SCHEMA_VERSION,
    profile: normalizeProfile(data.profile),
    workouts: (Array.isArray(data.workouts) ? data.workouts : [])
      .map(normalizeWorkout)
      .filter(/** @param {import('./model.js').WorkoutSession | null} w @returns {w is import('./model.js').WorkoutSession} */ (w) => w !== null),
    dailyNutrition: (Array.isArray(data.dailyNutrition) ? data.dailyNutrition : [])
      .map(normalizeDailyNutrition)
      .filter(/** @param {import('./model.js').DailyNutrition | null} n @returns {n is import('./model.js').DailyNutrition} */ (n) => n !== null),
    routines: (Array.isArray(data.routines) ? data.routines : [])
      .map(normalizeRoutine)
      .filter(/** @param {import('./model.js').RoutineItem | null} r @returns {r is import('./model.js').RoutineItem} */ (r) => r !== null),
    exerciseTemplates: Array.isArray(data.exerciseTemplates) && data.exerciseTemplates.length > 0
      ? data.exerciseTemplates.filter(/** @param {any} e */ (e) => typeof e === 'string' && e.trim().length > 0)
      : [...DEFAULT_EXERCISES],
  };
}

/**
 * @typedef {Object} LoadResult
 * @property {import('./model.js').AppData} data
 * @property {string | null} recoveredBackupKey
 */

/**
 * @param {StorageLike} storage
 * @returns {LoadResult}
 */
export function load(storage) {
  /** @type {string | null} */
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { data: emptyData(), recoveredBackupKey: null };
  }
  if (raw === null) return { data: emptyData(), recoveredBackupKey: null };

  try {
    return { data: migrate(JSON.parse(raw)), recoveredBackupKey: null };
  } catch {
    const key = backupRaw(storage, raw);
    return { data: emptyData(), recoveredBackupKey: key };
  }
}

/**
 * @param {StorageLike} storage
 * @param {import('./model.js').AppData} data
 * @returns {boolean}
 */
export function save(storage, data) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: SCHEMA_VERSION }));
    return true;
  } catch {
    return false;
  }
}

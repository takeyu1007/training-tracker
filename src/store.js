// @ts-check
/**
 * アプリ状態の管理。
 * 状態変更は必ずこのモジュールの関数経由で行い、変更のたびに自動保存する。
 * UI は subscribe() で変更通知を受け取って再描画する。
 */

import {
  createWorkoutSession,
  createWorkoutSet,
  createDailyNutrition,
  createRoutineItem,
  newId,
} from './model.js';
import { calculate1RM } from './calc.js';
import { load, save, emptyData } from './storage.js';

/** @typedef {import('./model.js').AppData} AppData */
/** @typedef {import('./model.js').WorkoutSession} WorkoutSession */
/** @typedef {import('./model.js').WorkoutSet} WorkoutSet */
/** @typedef {import('./model.js').DailyNutrition} DailyNutrition */
/** @typedef {import('./model.js').UserProfile} UserProfile */
/** @typedef {import('./storage.js').StorageLike} StorageLike */

/**
 * @param {StorageLike} storage
 * @param {{ now?: () => Date }} [options]
 */
export function createStore(storage, options = {}) {
  const now = options.now ?? (() => new Date());
  const loaded = load(storage);
  /** @type {AppData} */
  let state = loaded.data;
  /** @type {Set<(state: AppData) => void>} */
  const listeners = new Set();
  /** @type {Set<() => void>} */
  const saveErrorListeners = new Set();

  function commit() {
    if (!save(storage, state)) {
      saveErrorListeners.forEach((fn) => fn());
    }
    listeners.forEach((fn) => fn(state));
  }

  return {
    /** 破損データ退避キー（存在すれば起動時通知に使用） */
    recoveredBackupKey: loaded.recoveredBackupKey,

    /** @returns {AppData} */
    getState: () => state,

    /**
     * @param {(state: AppData) => void} fn
     * @returns {() => void} 購読解除関数
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** @param {() => void} fn */
    onSaveError(fn) {
      saveErrorListeners.add(fn);
    },

    // --- プロファイル ---
    /** @param {Partial<UserProfile>} patch */
    updateProfile(patch) {
      state = {
        ...state,
        profile: {
          ...state.profile,
          ...patch,
          name: patch.name !== undefined ? patch.name.trim() : state.profile.name,
        },
      };
      commit();
    },

    // --- ワークアウト ---
    /**
     * @param {Partial<WorkoutSession>} input
     * @returns {WorkoutSession}
     */
    addWorkout(input) {
      const session = createWorkoutSession(input, now());
      state = {
        ...state,
        workouts: [session, ...state.workouts],
      };
      commit();
      return session;
    },

    /**
     * @param {string} id
     * @param {Partial<WorkoutSession>} patch
     */
    updateWorkout(id, patch) {
      state = {
        ...state,
        workouts: state.workouts.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      };
      commit();
    },

    /** @param {string} id */
    deleteWorkout(id) {
      state = {
        ...state,
        workouts: state.workouts.filter((w) => w.id !== id),
      };
      commit();
    },

    /**
     * @param {string} workoutId
     * @param {string} [endTime]
     */
    finishWorkout(workoutId, endTime) {
      const endIso = endTime || now().toISOString();
      state = {
        ...state,
        workouts: state.workouts.map((w) => (w.id === workoutId ? { ...w, endTime: endIso } : w)),
      };
      commit();
    },

    /**
     * ワークアウトにセットを追加（推定1RMは自動計算）
     * @param {string} workoutId
     * @param {Partial<WorkoutSet> & { exerciseName: string, weight: number, reps: number }} setInput
     * @returns {WorkoutSet | undefined}
     */
    addSetToWorkout(workoutId, setInput) {
      const workout = state.workouts.find((w) => w.id === workoutId);
      if (!workout) return undefined;

      const est1rm = calculate1RM(setInput.weight, setInput.reps);
      const set = createWorkoutSet(setInput, est1rm);

      state = {
        ...state,
        workouts: state.workouts.map((w) =>
          w.id === workoutId ? { ...w, sets: [...w.sets, set] } : w,
        ),
      };
      commit();
      return set;
    },

    /**
     * @param {string} workoutId
     * @param {string} setId
     */
    deleteSetFromWorkout(workoutId, setId) {
      state = {
        ...state,
        workouts: state.workouts.map((w) =>
          w.id === workoutId ? { ...w, sets: w.sets.filter((s) => s.id !== setId) } : w,
        ),
      };
      commit();
    },

    /**
     * 指定種目の前回記録（重量、回数、セット種別）を取得する（クイック初期値用）
     * @param {string} exerciseName
     * @returns {WorkoutSet | null}
     */
    getPreviousSetValues(exerciseName) {
      if (!exerciseName) return null;
      // 過去のセッションから最新のセットを逆順探索
      for (const w of state.workouts) {
        for (let i = w.sets.length - 1; i >= 0; i--) {
          const s = w.sets[i];
          if (s.exerciseName.trim().toLowerCase() === exerciseName.trim().toLowerCase()) {
            return s;
          }
        }
      }
      return null;
    },

    // --- PFC・栄養管理 ---
    /**
     * 当日または指定日の栄養データを取得（無ければ作成）
     * @param {string} [dateStr] YYYY-MM-DD
     * @returns {DailyNutrition}
     */
    getOrCreateDailyNutrition(dateStr) {
      const d = dateStr || now().toISOString().slice(0, 10);
      let found = state.dailyNutrition.find((n) => n.date === d);
      if (!found) {
        found = createDailyNutrition(d);
        state = {
          ...state,
          dailyNutrition: [found, ...state.dailyNutrition],
        };
        commit();
      }
      return found;
    },

    /**
     * 栄養ログを追加し合計値を更新
     * @param {string} dateStr
     * @param {{ name: string, p: number, f: number, c: number }} input
     */
    addNutritionLog(dateStr, input) {
      const d = dateStr || now().toISOString().slice(0, 10);
      const current = this.getOrCreateDailyNutrition(d);
      const logItem = {
        id: newId(),
        name: input.name.trim() || 'クイック入力',
        p: Math.max(0, Number(input.p) || 0),
        f: Math.max(0, Number(input.f) || 0),
        c: Math.max(0, Number(input.c) || 0),
        loggedAt: now().toISOString(),
      };

      const newLogs = [...current.logs, logItem];
      const newTotalP = newLogs.reduce((acc, item) => acc + item.p, 0);
      const newTotalF = newLogs.reduce((acc, item) => acc + item.f, 0);
      const newTotalC = newLogs.reduce((acc, item) => acc + item.c, 0);

      state = {
        ...state,
        dailyNutrition: state.dailyNutrition.map((n) =>
          n.date === d
            ? {
                ...n,
                logs: newLogs,
                totalP: Math.round(newTotalP * 10) / 10,
                totalF: Math.round(newTotalF * 10) / 10,
                totalC: Math.round(newTotalC * 10) / 10,
              }
            : n,
        ),
      };
      commit();
      return logItem;
    },

    /**
     * 栄養ログの削除
     * @param {string} dateStr
     * @param {string} logId
     */
    deleteNutritionLog(dateStr, logId) {
      const target = state.dailyNutrition.find((n) => n.date === dateStr);
      if (!target) return;

      const newLogs = target.logs.filter((l) => l.id !== logId);
      const newTotalP = newLogs.reduce((acc, item) => acc + item.p, 0);
      const newTotalF = newLogs.reduce((acc, item) => acc + item.f, 0);
      const newTotalC = newLogs.reduce((acc, item) => acc + item.c, 0);

      state = {
        ...state,
        dailyNutrition: state.dailyNutrition.map((n) =>
          n.date === dateStr
            ? {
                ...n,
                logs: newLogs,
                totalP: Math.round(newTotalP * 10) / 10,
                totalF: Math.round(newTotalF * 10) / 10,
                totalC: Math.round(newTotalC * 10) / 10,
              }
            : n,
        ),
      };
      commit();
    },

    /**
     * サプリ摂取完了チェックのトグル
     * @param {string} dateStr
     * @param {string} supplementName
     */
    toggleDailySupplement(dateStr, supplementName) {
      const d = dateStr || now().toISOString().slice(0, 10);
      const current = this.getOrCreateDailyNutrition(d);
      const exists = current.completedSupplements.includes(supplementName);
      const next = exists
        ? current.completedSupplements.filter((s) => s !== supplementName)
        : [...current.completedSupplements, supplementName];

      state = {
        ...state,
        dailyNutrition: state.dailyNutrition.map((n) =>
          n.date === d ? { ...n, completedSupplements: next } : n,
        ),
      };
      commit();
    },

    // --- マイルーティン設定 ---
    /**
     * @param {Partial<import('./model.js').RoutineItem> & { name: string }} input
     */
    addRoutine(input) {
      const routine = createRoutineItem(input);
      state = {
        ...state,
        routines: [...state.routines, routine],
      };
      commit();
      return routine;
    },

    /**
     * @param {string} id
     * @param {Partial<import('./model.js').RoutineItem>} patch
     */
    updateRoutine(id, patch) {
      state = {
        ...state,
        routines: state.routines.map((r) =>
          r.id === id
            ? {
                ...r,
                ...patch,
                name: patch.name !== undefined ? patch.name.trim() : r.name,
              }
            : r,
        ),
      };
      commit();
    },

    /** @param {string} id */
    deleteRoutine(id) {
      state = {
        ...state,
        routines: state.routines.filter((r) => r.id !== id),
      };
      commit();
    },

    // --- 種目マスター ---
    /** @param {string} name */
    addExerciseTemplate(name) {
      const clean = name.trim();
      if (!clean || state.exerciseTemplates.includes(clean)) return false;
      state = {
        ...state,
        exerciseTemplates: [...state.exerciseTemplates, clean],
      };
      commit();
      return true;
    },

    /** @param {string} name */
    deleteExerciseTemplate(name) {
      if (!state.exerciseTemplates.includes(name)) return false;
      state = {
        ...state,
        exerciseTemplates: state.exerciseTemplates.filter((e) => e !== name),
      };
      commit();
      return true;
    },

    // --- 永続化・バックアップ ---
    reloadFromStorage() {
      state = load(storage).data;
      listeners.forEach((fn) => fn(state));
    },

    /** @param {string} jsonString */
    importData(jsonString) {
      try {
        const dummy = {
          getItem: () => jsonString,
          setItem: () => {},
        };
        const loadedResult = load(dummy);
        state = loadedResult.data;
        commit();
        return true;
      } catch {
        return false;
      }
    },

    exportData() {
      return JSON.stringify(state, null, 2);
    },

    resetAll() {
      state = emptyData();
      commit();
    },
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */

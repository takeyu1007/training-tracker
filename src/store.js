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
  createExerciseTemplate,
  newId,
} from './model.js';
import { calculate1RM } from './calc.js';
import { load, save, emptyData } from './storage.js';

/** @typedef {import('./model.js').AppData} AppData */
/** @typedef {import('./model.js').WorkoutSession} WorkoutSession */
/** @typedef {import('./model.js').WorkoutSet} WorkoutSet */
/** @typedef {import('./model.js').DailyNutrition} DailyNutrition */
/** @typedef {import('./model.js').UserProfile} UserProfile */
/** @typedef {import('./model.js').ExerciseTemplate} ExerciseTemplate */
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
     * ワークアウトに1セットを追加
     * @param {string} workoutId
     * @param {Partial<WorkoutSet> & { exerciseName: string, weight: number, reps: number }} setInput
     * @returns {WorkoutSet | undefined}
     */
    addSetToWorkout(workoutId, setInput) {
      const workout = state.workouts.find((w) => w.id === workoutId);
      if (!workout) return undefined;

      const isCompleted = setInput.isCompleted !== undefined ? setInput.isCompleted : true;
      const est1rm = isCompleted ? calculate1RM(setInput.weight, setInput.reps) : 0;
      const set = createWorkoutSet({ ...setInput, isCompleted }, est1rm);

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
     * 予定セットを一括追加（予実管理用: 例 ベンチ70kg*10回*3セットを一括登録）
     * @param {string} workoutId
     * @param {{ exerciseName: string, weight: number, reps: number, count: number, setType?: import('./model.js').SetType }} input
     * @returns {WorkoutSet[]} 追加されたセット一覧
     */
    addPlannedSets(workoutId, input) {
      const workout = state.workouts.find((w) => w.id === workoutId);
      if (!workout) return [];

      const count = Math.max(1, Math.min(20, Math.round(Number(input.count) || 1)));
      const weight = Math.max(0, Number(input.weight) || 0);
      const reps = Math.max(1, Math.round(Number(input.reps) || 1));
      const setType = input.setType || 'MAIN';

      /** @type {WorkoutSet[]} */
      const newSets = [];
      for (let i = 0; i < count; i++) {
        newSets.push(
          createWorkoutSet({
            exerciseName: input.exerciseName,
            weight,
            reps,
            targetWeight: weight,
            targetReps: reps,
            setType,
            isCompleted: false,
          }, 0),
        );
      }

      state = {
        ...state,
        workouts: state.workouts.map((w) =>
          w.id === workoutId ? { ...w, sets: [...w.sets, ...newSets] } : w,
        ),
      };
      commit();
      return newSets;
    },

    /**
     * 予定セットの実績完了（重量・回数の実測値を受け取り完了化）
     * @param {string} workoutId
     * @param {string} setId
     * @param {number} [actualWeight]
     * @param {number} [actualReps]
     * @returns {WorkoutSet | undefined}
     */
    completeSet(workoutId, setId, actualWeight, actualReps) {
      const workout = state.workouts.find((w) => w.id === workoutId);
      if (!workout) return undefined;

      let completedSet;
      const updatedSets = workout.sets.map((s) => {
        if (s.id !== setId) return s;
        const finalWeight = actualWeight !== undefined ? Math.max(0, Number(actualWeight)) : s.weight;
        const finalReps = actualReps !== undefined ? Math.max(1, Math.round(Number(actualReps))) : s.reps;
        const est1rm = calculate1RM(finalWeight, finalReps);

        completedSet = {
          ...s,
          weight: finalWeight,
          reps: finalReps,
          estimated1rm: est1rm,
          isCompleted: true,
          completedAt: now().toISOString(),
        };
        return completedSet;
      });

      state = {
        ...state,
        workouts: state.workouts.map((w) => (w.id === workoutId ? { ...w, sets: updatedSets } : w)),
      };
      commit();
      return completedSet;
    },

    /**
     * 完了セットを未完了（予定）に戻す
     * @param {string} workoutId
     * @param {string} setId
     */
    uncompleteSet(workoutId, setId) {
      const workout = state.workouts.find((w) => w.id === workoutId);
      if (!workout) return;

      const updatedSets = workout.sets.map((s) => {
        if (s.id !== setId) return s;
        return {
          ...s,
          isCompleted: false,
          estimated1rm: 0,
          completedAt: '',
        };
      });

      state = {
        ...state,
        workouts: state.workouts.map((w) => (w.id === workoutId ? { ...w, sets: updatedSets } : w)),
      };
      commit();
    },

    /**
     * セットの編集
     * @param {string} workoutId
     * @param {string} setId
     * @param {Partial<WorkoutSet>} patch
     */
    updateSet(workoutId, setId, patch) {
      const workout = state.workouts.find((w) => w.id === workoutId);
      if (!workout) return;

      const updatedSets = workout.sets.map((s) => {
        if (s.id !== setId) return s;
        const w = patch.weight !== undefined ? Number(patch.weight) : s.weight;
        const r = patch.reps !== undefined ? Number(patch.reps) : s.reps;
        const isComp = patch.isCompleted !== undefined ? Boolean(patch.isCompleted) : s.isCompleted;
        const est1rm = isComp ? calculate1RM(w, r) : 0;
        return {
          ...s,
          ...patch,
          weight: w,
          reps: r,
          isCompleted: isComp,
          estimated1rm: est1rm,
        };
      });

      state = {
        ...state,
        workouts: state.workouts.map((w) => (w.id === workoutId ? { ...w, sets: updatedSets } : w)),
      };
      commit();
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
     * 指定種目の前回完了記録（重量、回数、セット種別）を取得する（クイック初期値用）
     * @param {string} exerciseName
     * @returns {WorkoutSet | null}
     */
    getPreviousSetValues(exerciseName) {
      if (!exerciseName) return null;
      for (const w of state.workouts) {
        for (let i = w.sets.length - 1; i >= 0; i--) {
          const s = w.sets[i];
          if (
            s.exerciseName.trim().toLowerCase() === exerciseName.trim().toLowerCase() &&
            s.isCompleted !== false
          ) {
            return s;
          }
        }
      }
      return null;
    },

    // --- 種目マスター（種目別の既定休憩タイマー対応） ---
    /**
     * 種目の取得
     * @param {string} nameOrId
     * @returns {ExerciseTemplate | undefined}
     */
    getExerciseTemplate(nameOrId) {
      const clean = (nameOrId || '').trim().toLowerCase();
      return state.exerciseTemplates.find(
        (e) => e.id === nameOrId || e.name.toLowerCase() === clean,
      );
    },

    /**
     * 種目の追加
     * @param {string} name
     * @param {number} [defaultRestSeconds]
     * @param {import('./model.js').MuscleCategory} [category]
     * @returns {ExerciseTemplate | null}
     */
    addExerciseTemplate(name, defaultRestSeconds = 120, category = 'その他') {
      const clean = name.trim();
      if (!clean) return null;
      const exists = state.exerciseTemplates.some(
        (e) => e.name.toLowerCase() === clean.toLowerCase(),
      );
      if (exists) return null;

      const template = createExerciseTemplate(clean, defaultRestSeconds, category);
      state = {
        ...state,
        exerciseTemplates: [...state.exerciseTemplates, template],
      };
      commit();
      return template;
    },

    /**
     * 種目の更新（休憩時間や名称の変更）
     * @param {string} id
     * @param {Partial<ExerciseTemplate>} patch
     */
    updateExerciseTemplate(id, patch) {
      state = {
        ...state,
        exerciseTemplates: state.exerciseTemplates.map((e) =>
          e.id === id
            ? {
                ...e,
                ...patch,
                name: patch.name !== undefined ? patch.name.trim() : e.name,
                defaultRestSeconds:
                  patch.defaultRestSeconds !== undefined
                    ? Math.max(10, Number(patch.defaultRestSeconds))
                    : e.defaultRestSeconds,
              }
            : e,
        ),
      };
      commit();
    },

    /** @param {string} id */
    deleteExerciseTemplate(id) {
      state = {
        ...state,
        exerciseTemplates: state.exerciseTemplates.filter((e) => e.id !== id),
      };
      commit();
      return true;
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

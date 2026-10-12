// @ts-check
/**
 * データモデル定義（SPEC.md「4. テーブル定義」および PWA 向けスキーマ）。
 * 保存形式を変更する場合は storage.js の SCHEMA_VERSION を上げ、migrate() に変換処理を追加すること。
 */

/** @typedef {'male' | 'female'} Gender */
/** @typedef {'cut' | 'maintain' | 'bulk'} GoalType */
/** @typedef {'sedentary' | 'light' | 'moderate' | 'active'} ActivityLevel */
/** @typedef {'<5h' | '5-6h' | '6-7h' | '7h+'} SleepCategory */
/** @typedef {'UP' | 'MAIN' | 'HEAVY' | 'DOWN'} SetType */
/** @typedef {'胸' | '背中' | '脚' | '肩' | '腕' | '腹' | 'その他'} MuscleCategory */

/**
 * ユーザープロファイル
 * @typedef {Object} UserProfile
 * @property {string} name
 * @property {number} height                 身長 (cm)
 * @property {number} currentWeight          現在体重 (kg)
 * @property {number} [startWeight]          開始時体重 (kg)
 * @property {number} targetWeight           目標体重 (kg)
 * @property {string} targetDate             目標達成予定日 (YYYY-MM-DD)
 * @property {Gender} gender                 性別
 * @property {number} age                    年齢
 * @property {GoalType} goalType             目的（減量 / 維持 / 増量）
 * @property {ActivityLevel} activityLevel   日常の活動レベル
 * @property {number} targetCalories         目標総摂取カロリー (kcal)
 * @property {number} targetP                目標タンパク質 (g)
 * @property {number} targetF                目標脂質 (g)
 * @property {number} targetC                目標炭水化物 (g)
 * @property {string[]} supplements          管理するサプリメント一覧
 * @property {Record<SetType, number>} defaultRestSeconds セット種別ごとの既定インターバル（秒）
 */

/**
 * トレーニングの1セット（予実管理対応）
 * @typedef {Object} WorkoutSet
 * @property {string} id
 * @property {string} exerciseName
 * @property {number} weight                 実績重量 (kg)
 * @property {number} reps                   実績回数
 * @property {SetType} setType               UP / MAIN / HEAVY / DOWN
 * @property {number} estimated1rm           推定1RM (kg)
 * @property {string} completedAt            完了時刻 (ISO 8601)
 * @property {boolean} isCompleted           完了済みかどうか (false: 予定/未実施, true: 実施完了)
 * @property {number} [targetWeight]         予定重量 (kg)
 * @property {number} [targetReps]           予定回数
 */

/**
 * ワークアウトセッション
 * @typedef {Object} WorkoutSession
 * @property {string} id
 * @property {string} date                   実施日 (YYYY-MM-DD)
 * @property {string} startTime              開始日時 (ISO 8601)
 * @property {string | null} endTime         終了日時 (ISO 8601)
 * @property {number | null} bodyWeight      当日の体重 (kg)
 * @property {SleepCategory} sleepCategory   前夜の睡眠時間
 * @property {boolean} preWorkoutCarb        トレ前（1〜2時間前）のエネルギー/糖質補給有無
 * @property {number} conditionScore         主観的コンディション (1〜5)
 * @property {WorkoutSet[]} sets             実施セット一覧
 * @property {string} notes                  メモ・所感
 */

/**
 * 種目マスター（種目別の部位カテゴリおよびセット種別ごとの休憩時間を含む）
 * @typedef {Object} ExerciseTemplate
 * @property {string} id
 * @property {string} name                   種目名
 * @property {MuscleCategory} category       部位カテゴリ
 * @property {number} defaultRestSeconds     この種目の既定休憩時間（秒 / MAINセット相当）
 * @property {Record<SetType, number>} [restSeconds] セット種別ごとの個別休憩時間（秒）
 */

/**
 * 食事・PFC入力履歴レコード
 * @typedef {Object} NutritionLogItem
 * @property {string} id
 * @property {string} name                   品目名（例: "胸肉200g", "いつものプロテイン"）
 * @property {number} p                      タンパク質 (g)
 * @property {number} f                      脂質 (g)
 * @property {number} c                      炭水化物 (g)
 * @property {string} loggedAt               記録時刻 (ISO 8601)
 */

/**
 * 1日の栄養実績
 * @typedef {Object} DailyNutrition
 * @property {string} id
 * @property {string} date                   日付 (YYYY-MM-DD)
 * @property {number} totalP                 当日の合計P (g)
 * @property {number} totalF                 当日の合計F (g)
 * @property {number} totalC                 当日の合計C (g)
 * @property {string[]} completedSupplements 摂取完了したサプリ名リスト
 * @property {NutritionLogItem[]} logs       内訳ログ
 */

/**
 * マイルーティン定義（食事＆サプリのワンタップ登録用）
 * @typedef {Object} RoutineItem
 * @property {string} id
 * @property {string} name                   名称（例: "いつものプロテイン", "クレアチン5g"）
 * @property {number} p
 * @property {number} f
 * @property {number} c
 * @property {boolean} isSupplement          サプリチェック兼用かどうか
 */

/**
 * 保存データ全体 (Schema v3)
 * @typedef {Object} AppData
 * @property {number} version
 * @property {UserProfile} profile
 * @property {WorkoutSession[]} workouts
 * @property {DailyNutrition[]} dailyNutrition
 * @property {RoutineItem[]} routines
 * @property {ExerciseTemplate[]} exerciseTemplates
 */

/** @type {ReadonlyArray<{ name: string, category: MuscleCategory, defaultRestSeconds: number }>} */
export const DEFAULT_EXERCISES = Object.freeze([
  { name: 'ベンチプレス', category: /** @type {MuscleCategory} */ ('胸'), defaultRestSeconds: 150 },
  { name: 'スクワット', category: /** @type {MuscleCategory} */ ('脚'), defaultRestSeconds: 180 },
  { name: 'デッドリフト', category: /** @type {MuscleCategory} */ ('背中'), defaultRestSeconds: 180 },
  { name: 'ショルダープレス', category: /** @type {MuscleCategory} */ ('肩'), defaultRestSeconds: 120 },
  { name: '懸垂 (チンニング)', category: /** @type {MuscleCategory} */ ('背中'), defaultRestSeconds: 120 },
  { name: 'バーベルベントオーバーロー', category: /** @type {MuscleCategory} */ ('背中'), defaultRestSeconds: 120 },
  { name: 'インクラインダンベルプレス', category: /** @type {MuscleCategory} */ ('胸'), defaultRestSeconds: 120 },
  { name: 'ダンベルサイドレイズ', category: /** @type {MuscleCategory} */ ('肩'), defaultRestSeconds: 60 },
  { name: 'アームカール', category: /** @type {MuscleCategory} */ ('腕'), defaultRestSeconds: 60 },
  { name: 'ディップス', category: /** @type {MuscleCategory} */ ('胸'), defaultRestSeconds: 90 },
]);

export const DEFAULT_SUPPLEMENTS = Object.freeze([
  'クレアチン (5g)',
  'マルチビタミン＆ミネラル',
  'EAA / BCAA',
  'オメガ3 (フィッシュオイル)',
  'プロテイン (トレ後)',
]);

/** @returns {string} */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {string} name
 * @param {number} [defaultRestSeconds]
 * @param {MuscleCategory} [category]
 * @param {Partial<Record<SetType, number>>} [restSeconds]
 * @returns {ExerciseTemplate}
 */
export function createExerciseTemplate(name, defaultRestSeconds = 120, category = 'その他', restSeconds) {
  const validCategories = ['胸', '背中', '脚', '肩', '腕', '腹', 'その他'];
  const cat = validCategories.includes(category) ? category : 'その他';
  const mainSec = Math.max(10, Number(defaultRestSeconds) || 120);
  return {
    id: newId(),
    name: name.trim(),
    category: cat,
    defaultRestSeconds: mainSec,
    restSeconds: {
      UP: Math.max(10, Number(restSeconds?.UP) || 60),
      MAIN: Math.max(10, Number(restSeconds?.MAIN) || mainSec),
      HEAVY: Math.max(10, Number(restSeconds?.HEAVY) || Math.max(mainSec, 180)),
      DOWN: Math.max(10, Number(restSeconds?.DOWN) || 60),
    },
  };
}

/**
 * @param {Partial<UserProfile>} [input]
 * @returns {UserProfile}
 */
export function createProfile(input = {}) {
  const currentWeight = Number(input.currentWeight) || 68.0;
  const startWeight = input.startWeight !== undefined ? Number(input.startWeight) : currentWeight;
  return {
    name: input.name ? input.name.trim() : 'トレーニー',
    height: Number(input.height) || 172,
    currentWeight,
    startWeight,
    targetWeight: Number(input.targetWeight) || 65.0,
    targetDate: input.targetDate || '',
    gender: input.gender === 'female' ? 'female' : 'male',
    age: Number(input.age) || 28,
    goalType: ['cut', 'maintain', 'bulk'].includes(input.goalType || '') ? /** @type {GoalType} */ (input.goalType) : 'cut',
    activityLevel: ['sedentary', 'light', 'moderate', 'active'].includes(input.activityLevel || '')
      ? /** @type {ActivityLevel} */ (input.activityLevel)
      : 'moderate',
    targetCalories: Number(input.targetCalories) || 2100,
    targetP: Number(input.targetP) || 140,
    targetF: Number(input.targetF) || 50,
    targetC: Number(input.targetC) || 250,
    supplements: Array.isArray(input.supplements) && input.supplements.length > 0
      ? [...input.supplements]
      : [...DEFAULT_SUPPLEMENTS],
    defaultRestSeconds: {
      UP: 60,
      MAIN: 120,
      HEAVY: 180,
      DOWN: 60,
      ...(input.defaultRestSeconds || {}),
    },
  };
}

/**
 * @param {Partial<RoutineItem> & { name: string }} input
 * @returns {RoutineItem}
 */
export function createRoutineItem(input) {
  return {
    id: newId(),
    name: input.name.trim(),
    p: Math.max(0, Number(input.p) || 0),
    f: Math.max(0, Number(input.f) || 0),
    c: Math.max(0, Number(input.c) || 0),
    isSupplement: Boolean(input.isSupplement),
  };
}

/**
 * @param {Partial<WorkoutSet> & { exerciseName: string, weight: number, reps: number }} input
 * @param {number} [estimated1rm]
 * @returns {WorkoutSet}
 */
export function createWorkoutSet(input, estimated1rm = 0) {
  const isCompleted = input.isCompleted !== undefined ? Boolean(input.isCompleted) : true;
  const weight = Math.max(0, Number(input.weight) || 0);
  const reps = Math.max(1, Math.round(Number(input.reps) || 1));
  return {
    id: newId(),
    exerciseName: input.exerciseName.trim(),
    weight,
    reps,
    setType: ['UP', 'MAIN', 'HEAVY', 'DOWN'].includes(input.setType || '') ? /** @type {SetType} */ (input.setType) : 'MAIN',
    estimated1rm: Math.max(0, Number(estimated1rm) || 0),
    completedAt: input.completedAt || (isCompleted ? new Date().toISOString() : ''),
    isCompleted,
    targetWeight: input.targetWeight !== undefined ? Number(input.targetWeight) : weight,
    targetReps: input.targetReps !== undefined ? Number(input.targetReps) : reps,
  };
}

/**
 * @param {Partial<WorkoutSession>} [input]
 * @param {Date} [now]
 * @returns {WorkoutSession}
 */
export function createWorkoutSession(input = {}, now = new Date()) {
  const dateStr = now.toISOString().slice(0, 10);
  return {
    id: newId(),
    date: input.date || dateStr,
    startTime: input.startTime || now.toISOString(),
    endTime: input.endTime ?? null,
    bodyWeight: input.bodyWeight !== undefined && input.bodyWeight !== null ? Number(input.bodyWeight) : null,
    sleepCategory: ['<5h', '5-6h', '6-7h', '7h+'].includes(input.sleepCategory || '')
      ? /** @type {SleepCategory} */ (input.sleepCategory)
      : '6-7h',
    preWorkoutCarb: input.preWorkoutCarb !== undefined ? Boolean(input.preWorkoutCarb) : true,
    conditionScore: Number(input.conditionScore) >= 1 && Number(input.conditionScore) <= 5 ? Number(input.conditionScore) : 4,
    sets: Array.isArray(input.sets) ? [...input.sets] : [],
    notes: typeof input.notes === 'string' ? input.notes.trim() : '',
  };
}

/**
 * @param {string} date YYYY-MM-DD
 * @returns {DailyNutrition}
 */
export function createDailyNutrition(date) {
  return {
    id: newId(),
    date,
    totalP: 0,
    totalF: 0,
    totalC: 0,
    completedSupplements: [],
    logs: [],
  };
}

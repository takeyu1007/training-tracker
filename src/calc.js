// @ts-check
/**
 * 純粋計算ロジック（SPEC.md「3. 機能要件」に対応）。
 * DOM・localStorage に依存しない純粋関数のみを置く。変更時は tests/calc.test.js を更新すること。
 */

/**
 * 推定1RM（1 Rep Max）の計算
 * Epley式: weight * (1 + reps / 30)
 * @param {number} weight 重量 (kg)
 * @param {number} reps 回数
 * @param {'epley' | 'oconner' | 'brzycki'} [formula] 計算式
 * @returns {number} 推定1RM (kg、小数点第1位に丸め)
 */
export function calculate1RM(weight, reps, formula = 'epley') {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) return 0;
  if (r === 1) return Math.round(w * 10) / 10;

  let max = w;
  switch (formula) {
    case 'oconner':
      max = w * (1 + r / 40);
      break;
    case 'brzycki':
      max = r < 37 ? w * (36 / (37 - r)) : w * 2;
      break;
    case 'epley':
    default:
      max = w * (1 + r / 30);
      break;
  }
  return Math.round(max * 10) / 10;
}

/**
 * セットリストから総ボリューム（重量 × 回数）を計算
 * @param {Array<{ weight: number, reps: number, setType?: string }>} sets
 * @param {boolean} [includeWarmup] UPセットを含めるか
 * @returns {number} 総ボリューム (kg)
 */
export function calculateSessionVolume(sets, includeWarmup = true) {
  if (!Array.isArray(sets)) return 0;
  return sets.reduce((sum, s) => {
    if (!includeWarmup && s.setType === 'UP') return sum;
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    return sum + (w > 0 && r > 0 ? w * r : 0);
  }, 0);
}

/**
 * 基礎代謝量（BMR）の算出（Mifflin-St Jeor式）
 * @param {number} height 身長 (cm)
 * @param {number} weight 体重 (kg)
 * @param {number} age 年齢
 * @param {'male' | 'female'} gender 性別
 * @returns {number} BMR (kcal)
 */
export function calculateBMR(height, weight, age, gender) {
  const h = Number(height) || 170;
  const w = Number(weight) || 65;
  const a = Number(age) || 30;
  // 男性: 10 * W + 6.25 * H - 5 * A + 5
  // 女性: 10 * W + 6.25 * H - 5 * A - 161
  const base = 10 * w + 6.25 * h - 5 * a;
  const bmr = gender === 'female' ? base - 161 : base + 5;
  return Math.round(Math.max(800, bmr));
}

/**
 * 活動代謝（TDEE: Total Daily Energy Expenditure）の算出
 * @param {number} bmr 基礎代謝量
 * @param {'sedentary' | 'light' | 'moderate' | 'active'} activityLevel
 * @returns {number} TDEE (kcal)
 */
export function calculateTDEE(bmr, activityLevel) {
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  };
  const factor = multipliers[activityLevel] || 1.55;
  return Math.round(bmr * factor);
}

/**
 * ユーザープロファイルに基づく目標カロリーおよびPFCバランスの自動計算
 * @param {Pick<import('./model.js').UserProfile, 'height' | 'currentWeight' | 'age' | 'gender' | 'goalType' | 'activityLevel'>} profile
 * @returns {{ targetCalories: number, targetP: number, targetF: number, targetC: number }}
 */
export function calculateTargetPFC(profile) {
  const bmr = calculateBMR(profile.height, profile.currentWeight, profile.age, profile.gender);
  const tdee = calculateTDEE(bmr, profile.activityLevel);

  let targetCalories = tdee;
  if (profile.goalType === 'cut') {
    targetCalories = Math.max(1200, tdee - 500); // 減量: -500kcal
  } else if (profile.goalType === 'bulk') {
    targetCalories = tdee + 300; // 増量: +300kcal
  }

  // P: 体重 × 2.0g (4kcal/g)
  const targetP = Math.round(profile.currentWeight * 2.0);
  const pCalories = targetP * 4;

  // F: 総カロリーの 22% (9kcal/g)
  const targetF = Math.max(30, Math.round((targetCalories * 0.22) / 9));
  const fCalories = targetF * 9;

  // C: 残りカロリー (4kcal/g)
  const remainingCalories = Math.max(0, targetCalories - pCalories - fCalories);
  const targetC = Math.round(remainingCalories / 4);

  return {
    targetCalories,
    targetP,
    targetF,
    targetC,
  };
}

/**
 * PFCからの総摂取カロリー換算
 * @param {number} p (g)
 * @param {number} f (g)
 * @param {number} c (g)
 * @returns {number} kcal
 */
export function pfcToCalories(p, f, c) {
  const pCal = (Number(p) || 0) * 4;
  const fCal = (Number(f) || 0) * 9;
  const cCal = (Number(c) || 0) * 4;
  return Math.round(pCal + fCal + cCal);
}

/**
 * 目標PFCに対する残量および進捗率
 * @param {{ targetP: number, targetF: number, targetC: number, targetCalories: number }} target
 * @param {{ totalP: number, totalF: number, totalC: number }} current
 */
export function calculateRemainingPFC(target, current) {
  const p = Number(current.totalP) || 0;
  const f = Number(current.totalF) || 0;
  const c = Number(current.totalC) || 0;
  const currentCalories = pfcToCalories(p, f, c);

  return {
    currentCalories,
    targetCalories: target.targetCalories,
    diffCalories: target.targetCalories - currentCalories,
    remainingP: target.targetP - p,
    remainingF: target.targetF - f,
    remainingC: target.targetC - c,
    percentP: target.targetP > 0 ? Math.min(100, Math.round((p / target.targetP) * 100)) : 0,
    percentF: target.targetF > 0 ? Math.min(100, Math.round((f / target.targetF) * 100)) : 0,
    percentC: target.targetC > 0 ? Math.min(100, Math.round((c / target.targetC) * 100)) : 0,
    percentCalories:
      target.targetCalories > 0
        ? Math.min(100, Math.round((currentCalories / target.targetCalories) * 100))
        : 0,
  };
}

/**
 * 漸進性過負荷（オーバーロード）の判定と次回提案
 * @param {string} exerciseName 種目名
 * @param {import('./model.js').WorkoutSession[]} workouts 過去のワークアウト一覧
 * @param {number} [targetReps] 目標回数（既定 10回）
 * @returns {{ shouldIncrease: boolean, currentWeight: number, suggestedWeight: number, message: string }}
 */
export function suggestProgressiveOverload(exerciseName, workouts, targetReps = 10) {
  if (!Array.isArray(workouts) || workouts.length === 0) {
    return { shouldIncrease: false, currentWeight: 0, suggestedWeight: 0, message: '' };
  }

  // 新しい順に該当種目を含むセッションを検索
  const sorted = [...workouts].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const recent = sorted.find((w) => w.sets.some((s) => s.exerciseName === exerciseName));
  if (!recent) {
    return { shouldIncrease: false, currentWeight: 0, suggestedWeight: 0, message: '' };
  }

  // メインまたは高重量セットを抽出
  const mainSets = recent.sets.filter(
    (s) => s.exerciseName === exerciseName && (s.setType === 'MAIN' || s.setType === 'HEAVY'),
  );

  if (mainSets.length === 0) {
    return { shouldIncrease: false, currentWeight: 0, suggestedWeight: 0, message: '' };
  }

  // 最大重量とその回数
  const maxWeightSet = mainSets.reduce((prev, curr) => (curr.weight > prev.weight ? curr : prev), mainSets[0]);

  // 目標回数以上を達成していれば重量アップ提案
  if (maxWeightSet.reps >= targetReps) {
    const suggested = Math.round((maxWeightSet.weight + 2.5) * 10) / 10;
    return {
      shouldIncrease: true,
      currentWeight: maxWeightSet.weight,
      suggestedWeight: suggested,
      message: `前回メインセットで ${maxWeightSet.weight}kg × ${maxWeightSet.reps}回 を完遂！次回は +2.5kg（${suggested}kg）に挑戦してみましょう。`,
    };
  }

  return {
    shouldIncrease: false,
    currentWeight: maxWeightSet.weight,
    suggestedWeight: maxWeightSet.weight,
    message: `前回は ${maxWeightSet.weight}kg × ${maxWeightSet.reps}回。まずは同じ重量で ${targetReps}回 を目指しましょう。`,
  };
}

/**
 * コンディションと筋出力（推定1RM）の相関分析・警告インサイト
 * @param {import('./model.js').WorkoutSession[]} workouts ワークアウト履歴
 * @returns {Array<{ type: 'warning' | 'info' | 'positive', title: string, description: string }>}
 */
export function analyzeConditionInsights(workouts) {
  if (!Array.isArray(workouts) || workouts.length < 2) {
    return [
      {
        type: 'info',
        title: 'データ収集中',
        description: '2回以上のワークアウトを記録すると、睡眠やトレ前栄養と筋出力の相関インサイトがここに表示されます。',
      },
    ];
  }

  /** @type {Array<{ type: 'warning' | 'info' | 'positive', title: string, description: string }>} */
  const insights = [];

  // 1. 睡眠時間とMAIN/HEAVY推定1RMの相関
  /** @type {number[]} */
  const shortSleepSessions = []; // <6h ('<5h', '5-6h')
  /** @type {number[]} */
  const goodSleepSessions = [];  // >=6h ('6-7h', '7h+')

  workouts.forEach((w) => {
    const mainSets = w.sets.filter((s) => s.setType === 'MAIN' || s.setType === 'HEAVY');
    if (mainSets.length === 0) return;
    const avg1rm = mainSets.reduce((sum, s) => sum + s.estimated1rm, 0) / mainSets.length;
    if (w.sleepCategory === '<5h' || w.sleepCategory === '5-6h') {
      shortSleepSessions.push(avg1rm);
    } else {
      goodSleepSessions.push(avg1rm);
    }
  });

  if (shortSleepSessions.length > 0 && goodSleepSessions.length > 0) {
    const avgShort = shortSleepSessions.reduce((a, b) => a + b, 0) / shortSleepSessions.length;
    const avgGood = goodSleepSessions.reduce((a, b) => a + b, 0) / goodSleepSessions.length;

    if (avgShort < avgGood) {
      const dropPercent = Math.round(((avgGood - avgShort) / avgGood) * 100);
      insights.push({
        type: 'warning',
        title: '💤 睡眠不足による出力低下アラート',
        description: `睡眠6時間未満のセッションでは、十分な睡眠時と比べて推定1RMが平均 ${dropPercent}% 低下しています。高重量の日は前夜の睡眠を最優先しましょう。`,
      });
    } else {
      insights.push({
        type: 'positive',
        title: '✨ 良好な睡眠コンディション',
        description: '十分な睡眠（6時間以上）を確保したセッションで高いパフォーマンスが維持されています。',
      });
    }
  }

  // 2. トレ前糖質補給の有無と総ボリューム
  /** @type {number[]} */
  const carbOnVols = [];
  /** @type {number[]} */
  const carbOffVols = [];

  workouts.forEach((w) => {
    const vol = calculateSessionVolume(w.sets);
    if (vol === 0) return;
    if (w.preWorkoutCarb) {
      carbOnVols.push(vol);
    } else {
      carbOffVols.push(vol);
    }
  });

  if (carbOnVols.length > 0 && carbOffVols.length > 0) {
    const avgOn = carbOnVols.reduce((a, b) => a + b, 0) / carbOnVols.length;
    const avgOff = carbOffVols.reduce((a, b) => a + b, 0) / carbOffVols.length;

    if (avgOff < avgOn) {
      const diffPercent = Math.round(((avgOn - avgOff) / avgOn) * 100);
      insights.push({
        type: 'warning',
        title: '🍌 トレ前エネルギー補給の重要性',
        description: `トレ前の糖質・栄養補給がない日は、補給がある日に比べて総ボリュームが平均 ${diffPercent}% 低い傾向にあります。トレ1〜2時間前の糖質摂取を推奨します。`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      type: 'info',
      title: '📊 順調なトレーニング推移',
      description: 'コンディションと筋出力のバランスは安定しています。日々の記録を継続してさらに精度を高めましょう。',
    });
  }

  return insights;
}

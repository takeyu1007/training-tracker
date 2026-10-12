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
 * セットリストから実績総ボリューム（重量 × 回数）を計算（完了済みセットのみ対象）
 * @param {Array<{ weight: number, reps: number, setType?: string, isCompleted?: boolean }>} sets
 * @param {boolean} [includeWarmup] UPセットを含めるか
 * @returns {number} 実績総ボリューム (kg)
 */
export function calculateSessionVolume(sets, includeWarmup = true) {
  if (!Array.isArray(sets)) return 0;
  return sets.reduce((sum, s) => {
    if (s.isCompleted === false) return sum;
    if (!includeWarmup && s.setType === 'UP') return sum;
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    return sum + (w > 0 && r > 0 ? w * r : 0);
  }, 0);
}

/**
 * セットリストから計画総ボリューム（予定重量 × 予定回数）を計算
 * @param {Array<{ weight?: number, reps?: number, targetWeight?: number, targetReps?: number, setType?: string }>} sets
 * @param {boolean} [includeWarmup]
 * @returns {number} 計画総ボリューム (kg)
 */
export function calculatePlannedVolume(sets, includeWarmup = true) {
  if (!Array.isArray(sets)) return 0;
  return sets.reduce((sum, s) => {
    if (!includeWarmup && s.setType === 'UP') return sum;
    const w = Number(s.targetWeight !== undefined ? s.targetWeight : s.weight) || 0;
    const r = Number(s.targetReps !== undefined ? s.targetReps : s.reps) || 0;
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

  // メインまたは高重量セットを抽出（完了済みのみ）
  const mainSets = recent.sets.filter(
    (s) => s.exerciseName === exerciseName && (s.setType === 'MAIN' || s.setType === 'HEAVY') && s.isCompleted !== false,
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
    const mainSets = w.sets.filter((s) => (s.setType === 'MAIN' || s.setType === 'HEAVY') && s.isCompleted !== false);
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

/**
 * 減量・増量マイルストーンの進捗および必要カロリー差分の計算（7,200 kcal/kg 則）
 * @param {number} startWeight 開始時体重 (kg)
 * @param {number} currentWeight 現在体重 (kg)
 * @param {number} targetWeight 目標体重 (kg)
 * @param {string} targetDate 目標達成予定日 (YYYY-MM-DD)
 * @param {Date} [now] 現在日時
 * @returns {{
 *   daysRemaining: number,
 *   direction: 'cut' | 'maintain' | 'bulk',
 *   weightRemaining: number,
 *   totalChangeNeeded: number,
 *   totalCaloriesNeeded: number,
 *   dailyCalorieAdjustment: number,
 *   progressPercent: number
 * }}
 */
export function calculateWeightPace(startWeight, currentWeight, targetWeight, targetDate, now = new Date()) {
  const sWeight = Number(startWeight) || Number(currentWeight) || 68;
  const cWeight = Number(currentWeight) || 68;
  const tWeight = Number(targetWeight) || cWeight;

  // 残り日数の計算 (本日との差分日数、0日未満は0)
  let daysRemaining = 0;
  if (targetDate) {
    const todayStr = now.toISOString().slice(0, 10);
    const targetEpoch = Date.parse(targetDate);
    const todayEpoch = Date.parse(todayStr);
    if (!Number.isNaN(targetEpoch) && !Number.isNaN(todayEpoch)) {
      const diffMs = targetEpoch - todayEpoch;
      daysRemaining = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    }
  }

  /** @type {'cut' | 'maintain' | 'bulk'} */
  let direction = 'maintain';
  if (tWeight < cWeight) direction = 'cut';
  else if (tWeight > cWeight) direction = 'bulk';

  const weightRemaining = Math.round(Math.abs(cWeight - tWeight) * 10) / 10;
  // 脂肪1kg = 約7,200kcal
  const totalCaloriesNeeded = Math.round(weightRemaining * 7200);
  const dailyCalorieAdjustment = daysRemaining > 0 ? Math.round(totalCaloriesNeeded / daysRemaining) : 0;

  // 進捗率の計算 (0〜100%)
  let progressPercent = 0;
  const totalSpan = Math.abs(tWeight - sWeight);
  if (totalSpan <= 0.05) {
    progressPercent = 100;
  } else if (direction === 'cut') {
    const lost = sWeight - cWeight;
    progressPercent = Math.max(0, Math.min(100, Math.round((lost / (sWeight - tWeight)) * 100)));
  } else if (direction === 'bulk') {
    const gained = cWeight - sWeight;
    progressPercent = Math.max(0, Math.min(100, Math.round((gained / (tWeight - sWeight)) * 100)));
  } else {
    progressPercent = 100;
  }

  return {
    daysRemaining,
    direction,
    weightRemaining,
    totalChangeNeeded: Math.round((tWeight - cWeight) * 10) / 10,
    totalCaloriesNeeded,
    dailyCalorieAdjustment,
    progressPercent,
  };
}

/**
 * 減量・増量ペースの安全性判定（医学・スポーツ栄養学基準）
 * - 減量: 月間5%超（または日別1,000kcal以上の赤字）は筋肉減少・基礎代謝低下・胆石リスク
 * - 増量: 月間2%超（または日別700kcal以上の黒字）は体脂肪過多・生活習慣病リスク
 * @param {number} currentWeight 現在体重 (kg)
 * @param {number} targetWeight 目標体重 (kg)
 * @param {string} targetDate 目標達成予定日 (YYYY-MM-DD)
 * @param {Date} [now]
 * @returns {{
 *   isUnsafe: boolean,
 *   severity: 'none' | 'warning' | 'danger',
 *   reason: string,
 *   monthlyRatePercent: number,
 *   dailyCalorieAdjustment: number,
 *   recommendedDays: number,
 *   recommendedTargetDate: string,
 *   suggestedWeightForDate: number
 * }}
 */
export function checkPaceSafety(currentWeight, targetWeight, targetDate, now = new Date()) {
  const cWeight = Number(currentWeight) || 68;
  const tWeight = Number(targetWeight) || cWeight;
  const weightDiff = Math.round((tWeight - cWeight) * 10) / 10;

  if (Math.abs(weightDiff) < 0.1 || !targetDate) {
    return {
      isUnsafe: false,
      severity: 'none',
      reason: '',
      monthlyRatePercent: 0,
      dailyCalorieAdjustment: 0,
      recommendedDays: 0,
      recommendedTargetDate: targetDate || '',
      suggestedWeightForDate: tWeight,
    };
  }

  const todayStr = now.toISOString().slice(0, 10);
  const targetEpoch = Date.parse(targetDate);
  const todayEpoch = Date.parse(todayStr);
  const daysRemaining = Number.isNaN(targetEpoch) ? 0 : Math.round((targetEpoch - todayEpoch) / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 0) {
    return {
      isUnsafe: true,
      severity: 'danger',
      reason: '目標日が本日以前になっています。未来の日付を設定してください。',
      monthlyRatePercent: 0,
      dailyCalorieAdjustment: 0,
      recommendedDays: 30,
      recommendedTargetDate: new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10),
      suggestedWeightForDate: tWeight,
    };
  }

  const totalAbsDiff = Math.abs(weightDiff);
  const ratePerDay = totalAbsDiff / daysRemaining;
  const monthlyWeightChange = ratePerDay * 30;
  const monthlyRatePercent = Math.round((monthlyWeightChange / cWeight) * 1000) / 10;
  const dailyCalorieAdjustment = Math.round((totalAbsDiff * 7200) / daysRemaining);

  // 1. 減量チェック (Cut)
  if (weightDiff < 0) {
    // 基準: 安全な上限は月間 5.0%（体重70kgなら月3.5kgまで、1日最大-840kcal）
    if (monthlyRatePercent > 5.0 || dailyCalorieAdjustment > 1000) {
      const safeMonthlyKg = cWeight * 0.05; // 5%
      const safeDailyKg = safeMonthlyKg / 30;
      const recommendedDays = Math.max(7, Math.ceil(totalAbsDiff / safeDailyKg));
      const recDate = new Date(now.getTime() + recommendedDays * 86400000).toISOString().slice(0, 10);
      const suggestedWeightForDate = Math.round((cWeight - safeDailyKg * daysRemaining) * 10) / 10;

      const isExtreme = monthlyRatePercent > 8.0 || dailyCalorieAdjustment > 1500;
      return {
        isUnsafe: true,
        severity: isExtreme ? 'danger' : 'warning',
        reason: `月間換算 -${monthlyRatePercent}%（日別 -${dailyCalorieAdjustment.toLocaleString()} kcal）の減量は急激すぎます。筋肉の大幅な減少、基礎代謝の低下、リバウンドや体調不良のリスクが極めて高くなります。`,
        monthlyRatePercent,
        dailyCalorieAdjustment,
        recommendedDays,
        recommendedTargetDate: recDate,
        suggestedWeightForDate,
      };
    }
  }

  // 2. 増量チェック (Bulk)
  if (weightDiff > 0) {
    // 基準: 安全なリーンバルクの上限は月間 2.0%（体重70kgなら月1.4kgまで、1日最大+336kcal）
    if (monthlyRatePercent > 2.0 || dailyCalorieAdjustment > 700) {
      const safeMonthlyKg = cWeight * 0.02; // 2%
      const safeDailyKg = safeMonthlyKg / 30;
      const recommendedDays = Math.max(7, Math.ceil(totalAbsDiff / safeDailyKg));
      const recDate = new Date(now.getTime() + recommendedDays * 86400000).toISOString().slice(0, 10);
      const suggestedWeightForDate = Math.round((cWeight + safeDailyKg * daysRemaining) * 10) / 10;

      const isExtreme = monthlyRatePercent > 4.0 || dailyCalorieAdjustment > 1000;
      return {
        isUnsafe: true,
        severity: isExtreme ? 'danger' : 'warning',
        reason: `月間換算 +${monthlyRatePercent}%（日別 +${dailyCalorieAdjustment.toLocaleString()} kcal）の増量は筋肉ではなく体脂肪が急増するリスクがあります。リーンバルクには月間+1〜2%以内が推奨されます。`,
        monthlyRatePercent,
        dailyCalorieAdjustment,
        recommendedDays,
        recommendedTargetDate: recDate,
        suggestedWeightForDate,
      };
    }
  }

  return {
    isUnsafe: false,
    severity: 'none',
    reason: '',
    monthlyRatePercent,
    dailyCalorieAdjustment,
    recommendedDays: daysRemaining,
    recommendedTargetDate: targetDate,
    suggestedWeightForDate: tWeight,
  };
}

/**
 * 体重の7日間移動平均（Rolling Average）の算出
 * 日々の水分量変動を平滑化し、真の体脂肪増減トレンドを可視化する
 * @param {Array<{ date: string, bodyWeight: number | null }>} workouts
 * @returns {Array<{ date: string, weight: number | null, ma7: number | null }>}
 */
export function calculate7DayMovingAverage(workouts) {
  if (!Array.isArray(workouts)) return [];
  const sorted = [...workouts]
    .filter((w) => w && typeof w.date === 'string')
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return sorted.map((w, idx) => {
    const weight = w.bodyWeight !== null && w.bodyWeight !== undefined ? Number(w.bodyWeight) : null;
    const currentDateEpoch = Date.parse(w.date);

    // 過去7日間 (currentDateEpoch - 6日 から currentDateEpoch まで) の記録を取得
    const windowRecords = sorted.slice(0, idx + 1).filter((prev) => {
      const prevDateEpoch = Date.parse(prev.date);
      const diffDays = (currentDateEpoch - prevDateEpoch) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays < 7 && prev.bodyWeight !== null && prev.bodyWeight !== undefined;
    });

    let ma7 = null;
    if (windowRecords.length > 0) {
      const sum = windowRecords.reduce((acc, r) => acc + Number(r.bodyWeight), 0);
      ma7 = Math.round((sum / windowRecords.length) * 10) / 10;
    }

    return {
      date: w.date,
      weight,
      ma7,
    };
  });
}

/**
 * 過去7日間の平均摂取カロリー＆PFCバランスの算出
 * @param {import('./model.js').DailyNutrition[]} dailyNutritionList
 * @param {Date} [now]
 * @returns {{ daysLogged: number, avgCalories: number, avgP: number, avgF: number, avgC: number }}
 */
export function calculateWeeklyNutritionAverage(dailyNutritionList, now = new Date()) {
  if (!Array.isArray(dailyNutritionList) || dailyNutritionList.length === 0) {
    return { daysLogged: 0, avgCalories: 0, avgP: 0, avgF: 0, avgC: 0 };
  }

  const todayEpoch = Date.parse(now.toISOString().slice(0, 10));
  const weekList = dailyNutritionList.filter((d) => {
    const epoch = Date.parse(d.date);
    const diffDays = (todayEpoch - epoch) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays < 7 && (d.totalP > 0 || d.totalF > 0 || d.totalC > 0);
  });

  if (weekList.length === 0) {
    return { daysLogged: 0, avgCalories: 0, avgP: 0, avgF: 0, avgC: 0 };
  }

  const totalP = weekList.reduce((acc, d) => acc + d.totalP, 0);
  const totalF = weekList.reduce((acc, d) => acc + d.totalF, 0);
  const totalC = weekList.reduce((acc, d) => acc + d.totalC, 0);
  const totalCals = weekList.reduce((acc, d) => acc + pfcToCalories(d.totalP, d.totalF, d.totalC), 0);
  const count = weekList.length;

  return {
    daysLogged: count,
    avgCalories: Math.round(totalCals / count),
    avgP: Math.round((totalP / count) * 10) / 10,
    avgF: Math.round((totalF / count) * 10) / 10,
    avgC: Math.round((totalC / count) * 10) / 10,
  };
}

/**
 * BIG3（ベンチプレス・スクワット・デッドリフト）の自己最高 推定1RM 合計スコア
 * @param {import('./model.js').WorkoutSession[]} workouts
 * @returns {{
 *   benchMax: number,
 *   squatMax: number,
 *   deadliftMax: number,
 *   total: number,
 *   clubLevel: '500kg Club' | '400kg Club' | '300kg Club' | 'Road to 300kg'
 * }}
 */
export function calculateBig3Total(workouts) {
  let benchMax = 0;
  let squatMax = 0;
  let deadliftMax = 0;

  if (Array.isArray(workouts)) {
    workouts.forEach((w) => {
      (w.sets || []).forEach((s) => {
        if (s.isCompleted === false) return;
        const name = (s.exerciseName || '').toLowerCase();
        const est = Number(s.estimated1rm) || 0;
        if (name.includes('ベンチプレス') || name.includes('bench')) {
          if (est > benchMax) benchMax = est;
        } else if (name.includes('スクワット') || name.includes('squat')) {
          if (est > squatMax) squatMax = est;
        } else if (name.includes('デッドリフト') || name.includes('deadlift')) {
          if (est > deadliftMax) deadliftMax = est;
        }
      });
    });
  }

  const total = Math.round((benchMax + squatMax + deadliftMax) * 10) / 10;
  /** @type {'500kg Club' | '400kg Club' | '300kg Club' | 'Road to 300kg'} */
  let clubLevel = 'Road to 300kg';
  if (total >= 500) clubLevel = '500kg Club';
  else if (total >= 400) clubLevel = '400kg Club';
  else if (total >= 300) clubLevel = '300kg Club';

  return {
    benchMax,
    squatMax,
    deadliftMax,
    total,
    clubLevel,
  };
}

/**
 * 過去7日間の部位別セット数ボリュームメーター
 * 推奨週間セット数: 1部位あたり 10〜20セット（筋肥大の至適ボリューム）
 * @param {import('./model.js').WorkoutSession[]} workouts
 * @param {import('./model.js').ExerciseTemplate[]} exerciseTemplates
 * @param {Date} [now]
 * @returns {Record<import('./model.js').MuscleCategory, { sets: number, status: 'low' | 'optimal' | 'high' }>}
 */
export function calculateWeeklyMuscleVolume(workouts, exerciseTemplates, now = new Date()) {
  /** @type {Record<import('./model.js').MuscleCategory, number>} */
  const counts = {
    胸: 0,
    背中: 0,
    脚: 0,
    肩: 0,
    腕: 0,
    腹: 0,
    その他: 0,
  };

  /** @type {Map<string, import('./model.js').MuscleCategory>} */
  const categoryMap = new Map();
  if (Array.isArray(exerciseTemplates)) {
    exerciseTemplates.forEach((t) => {
      if (t && t.name && t.category) {
        categoryMap.set(t.name.trim().toLowerCase(), t.category);
      }
    });
  }

  if (Array.isArray(workouts)) {
    const todayEpoch = Date.parse(now.toISOString().slice(0, 10));
    workouts.forEach((w) => {
      const epoch = Date.parse(w.date);
      const diffDays = (todayEpoch - epoch) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays < 7) {
        (w.sets || []).forEach((s) => {
          // UPセットおよび未完了セットはカウント除外（有効刺激セットのみ）
          if (s.isCompleted === false || s.setType === 'UP') return;
          const cleanName = (s.exerciseName || '').trim().toLowerCase();
          let cat = categoryMap.get(cleanName);
          if (!cat) {
            // 名前の簡易推定
            if (cleanName.includes('ベンチ') || cleanName.includes('チェスト') || cleanName.includes('ディップス')) cat = '胸';
            else if (cleanName.includes('スクワット') || cleanName.includes('レッグ') || cleanName.includes('カーフ')) cat = '脚';
            else if (cleanName.includes('デッドリフト') || cleanName.includes('懸垂') || cleanName.includes('ロー') || cleanName.includes('プルダウン')) cat = '背中';
            else if (cleanName.includes('ショルダー') || cleanName.includes('レイズ') || cleanName.includes('ミリタリー')) cat = '肩';
            else if (cleanName.includes('カール') || cleanName.includes('トライセプス') || cleanName.includes('エクステンション')) cat = '腕';
            else if (cleanName.includes('クランチ') || cleanName.includes('アブ') || cleanName.includes('レッグレイズ')) cat = '腹';
            else cat = 'その他';
          }
          counts[cat] = (counts[cat] || 0) + 1;
        });
      }
    });
  }

  /** @type {Record<import('./model.js').MuscleCategory, { sets: number, status: 'low' | 'optimal' | 'high' }>} */
  const result = {
    胸: { sets: counts.胸, status: counts.胸 < 10 ? 'low' : counts.胸 <= 20 ? 'optimal' : 'high' },
    背中: { sets: counts.背中, status: counts.背中 < 10 ? 'low' : counts.背中 <= 20 ? 'optimal' : 'high' },
    脚: { sets: counts.脚, status: counts.脚 < 10 ? 'low' : counts.脚 <= 20 ? 'optimal' : 'high' },
    肩: { sets: counts.肩, status: counts.肩 < 10 ? 'low' : counts.肩 <= 20 ? 'optimal' : 'high' },
    腕: { sets: counts.腕, status: counts.腕 < 10 ? 'low' : counts.腕 <= 20 ? 'optimal' : 'high' },
    腹: { sets: counts.腹, status: counts.腹 < 6 ? 'low' : counts.腹 <= 16 ? 'optimal' : 'high' },
    その他: { sets: counts.その他, status: counts.その他 < 10 ? 'low' : counts.その他 <= 20 ? 'optimal' : 'high' },
  };

  return result;
}


// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate1RM,
  calculateSessionVolume,
  calculatePlannedVolume,
  calculateBMR,
  calculateTDEE,
  calculateTargetPFC,
  pfcToCalories,
  calculateRemainingPFC,
  suggestProgressiveOverload,
  analyzeConditionInsights,
  calculateWeightPace,
  checkPaceSafety,
  calculate7DayMovingAverage,
  calculateWeeklyNutritionAverage,
  calculateBig3Total,
  calculateWeeklyMuscleVolume,
} from '../src/calc.js';
import { createWorkoutSession, createWorkoutSet, createExerciseTemplate } from '../src/model.js';

test('calculate1RM: Epley formula accuracy and edge cases', () => {
  // 1回の場合はそのままの重量
  assert.equal(calculate1RM(100, 1), 100);

  // 100kg x 10回: 100 * (1 + 10 / 30) = 133.333... -> 133.3
  assert.equal(calculate1RM(100, 10), 133.3);

  // 80kg x 8回: 80 * (1 + 8/30) = 101.333... -> 101.3
  assert.equal(calculate1RM(80, 8), 101.3);

  // 0 や負の入力
  assert.equal(calculate1RM(0, 10), 0);
  assert.equal(calculate1RM(100, 0), 0);
  assert.equal(calculate1RM(-50, 5), 0);
});

test('calculateSessionVolume and calculatePlannedVolume: respects isCompleted', () => {
  const sets = [
    { weight: 60, reps: 10, setType: 'UP', isCompleted: true },
    { weight: 100, reps: 8, setType: 'MAIN', isCompleted: true },
    { weight: 100, reps: 8, targetWeight: 100, targetReps: 8, setType: 'MAIN', isCompleted: false }, // planned
    { weight: 100, reps: 8, targetWeight: 100, targetReps: 8, setType: 'MAIN', isCompleted: false }, // planned
  ];
  // 実績 (完了済み): 60*10 + 100*8 = 600 + 800 = 1400
  assert.equal(calculateSessionVolume(sets, true), 1400);
  // 実績 (UP除外): 800
  assert.equal(calculateSessionVolume(sets, false), 800);

  // 計画全体 (UP含む): 600 + 800 + 800 + 800 = 3000
  assert.equal(calculatePlannedVolume(sets, true), 3000);
});

test('calculateBMR and calculateTDEE: Mifflin-St Jeor formula', () => {
  // 男 175cm, 70kg, 30歳: 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75 -> 1649
  const bmrMale = calculateBMR(175, 70, 30, 'male');
  assert.equal(bmrMale, 1649);

  // 女 160cm, 52kg, 28歳: 10*52 + 6.25*160 - 5*28 - 161 = 520 + 1000 - 140 - 161 = 1219
  const bmrFemale = calculateBMR(160, 52, 28, 'female');
  assert.equal(bmrFemale, 1219);

  // TDEE moderate (1.55)
  const tdee = calculateTDEE(1649, 'moderate');
  assert.equal(tdee, Math.round(1649 * 1.55));
});

test('calculateTargetPFC: auto calculates macro distribution based on goal', () => {
  const profile = {
    height: 175,
    currentWeight: 70,
    age: 30,
    gender: /** @type {const} */ ('male'),
    goalType: /** @type {const} */ ('cut'),
    activityLevel: /** @type {const} */ ('moderate'),
  };

  const target = calculateTargetPFC(profile);
  // P = 70 * 2 = 140g
  assert.equal(target.targetP, 140);
  // Cut should be TDEE - 500
  const expectedTdee = calculateTDEE(calculateBMR(175, 70, 30, 'male'), 'moderate');
  assert.equal(target.targetCalories, expectedTdee - 500);
  assert.ok(target.targetF >= 30);
  assert.ok(target.targetC > 0);
});

test('pfcToCalories and calculateRemainingPFC', () => {
  // P: 100g (400), F: 40g (360), C: 200g (800) -> 1560 kcal
  assert.equal(pfcToCalories(100, 40, 200), 1560);

  const target = { targetCalories: 2000, targetP: 150, targetF: 50, targetC: 220 };
  const current = { totalP: 100, totalF: 30, totalC: 150 };
  const rem = calculateRemainingPFC(target, current);

  assert.equal(rem.remainingP, 50);
  assert.equal(rem.remainingF, 20);
  assert.equal(rem.remainingC, 70);
  assert.equal(rem.currentCalories, 100 * 4 + 30 * 9 + 150 * 4); // 400 + 270 + 600 = 1270
  assert.equal(rem.diffCalories, 2000 - 1270);
});

test('suggestProgressiveOverload: suggests weight increase when target reps are hit', () => {
  const pastSession = createWorkoutSession({
    date: '2026-10-10',
    sets: [
      createWorkoutSet({ exerciseName: 'ベンチプレス', weight: 80, reps: 10, setType: 'MAIN' }),
    ],
  });

  const suggestion = suggestProgressiveOverload('ベンチプレス', [pastSession], 10);
  assert.equal(suggestion.shouldIncrease, true);
  assert.equal(suggestion.currentWeight, 80);
  assert.equal(suggestion.suggestedWeight, 82.5);
  assert.ok(suggestion.message.includes('+2.5kg'));
});

test('analyzeConditionInsights: extracts sleep and pre-workout carb correlations', () => {
  const session1 = createWorkoutSession({
    date: '2026-10-01',
    sleepCategory: '<5h',
    preWorkoutCarb: false,
    sets: [
      createWorkoutSet({ exerciseName: 'スクワット', weight: 100, reps: 5, setType: 'MAIN' }, 116.7),
    ],
  });

  const session2 = createWorkoutSession({
    date: '2026-10-05',
    sleepCategory: '7h+',
    preWorkoutCarb: true,
    sets: [
      createWorkoutSet({ exerciseName: 'スクワット', weight: 120, reps: 5, setType: 'MAIN' }, 140.0),
    ],
  });

  const insights = analyzeConditionInsights([session1, session2]);
  assert.ok(insights.length >= 1);
  const sleepWarning = insights.find((i) => i.title.includes('睡眠'));
  assert.ok(sleepWarning);
  assert.equal(sleepWarning.type, 'warning');
});

test('calculateWeightPace: computes remaining days, 7200 kcal/kg rule, and progress percent', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  // 減量ケース: 70kg -> 65kg (-5kg), 開始72kg, 25日後 (2026-11-06)
  // 残り重量: 5kg -> 5 * 7200 = 36000 kcal
  // 25日残り -> 36000 / 25 = 1440 kcal/day
  // 進捗率: (72 - 70) / (72 - 65) = 2 / 7 = ~29%
  const pace = calculateWeightPace(72, 70, 65, '2026-11-06', now);
  assert.equal(pace.daysRemaining, 25);
  assert.equal(pace.direction, 'cut');
  assert.equal(pace.weightRemaining, 5);
  assert.equal(pace.totalCaloriesNeeded, 36000);
  assert.equal(pace.dailyCalorieAdjustment, 1440);
  assert.equal(pace.progressPercent, 29);
});

test('checkPaceSafety: warns on unsafe pace (e.g. -15kg in 1 month)', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  // 1ヶ月 (30日後: 2026-11-11) で 75kg -> 60kg (-15kg)
  // 月間換算 -20% (安全上限 5%)
  const check = checkPaceSafety(75, 60, '2026-11-11', now);
  assert.equal(check.isUnsafe, true);
  assert.equal(check.severity, 'danger');
  assert.ok(check.reason.includes('急激すぎます'));
  assert.ok(check.recommendedDays > 30);
  assert.ok(check.recommendedTargetDate);
  assert.ok(check.suggestedWeightForDate > 60);

  // 安全なペース (-2kg in 2 months)
  const safeCheck = checkPaceSafety(70, 68, '2026-12-12', now);
  assert.equal(safeCheck.isUnsafe, false);
  assert.equal(safeCheck.severity, 'none');
});

test('calculate7DayMovingAverage: smooths daily weight fluctuations', () => {
  const workouts = [
    { date: '2026-10-01', bodyWeight: 70.0 },
    { date: '2026-10-02', bodyWeight: 71.0 },
    { date: '2026-10-03', bodyWeight: 69.5 },
  ];
  const ma = calculate7DayMovingAverage(workouts);
  assert.equal(ma.length, 3);
  assert.equal(ma[0].ma7, 70.0);
  assert.equal(ma[1].ma7, 70.5); // (70+71)/2
  assert.equal(ma[2].ma7, 70.2); // (70+71+69.5)/3 = 70.166... -> 70.2
});

test('calculateWeeklyNutritionAverage: computes 7-day average intake', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const logs = [
    { id: '1', date: '2026-10-12', totalP: 150, totalF: 50, totalC: 250, completedSupplements: [], logs: [] },
    { id: '2', date: '2026-10-11', totalP: 130, totalF: 40, totalC: 200, completedSupplements: [], logs: [] },
    { id: '3', date: '2026-10-01', totalP: 140, totalF: 45, totalC: 220, completedSupplements: [], logs: [] }, // 7日以上前
  ];
  const avg = calculateWeeklyNutritionAverage(logs, now);
  assert.equal(avg.daysLogged, 2);
  assert.equal(avg.avgP, 140); // (150+130)/2
  assert.equal(avg.avgF, 45);  // (50+40)/2
  assert.equal(avg.avgC, 225); // (250+200)/2
  assert.ok(avg.avgCalories > 1500);
});

test('calculateBig3Total: computes max 1RM for bench, squat, deadlift and club level', () => {
  const workouts = [
    createWorkoutSession({
      date: '2026-10-10',
      sets: [
        createWorkoutSet({ exerciseName: 'ベンチプレス', weight: 100, reps: 5, setType: 'MAIN' }, 116.7),
        createWorkoutSet({ exerciseName: 'スクワット', weight: 140, reps: 3, setType: 'MAIN' }, 154.0),
      ],
    }),
    createWorkoutSession({
      date: '2026-10-12',
      sets: [
        createWorkoutSet({ exerciseName: 'デッドリフト', weight: 160, reps: 2, setType: 'MAIN' }, 170.7),
      ],
    }),
  ];
  const big3 = calculateBig3Total(workouts);
  assert.equal(big3.benchMax, 116.7);
  assert.equal(big3.squatMax, 154.0);
  assert.equal(big3.deadliftMax, 170.7);
  // 116.7 + 154.0 + 170.7 = 441.4
  assert.equal(big3.total, 441.4);
  assert.equal(big3.clubLevel, '400kg Club');
});

test('calculateWeeklyMuscleVolume: aggregates weekly sets by muscle category', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const templates = [
    createExerciseTemplate('ベンチプレス', 120, '胸'),
    createExerciseTemplate('懸垂', 120, '背中'),
    createExerciseTemplate('スクワット', 180, '脚'),
  ];
  const workouts = [
    createWorkoutSession({
      date: '2026-10-12',
      sets: [
        createWorkoutSet({ exerciseName: 'ベンチプレス', weight: 80, reps: 10, setType: 'UP' }), // warmup -> excluded
        createWorkoutSet({ exerciseName: 'ベンチプレス', weight: 90, reps: 8, setType: 'MAIN' }),
        createWorkoutSet({ exerciseName: 'ベンチプレス', weight: 90, reps: 8, setType: 'MAIN' }),
        createWorkoutSet({ exerciseName: '懸垂', weight: 0, reps: 10, setType: 'MAIN' }),
      ],
    }),
  ];
  const volume = calculateWeeklyMuscleVolume(workouts, templates, now);
  assert.equal(volume.胸.sets, 2);
  assert.equal(volume.胸.status, 'low');
  assert.equal(volume.背中.sets, 1);
  assert.equal(volume.脚.sets, 0);
});


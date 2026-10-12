// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate1RM,
  calculateSessionVolume,
  calculateBMR,
  calculateTDEE,
  calculateTargetPFC,
  pfcToCalories,
  calculateRemainingPFC,
  suggestProgressiveOverload,
  analyzeConditionInsights,
} from '../src/calc.js';
import { createWorkoutSession, createWorkoutSet } from '../src/model.js';

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

test('calculateSessionVolume: computes sum of weight * reps', () => {
  const sets = [
    { weight: 60, reps: 10, setType: 'UP' },
    { weight: 100, reps: 8, setType: 'MAIN' },
    { weight: 100, reps: 7, setType: 'MAIN' },
    { weight: 90, reps: 10, setType: 'DOWN' },
  ];
  // 60*10 + 100*8 + 100*7 + 90*10 = 600 + 800 + 700 + 900 = 3000
  assert.equal(calculateSessionVolume(sets, true), 3000);
  // exclude warmup: 800 + 700 + 900 = 2400
  assert.equal(calculateSessionVolume(sets, false), 2400);
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

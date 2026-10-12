// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save, emptyData, migrate, STORAGE_KEY, SCHEMA_VERSION } from '../src/storage.js';
import { createStore } from '../src/store.js';
import { createMemoryStorage } from './helpers.js';

test('storage: load on empty storage returns default data without backup key', () => {
  const storage = createMemoryStorage();
  const result = load(storage);
  assert.equal(result.recoveredBackupKey, null);
  assert.equal(result.data.version, SCHEMA_VERSION);
  assert.equal(result.data.workouts.length, 0);
  assert.ok(result.data.profile);
  assert.ok(result.data.routines.length > 0);
});

test('storage: save and load round-trip works correctly', () => {
  const storage = createMemoryStorage();
  const initial = emptyData();
  initial.profile.name = 'テストユーザー';
  initial.profile.currentWeight = 75.5;

  assert.equal(save(storage, initial), true);

  const loaded = load(storage);
  assert.equal(loaded.recoveredBackupKey, null);
  assert.equal(loaded.data.profile.name, 'テストユーザー');
  assert.equal(loaded.data.profile.currentWeight, 75.5);
});

test('storage: corrupt JSON triggers raw backup and returns clean empty data', () => {
  const storage = createMemoryStorage({
    [STORAGE_KEY]: '{"corrupted": true, broken',
  });

  const loaded = load(storage);
  assert.ok(loaded.recoveredBackupKey);
  assert.ok(loaded.recoveredBackupKey.startsWith('trainingTracker.backup.'));
  assert.equal(storage.getItem(loaded.recoveredBackupKey), '{"corrupted": true, broken');
  assert.equal(loaded.data.version, SCHEMA_VERSION);
});

test('store: add workout, add sets with auto 1RM, and nutrition logs', () => {
  const storage = createMemoryStorage();
  const store = createStore(storage);

  // 1. ワークアウトセッションの追加
  const session = store.addWorkout({
    date: '2026-10-12',
    sleepCategory: '7h+',
    preWorkoutCarb: true,
    conditionScore: 5,
  });
  assert.ok(session.id);
  assert.equal(store.getState().workouts.length, 1);

  // 2. セットの追加（推定1RMが自動計算されること）
  const set = store.addSetToWorkout(session.id, {
    exerciseName: 'ベンチプレス',
    weight: 100,
    reps: 5,
    setType: 'MAIN',
  });
  assert.ok(set);
  // 100 * (1 + 5/30) = 116.7
  assert.equal(set.estimated1rm, 116.7);
  assert.equal(store.getState().workouts[0].sets.length, 1);

  // 3. getPreviousSetValues で前回の値が取得できること
  const prev = store.getPreviousSetValues('ベンチプレス');
  assert.ok(prev);
  assert.equal(prev.weight, 100);
  assert.equal(prev.reps, 5);

  // 4. PFCログの追加
  store.addNutritionLog('2026-10-12', {
    name: '鶏胸肉 300g',
    p: 66,
    f: 4.5,
    c: 0,
  });

  const daily = store.getState().dailyNutrition.find((n) => n.date === '2026-10-12');
  assert.ok(daily);
  assert.equal(daily.totalP, 66);
  assert.equal(daily.totalF, 4.5);
  assert.equal(daily.logs.length, 1);

  // 5. サプリメントトグル
  store.toggleDailySupplement('2026-10-12', 'クレアチン (5g)');
  const updatedDaily = store.getState().dailyNutrition.find((n) => n.date === '2026-10-12');
  assert.ok(updatedDaily?.completedSupplements.includes('クレアチン (5g)'));
});

test('store: JSON export and import restores complete state', () => {
  const storage1 = createMemoryStorage();
  const store1 = createStore(storage1);
  store1.updateProfile({ name: 'インポート検証' });
  const exported = store1.exportData();

  const storage2 = createMemoryStorage();
  const store2 = createStore(storage2);
  const ok = store2.importData(exported);
  assert.equal(ok, true);
  assert.equal(store2.getState().profile.name, 'インポート検証');
});

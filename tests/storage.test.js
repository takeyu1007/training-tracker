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

test('storage: migrate v1 data to v2 with exercise templates and planned sets', () => {
  const v1Data = {
    version: 1,
    profile: {
      name: 'v1ユーザー',
      height: 170,
      currentWeight: 65,
      targetWeight: 60,
      targetDate: '',
      gender: 'male',
      age: 25,
      goalType: 'cut',
      activityLevel: 'moderate',
      targetCalories: 2000,
      targetP: 130,
      targetF: 45,
      targetC: 220,
      supplements: ['クレアチン'],
      defaultRestSeconds: { UP: 60, MAIN: 120, HEAVY: 180, DOWN: 60 },
    },
    workouts: [
      {
        id: 'w1',
        date: '2026-10-10',
        startTime: '2026-10-10T10:00:00Z',
        endTime: null,
        bodyWeight: 65,
        sleepCategory: '7h+',
        preWorkoutCarb: true,
        conditionScore: 4,
        sets: [
          {
            id: 's1',
            exerciseName: 'ベンチプレス',
            weight: 70,
            reps: 10,
            setType: 'MAIN',
            estimated1rm: 93.3,
            completedAt: '2026-10-10T10:05:00Z',
          },
        ],
        notes: '',
      },
    ],
    dailyNutrition: [],
    routines: [],
    exerciseTemplates: ['ベンチプレス', 'スクワット'],
  };

  const migrated = migrate(v1Data);
  assert.equal(migrated.version, SCHEMA_VERSION);
  // exerciseTemplates should now be objects with defaultRestSeconds and category
  assert.equal(migrated.exerciseTemplates.length, 2);
  assert.equal(migrated.exerciseTemplates[0].name, 'ベンチプレス');
  assert.equal(migrated.exerciseTemplates[0].category, '胸');
  assert.ok(migrated.exerciseTemplates[0].defaultRestSeconds > 0);
  assert.equal(migrated.profile.startWeight, 65);
  // activeProject and weightLogs should be migrated
  assert.ok(migrated.activeProject);
  assert.equal(migrated.activeProject.startWeight, 65);
  assert.ok(migrated.weightLogs.length > 0);
  assert.equal(migrated.workouts[0].sessionType, 'workout');
  // sets should have isCompleted: true
  assert.equal(migrated.workouts[0].sets[0].isCompleted, true);
  assert.equal(migrated.workouts[0].sets[0].targetWeight, 70);
  assert.equal(migrated.workouts[0].sets[0].targetReps, 10);
});

test('store: addPlannedSets, completeSet, uncompleteSet and custom exercise rest times with category', () => {
  const storage = createMemoryStorage();
  const store = createStore(storage);

  const session = store.addWorkout({ date: '2026-10-12' });

  // 1. 3セットを一括予約
  const planned = store.addPlannedSets(session.id, {
    exerciseName: 'スクワット',
    weight: 100,
    reps: 8,
    count: 3,
    setType: 'MAIN',
  });
  assert.equal(planned.length, 3);
  assert.equal(planned[0].isCompleted, false);
  assert.equal(planned[0].targetWeight, 100);
  assert.equal(planned[0].targetReps, 8);

  // 2. 1セット目を実績完了
  const completed = store.completeSet(session.id, planned[0].id, 100, 10);
  assert.ok(completed);
  assert.equal(completed.isCompleted, true);
  assert.equal(completed.reps, 10);
  assert.equal(completed.estimated1rm, 133.3);

  // 3. 種目ごとの休憩時間・部位カテゴリの追加・取得
  const addedTemplate = store.addExerciseTemplate('ヒップスラスト', 180, '脚');
  assert.ok(addedTemplate);
  assert.equal(addedTemplate.name, 'ヒップスラスト');
  assert.equal(addedTemplate.defaultRestSeconds, 180);
  assert.equal(addedTemplate.category, '脚');

  const found = store.getExerciseTemplate('ヒップスラスト');
  assert.ok(found);
  assert.equal(found.defaultRestSeconds, 180);
  assert.equal(found.category, '脚');
});

test('store: per-exercise restSeconds customization and batchUpdateExerciseRestSeconds', () => {
  const storage = createMemoryStorage();
  const store = createStore(storage);

  // 1. 個別種目のセット種別ごとの休憩秒数の更新
  const bench = store.getExerciseTemplate('ベンチプレス');
  assert.ok(bench);
  store.updateExerciseTemplate(bench.id, {
    restSeconds: { UP: 45, MAIN: 150, HEAVY: 240, DOWN: 60 },
  });

  const updatedBench = store.getExerciseTemplate('ベンチプレス');
  assert.ok(updatedBench);
  assert.equal(updatedBench.restSeconds?.UP, 45);
  assert.equal(updatedBench.restSeconds?.MAIN, 150);
  assert.equal(updatedBench.restSeconds?.HEAVY, 240);
  assert.equal(updatedBench.restSeconds?.DOWN, 60);
  assert.equal(updatedBench.defaultRestSeconds, 150); // MAINに同期

  // 2. 一括反映 (batchUpdateExerciseRestSeconds)
  store.batchUpdateExerciseRestSeconds({
    UP: 50,
    MAIN: 110,
    HEAVY: 200,
    DOWN: 50,
  });

  const allTemplates = store.getState().exerciseTemplates;
  for (const t of allTemplates) {
    assert.equal(t.restSeconds?.UP, 50);
    assert.equal(t.restSeconds?.MAIN, 110);
    assert.equal(t.restSeconds?.HEAVY, 200);
    assert.equal(t.restSeconds?.DOWN, 50);
    assert.equal(t.defaultRestSeconds, 110);
  }

  // 3. ストレージ再読み込み（リロード時永続化検証）
  const storeReloaded = createStore(storage);
  const benchReloaded = storeReloaded.getExerciseTemplate('ベンチプレス');
  assert.ok(benchReloaded);
  assert.equal(benchReloaded.restSeconds?.UP, 50);
  assert.equal(benchReloaded.restSeconds?.MAIN, 110);
  assert.equal(benchReloaded.restSeconds?.HEAVY, 200);
  assert.equal(benchReloaded.restSeconds?.DOWN, 50);
});

test('store: body projects, weight logs, and rest day session management', () => {
  const storage = createMemoryStorage();
  const store = createStore(storage);

  // 1. 新規プロジェクトの作成
  const proj = store.createProject({
    name: '2026秋 リーンバルク',
    goalType: 'bulk',
    startDate: '2026-10-01',
    startWeight: 70.0,
    targetDate: '2026-12-31',
    targetWeight: 74.0,
    targetCalories: 2700,
    targetP: 160,
    targetF: 60,
    targetC: 380,
  });

  assert.equal(store.getState().activeProject?.name, '2026秋 リーンバルク');
  assert.equal(store.getState().activeProject?.startWeight, 70.0);
  assert.equal(store.getState().profile.targetCalories, 2700);

  // 2. 体重ログの記録・最新体重取得
  store.logWeight('2026-10-05', 70.5);
  store.logWeight('2026-10-12', 71.2);
  assert.equal(store.getLatestWeight(), 71.2);
  assert.equal(store.getState().weightLogs.length >= 2, true);

  // 体重ログの修正
  const logToUpdate = store.getState().weightLogs.find((l) => l.date === '2026-10-05');
  assert.ok(logToUpdate);
  store.updateWeightLog(logToUpdate.id, { weight: 70.7 });
  const updatedLog = store.getState().weightLogs.find((l) => l.id === logToUpdate.id);
  assert.equal(updatedLog?.weight, 70.7);

  // 3. 次のプロジェクトを開始して前PJが完了アーカイブされること
  const nextProj = store.createProject({
    name: '2027春 コンテスト絞り',
    goalType: 'cut',
    startDate: '2027-01-01',
    startWeight: 74.5,
  });

  assert.equal(store.getState().activeProject?.name, '2027春 コンテスト絞り');
  assert.equal(store.getState().projects.length, 2); // defaultProj + リーンバルク
  assert.equal(store.getState().projects[0].name, '2026秋 リーンバルク');
  assert.equal(store.getState().projects[0].status, 'completed');

  // 4. 休息日（OFF）セッションの登録
  const restSession = store.logRestDay({
    date: '2027-01-02',
    sleepCategory: '7h+',
    conditionScore: 5,
    bodyWeight: 71.0,
    notes: 'ストレッチ30分と交代浴でしっかりリカバリー',
  });

  assert.ok(restSession.id);
  assert.equal(restSession.sessionType, 'rest');
  assert.equal(restSession.notes, 'ストレッチ30分と交代浴でしっかりリカバリー');
  assert.equal(restSession.bodyWeight, 71.0);
  assert.equal(store.getLatestWeight(), 71.0);
});


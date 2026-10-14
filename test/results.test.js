import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult, weeklySchedule } from '../server/results.js';

const base = {
  q_producto: 'cigarrillos', q_cantidad: 10, q_gasto: 25, q_anios: '10-19', q_primer: '30min',
  q_gatillos: ['cafe', 'estres', 'alcohol'], q_dificil: 'cafe', q_intentos: ['solo'], q_preocupacion: 'ansiedad',
  q_motivos: ['salud'], q_objetivo: 'gradual', q_edad: '35-44',
};

test('consumo y gasto actuales salen de las respuestas', () => {
  const r = computeResult(base);
  assert.equal(r.current.perWeek, 70);
  assert.equal(r.current.perYear, 3650);
  assert.equal(r.current.monthlySpend, 108.33); // 25 × 52 / 12
  assert.equal(r.current.yearlySpend, 1300); // 25 × 52
});

test('índice de dependencia (HSI): cantidad + primer cigarrillo', () => {
  assert.deepEqual(computeResult(base).dependence, { score: 2, max: 6, level: 'moderada' }); // 0 + 2
  assert.equal(computeResult({ ...base, q_cantidad: 25, q_primer: '5min' }).dependence.score, 5); // 2 + 3
  assert.equal(computeResult({ ...base, q_cantidad: 5, q_primer: 'mas' }).dependence.level, 'baja');
});

test('perfil de hábitos suma 100 y sigue a los gatillos marcados', () => {
  const r = computeResult(base);
  assert.equal(r.profile.reduce((a, g) => a + g.value, 0), 100);
  assert.equal(r.profile[0].id, 'automatico'); // café (2) + más difícil café (3)
  assert.equal(r.triggers[0].id, 'cafe');
});

test('proyección: calendario, cigarrillos evitados y ahorro', () => {
  const p = computeResult(base).projection;
  assert.deepEqual(p.schedule, [10, 8, 5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  // (10-8)·7 + (10-5)·7 + (10-3)·7 + 9 semanas · 70 = 14 + 35 + 49 + 630
  assert.equal(p.cigarettesAvoided12Weeks, 728);
  // 728 cigarrillos × (25 $ / 70 cigarrillos)
  assert.equal(p.savings12Weeks, 260);
  // + 40 semanas más sin fumar × 25 $
  assert.equal(p.savingsYear, 1260);
  assert.equal(p.reductionPercent, 100);
});

test('cada estrategia genera su calendario', () => {
  assert.deepEqual(weeklySchedule('parar', 20).slice(0, 4), [20, 17, 14, 0]);
  assert.equal(weeklySchedule('reducir', 20).at(-1), 10);
  assert.equal(computeResult({ ...base, q_objetivo: 'reducir' }).projection.reductionPercent, 50);
});

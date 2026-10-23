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

// ------------------------------------------------------------
// ALCOHOL
// ------------------------------------------------------------
const alcBase = {
  q_alc_frecuencia: 'semanal', q_alc_cantidad: '3-4', q_alc_atracones: 'mensual',
  q_alc_gasto: 100, q_alc_gatillos: ['desconexion', 'social'], q_alc_seguridad: 'no',
  q_alc_objetivo: 'moderar', q_alc_motivos: ['salud'], q_alc_ultimo: 'semana',
};

test('alcohol: puntuación audit, gasto y nivel de dependencia', () => {
  const r = computeResult(alcBase, { program: 'alcohol' });
  assert.equal(r.program, 'alcohol');
  assert.equal(r.dependence.score, 5); // semanal(3) + 3-4(2)
  assert.equal(r.dependence.max, 9);
  assert.equal(r.dependence.level, 'moderada');
  assert.equal(r.dependence.hasPhysicalRisk, false);
  assert.equal(r.current.weeklySpend, 23.08); // 100 × 12 / 52
  assert.equal(r.current.monthlySpend, 100);
  assert.equal(r.current.yearlySpend, 1200);
});

test('alcohol: selecciona el programa por sus respuestas (sin options)', () => {
  assert.equal(computeResult(alcBase).program, 'alcohol');
});

test('alcohol: aviso de seguridad clínica solo con síntomas físicos', () => {
  const sinRiesgo = computeResult(alcBase, { program: 'alcohol' });
  assert.equal(sinRiesgo.safetyNotice, null);
  const conRiesgo = computeResult({ ...alcBase, q_alc_seguridad: 'si' }, { program: 'alcohol' });
  assert.equal(conRiesgo.dependence.hasPhysicalRisk, true);
  assert.match(conRiesgo.safetyNotice, /dependencia física/);
  assert.match(conRiesgo.safetyNotice, /profesional de la salud/);
});

test('alcohol: objetivo ajusta la reducción y el ahorro proyectado', () => {
  const moderar = computeResult({ ...alcBase, q_alc_objetivo: 'moderar' }, { program: 'alcohol' });
  assert.equal(moderar.projection.reductionPercent, 50);
  assert.equal(moderar.projection.savings12Weeks, 150); // 100 × 3 × 50 %
  assert.equal(moderar.projection.savingsYear, 600); // 1.200 × 50 %
  const dejarlo = computeResult({ ...alcBase, q_alc_objetivo: 'dejarlo' }, { program: 'alcohol' });
  assert.equal(dejarlo.projection.reductionPercent, 100);
  assert.equal(dejarlo.plan.strategy.id, 'dejarlo');
  const pausa = computeResult({ ...alcBase, q_alc_objetivo: 'pausa' }, { program: 'alcohol' });
  assert.equal(pausa.plan.strategy.name, 'Pausa saludable de 90 días');
});

test('alcohol: solo 3 gatillos, con etiqueta legible', () => {
  const r = computeResult({ ...alcBase, q_alc_gatillos: ['desconexion', 'social', 'estres', 'aburrimiento', 'comidas'] }, { program: 'alcohol' });
  assert.equal(r.triggers.length, 3);
  assert.equal(r.triggers[0].label, 'Al terminar el trabajo o para desconectar');
});

// ------------------------------------------------------------
// AZÚCAR
// ------------------------------------------------------------
const azBase = {
  q_az_tipo: 'bolleria', q_az_frecuencia: 3, q_az_momentos: ['bajon', 'noche'],
  q_az_sensacion: 'cansancio', q_az_intentos: ['dietas'], q_az_objetivo: 'equilibrio',
};

test('azúcar: selecciona el programa por sus respuestas', () => {
  assert.equal(computeResult(azBase, { program: 'azucar' }).program, 'azucar');
});

test('azúcar: puntuación y nivel según frecuencia diaria', () => {
  const r = computeResult(azBase, { program: 'azucar' });
  assert.equal(r.current.perDay, 3);
  assert.deepEqual(r.dependence, { score: 6, max: 10, level: 'moderada' }); // 3 × 2
  assert.equal(computeResult({ ...azBase, q_az_frecuencia: 1 }, { program: 'azucar' }).dependence.level, 'baja');
  const alta = computeResult({ ...azBase, q_az_frecuencia: 6 }, { program: 'azucar' });
  assert.deepEqual(alta.dependence, { score: 8, max: 10, level: 'alta' }); // min(8, 12)
});

test('azúcar: picos evitados proyectados a 12 semanas', () => {
  const r = computeResult(azBase, { program: 'azucar' });
  assert.equal(r.projection.reductionPercent, 60);
  assert.equal(r.projection.sugarSpikesAvoided, 252); // 3 × 7 × 12
});

// ------------------------------------------------------------
// ANSIEDAD
// ------------------------------------------------------------
const ansBase = {
  q_ans_frecuencia: 'semanal', q_ans_manifestaciones: ['muscular', 'cabeza'],
  q_ans_gatillos: ['trabajo', 'futuro'], q_ans_recursos: ['movil', 'caminar'],
  q_ans_objetivo: 'bucle',
};

test('ansiedad: selecciona el programa y mapea manifestaciones', () => {
  const r = computeResult(ansBase, { program: 'ansiedad' });
  assert.equal(r.program, 'ansiedad');
  assert.equal(r.current.manifestations[1], 'Pensamientos en bucle y sobrepensamiento');
  assert.equal(r.triggers[0].label, 'Sobrecarga laboral/estudio');
  assert.equal(r.dependence.level, 'moderada'); // frecuencia ≠ diario
});

test('ansiedad: nivel alta solo con frecuencia diaria', () => {
  const r = computeResult({ ...ansBase, q_ans_frecuencia: 'diario' }, { program: 'ansiedad' });
  assert.equal(r.dependence.level, 'alta');
  assert.equal(r.projection.reductionPercent, 50);
  assert.equal(r.plan.strategy.id, 'calma_sistematica');
});

// ------------------------------------------------------------
// SUEÑO
// ------------------------------------------------------------
const sueBase = {
  q_sue_horas: 5, q_sue_dificultad: 'conciliar', q_sue_habitos: ['pantallas', 'cafeina'],
  q_sue_despertar: 'agotado', q_sue_objetivo: 'rutina',
};

test('sueño: horas, deuda de sueño y nivel por horas dormidas', () => {
  const r = computeResult(sueBase, { program: 'sueno' });
  assert.equal(r.program, 'sueno');
  assert.equal(r.current.hoursSlept, 5);
  assert.equal(r.current.sleepDebtHours, 3);
  assert.deepEqual(r.dependence, { score: 5, max: 10, level: 'alta' }); // 10 − 5
  assert.equal(computeResult({ ...sueBase, q_sue_horas: 6.5 }, { program: 'sueno' }).dependence.level, 'moderada');
  const ocho = computeResult({ ...sueBase, q_sue_horas: 8 }, { program: 'sueno' });
  assert.deepEqual(ocho.dependence, { score: 2, max: 10, level: 'baja' }); // máx(2, 2)
  assert.equal(ocho.current.sleepDebtHours, 0);
});

test('sueño: horas de descanso recuperadas en 12 semanas', () => {
  const r = computeResult(sueBase, { program: 'sueno' });
  assert.equal(r.projection.recoveredRestHours, 252); // 3 h × 7 × 12
  assert.equal(r.projection.reductionPercent, 75);
  assert.equal(r.plan.strategy.id, 'higiene_nocturna');
});

test('sueño: etiquetas legibles de hábitos', () => {
  const r = computeResult({ ...sueBase, q_sue_habitos: ['pantallas', 'cafeina', 'cenas', 'horarios', 'rumiacion'] }, { program: 'sueno' });
  assert.equal(r.triggers.length, 3);
  assert.equal(r.triggers[1].label, 'Cafeína por la tarde');
});

// ------------------------------------------------------------
// DESPACHO UNIVERSAL
// ------------------------------------------------------------
test('respuestas vacías permanecen en el programa por defecto (sem-fumo)', () => {
  assert.equal(computeResult(base).program, 'sem-fumo');
});

test('quiz v3: rangos → números, radar 0–100 y tipo de fumador por el eje dominante', () => {
  const r = computeResult({ ...base, q_cantidad: '11a20', q_gasto: '50a149', q_patron: 'automatico', q_disfrute: ['sabor', 'inhalar', 'gesto'], q_anios: 'mas20' });
  assert.equal(r.current.perDay, 15);
  assert.equal(r.current.weeklySpend, 23);
  assert.equal(r.radar.length, 6);
  assert.ok(r.radar.every((x) => x.value >= 0 && x.value <= 100));
  assert.equal(r.radar.find((x) => x.id === 'placer').value, 100);
  assert.equal(r.smokerType.id, 'placer');
  assert.ok(r.smokerType.name && r.smokerType.body);
});

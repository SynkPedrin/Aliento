import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFx } from '../server/growth/fx.js';

test('fx: totais de várias moedas na moeda do painel; sem cotação, a moeda fica de fora e é avisada', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => [{ quote: 'BRL', rate: 5 }, { quote: 'EUR', rate: 0.9 }] }; };
  const fx = createFx({ base: 'usd', fetchImpl, log: { warn() {} } });
  assert.deepEqual(await fx.total([{ currency: 'USD', cents: 1000 }]), { cents: 1000, missing: [] });
  assert.equal(calls, 0, 'só USD: não busca cotação');
  assert.deepEqual(await fx.total([{ currency: 'USD', cents: 1000 }, { currency: 'brl', cents: 990 }, { currency: 'EUR', cents: 1999 }, { currency: 'GBP', cents: 699 }]),
    { cents: 1000 + 198 + 2221, missing: ['GBP'] });
  await fx.total([{ currency: 'BRL', cents: 100 }]);
  assert.equal(calls, 1, 'cotação em cache');
  const down = createFx({ base: 'USD', fetchImpl: async () => { throw new Error('offline'); }, log: { warn() {} } });
  assert.deepEqual(await down.total([{ currency: 'USD', cents: 500 }, { currency: 'BRL', cents: 990 }]), { cents: 500, missing: ['BRL'] });
});

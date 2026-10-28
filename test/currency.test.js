import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currencyForCountry, localizePlans } from '../server/billing.js';

test('preço na moeda do país quando o plano tem essa moeda; senão, moeda base', () => {
  assert.equal(currencyForCountry('br'), 'BRL');
  assert.equal(currencyForCountry('ES'), 'EUR');
  assert.equal(currencyForCountry('GB'), 'GBP');
  assert.equal(currencyForCountry('US'), null);
  assert.equal(currencyForCountry(undefined), null);
  const plans = [{ id: 'mensual', amount: 1999, currency: 'USD', currencies: { BRL: 2490, EUR: 1999 } }];
  assert.deepEqual(localizePlans(plans, 'BR'), [{ id: 'mensual', amount: 2490, currency: 'BRL' }]);
  assert.deepEqual(localizePlans(plans, 'FR'), [{ id: 'mensual', amount: 1999, currency: 'EUR' }]);
  assert.deepEqual(localizePlans(plans, 'GB'), [{ id: 'mensual', amount: 1999, currency: 'USD' }], 'sem GBP no preço: fica USD, como no checkout');
  assert.deepEqual(localizePlans(plans, null), [{ id: 'mensual', amount: 1999, currency: 'USD' }]);
});

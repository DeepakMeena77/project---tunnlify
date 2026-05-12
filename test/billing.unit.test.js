'use strict';

const assert = require('assert');
const {
  normalizePlan,
  getPlanLimit,
  getStripePriceId,
  getPlanFromPriceId,
  listPlans,
} = require('../billing/plans');

process.env.STRIPE_DEVELOPER_PRICE_ID = 'price_dev_inr_monthly';
process.env.STRIPE_TEAM_PRICE_ID = 'price_team_inr_monthly';

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ok  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  fail ${label}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

console.log('\n  billing/plans.js - Unit Tests\n');

test('normalizes supported plan names', () => {
  assert.strictEqual(normalizePlan('FREE'), 'free');
  assert.strictEqual(normalizePlan(' developer '), 'developer');
  assert.strictEqual(normalizePlan('Team'), 'team');
});

test('rejects unsupported plan names', () => {
  assert.strictEqual(normalizePlan('enterprise'), null);
  assert.strictEqual(normalizePlan(''), null);
});

test('returns configured tunnel limits', () => {
  assert.strictEqual(getPlanLimit('free'), 1);
  assert.strictEqual(getPlanLimit('developer'), 5);
  assert.strictEqual(getPlanLimit('team'), 20);
  assert.strictEqual(getPlanLimit('unknown'), 1);
});

test('uses INR prices and currency metadata', () => {
  const plans = listPlans();
  assert.deepStrictEqual(plans.map((plan) => plan.currency), ['inr', 'inr', 'inr']);
  assert.deepStrictEqual(plans.map((plan) => plan.currency_symbol), ['₹', '₹', '₹']);
  assert.deepStrictEqual(plans.map((plan) => plan.monthly_price), [0, 199, 699]);
});

test('maps Stripe price IDs to paid plans', () => {
  assert.strictEqual(getStripePriceId('developer'), 'price_dev_inr_monthly');
  assert.strictEqual(getStripePriceId('team'), 'price_team_inr_monthly');
  assert.strictEqual(getPlanFromPriceId('price_dev_inr_monthly'), 'developer');
  assert.strictEqual(getPlanFromPriceId('price_team_inr_monthly'), 'team');
  assert.strictEqual(getPlanFromPriceId('price_unknown'), null);
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

'use strict';

const PLANS = Object.freeze({
  free: Object.freeze({
    key: 'free',
    label: 'Free',
    monthlyPrice: 0,
    currency: 'inr',
    currencySymbol: '₹',
    tunnelLimit: 1,
  }),
  developer: Object.freeze({
    key: 'developer',
    label: 'Developer',
    monthlyPrice: 199,
    currency: 'inr',
    currencySymbol: '₹',
    tunnelLimit: 5,
    priceEnv: 'STRIPE_DEVELOPER_PRICE_ID',
  }),
  team: Object.freeze({
    key: 'team',
    label: 'Team',
    monthlyPrice: 699,
    currency: 'inr',
    currencySymbol: '₹',
    tunnelLimit: 20,
    priceEnv: 'STRIPE_TEAM_PRICE_ID',
  }),
});

function normalizePlan(plan) {
  const key = String(plan || '').toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(PLANS, key) ? key : null;
}

function getPlan(plan) {
  return PLANS[normalizePlan(plan) || 'free'];
}

function getPlanLimit(plan) {
  return getPlan(plan).tunnelLimit;
}

function getStripePriceId(plan) {
  const item = PLANS[normalizePlan(plan)];
  return item?.priceEnv ? process.env[item.priceEnv] : null;
}

function getPlanFromPriceId(priceId) {
  if (!priceId) return null;
  return Object.values(PLANS).find((plan) => {
    return plan.priceEnv && process.env[plan.priceEnv] === priceId;
  })?.key ?? null;
}

function listPlans() {
  return Object.values(PLANS).map((plan) => ({
    key: plan.key,
    label: plan.label,
    monthly_price: plan.monthlyPrice,
    currency: plan.currency,
    currency_symbol: plan.currencySymbol,
    tunnel_limit: plan.tunnelLimit,
  }));
}

module.exports = {
  PLANS,
  normalizePlan,
  getPlan,
  getPlanLimit,
  getStripePriceId,
  getPlanFromPriceId,
  listPlans,
};

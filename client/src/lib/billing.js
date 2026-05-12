export const DEFAULT_PLANS = [
  { key: 'free', label: 'Free', monthly_price: 0, currency: 'inr', currency_symbol: '₹', tunnel_limit: 1 },
  { key: 'developer', label: 'Developer', monthly_price: 199, currency: 'inr', currency_symbol: '₹', tunnel_limit: 5 },
  { key: 'team', label: 'Team', monthly_price: 699, currency: 'inr', currency_symbol: '₹', tunnel_limit: 20 },
]

export function formatPlanPrice(plan) {
  const amount = Number(plan?.monthly_price ?? 0)
  if (!amount) return 'Free'

  const currency = String(plan?.currency || '').toLowerCase()
  const symbol = plan?.currency_symbol || (currency === 'inr' ? '₹' : '$')

  return `${symbol}${amount.toLocaleString('en-IN')}/mo`
}

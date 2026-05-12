/**
 * Generic stat card — used on the Dashboard
 */
export default function StatCard({ label, value, sub, children }) {
  return (
    <div className="card-md flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      {children ?? (
        <>
          <span className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</span>
          {sub && <span className="text-xs text-gray-400">{sub}</span>}
        </>
      )}
    </div>
  )
}

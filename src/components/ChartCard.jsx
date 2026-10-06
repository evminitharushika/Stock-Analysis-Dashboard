export default function ChartCard({ title, subtitle, children, className = '' }) {
  return <section className={`chart-card ${className}`}><div className="chart-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="chart-menu">•••</span></div>{children}</section>
}

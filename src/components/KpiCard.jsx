import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

export default function KpiCard({ icon: Icon, label, value, note, accent = 'violet', trend }) {
  return <article className={`kpi-card ${accent}`}><div className="kpi-top"><span className="kpi-icon"><Icon size={18} /></span>{trend && <span className={trend > 0 ? 'trend positive' : 'trend negative'}>{trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(trend)}%</span>}</div><p>{label}</p><strong>{value}</strong><span className="kpi-note">{note}</span></article>
}

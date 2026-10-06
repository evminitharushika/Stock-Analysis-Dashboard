import { BarChart3, FilePlus2 } from 'lucide-react'

export default function Navbar({ page, onNavigate, onNewDataset }) {
  return <header className="navbar"><button className="brand" onClick={() => onNavigate('home')} aria-label="Go to Freelan home"><span className="brand-mark"><BarChart3 size={18} /></span><span>Fre<span>elan</span></span></button>{page !== 'home' && <><nav><button className="nav-link active">Dashboard</button></nav><button className="outline-button small" onClick={onNewDataset}><FilePlus2 size={16} /> New dataset</button></>}</header>
}

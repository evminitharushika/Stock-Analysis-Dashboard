import { FileSpreadsheet, Link2, LoaderCircle, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'

export default function UploadCard({ onFile, onSheet, loading }) {
  const inputRef = useRef(null)
  const [url, setUrl] = useState('')
  return (
    <div className="import-grid">
      <div className="import-card upload-card">
        <div className="import-icon violet"><FileSpreadsheet size={23} /></div>
        <div>
          <p className="eyebrow">OPTION 01</p>
          <h2>Upload a spreadsheet</h2>
          <p className="muted">Upload any Excel workbook or CSV. Category sections and warehouse columns are detected automatically.</p>
        </div>
        <button className="primary-button" onClick={() => inputRef.current?.click()} disabled={loading}>
          <UploadCloud size={18} /> {loading ? 'Analyzing…' : 'Upload Excel / CSV'}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} />
        <span className="file-hint">.xlsx, .xls or .csv · Up to 50 MB</span>
      </div>
      <div className="import-card sheet-card">
        <div className="import-icon cyan"><Link2 size={23} /></div>
        <div>
          <p className="eyebrow">OPTION 02</p>
          <h2>Connect a Google Sheet</h2>
          <p className="muted">Paste a Google Sheets link. Data is fetched only from that sheet — nothing else.</p>
        </div>
        <div className="input-action">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste Google Sheets URL" aria-label="Google Sheets URL" />
          <button className="icon-button" onClick={() => onSheet(url)} disabled={loading || !url.trim()} aria-label="Analyze Google Sheet">
            {loading ? <LoaderCircle className="spin" size={18} /> : <UploadCloud size={18} />}
          </button>
        </div>
        <span className="file-hint">Sharing: Anyone with the link → Viewer</span>
      </div>
    </div>
  )
}

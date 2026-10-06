import { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import { parseFile } from './utils/excelParser'
import { analyzeData } from './utils/dataAnalyzer'
import { fetchGoogleSheet } from './utils/googleSheets'
import './App.css'

function App() {
  const [page, setPage] = useState('home')
  const [dataset, setDataset] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function importRows(rows, fileName = 'Uploaded data', sheets = [{ name: 'Data', rows }], sourceUrl = '') {
    if (!rows.length) throw new Error('The dataset is empty. Add at least one row of data.')
    setDataset({ rows, sheets, fileName, sourceUrl, lastUpdated: new Date(), analysis: analyzeData(rows) })
    setPage('dashboard')
  }

  async function handleFile(file) {
    setLoading(true)
    setError('')
    try {
      const workbook = await parseFile(file)
      await importRows(workbook.rows, file.name, workbook.sheets)
    } catch (caught) { setError(caught.message || 'We could not analyze that file.') } finally { setLoading(false) }
  }

  async function handleSheet(url) {
    setLoading(true)
    setError('')
    try {
      const workbook = await fetchGoogleSheet(url)
      await importRows(workbook.rows, 'Google Sheet', workbook.sheets, url)
    } catch (caught) { setError(caught.message || 'We could not analyze that Google Sheet.') } finally { setLoading(false) }
  }

  async function refreshSheet() {
    if (!dataset?.sourceUrl) return
    setLoading(true)
    setError('')
    try {
      const workbook = await fetchGoogleSheet(dataset.sourceUrl)
      await importRows(workbook.rows, 'Google Sheet', workbook.sheets, dataset.sourceUrl)
    } catch (caught) { setError(caught.message || 'We could not refresh that Google Sheet.') } finally { setLoading(false) }
  }

  function startOver() { setError(''); setPage('home') }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') !== '1') return
    const rows = [
      { 'Mix RM': 'Chilli Mix', 'RM Code': 'RM01', 'Product / Description': 'Chilli Powder', 'Total +20% / Freelan (kg)': 120, 'Freelan Stock': 20, 'Navimana Stock': 10, 'Agro Stock': 30, 'SM Stock': 40 },
      { 'Mix RM': 'Turmeric Mix', 'RM Code': 'RM02', 'Product / Description': 'Turmeric Powder', 'Total +20% / Freelan (kg)': 200, 'Freelan Stock': 50, 'Navimana Stock': 5, 'Agro Stock': 25, 'SM Stock': 25 },
      { 'Mix RM': 'Pepper Mix', 'RM Code': 'RM03', 'Product / Description': 'Black Pepper', 'Total +20% / Freelan (kg)': 80, 'Freelan Stock': 8, 'Navimana Stock': 4, 'Agro Stock': 6, 'SM Stock': 2 },
    ]
    importRows(rows, 'Demo sheet', [{ name: 'October', rows }]).catch(() => {})
  }, [])

  return <><Navbar page={page} onNavigate={setPage} onNewDataset={startOver} />{page === 'home' && <Home onFile={handleFile} onSheet={handleSheet} loading={loading} error={error} />}{page === 'dashboard' && dataset && <Dashboard dataset={dataset} onRefresh={refreshSheet} refreshing={loading} />}</>
}

export default App

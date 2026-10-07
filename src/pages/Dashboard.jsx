import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileDown, Printer, RefreshCcw, Search, Table2 } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import * as XLSX from 'xlsx'
import {
  WAREHOUSES,
  analyzeData,
  formatPercent,
  formatValue,
  groupProducts,
  shareData,
  warehouseTotals,
} from '../utils/dataAnalyzer'

const CATEGORY_COLORS = ['#0F766E', '#7C3AED', '#EA580C', '#0891B2', '#BE185D', '#4F46E5', '#65A30D', '#C2410C', '#0369A1', '#9333EA']
const sumBy = (items, field) => items.reduce((sum, item) => sum + (item[field] || 0), 0)
const unique = (items) => [...new Map(items.map((item) => [item.code === 'N/A' ? item.id : String(item.code), item])).values()]
const sheetBy = (sheets, pattern, fallback) => sheets.find((sheet) => pattern.test(sheet.name)) || sheets[fallback] || sheets[0]
function Kpi({ label, value, tone = '' }) {
  return (
    <div className={`management-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
function statusClass(status) {
  return status.toLowerCase().replace(/\s+/g, '-')
}
function exportRows(rows, fileName) {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Stock Analysis')
  XLSX.writeFile(book, `${fileName.replace(/\.[^.]+$/, '')}-analysis.xlsx`)
}
function rawComment(product) {
  const entry = Object.entries(product.raw || {}).find(([key]) => key.trim().toLowerCase() === 'comments')
  return entry?.[1] ?? ''
}
function pdfStatusStyle(status) {
  const styles = {
    Critical: { fill: [255, 228, 230], text: [159, 18, 57] },
    'Low Stock': { fill: [254, 243, 199], text: [146, 64, 14] },
    Sufficient: { fill: [220, 252, 231], text: [22, 101, 52] },
    Overstock: { fill: [243, 232, 255], text: [107, 33, 168] },
  }
  return styles[status] || { fill: [241, 245, 249], text: [71, 85, 105] }
}

function pieLabel({ percent }) {
  if (!percent) return ''
  return `${Number(percent).toFixed(1)}%`
}

function WarehouseBar({ product }) {
  const parts = WAREHOUSES.map((warehouse) => ({ ...warehouse, value: product[warehouse.key] || 0 }))
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  if (!total) return <div className="warehouse-bar empty">No warehouse stock</div>
  return (
    <div className="warehouse-bar" title={parts.map((part) => `${part.label}: ${formatValue(part.value)} kg · ${formatPercent(total ? (part.value / total) * 100 : 0)}`).join(' · ')}>
      {parts.map((part) => (
        part.value > 0 ? <span key={part.key} style={{ width: `${(part.value / total) * 100}%`, background: part.color }} /> : null
      ))}
    </div>
  )
}

function BranchChips({ product }) {
  const branches = product.branches?.length
    ? product.branches
    : WAREHOUSES.filter((warehouse) => (product[warehouse.key] || 0) > 0)
  if (!branches.length) return <span className="branch-empty">No branch stock</span>
  return (
    <div className="branch-chips">
      {branches.map((warehouse) => (
        <span key={warehouse.key} className={`branch-chip ${warehouse.key}`} style={{ '--branch': warehouse.color }}>
          {warehouse.label}
        </span>
      ))}
    </div>
  )
}

function SharePie({ title, data, colors, empty }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <div className="share-pie">
      <h3>{title}</h3>
      {data.length ? (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={96} paddingAngle={2} label={pieLabel} labelLine={false}>
              {data.map((item, index) => <Cell key={item.name} fill={item.color || colors[index % colors.length]} />)}
            </Pie>
            <Tooltip formatter={(value, name) => [`${formatValue(value)} kg · ${formatPercent(total ? (value / total) * 100 : null)}`, name]} />
            <Legend formatter={(value) => {
              const item = data.find((entry) => entry.name === value)
              return `${value} · ${formatPercent(item?.percent)}`
            }} />
          </PieChart>
        </ResponsiveContainer>
      ) : <p className="empty-message">{empty}</p>}
    </div>
  )
}

export default function Dashboard({ dataset, onRefresh, refreshing }) {
  const sheets = dataset.sheets?.length ? dataset.sheets : [{ name: 'Data', rows: dataset.rows }]
  const detectedPrevious = sheetBy(sheets, /sep|september/i, 0)
  const detectedCurrent = sheetBy(sheets, /oct|october/i, Math.min(1, sheets.length - 1))
  const [previousName, setPreviousName] = useState(detectedPrevious?.name || 'Month 1')
  const [currentName, setCurrentName] = useState(detectedCurrent?.name || 'Month 2')
  const [query, setQuery] = useState('')
  const [comments, setComments] = useState({})
  const [printWarehouse, setPrintWarehouse] = useState(false)
  const loadedCommentsKey = useRef('')
  const commentsStorageKey = `warehouse-stock-comments:${dataset.sourceUrl || dataset.fileName}:${currentName}`
  const previousSheet = sheets.find((sheet) => sheet.name === previousName) || detectedPrevious
  const currentSheet = sheets.find((sheet) => sheet.name === currentName) || detectedCurrent
  const previous = useMemo(() => analyzeData(previousSheet?.rows || []), [previousSheet])
  const current = useMemo(() => analyzeData(currentSheet?.rows || []), [currentSheet])
  const oldProducts = useMemo(() => new Map(unique(previous.products).map((product) => [product.code === 'N/A' ? String(product.product) : String(product.code), product])), [previous.products])
  const comparison = useMemo(() => unique(current.products).map((product) => {
    const key = product.code === 'N/A' ? String(product.product) : String(product.code)
    const old = oldProducts.get(key)
    const currentStock = product.totalStock || 0
    const previousStock = old?.totalStock || 0
    return { ...product, currentStock, previousStock, change: currentStock - previousStock, changePercent: previousStock ? ((currentStock - previousStock) / previousStock) * 100 : null }
  }), [current.products, oldProducts])
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return comparison
    return comparison.filter((product) => `${product.product} ${product.code} ${product.category} ${product.mixRm}`.toLowerCase().includes(text))
  }, [comparison, query])
  const lowStock = filtered.filter((product) => product.status === 'Critical' || product.status === 'Low Stock').sort((a, b) => (a.stockPercent ?? Infinity) - (b.stockPercent ?? Infinity))
  const topLow = lowStock.slice(0, 5)
  const overstock = filtered.filter((product) => product.status === 'Overstock')
  const currentTotal = sumBy(filtered, 'currentStock')
  const previousTotal = sumBy(filtered, 'previousStock')
  const targetTotal = sumBy(filtered, 'targetStock')
  const currentPercent = targetTotal ? (currentTotal / targetTotal) * 100 : null
  const changePercent = previousTotal ? ((currentTotal - previousTotal) / previousTotal) * 100 : null
  const warehouseChart = shareData(warehouseTotals(filtered), currentTotal)
  const categoryChart = shareData(groupProducts(filtered, 'category').map((group) => ({ name: group.name, value: group.totalStock })), currentTotal)
  const exportData = filtered.map((product) => ({
    Product: product.product,
    'RM Code': product.code,
    Category: product.category,
    [previousName]: product.previousStock,
    [currentName]: product.currentStock,
    'UK Store': product.freelan,
    Navimana: product.navimana,
    Agro: product.agro,
    SM: product.sm,
    Change: product.change,
    'Change %': product.changePercent,
    'Target Stock': product.targetStock,
    'Stock %': product.sourcePercent ?? product.stockPercent,
    Status: product.status,
    Comments: comments[product.id] ?? rawComment(product),
  }))

  useEffect(() => {
    if (loadedCommentsKey.current !== commentsStorageKey) {
      try {
        const savedComments = window.localStorage.getItem(commentsStorageKey)
        setComments(savedComments ? JSON.parse(savedComments) : {})
      } catch (error) {
        console.error('Could not load saved warehouse comments.', error)
        setComments({})
      }
      loadedCommentsKey.current = commentsStorageKey
      return
    }

    try {
      window.localStorage.setItem(commentsStorageKey, JSON.stringify(comments))
    } catch (error) {
      console.error('Could not save warehouse comments.', error)
    }
  }, [comments, commentsStorageKey])

  useEffect(() => {
    function finishWarehousePrint() {
      setPrintWarehouse(false)
    }
    window.addEventListener('afterprint', finishWarehousePrint)
    return () => window.removeEventListener('afterprint', finishWarehousePrint)
  }, [])

  function updateComment(productId, value) {
    setComments((currentComments) => ({ ...currentComments, [productId]: value }))
  }

  function saveWarehousePdf() {
    const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = document.internal.pageSize.getWidth()
    const source = dataset.sourceUrl || dataset.fileName || 'Uploaded data'
    const generated = new Date().toLocaleString()
    const pdfRows = filtered.map((product) => [
      `${product.product}\n${product.code}`,
      product.category,
      `${formatValue(product.freelan)} kg\n${formatPercent(product.warehouseShares?.freelan)}`,
      `${formatValue(product.navimana)} kg\n${formatPercent(product.warehouseShares?.navimana)}`,
      `${formatValue(product.agro)} kg\n${formatPercent(product.warehouseShares?.agro)}`,
      `${formatValue(product.sm)} kg\n${formatPercent(product.warehouseShares?.sm)}`,
      WAREHOUSES.map((warehouse) => `${warehouse.label}: ${formatPercent(product.warehouseShares?.[warehouse.key])}`).join('\n'),
      `${formatValue(product.currentStock)} kg`,
      formatPercent(product.sourcePercent ?? product.stockPercent),
      product.status,
      (comments[product.id] ?? rawComment(product)) || '—',
    ])

    document.setFillColor(19, 34, 56)
    document.rect(0, 0, pageWidth, 30, 'F')
    document.setTextColor(255, 255, 255)
    document.setFont('helvetica', 'bold')
    document.setFontSize(18)
    document.text('WAREHOUSE STOCK BY PRODUCT', 14, 13)
    document.setFont('helvetica', 'normal')
    document.setFontSize(9)
    document.text('Freelan Inventory Report', 14, 20)
    document.text(`Sheet: ${currentName}   |   Source: ${source}`, 14, 25)
    document.text(`Generated: ${generated}`, pageWidth - 14, 25, { align: 'right' })

    autoTable(document, {
      startY: 36,
      head: [['Product', 'Category', 'UK Store', 'Navimana', 'Agro', 'SM', 'Share', 'Total Stock', '%', 'Status', 'Comments']],
      body: pdfRows,
      theme: 'grid',
      margin: { left: 10, right: 10, bottom: 14 },
      styles: {
        font: 'helvetica',
        fontSize: 7,
        cellPadding: 2,
        textColor: [51, 65, 85],
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 20 },
        2: { cellWidth: 18 },
        3: { cellWidth: 18 },
        4: { cellWidth: 18 },
        5: { cellWidth: 18 },
        6: { cellWidth: 28 },
        7: { cellWidth: 19 },
        8: { cellWidth: 12 },
        9: { cellWidth: 23, halign: 'center' },
        10: { cellWidth: 42 },
      },
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index >= 2 && data.column.index <= 5) {
          const warehouseColors = [[234, 179, 8], [220, 38, 38], [22, 163, 74], [37, 99, 235]]
          data.cell.styles.fillColor = warehouseColors[data.column.index - 2]
          data.cell.styles.textColor = data.column.index === 2 ? [51, 65, 85] : [255, 255, 255]
        }
        if (data.section === 'body' && data.column.index >= 2 && data.column.index <= 5) {
          const warehouseColors = [[254, 249, 195], [254, 226, 226], [220, 252, 231], [219, 234, 254]]
          data.cell.styles.fillColor = warehouseColors[data.column.index - 2]
        }
        if (data.section === 'body' && data.column.index === 9) {
          const statusStyle = pdfStatusStyle(String(data.cell.raw))
          data.cell.styles.fillColor = statusStyle.fill
          data.cell.styles.textColor = statusStyle.text
          data.cell.styles.fontStyle = 'bold'
        }
      },
      didDrawPage: (data) => {
        document.setFontSize(8)
        document.setTextColor(100, 116, 139)
        document.text(`Freelan Inventory Report · Page ${data.pageNumber}`, pageWidth - 10, 202, { align: 'right' })
      },
    })

    const safeName = String(dataset.fileName || 'freelan-inventory').replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-')
    document.save(`${safeName}-warehouse-stock-${currentName.replace(/[^a-z0-9-_]+/gi, '-')}.pdf`)
  }

  return (
    <main className={`management-page${printWarehouse ? ' print-warehouse' : ''}`}>
      <header className="management-header">
        <div>
          <p className="eyebrow">INVENTORY CONTROL · MANAGEMENT VIEW</p>
          <h1>RAW MATERIAL STOCK ANALYSIS DASHBOARD</h1>
          <p>{previousName} vs {currentName} · {dataset.fileName} · Last updated: {dataset.lastUpdated?.toLocaleString()}</p>
        </div>
        <div className="management-actions">
          {dataset.sourceUrl && <button className="ghost-action" onClick={onRefresh} disabled={refreshing}><RefreshCcw size={16} /> {refreshing ? 'Refreshing...' : 'Refresh Data'}</button>}
          <button className="ghost-action" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button className="primary-action" onClick={() => exportRows(exportData, dataset.fileName)}><Download size={16} /> Export</button>
        </div>
      </header>

      <section className="month-source-bar">
        <Table2 size={16} />
        <span>Sheet data only</span>
        <label>Compare
          <select value={previousName} onChange={(event) => setPreviousName(event.target.value)}>
            {sheets.map((sheet) => <option key={`previous-${sheet.name}`}>{sheet.name}</option>)}
          </select>
        </label>
        <label>Show
          <select value={currentName} onChange={(event) => setCurrentName(event.target.value)}>
            {sheets.map((sheet) => <option key={`current-${sheet.name}`}>{sheet.name}</option>)}
          </select>
        </label>
        <label className="sheet-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, code, category" />
        </label>
      </section>

      <section className="management-kpis">
        <Kpi label="Total Products" value={filtered.length} />
        <Kpi label="Total Stock (kg)" value={formatValue(currentTotal)} tone="green" />
        <Kpi label="Low Stock Items" value={lowStock.length} tone="warning" />
        <Kpi label="Overstock Items" value={overstock.length} tone="violet" />
        <Kpi label="Overall Stock %" value={formatPercent(currentPercent)} tone="blue" />
        <Kpi label="Stock Change %" value={formatPercent(changePercent)} tone={changePercent >= 0 ? 'green' : 'warning'} />
      </section>

      <section className="warehouse-legend">
        {WAREHOUSES.map((warehouse) => (
          <div key={warehouse.key} className="warehouse-chip">
            <i style={{ background: warehouse.color }} />
            <span>{warehouse.label}</span>
            <strong>{formatValue(filtered.reduce((sum, product) => sum + (product[warehouse.key] || 0), 0))} kg</strong>
            <em>{formatPercent(currentTotal ? (sumBy(filtered, warehouse.key) / currentTotal) * 100 : null)}</em>
          </div>
        ))}
      </section>

      <section className="share-grid">
        <SharePie title="Category share (%)" data={categoryChart} colors={CATEGORY_COLORS} empty="No category totals were found in this sheet." />
        <SharePie title="Warehouse share (%)" data={warehouseChart} colors={WAREHOUSES.map((warehouse) => warehouse.color)} empty="No UK Store, Navimana, Agro, or SM stock columns were found." />
      </section>

      <section className="top-low-stock">
        <div className="top-low-heading">
          <div>
            <p className="eyebrow">ACTION REQUIRED</p>
            <h2>TOP 5 LOW STOCK ITEMS</h2>
            <p>Lowest sheet % products, with the warehouse branches that currently hold stock.</p>
          </div>
          <span>{lowStock.length} items</span>
        </div>
        <div className="top-low-grid">
          {topLow.length ? topLow.map((product, index) => (
            <article className="top-low-item" key={product.id}>
              <b>#{index + 1}</b>
              <div>
                <strong>{product.product}</strong>
                <small>{product.code} · {product.category}</small>
              </div>
              <span>Stock {formatValue(product.currentStock)} kg<br />Target {formatValue(product.targetStock)} kg</span>
              <em>{formatPercent(product.stockPercent)}</em>
              <BranchChips product={product} />
              <WarehouseBar product={product} />
              <label className={`status-pill ${statusClass(product.status)}`}>{product.status}</label>
            </article>
          )) : <p className="empty-message">No low-stock products found.</p>}
        </div>
      </section>

      <section className="mix-stock-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">WAREHOUSE STOCK BY PRODUCT</p>
            <h2>Each item’s stock in UK Store, Navimana, Agro, and SM</h2>
            <p className="section-muted">Warehouse kg and % come from the sheet. The % column is the same stock percentage as in Google Sheets. UK Store is yellow, Navimana is red, Agro is green, and SM is blue.</p>
          </div>
          <button className="ghost-action warehouse-pdf-action" onClick={saveWarehousePdf}><FileDown size={16} /> Save table as PDF</button>
        </div>
        <div className="table-scroll">
          <table className="comparison-table source-stock-table warehouse-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                {WAREHOUSES.map((warehouse) => (
                  <th key={warehouse.key} className={`wh-${warehouse.key}`}>{warehouse.label}</th>
                ))}
                <th>Share</th>
                <th>Total Stock</th>
                <th>%</th>
                <th>Status</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={`source-${product.id}`}>
                  <td>
                    <strong>{product.product}</strong>
                    <small>{product.code}</small>
                  </td>
                  <td>{product.category}</td>
                  {WAREHOUSES.map((warehouse) => {
                    const value = product[warehouse.key]
                    const share = product.warehouseShares?.[warehouse.key]
                    return (
                      <td key={warehouse.key} className={`wh-${warehouse.key}`}>
                        <strong>{formatValue(value)}</strong>
                        <small>{(value || 0) > 0 ? formatPercent(share) : '—'}</small>
                      </td>
                    )
                  })}
                  <td><WarehouseBar product={product} /></td>
                  <td><strong>{formatValue(product.currentStock)} kg</strong></td>
                  <td><strong>{formatPercent(product.sourcePercent ?? product.stockPercent)}</strong></td>
                  <td><label className={`status-pill ${statusClass(product.status)}`}>{product.status}</label></td>
                  <td>
                    <input
                      className="stock-comment-input"
                      type="text"
                      value={comments[product.id] ?? rawComment(product)}
                      onChange={(event) => updateComment(product.id, event.target.value)}
                      placeholder="Add a comment"
                      aria-label={`Comment for ${product.product}`}
                    />
                    <span className="stock-comment-print">{(comments[product.id] ?? rawComment(product)) || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

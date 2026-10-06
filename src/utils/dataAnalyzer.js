export const STOCK_STATUSES = ['Critical', 'Low Stock', 'Sufficient', 'Overstock']

export const WAREHOUSES = [
  { key: 'freelan', label: 'UK Store', color: '#EAB308' },
  { key: 'navimana', label: 'Navimana', color: '#DC2626' },
  { key: 'agro', label: 'Agro', color: '#16A34A' },
  { key: 'sm', label: 'SM', color: '#2563EB' },
]

export function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || /^(-|n\/a|na|#value!|#n\/a|#div\/0!|error)$/i.test(text)) return null
  const negative = /^\(.*\)$/.test(text)
  const normalized = text.replace(/[,$%\s()]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null
}

export function toPercent(value) {
  const parsed = toNumber(value)
  if (parsed === null) return null
  if (typeof value === 'string' && /%/.test(value)) return parsed
  if (typeof value === 'number' && Math.abs(parsed) <= 10) return parsed * 100
  return parsed
}

function keyOf(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findColumn(columns, aliases, { preferExact = true, exclude = [] } = {}) {
  const keys = aliases.map(keyOf).filter(Boolean)
  const excluded = new Set(exclude.map(keyOf))
  const available = columns.filter((column) => {
    const key = keyOf(column)
    if (excluded.has(key)) return false
    if (exclude.some((item) => String(item) === String(column))) return false
    return true
  })

  // Prefer literal matches for short symbols like "%"
  const literal = available.find((column) => aliases.some((alias) => String(column).trim() === String(alias).trim()))
  if (literal) return literal

  const exact = available.find((column) => keys.includes(keyOf(column)))
  if (exact) return exact
  if (preferExact && keys.length && keys.every((key) => key.length <= 2)) return null

  return available.find((column) => keys.some((key) => key.length > 4 && keyOf(column).includes(key) && !/target|total\+?20|required/.test(keyOf(column)))) || null
}

function classifyMaterial(text) {
  const value = String(text || '').toLowerCase()
  if (/powder|ground/.test(value)) return 'Powder'
  if (/flour|maida|atta/.test(value)) return 'Flour'
  if (/seed|seeds/.test(value)) return 'Seeds'
  if (/whole|direct/.test(value)) return 'Whole / Direct RM'
  return /chilli|turmeric|pepper|coriander|cumin|fennel|ginger|salt|clove/.test(value) ? 'Whole / Direct RM' : 'Other'
}

function classifyCategory(text) {
  const value = String(text || '').toLowerCase()
  const categories = [
    ['Chilli', /chilli|chile|chili/],
    ['Turmeric', /turmeric|haldi/],
    ['Pepper', /pepper/],
    ['Coriander', /coriander/],
    ['Cumin', /cumin/],
    ['Fennel', /fennel/],
    ['Ginger', /ginger/],
    ['Salt', /salt/],
    ['Clove', /clove/],
    ['Flour', /flour|maida|atta/],
  ]
  return categories.find(([, pattern]) => pattern.test(value))?.[0] || 'Other / Unclassified'
}

export function getNumericStats(rows, column) {
  const values = rows.map((row) => toNumber(row[column])).filter((value) => value !== null)
  if (!values.length) return { sum: 0, average: 0, min: 0, max: 0, count: 0 }
  const sum = values.reduce((total, value) => total + value, 0)
  return { sum, average: sum / values.length, min: Math.min(...values), max: Math.max(...values), count: values.length }
}

export function getStockStatus(stockPercent, thresholds = { critical: 50, sufficient: 80, overstock: 100 }) {
  if (stockPercent < thresholds.critical) return 'Critical'
  if (stockPercent < thresholds.sufficient) return 'Low Stock'
  if (stockPercent <= thresholds.overstock) return 'Sufficient'
  return 'Overstock'
}

export function analyzeData(rows, thresholds) {
  if (!rows.length) throw new Error('The dataset is empty. Add at least one row of data.')
  const columns = Object.keys(rows[0]).filter((column) => column !== '__category')

  const required = findColumn(columns, ['Target / Freelan (kg)', 'Total / Freelan (kg)', 'Total Freelan', 'Required Stock', 'Required', 'Target'])
  const target = findColumn(columns, ['Total +20% / Freelan (kg)', 'Total +20%', 'Total+20%', 'Target Stock'])
  const freelanTargetLike = [required, target].filter(Boolean)

  const sources = {
    freelan: findColumn(columns, ['UK Stock', 'UK Store', 'UK Stores', 'Freelan Stock', 'UK'], { exclude: freelanTargetLike }),
    navimana: findColumn(columns, ['Navimana Stock', 'Navimana'], { exclude: freelanTargetLike }),
    agro: findColumn(columns, ['Agro Stock', 'Agro', 'SM Agro', 'SM-Agro'], { exclude: freelanTargetLike }),
    sm: findColumn(columns, ['SM Stock', 'SM'], { exclude: freelanTargetLike }),
  }

  // Never treat Target / Total+20 Freelan columns as warehouse stock.
  if (sources.freelan && /target|total\+?20|required|freelan\(kg\)|freelankg/.test(keyOf(sources.freelan)) && !/uk/.test(keyOf(sources.freelan))) {
    sources.freelan = findColumn(columns, ['UK Stock', 'UK Store', 'UK Stores', 'UK'], { exclude: freelanTargetLike })
  }

  const totalColumn = findColumn(columns, ['Total Stock', 'Actual Total Stock', 'Stock Total'])
  const quantityColumn = findColumn(columns, ['Current Stock', 'Available Stock', 'Available Quantity', 'Quantity', 'Qty', 'Balance', 'Stock'], { exclude: [...freelanTargetLike, sources.freelan, sources.navimana, sources.agro, sources.sm, totalColumn].filter(Boolean) })
  const productColumn = findColumn(columns, ['Product / Description', 'Product', 'Description', 'Product Name', 'RM Name']) || columns.find((column) => /product|description|name/i.test(column)) || columns[0]
  const codeColumn = findColumn(columns, ['RM Code', 'RMCode', 'Material Code', 'Item ID', 'Item Code', 'Product ID', 'Product Code', 'Code'])
  const mixColumn = findColumn(columns, ['Mix RM', 'MixRM', 'Mix'], { preferExact: true })
  const percentageColumn = (() => {
    const exact = columns.find((column) => ['%', 'stock %', 'stock percentage', 'percentage'].includes(String(column).trim().toLowerCase()))
    return exact || null
  })()
  const config = thresholds || { critical: 50, sufficient: 80, overstock: 100 }

  const products = rows.map((row, index) => {
    const sourceValues = Object.fromEntries(Object.entries(sources).map(([name, column]) => [name, column ? toNumber(row[column]) : null]))
    const sourceColumnsExist = Object.values(sources).some(Boolean)
    const sourceStock = Object.values(sourceValues).some((value) => value !== null)
      ? Object.values(sourceValues).map((value) => value ?? 0).reduce((sum, value) => sum + value, 0)
      : null
    const quantityStock = quantityColumn ? toNumber(row[quantityColumn]) : null
    const listedTotal = totalColumn ? toNumber(row[totalColumn]) : null
    const totalStock = listedTotal ?? (sourceColumnsExist ? sourceStock : quantityStock)
    const requiredStock = required ? toNumber(row[required]) : null
    const targetStock = target ? toNumber(row[target]) : requiredStock === null ? null : requiredStock * 1.2
    const denominator = targetStock !== null && targetStock !== 0 ? targetStock : requiredStock
    const calculatedPercent = denominator !== null && denominator !== 0 ? ((totalStock ?? 0) / denominator) * 100 : null
    const sourcePercent = percentageColumn ? toPercent(row[percentageColumn]) : null
    const stockPercent = sourcePercent ?? calculatedPercent
    const invalidStockData = totalStock === null
    const description = String(row[productColumn] || `Row ${index + 1}`).trim()
    const sheetCategory = String(row.__category || '').trim()
    const mixRmValue = mixColumn ? String(row[mixColumn] ?? '').trim() : ''
    const namedMix = mixRmValue && !/^n\/?a$/i.test(mixRmValue) && !/^\d+$/.test(mixRmValue) ? mixRmValue : ''
    const category = sheetCategory || namedMix || classifyCategory(`${description} ${codeColumn ? row[codeColumn] : ''}`)
    const materialType = classifyMaterial(description)
    const warehouseTotal = ['freelan', 'navimana', 'agro', 'sm'].reduce((sum, key) => sum + (sourceValues[key] || 0), 0)
    const branches = WAREHOUSES.filter((warehouse) => (sourceValues[warehouse.key] || 0) > 0)

    return {
      id: `${index}-${String(row[codeColumn] || description)}`,
      mixRm: namedMix || sheetCategory || 'N/A',
      code: codeColumn ? (row[codeColumn] ?? 'N/A') : 'N/A',
      product: description,
      requiredStock,
      targetStock,
      ...sourceValues,
      totalStock,
      stockPercent,
      calculatedPercent,
      stockValueValid: totalStock !== null,
      sourceTotal: listedTotal,
      sourcePercent,
      warehouseShares: Object.fromEntries(
        WAREHOUSES.map((warehouse) => [warehouse.key, warehouseTotal ? ((sourceValues[warehouse.key] || 0) / warehouseTotal) * 100 : 0]),
      ),
      branches,
      category,
      materialType,
      invalidStockData,
      status: invalidStockData || stockPercent === null ? 'Data Quality Issue' : getStockStatus(stockPercent, config),
      shortage: Math.max((targetStock || 0) - (totalStock || 0), 0),
      excess: Math.max((totalStock || 0) - (targetStock || 0), 0),
      raw: row,
    }
  }).filter((product) => {
    // Drop category marker leftovers and rows without a real product identity.
    const name = String(product.product || '').trim()
    if (!name || /^\d+$/.test(name)) return false
    if (/^(mix|direct)\s*r\/?m$|^flavour?s?$|^powder$|^others?$|^soya$/i.test(name) && product.code === 'N/A') return false
    return true
  })

  const warnings = []
  const invalidStockRows = products.filter((product) => product.invalidStockData).length
  if (invalidStockRows) warnings.push(`${invalidStockRows} row${invalidStockRows === 1 ? '' : 's'} have missing or invalid stock data and were excluded from stock status counts.`)
  const codes = products.map((product) => String(product.code)).filter((code) => code !== 'N/A')
  const duplicateCodes = [...new Set(codes.filter((code, index) => codes.indexOf(code) !== index))]
  if (duplicateCodes.length) warnings.push(`${duplicateCodes.length} duplicate RM Code${duplicateCodes.length === 1 ? '' : 's'} found.`)
  const invalidValues = products.filter((product) => Object.values(product.raw).some((value) => typeof value === 'string' && /^#(value|n\/a|div\/0!)/i.test(value))).length
  if (invalidValues) warnings.push(`${invalidValues} row${invalidValues === 1 ? '' : 's'} contain spreadsheet errors.`)
  const negatives = products.filter((product) => Object.values(sources).some((column) => column && toNumber(product.raw[column]) < 0)).length
  if (negatives) warnings.push(`${negatives} product${negatives === 1 ? '' : 's'} contain negative stock values.`)
  const mismatches = products.filter((product) => {
    const sourceSum = ['freelan', 'navimana', 'agro', 'sm'].reduce((sum, key) => sum + (product[key] || 0), 0)
    return product.sourceTotal !== null && Math.abs(product.sourceTotal - sourceSum) > 1
  }).length
  if (mismatches) warnings.push(`${mismatches} row${mismatches === 1 ? '' : 's'} have Total Stock different from warehouse totals.`)
  const unclassified = products.filter((product) => product.category === 'Other / Unclassified' || product.category === 'Uncategorized').length
  if (unclassified) warnings.push(`${unclassified} product${unclassified === 1 ? '' : 's'} need category review.`)

  return {
    rows,
    columns,
    products,
    warnings,
    mapping: { required, target, sources, totalColumn, quantityColumn, productColumn, codeColumn, mixColumn, percentageColumn },
    thresholds: config,
  }
}

export function formatValue(value) {
  return value === null || value === undefined || !Number.isFinite(value) ? 'N/A' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)
}

export function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  const rounded = Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : Number(value.toFixed(1))
  return `${rounded}%`
}

export function groupProducts(products, field) {
  const groups = new Map()
  products.forEach((product) => {
    const name = product[field] || 'Unclassified'
    const current = groups.get(name) || { name, totalStock: 0, products: 0, averagePercent: 0, lowStock: 0, overstock: 0, percentCount: 0 }
    current.totalStock += product.totalStock || 0
    current.products += 1
    if (product.stockPercent !== null) {
      current.averagePercent += product.stockPercent
      current.percentCount += 1
    }
    if (product.status === 'Critical' || product.status === 'Low Stock') current.lowStock += 1
    if (product.status === 'Overstock') current.overstock += 1
    groups.set(name, current)
  })
  return [...groups.values()]
    .map((group) => ({ ...group, averagePercent: group.percentCount ? group.averagePercent / group.percentCount : null }))
    .sort((a, b) => b.totalStock - a.totalStock)
}

export function warehouseTotals(products) {
  return WAREHOUSES.map((warehouse) => {
    const value = products.reduce((sum, product) => sum + (product[warehouse.key] || 0), 0)
    return { ...warehouse, name: warehouse.label, value }
  }).filter((item) => item.value > 0)
}

export function shareData(items, total) {
  const denominator = total || items.reduce((sum, item) => sum + (item.value || item.totalStock || 0), 0)
  return items.map((item) => {
    const value = item.value ?? item.totalStock ?? 0
    return { ...item, value, percent: denominator ? (value / denominator) * 100 : 0 }
  })
}

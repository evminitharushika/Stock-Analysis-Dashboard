import Papa from 'papaparse'
import * as XLSX from 'xlsx'

const HEADER_KEYWORDS = [
  'mix rm', 'rm code', 'product', 'description', 'total', 'total +20',
  'freelan', 'navimana', 'sm', 'agro', 'total stock', '%', 'uk stock', 'uk store', 'target',
]

const CATEGORY_PATTERNS = [
  /^mix\s*r\/?m$/i,
  /^direct\s*r\/?m$/i,
  /^flavou?rs?$/i,
  /^powder$/i,
  /^others?$/i,
  /^soya$/i,
  /^whole$/i,
  /^raw\s*material/i,
]

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function isEmpty(value) {
  return value === null || value === undefined || normalizeText(value) === ''
}

function looksLikeCode(value) {
  return /^[A-Z]{1,6}[A-Z0-9_-]{2,}$/i.test(String(value ?? '').trim())
}

function looksLikeProductName(value) {
  const text = String(value ?? '').trim()
  return text.length > 2 && /[a-zA-Z]/.test(text) && !/^\d+([.,]\d+)?%?$/.test(text)
}

function looksLikeCategoryHeader(row) {
  if (!row?.length) return false
  const first = String(row[0] ?? '').trim()
  if (!first || /^\d+$/.test(first)) return false
  if (CATEGORY_PATTERNS.some((pattern) => pattern.test(first))) return true
  if (looksLikeCode(first)) return false
  const rest = row.slice(1)
  const filled = rest.filter((cell) => !isEmpty(cell))
  if (filled.length > 2) return false
  // Category rows usually only have a title (and maybe an item count).
  return filled.every((cell) => /^\d+$/.test(String(cell).trim())) && !looksLikeCode(rest[0]) && !looksLikeProductName(rest[1])
}

export function detectHeaderRow(rows) {
  const candidates = rows.slice(0, 12)
  let bestIndex = 0
  let bestScore = -1
  candidates.forEach((row, index) => {
    const score = row.reduce((total, cell) => {
      const value = normalizeText(cell)
      return total + (HEADER_KEYWORDS.some((keyword) => value === keyword || value.includes(keyword)) ? 1 : 0)
    }, 0)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestScore > 0 ? bestIndex : 0
}

function inferMissingHeaders(headerRow, sampleRows) {
  const headers = headerRow.map((header) => String(header ?? '').trim())
  const samples = sampleRows.filter((row) => !looksLikeCategoryHeader(row)).slice(0, 20)

  const emptyIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => !header)
    .map(({ index }) => index)

  emptyIndexes.forEach((index) => {
    const values = samples.map((row) => row[index]).filter((value) => !isEmpty(value))
    if (!values.length) return
    const codeHits = values.filter(looksLikeCode).length
    const nameHits = values.filter((value) => looksLikeProductName(value) && !looksLikeCode(value)).length
    const mostlyCodes = codeHits >= Math.max(2, values.length * 0.5)
    const mostlyNames = nameHits >= Math.max(2, values.length * 0.5)
    // Prefer earlier empty columns for code/name; trailing sparse note columns stay generic.
    if (mostlyCodes && index <= 2) headers[index] = 'RM Code'
    else if (mostlyNames && index <= 3) headers[index] = 'Product / Description'
  })

  // If first column is a category label like "Mix R/M" but data is row numbers, keep a clearer name.
  if (/^mix\s*r\/?m$/i.test(headers[0] || '')) {
    const firstValues = samples.map((row) => row[0]).filter((value) => !isEmpty(value))
    if (firstValues.every((value) => /^\d+$/.test(String(value).trim()) || looksLikeCategoryHeader([value]))) {
      headers[0] = '#'
    }
  }

  return headers
}

function makeUniqueHeaders(headerRow, precedingRows) {
  const used = new Map()
  const headerCounts = headerRow.reduce((counts, header) => {
    const key = normalizeText(header)
    counts.set(key, (counts.get(key) || 0) + 1)
    return counts
  }, new Map())
  const groupText = precedingRows.flat().map(normalizeText)
  const hasTargetGroup = groupText.some((value) => value.includes('total +20') || value.includes('total+20') || value.includes('target'))

  return headerRow.map((header, index) => {
    const base = String(header ?? '').trim() || `Column ${index + 1}`
    const normalized = normalizeText(base)
    const occurrence = (used.get(normalized) || 0) + 1
    used.set(normalized, occurrence)
    const isDuplicate = headerCounts.get(normalized) > 1

    if (isDuplicate && normalized.includes('freelan') && hasTargetGroup) {
      if (occurrence === 1) return 'Target / Freelan (kg)'
      if (occurrence === 2) return 'Total +20% / Freelan (kg)'
      return `${base} ${occurrence}`
    }

    return occurrence === 1 ? base : `${base} ${occurrence}`
  })
}

function initialCategoryFromHeader(headerRow) {
  const first = String(headerRow?.[0] ?? '').trim()
  if (CATEGORY_PATTERNS.some((pattern) => pattern.test(first))) return first
  return 'Uncategorized'
}

function attachCategories(objectRows, matrixRows, headerIndex) {
  let currentCategory = initialCategoryFromHeader(matrixRows[headerIndex])
  const dataMatrix = matrixRows.slice(headerIndex + 1)
  const result = []

  dataMatrix.forEach((matrixRow, index) => {
    if (looksLikeCategoryHeader(matrixRow)) {
      currentCategory = String(matrixRow[0]).trim()
      return
    }

    const row = objectRows[index]
    if (!row) return

    const meaningful = Object.values(row).filter((value) => !isEmpty(value))
    if (!meaningful.length) return

    const first = String(matrixRow[0] ?? '').trim()
    const second = String(matrixRow[1] ?? '').trim()
    const third = String(matrixRow[2] ?? '').trim()
    const isSectionNoise = CATEGORY_PATTERNS.some((pattern) => pattern.test(first)) && !looksLikeCode(second) && !looksLikeProductName(third)
    if (isSectionNoise) return

    result.push({ ...row, __category: currentCategory })
  })

  return result
}

export function rowsToObjects(rows, headerIndex = detectHeaderRow(rows)) {
  const rawHeader = rows[headerIndex] || []
  const sampleRows = rows.slice(headerIndex + 1)
  const inferred = inferMissingHeaders(rawHeader, sampleRows)
  const headers = makeUniqueHeaders(inferred, rows.slice(0, headerIndex))
  const objectRows = sampleRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])))
  return cleanRows(attachCategories(objectRows, rows, headerIndex))
}

export function parseRows(rows) {
  return rowsToObjects(rows)
}

export function parseFile(file) {
  return new Promise((resolve, reject) => {
    if (file.name.toLowerCase().endsWith('.csv')) {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: false,
        dynamicTyping: false,
        complete: ({ data, errors }) => {
          if (errors.length && !data.length) reject(new Error('We could not read this CSV file.'))
          else {
            const rows = parseRows(data)
            resolve({ rows, sheets: [{ name: 'CSV', rows }] })
          }
        },
        error: () => reject(new Error('We could not read this CSV file.')),
      })
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: 'array', cellDates: true })
        const sheets = workbook.SheetNames.map((name) => ({
          name,
          rows: parseRows(XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, raw: true })),
        }))
        resolve({ rows: (sheets.find((sheet) => sheet.rows.length) || sheets[0])?.rows || [], sheets })
      } catch {
        reject(new Error('We could not read this spreadsheet. Check that it is a valid Excel file.'))
      }
    }
    reader.onerror = () => reject(new Error('We could not read this file.'))
    reader.readAsArrayBuffer(file)
  })
}

export function cleanRows(rows) {
  return rows
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim(), typeof value === 'string' ? value.trim() : value])))
    .filter((row) => Object.entries(row).some(([key, value]) => key !== '__category' && !isEmpty(value)))
}

import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { parseRows } from './excelParser'

export function getGoogleSheetId(input) {
  const match = input.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) throw new Error('Enter a valid Google Sheets URL.')
  return match[1]
}

export function getGoogleSheetCsvUrl(input) {
  const id = getGoogleSheetId(input)
  const gid = input.match(/(?:[?#&])gid=(\d+)/)?.[1]
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`
}

export function getGoogleSheetXlsxUrl(input) {
  return `https://docs.google.com/spreadsheets/d/${getGoogleSheetId(input)}/export?format=xlsx`
}

function workbookToSheets(workbook) {
  return workbook.SheetNames.map((name) => ({ name, rows: parseRows(XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, raw: true })) }))
}

export async function fetchGoogleSheet(input) {
  const response = await fetch(getGoogleSheetXlsxUrl(input))
  if (response.ok) {
    try {
      const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array', cellDates: true })
      const sheets = workbookToSheets(workbook)
      if (sheets.length) return { rows: (sheets.find((sheet) => sheet.rows.length) || sheets[0]).rows, sheets }
    } catch {
      // Fall through to CSV for Sheets exports that do not support XLSX.
    }
  }
  const csvResponse = await fetch(getGoogleSheetCsvUrl(input))
  if (!csvResponse.ok) throw new Error('This Google Sheet could not be accessed. Set sharing to Anyone with the link → Viewer.')
  const csv = await csvResponse.text()
  return new Promise((resolve, reject) => {
    Papa.parse(csv, {
      header: false, skipEmptyLines: false, dynamicTyping: false,
      complete: ({ data, errors }) => {
        if (errors.length && !data.length) reject(new Error('The Google Sheet returned an unreadable CSV.'))
        else { const rows = parseRows(data); resolve({ rows, sheets: [{ name: 'Google Sheet', rows }] }) }
      },
      error: () => reject(new Error('The Google Sheet could not be parsed.')),
    })
  })
}

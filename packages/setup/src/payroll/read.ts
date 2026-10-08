// Read a payroll export (CSV or Excel) into a header row and data rows.
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/node';

export type Cell = string | number | boolean | Date | null;
export interface Table {
  headers: string[];
  rows: Cell[][];
}

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;

export class UploadError extends Error {}

export function fileKind(fileName: string): 'csv' | 'xlsx' {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx') return 'xlsx';
  throw new UploadError('Upload a CSV or Excel (.xlsx) file.');
}

export async function readTable(fileName: string, bytes: Uint8Array): Promise<Table> {
  if (bytes.byteLength > MAX_BYTES) throw new UploadError('That file is over 5 MB. Export just the current pay period.');
  let data: Cell[][];
  if (fileKind(fileName) === 'csv') {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
    data = parsed.data.map((r) => r.map((c) => (c.trim() === '' ? null : c.trim())));
  } else {
    try {
      data = (await readSheet(Buffer.from(bytes))) as Cell[][];
    } catch {
      throw new UploadError('Fork couldn’t open that Excel file. Try saving it again as .xlsx or CSV.');
    }
  }
  // The header row is the first row with at least two filled cells (exports often start with a title).
  const start = data.findIndex((r) => r.filter((c) => c !== null && c !== '').length >= 2);
  if (start < 0) throw new UploadError('That file looks empty.');
  const headers = data[start]!.map((c, i) => (c === null || c === '' ? `Column ${i + 1}` : String(c).trim()));
  const dupes = headers.filter((h, i) => headers.indexOf(h) !== i);
  if (dupes.length) throw new UploadError(`Two columns are both called “${dupes[0]}”. Rename one and upload again.`);
  const rows = data.slice(start + 1).filter((r) => r.some((c) => c !== null && c !== ''));
  if (!rows.length) throw new UploadError('That file has a header row but no people.');
  if (rows.length > MAX_ROWS) throw new UploadError(`That file has more than ${MAX_ROWS} rows. Fork is built for companies of up to 100 people.`);
  return { headers, rows: rows.map((r) => headers.map((_, i) => r[i] ?? null)) };
}

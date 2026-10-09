// Prepare an uploaded document for the interpreter: PDFs go as they are; Word files become text.
import mammoth from 'mammoth';
import { UploadError } from '../payroll/read';

export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export type PreparedDocument = { mimeType: string; document: { mediaType: 'application/pdf'; base64: string } | { mediaType: 'text/plain'; text: string } };

const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b; // PK, as .docx files are

/** Check the file really is what its name says, by its first bytes. */
export function documentType(fileName: string, bytes: Uint8Array): 'pdf' | 'docx' {
  const ext = fileName.toLowerCase().split('.').pop();
  if (bytes.byteLength > MAX_DOC_BYTES) throw new UploadError('That file is over 10 MB.');
  if (ext === 'pdf' && isPdf(bytes)) return 'pdf';
  if (ext === 'docx' && isZip(bytes)) return 'docx';
  throw new UploadError('Upload a PDF or Word (.docx) file.');
}

export async function prepareDocument(fileName: string, bytes: Uint8Array): Promise<PreparedDocument> {
  if (documentType(fileName, bytes) === 'pdf') {
    return { mimeType: 'application/pdf', document: { mediaType: 'application/pdf', base64: Buffer.from(bytes).toString('base64') } };
  }
  let text: string;
  try {
    text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } catch {
    throw new UploadError('Fork couldn’t open that Word file. Try saving it again, or as a PDF.');
  }
  if (!text.trim()) throw new UploadError('That Word file has no text in it.');
  return { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', document: { mediaType: 'text/plain', text: text.slice(0, 400_000) } };
}

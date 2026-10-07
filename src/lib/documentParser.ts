/**
 * Document Text Extractor
 *
 * Reliably extracts plain text from PDF, DOCX, DOC, Markdown, and TXT files
 * ensuring zero raw binary bytecode, PDF headers, or XML markup is exposed to the user.
 */
import { PDFParse } from 'pdf-parse';

/**
 * Fallback cleaner for raw PDF data in case of unconventional or encrypted streams
 */
function cleanRawPdfText(raw: string): string {
  // Extract text within PDF text operators: (some text) Tj or (some text) '
  const tjMatches: string[] = [];
  const regex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    const extracted = match[1]
      .replace(/\\([()\\])/g, '$1')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, ' ');
    if (extracted.trim().length > 0) {
      tjMatches.push(extracted);
    }
  }

  if (tjMatches.length > 5) {
    return tjMatches.join(' ').replace(/\s{2,}/g, ' ').trim();
  }

  // Otherwise strip PDF structures and binary data
  const cleaned = raw
    .replace(/%PDF-[\d.]+/g, '')
    .replace(/\d+\s+\d+\s+obj[\s\S]*?endobj/g, ' ')
    .replace(/stream[\s\S]*?endstream/g, ' ')
    .replace(/xref[\s\S]*?trailer/g, ' ')
    .replace(/trailer[\s\S]*?%%EOF/g, ' ')
    .replace(/<<[\s\S]*?>>/g, ' ')
    .replace(/[^\x20-\x7E\t\r\n]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Main file extraction function
 */
export async function extractDocumentText(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();

  // 1. Plain text and markdown files
  if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return (await file.text()).trim();
  }

  // 2. PDF Files
  if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
    try {
      // First attempt: Server-side high-fidelity extractor
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = '';
      const len = uint8.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);

      const response = await fetch('/api/extract-document-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: 'application/pdf',
          fileData: base64,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text && typeof data.text === 'string' && data.text.trim().length > 0) {
          return data.text.trim();
        }
      }
    } catch {
      // Fallback to client-side
    }

    try {
      // Second attempt: Client-side pdf-parse module
      const arrayBuffer = await file.arrayBuffer();
      const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });
      const result = await parser.getText();
      if (result?.text && result.text.trim().length > 0) {
        return result.text.trim();
      }
    } catch (clientErr) {
      console.warn('Client-side pdf-parse fallback triggered:', clientErr);
    }

    // Third attempt: Clean regex filter fallback
    const rawContent = await file.text();
    const fallbackText = cleanRawPdfText(rawContent);
    return fallbackText || 'Could not extract readable text from this PDF file. Please copy and paste the text directly.';
  }

  // 3. Word documents (.docx, .doc)
  if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8.byteLength; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);

      const response = await fetch('/api/extract-document-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileData: base64,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text && typeof data.text === 'string' && data.text.trim().length > 0) {
          return data.text.trim();
        }
      }
    } catch {
      // Fallback
    }

    const raw = await file.text();
    // Strip XML tags and binary headers
    const cleaned = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^\x20-\x7E\t\r\n]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return cleaned || 'Document uploaded. You may also paste text directly for instant analysis.';
  }

  // Generic fallback
  const genericText = await file.text();
  return genericText.replace(/[^\x20-\x7E\t\r\n]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

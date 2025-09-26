import JSZip from 'jszip';

interface ImportPayload {
  projectId: string;
  name: string;
  bytes: Uint8Array;
}

export async function validateAndPreviewImport(payload: ImportPayload): Promise<void> {
  // Minimal placeholder for Task 5.2
  // 1) Ensure it's a zip
  // 2) Attempt to read entries
  // 3) Basic structure presence check (best-effort)
  const zip = await JSZip.loadAsync(payload.bytes.buffer);
  const hasCsv = Object.keys(zip.files).some(k => k.toLowerCase().endsWith('project_data.csv'));
  if (!hasCsv) {
    throw new Error('Invalid export: missing project_data.csv');
  }
  // Hand off to a future preview UI or merge pipeline
  alert('Zip validated. Preview/merge flow coming next.');
}



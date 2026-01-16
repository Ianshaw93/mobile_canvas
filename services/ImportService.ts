import JSZip from 'jszip';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { database } from './database';
import type { DBProject, DBPlan, DBPoint, DBImage } from './database';
import { v4 as uuidv4 } from 'uuid';
import useSiteStore from '@/store/useSiteStore';
import { grayscaleCanvasInPlace } from '@/utils/pdfGrayscale';

/**
 * Convert Uint8Array to base64 string in chunks to avoid stack overflow
 */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000; // 32KB chunks to avoid call stack limits
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

/**
 * Generate grayscale thumbnail from PDF data URL
 */
async function generateGrayscaleThumbnailFromPdf(pdfDataUrl: string): Promise<string> {
  // Lazy import pdf.js to avoid SSR issues
  // @ts-ignore
  const pdfjs = await import('pdfjs-dist/build/pdf');
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

  const base64 = pdfDataUrl.includes(',')
    ? pdfDataUrl.split(',')[1]
    : pdfDataUrl;
  const binaryString = typeof atob === 'function' ? atob(base64) : '';
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // @ts-ignore
  const loadingTask = pdfjs.getDocument({ data: bytes.buffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get canvas context');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;
  grayscaleCanvasInPlace(canvas);
  return canvas.toDataURL();
}

export interface ImportPayload {
  projectId?: string; // Optional - only used if merging into specific project
  name: string;
  bytes: Uint8Array;
}

export interface ImportPreview {
  project: {
    id: string;
    name: string;
    clientName: string;
    engineerName: string;
    siteVisitNumber: number;
    createdAt: number;
    updatedAt: number;
  };
  plans: Array<{
    id: string;
    name: string;
    fileName: string;
    pointCount: number;
    imageCount: number;
    hasPdf: boolean;
  }>;
  totalPoints: number;
  totalImages: number;
  warnings: string[];
}

export interface ImportStrategy {
  type: 'new' | 'merge';
  targetProjectId?: string; // Required if type is 'merge'
  planMatching: 'create-new' | 'match-by-name'; // How to handle plans when merging
}

interface ParsedImportData {
  project: ImportPreview['project'];
  plans: Map<string, {
    plan: {
      id: string;
      name: string;
      fileName: string;
      width: number;
      height: number;
      displayScale: number;
      siteVisitNumber: number; // Site visit this plan belongs to
    };
    points: Map<string, {
      point: {
        id: string;
        x: number;
        y: number;
        status: 'Open' | 'Closed' | 'Note';
        comment?: string;
        siteVisitNumber: number; // Site visit this point belongs to
      };
      images: Array<{
        fileName: string;
        comment?: string;
      }>;
    }>;
  }>;
  pdfFiles: Map<string, Uint8Array>; // plan name -> PDF data
  imageFiles: Map<string, Uint8Array>; // image filename -> image data
}

/**
 * Generate a deterministic ID for orphan plans based on plan name
 * This ensures the same plan name always generates the same ID across multiple parseExportZip calls
 * Format: orphan_<sanitized_plan_name>
 */
function generateOrphanPlanId(planName: string): string {
  // Sanitize plan name: lowercase, replace non-alphanumeric with underscore
  const sanitized = planName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return `orphan_${sanitized}`;
}

/**
 * Parse and validate an export zip file
 * @param bytes - The zip file bytes
 * @param previewOnly - If true, skip loading binary data (PDFs/images) for faster preview
 */
export async function parseExportZip(bytes: Uint8Array, previewOnly: boolean = false): Promise<ParsedImportData> {
  // Optimize loadAsync for performance: skip CRC32 check and folder creation
  // This can save 30-50% of parsing time for large zip files
  const zip = await JSZip.loadAsync(bytes, {
    checkCRC32: false,  // Skip CRC verification - significantly faster
    createFolders: false  // Don't create folder structure - saves memory
  });
  const warnings: string[] = [];

  // Check for required files
  const csvFile = Object.keys(zip.files).find(k => 
    k.toLowerCase().endsWith('project_data.csv')
  );
  if (!csvFile) {
    throw new Error('Invalid export: missing project_data.csv');
  }

  // Parse metadata if available
  const metadataFile = Object.keys(zip.files).find(k => 
    k.toLowerCase().endsWith('project_metadata.json')
  );
  let projectMetadata: any = null;
  if (metadataFile) {
    try {
      const metadataContent = await zip.files[metadataFile].async('string');
      projectMetadata = JSON.parse(metadataContent);
    } catch (e) {
      warnings.push('Could not parse project_metadata.json');
    }
  }

  // Parse CSV with proper handling of quoted fields
  const csvContent = await zip.files[csvFile].async('string');
  
  // CSV parser that handles quoted fields with commas
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    result.push(current.trim());
    return result;
  };

  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  
  // Allow CSV with just headers (no data rows) if we have PDFs - this handles projects with zero pins
  let hasHeaders = false;
  let headers: string[] = [];
  
  if (lines.length >= 1) {
    headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
    hasHeaders = headers.length > 0;
  }
  
  // If CSV has no headers, that's a problem (unless we can get project info from metadata)
  if (!hasHeaders && lines.length === 0) {
    throw new Error(`Invalid CSV: file appears to be empty`);
  }
  
  // Find column indices (only needed if we have headers)
  const colIndex = (name: string) => {
    if (headers.length === 0) return -1;
    const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    return idx;
  };

  const getCol = (row: string[], name: string): string => {
    const idx = colIndex(name);
    if (idx === -1) return '';
    const val = row[idx]?.replace(/^"|"$/g, '') || '';
    return val;
  };

  // Extract unique project info from first data row (if available) or metadata
  let projectId = '';
  let projectName = '';
  let clientName = '';
  let engineerName = '';
  let siteVisitNumber = 1;
  
  if (lines.length >= 2) {
    // We have data rows, extract from CSV
    const firstRow = parseCSVLine(lines[1]);
    projectId = getCol(firstRow, 'Project ID');
    projectName = getCol(firstRow, 'Project Name');
    clientName = getCol(firstRow, 'Client Name') || '';
    engineerName = getCol(firstRow, 'Engineer Name') || '';
    siteVisitNumber = parseInt(getCol(firstRow, 'Site Visit Number') || '1', 10) || 1;
  } else if (projectMetadata) {
    // No data rows, try to get from metadata
    projectId = projectMetadata.id || `proj_${Date.now()}`;
    projectName = projectMetadata.name || 'Imported Project';
    clientName = projectMetadata.clientName || '';
    engineerName = projectMetadata.engineerName || '';
    siteVisitNumber = projectMetadata.siteVisitNumber || 1;
  } else {
    // No data and no metadata - use defaults
    projectId = `proj_${Date.now()}`;
    projectName = 'Imported Project';
  }
  
  // Parse dates from metadata or use current time
  let createdAt = Date.now();
  let updatedAt = Date.now();
  if (projectMetadata) {
    if (projectMetadata.createdAt) {
      createdAt = typeof projectMetadata.createdAt === 'number' 
        ? projectMetadata.createdAt 
        : new Date(projectMetadata.createdAt).getTime();
    }
    if (projectMetadata.updatedAt) {
      updatedAt = typeof projectMetadata.updatedAt === 'number'
        ? projectMetadata.updatedAt
        : new Date(projectMetadata.updatedAt).getTime();
    }
  }

  // Build structured data
  const plans = new Map<string, {
    plan: {
      id: string;
      name: string;
      fileName: string;
      width: number;
      height: number;
      displayScale: number;
      siteVisitNumber: number; // Site visit this plan belongs to
    };
    points: Map<string, {
      point: {
        id: string;
        x: number;
        y: number;
        status: 'Open' | 'Closed' | 'Note';
        comment?: string;
        siteVisitNumber: number; // Site visit this point belongs to
      };
      images: Array<{
        fileName: string;
        comment?: string;
      }>;
    }>;
  }>();

  // First, load plans from metadata if available (new format)
  if (projectMetadata && Array.isArray(projectMetadata.plans)) {
    console.log(`[Import] Loading ${projectMetadata.plans.length} plans from metadata`);
    for (const planMeta of projectMetadata.plans) {
      if (planMeta.id && planMeta.name) {
        plans.set(planMeta.id, {
          plan: {
            id: planMeta.id,
            name: planMeta.name,
            fileName: planMeta.fileName ? planMeta.fileName.replace('.pdf', '') : planMeta.name,
            width: planMeta.width || 0,
            height: planMeta.height || 0,
            displayScale: planMeta.displayScale || 1.5,
            siteVisitNumber: planMeta.siteVisitNumber || 1
          },
          points: new Map() // Points will be added from CSV
        });
        console.log(`[Import] Loaded plan from metadata: "${planMeta.name}" (planId: "${planMeta.id}")`);
      }
    }
  }

  // Process CSV rows (only if we have data rows)
  let dataRowCount = 0;
  console.log(`[Import] CSV has ${lines.length} lines, ${headers.length} headers`);
  if (lines.length >= 2 && headers.length > 0) {
    for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    // Skip empty rows or rows with too few columns
    if (row.length === 0 || row.every(cell => !cell.trim())) continue;
    if (row.length < headers.length) {
      console.warn(`Skipping row ${i}: expected ${headers.length} columns, got ${row.length}`);
      continue;
    }
    dataRowCount++;

    const planId = getCol(row, 'Plan ID').trim();
    const planName = getCol(row, 'Plan Name').trim();
      console.log(`[Import] CSV row ${i}: planId="${planId}", planName="${planName}"`);
    const planFileName = getCol(row, 'Plan File Name').trim();
    const planSiteVisitNumber = parseInt(getCol(row, 'Plan Site Visit Number') || '1', 10) || 1;
    const planWidth = parseFloat(getCol(row, 'Plan Width')) || 0;
    const planHeight = parseFloat(getCol(row, 'Plan Height')) || 0;
    const pointId = getCol(row, 'Point ID');
    const pointSiteVisitNumber = parseInt(getCol(row, 'Point Site Visit Number') || '1', 10) || 1;
    const pointX = parseFloat(getCol(row, 'Point X (Original)')) || parseFloat(getCol(row, 'Point X (Normalized)')) * planWidth;
    const pointY = parseFloat(getCol(row, 'Point Y (Original)')) || parseFloat(getCol(row, 'Point Y (Normalized)')) * planHeight;
    const pointComment = getCol(row, 'Point Comment') || undefined;
    const pointStatus = (getCol(row, 'Point Status') || 'Open') as 'Open' | 'Closed' | 'Note';
    const imageFileName = getCol(row, 'Image File Name');
    const imageComment = getCol(row, 'Image Comment') || undefined;

    // Get or create plan (may already exist from metadata)
    if (!plans.has(planId)) {
      // Plan not in metadata, create from CSV (backward compatibility)
      plans.set(planId, {
        plan: {
          id: planId,
          name: planName,
          fileName: planFileName.replace('.pdf', ''),
          width: planWidth,
          height: planHeight,
          displayScale: 1.5, // Default, can be adjusted
          siteVisitNumber: planSiteVisitNumber
        },
        points: new Map()
      });
      console.log(`[Import] Created plan from CSV: "${planName}" (planId: "${planId}", visit: ${planSiteVisitNumber})`);
    } else {
      // Plan exists from metadata, update dimensions if CSV has better data
      const existingPlan = plans.get(planId)!;
      if (planWidth > 0 && planHeight > 0 && (existingPlan.plan.width === 0 || existingPlan.plan.height === 0)) {
        existingPlan.plan.width = planWidth;
        existingPlan.plan.height = planHeight;
      }
      // Update site visit number if not set
      if (!existingPlan.plan.siteVisitNumber) {
        existingPlan.plan.siteVisitNumber = planSiteVisitNumber;
      }
    }

    const planData = plans.get(planId)!;

    // Get or create point
    if (!planData.points.has(pointId)) {
      planData.points.set(pointId, {
        point: {
          id: pointId,
          x: pointX,
          y: pointY,
          status: pointStatus,
          comment: pointComment,
          siteVisitNumber: pointSiteVisitNumber
        },
        images: []
      });
    }

    const pointData = planData.points.get(pointId)!;

    // Add image if present
    if (imageFileName) {
      pointData.images.push({
        fileName: imageFileName,
        comment: imageComment
      });
    }
    }
  } // End of CSV row processing
  console.log(`[Import] After CSV processing: ${plans.size} plans created, ${dataRowCount} data rows processed`);

  // Load PDF files
  const pdfFiles = new Map<string, Uint8Array>();
  const pdfsFolder = zip.folder('pdfs');
  const processedPdfNames = new Set<string>(); // Track which PDFs we've matched to plans
  
  if (pdfsFolder) {
    // Get all PDF files in the folder (do this in both preview and non-preview mode)
    // JSZip file paths might include "pdfs/" prefix - we need to normalize
    const allPdfFilesRaw = Object.keys(pdfsFolder.files).filter(f => 
      f.toLowerCase().endsWith('.pdf') && !pdfsFolder.files[f].dir
    );
    
    // Normalize paths - remove "pdfs/" prefix if present
    const normalizePdfPath = (path: string): string => {
      return path.replace(/^pdfs[\/\\]/i, '').replace(/^pdfs/i, '');
    };
    
    // Create a map of normalized paths to original paths for lookup
    const pdfPathMap = new Map<string, string>();
    for (const rawPath of allPdfFilesRaw) {
      const normalized = normalizePdfPath(rawPath);
      pdfPathMap.set(normalized.toLowerCase(), rawPath);
    }
    
    const allPdfFilesNormalized = Array.from(pdfPathMap.keys());
    
    // Debug: Log what we found
    console.log(`[Import] Found ${allPdfFilesRaw.length} PDFs in pdfs folder`);
    if (allPdfFilesRaw.length > 0) {
      console.log(`[Import] Sample PDFs (raw):`, allPdfFilesRaw.slice(0, 3));
      console.log(`[Import] Sample PDFs (normalized):`, allPdfFilesNormalized.slice(0, 3));
    }
    console.log(`[Import] Plans to match:`, Array.from(plans.values()).map(p => p.plan.name).slice(0, 5));
    
    // Shared function to match and load PDF for a plan (works for both CSV and orphan plans)
    const matchAndLoadPdf = async (
      planId: string,
      planName: string,
      planFileName: string,
      previewOnly: boolean
    ): Promise<{ matched: boolean; fileName?: string }> => {
      // Try multiple matching strategies in priority order:
      // 1. PRIMARY: Match by Plan Name + .pdf (how export actually saves it)
      const planNameTrimmed = planName.trim();
      const planNameFileName = `${planNameTrimmed}.pdf`;
      // 2. Match by Plan File Name + .pdf
      const csvFileName = `${planFileName}.pdf`;
      // 3. Match by sanitized plan name (fallback)
      const sanitizedFileName = `plan_${planName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      
      console.log(`[Import] Looking for PDF for plan "${planName}":`, {
        planNameFileName,
        csvFileName,
        sanitizedFileName
      });
      
      // Normalize filenames for case-insensitive matching
      const planNameLower = planNameFileName.toLowerCase();
      const csvFileNameLower = csvFileName.toLowerCase();
      const sanitizedFileNameLower = sanitizedFileName.toLowerCase();
      
      // Try exact matches first (case-insensitive) - use normalized paths
      let matchedFileName: string | undefined = undefined;
      for (const normalizedPath of allPdfFilesNormalized) {
        if (normalizedPath === planNameLower || 
            normalizedPath === csvFileNameLower || 
            normalizedPath === sanitizedFileNameLower) {
          // Get the original path from the map
          matchedFileName = pdfPathMap.get(normalizedPath);
          console.log(`[Import] ✅ Exact match found: "${matchedFileName}" (normalized: "${normalizedPath}") for plan "${planName}"`);
          break;
        }
      }
      
      // Access file using the normalized filename (without prefix)
      let pdfFile = matchedFileName ? pdfsFolder.file(normalizePdfPath(matchedFileName)) : null;
      
      // If still not found, try fuzzy matching by name (more lenient)
      if (!pdfFile) {
        const planNameClean = planName.toLowerCase().trim();
        const matchingNormalized = allPdfFilesNormalized.find(normalizedPath => {
          const fileName = normalizedPath.replace('.pdf', '').trim();
          const fileNameClean = fileName.replace(/[^a-z0-9]/gi, '');
          const planNameCleanOnly = planNameClean.replace(/[^a-z0-9]/gi, '');
          
          // Check multiple fuzzy strategies:
          // 1. Exact match (case-insensitive, ignoring special chars)
          if (fileNameClean === planNameCleanOnly) {
            console.log(`[Import] ✅ Fuzzy match (clean): "${normalizedPath}" for plan "${planName}"`);
            return true;
          }
          
          // 2. Filename contains plan name or vice versa
          if (fileName.includes(planNameClean) || planNameClean.includes(fileName)) {
            console.log(`[Import] ✅ Fuzzy match (contains): "${normalizedPath}" for plan "${planName}"`);
            return true;
          }
          
          // 3. Plan name contains filename or vice versa (ignoring special chars)
          if (fileNameClean.includes(planNameCleanOnly) || planNameCleanOnly.includes(fileNameClean)) {
            console.log(`[Import] ✅ Fuzzy match (clean contains): "${normalizedPath}" for plan "${planName}"`);
            return true;
          }
          
          return false;
        });
        
        if (matchingNormalized) {
          // Use normalized path (without prefix) to access the file
          pdfFile = pdfsFolder.file(matchingNormalized);
        }
      }
      
      if (pdfFile) {
          const matchedFileName = pdfFile.name.split('/').pop() || pdfFile.name;
          processedPdfNames.add(matchedFileName.toLowerCase());
        
        if (previewOnly) {
          // In preview mode, just mark that PDF exists without loading it
          pdfFiles.set(planId, new Uint8Array(0)); // Empty placeholder
          console.log(`✅ Matched PDF for plan "${planName}": ${matchedFileName} (preview mode)`);
          return { matched: true, fileName: matchedFileName };
        } else {
          try {
            const pdfData = await pdfFile.async('uint8array');
            
            // Create an explicit copy with its own ArrayBuffer to prevent data loss
            // JSZip may release internal buffers, so we need an independent copy
            const pdfDataCopy = pdfData.slice();
            
            // Validate PDF data is not empty
            if (!pdfDataCopy || pdfDataCopy.length === 0) {
              warnings.push(`PDF file for plan "${planName}" is empty (0 bytes)`);
              return { matched: false };
            }
            
            pdfFiles.set(planId, pdfDataCopy);
            console.log(`✅ Matched PDF for plan "${planName}": ${matchedFileName} (stored with planId: "${planId}", ${pdfDataCopy.length} bytes)`);
            return { matched: true, fileName: matchedFileName };
        } catch (e) {
            warnings.push(`Could not load PDF for plan ${planName}: ${e}`);
            return { matched: false };
          }
        }
      } else {
        // Log all available PDFs for debugging
        const availablePdfs = allPdfFilesNormalized.slice(0, 10).join(', ');
        warnings.push(`PDF not found for plan "${planName}" (tried: ${planNameFileName}, ${csvFileName}, ${sanitizedFileName}). Available PDFs: ${availablePdfs}${allPdfFilesNormalized.length > 10 ? '...' : ''}`);
        return { matched: false };
      }
    };
    
    // First, process PDFs that have CSV data
    for (const [planId, planData] of Array.from(plans.entries())) {
      await matchAndLoadPdf(planId, planData.plan.name, planData.plan.fileName, previewOnly);
    }
    
    // Now check for PDFs that don't have CSV data (plans without pins)
    // Use the same matching logic as CSV plans for consistency
    for (const pdfFileName of allPdfFilesNormalized) {
      const fileNameLower = pdfFileName.toLowerCase();
      // Skip if already processed or if it's an overview PNG (not a PDF)
      if (processedPdfNames.has(fileNameLower) || !fileNameLower.endsWith('.pdf')) {
        continue;
      }
      
      // Get original path from map
      const originalPath = pdfPathMap.get(pdfFileName);
      if (!originalPath) continue;
      
      // Extract plan name from original filename (remove .pdf extension) to preserve case
      const normalizedOriginalPath = normalizePdfPath(originalPath);
      const planName = normalizedOriginalPath.replace(/\.pdf$/i, '').trim();
      if (!planName) continue;
      
      // Check if plan already exists (from metadata or CSV)
      // Try to find by name first (in case metadata has different ID format)
      let existingPlanId: string | undefined = undefined;
      for (const [pid, pdata] of plans.entries()) {
        if (pdata.plan.name.toLowerCase().trim() === planName.toLowerCase().trim()) {
          existingPlanId = pid;
          break;
        }
      }
      
      // If not found, create orphan plan (backward compatibility for old zips without metadata plans)
      if (!existingPlanId) {
        // Use deterministic ID based on plan name so it's consistent across parseExportZip calls
        const orphanPlanId = generateOrphanPlanId(planName);
        plans.set(orphanPlanId, {
          plan: {
            id: orphanPlanId,
            name: planName,
            fileName: planName,
            width: 0, // Will be determined when PDF is loaded
            height: 0,
            displayScale: 1.5,
            siteVisitNumber: 1 // Default to visit 1 for orphan plans
          },
          points: new Map() // No points
        });
        existingPlanId = orphanPlanId;
        console.log(`[Import] Created orphan plan from PDF: "${planName}" (planId: "${orphanPlanId}")`);
      }
      
      const orphanPlanId = existingPlanId;
      
      // Use the same matching logic as CSV plans
      const planData = plans.get(orphanPlanId)!;
      const matchResult = await matchAndLoadPdf(orphanPlanId, planName, planData.plan.fileName || planName, previewOnly);
      
      if (matchResult.matched && !previewOnly) {
        // Try to get dimensions from PDF if possible (only in non-preview mode)
        const pdfData = pdfFiles.get(orphanPlanId);
        if (pdfData && pdfData.length > 0) {
          try {
            // @ts-ignore
            const pdfjs = await import('pdfjs-dist/build/pdf');
            // @ts-ignore
            pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
            // @ts-ignore
            const loadingTask = pdfjs.getDocument({ data: pdfData.buffer });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 });
            const planData = plans.get(orphanPlanId)!;
            planData.plan.width = viewport.width;
            planData.plan.height = viewport.height;
          } catch (e) {
            // If we can't get dimensions, keep defaults (0, 0)
            console.warn(`Could not extract dimensions from PDF ${planName}:`, e);
          }
        }
      }
    }
  }
  
  if (!pdfsFolder) {
    warnings.push('PDFs folder not found in zip file');
  }
  
  // Only throw error if we have no plans at all (neither from CSV nor from orphan PDFs)
  if (plans.size === 0) {
    throw new Error(`Invalid CSV: no valid data rows found after parsing (processed ${lines.length - 1} lines) and no PDFs found in pdfs folder`);
  }

  // Load image files (skip in preview mode)
  const imageFiles = new Map<string, Uint8Array>();
  const imagesFolder = zip.folder('images');
  if (imagesFolder) {
    for (const [planId, planData] of Array.from(plans.entries())) {
      for (const [pointId, pointData] of Array.from(planData.points.entries())) {
        for (const img of pointData.images) {
          const imgFile = imagesFolder.file(img.fileName);
          if (imgFile) {
            if (previewOnly) {
              // In preview mode, just mark that image exists without loading it
              imageFiles.set(img.fileName, new Uint8Array(0)); // Empty placeholder
            } else {
            try {
              const imgData = await imgFile.async('uint8array');
              imageFiles.set(img.fileName, imgData);
            } catch (e) {
              warnings.push(`Could not load image ${img.fileName}: ${e}`);
              }
            }
          } else {
            warnings.push(`Image file not found: ${img.fileName}`);
          }
        }
      }
    }
  }

  return {
    project: {
      id: projectId,
      name: projectName,
      clientName,
      engineerName,
      siteVisitNumber,
      createdAt,
      updatedAt
    },
    plans,
    pdfFiles,
    imageFiles
  };
}

/**
 * Generate a preview of what will be imported
 */
export async function previewImport(bytes: Uint8Array): Promise<ImportPreview> {
  const parsed = await parseExportZip(bytes, true); // Use preview mode - don't load binary data
  
  const plans: ImportPreview['plans'] = [];
  let totalPoints = 0;
  let totalImages = 0;

  for (const [planId, planData] of Array.from(parsed.plans.entries())) {
    const pointCount = planData.points.size;
    const imageCount = Array.from(planData.points.values()).reduce(
      (sum, pt) => sum + pt.images.length, 0
    );
    
    plans.push({
      id: planId,
      name: planData.plan.name,
      fileName: planData.plan.fileName,
      pointCount,
      imageCount,
      hasPdf: parsed.pdfFiles.has(planId) // Works with placeholder in preview mode
    });

    totalPoints += pointCount;
    totalImages += imageCount;
  }

  const warnings: string[] = [];
  for (const [planId, planData] of Array.from(parsed.plans.entries())) {
    if (!parsed.pdfFiles.has(planId)) {
      warnings.push(`Plan "${planData.plan.name}" is missing its PDF file`);
    }
  }

  return {
    project: parsed.project,
    plans,
    totalPoints,
    totalImages,
    warnings
  };
}

/**
 * Apply the import with the given strategy
 */
export async function applyImport(
  bytes: Uint8Array,
  strategy: ImportStrategy,
  onProgress?: (progress: string, percent: number) => void
): Promise<{ projectId: string; plansCreated: number; pointsCreated: number; imagesCreated: number }> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Import only available in native mode');
  }

  onProgress?.('Parsing zip file...', 5);
  const parsed = await parseExportZip(bytes);

  let targetProjectId: string;
  let plansCreated = 0;
  let pointsCreated = 0;
  let imagesCreated = 0;

  if (strategy.type === 'new') {
    // Create new project
    onProgress?.('Creating new project...', 10);
    targetProjectId = `proj_${Date.now()}`;
    
    const dbProject: DBProject = {
      id: targetProjectId,
      name: parsed.project.name,
      client_name: parsed.project.clientName,
      engineer_name: parsed.project.engineerName,
      site_visit_number: parsed.project.siteVisitNumber,
      created_at: new Date(parsed.project.createdAt).toISOString(),
      updated_at: new Date(parsed.project.updatedAt).toISOString()
    };

    await database.createProject(dbProject);
  } else {
    // Merge into existing project
    if (!strategy.targetProjectId) {
      throw new Error('targetProjectId required for merge strategy');
    }
    targetProjectId = strategy.targetProjectId;
    
    // Verify project exists
    const existingProject = await database.getProject(targetProjectId);
    if (!existingProject) {
      throw new Error(`Target project ${targetProjectId} not found`);
    }

    onProgress?.('Merging into existing project...', 10);
  }

  // Get existing plans for matching
  const existingPlans = strategy.type === 'merge' && strategy.planMatching === 'match-by-name'
    ? await database.getPlansByProject(targetProjectId)
    : [];

  const planMapping = new Map<string, string>(); // imported plan id -> target plan id

  // Process each plan
  const planEntries = Array.from(parsed.plans.entries());
  console.log(`[Import] Processing ${planEntries.length} plans. Plan IDs:`, planEntries.map(([id, data]) => `${data.plan.name}(${id})`));
  console.log(`[Import] PDF files Map has ${parsed.pdfFiles.size} entries. Keys:`, Array.from(parsed.pdfFiles.keys()));
  for (let i = 0; i < planEntries.length; i++) {
    const [importedPlanId, planData] = planEntries[i];
    const progress = 10 + (i / planEntries.length) * 70;
    onProgress?.(`Processing plan: ${planData.plan.name}...`, progress);
    console.log(`[Import] Processing plan "${planData.plan.name}" with importedPlanId: "${importedPlanId}"`);

    let targetPlanId: string;
    let isMergingIntoExistingPlan = false;

    if (strategy.type === 'merge' && strategy.planMatching === 'match-by-name') {
      // Try to find existing plan by name
      const matchingPlan = existingPlans.find(p => 
        p.name.toLowerCase().trim() === planData.plan.name.toLowerCase().trim()
      );

      if (matchingPlan) {
        // Merge into existing plan
        targetPlanId = matchingPlan.id;
        planMapping.set(importedPlanId, targetPlanId);
        isMergingIntoExistingPlan = true;
        onProgress?.(`Merging into existing plan: ${planData.plan.name}...`, progress);
      } else {
        // Create new plan
        targetPlanId = uuidv4();
        planMapping.set(importedPlanId, targetPlanId);
        const pdfData = parsed.pdfFiles.get(importedPlanId);
        console.log(`[Import] Looking up PDF for plan "${planData.plan.name}" (importedPlanId: "${importedPlanId}")`);
        console.log(`[Import] PDF files Map keys:`, Array.from(parsed.pdfFiles.keys()));
        console.log(`[Import] PDF data found:`, pdfData ? `${pdfData.length} bytes` : 'undefined');
        const planCreated = await createPlan(targetProjectId, targetPlanId, planData, pdfData);
        if (planCreated) {
          plansCreated++;
        } else {
          // Skip this plan and its points/images - PDF data missing
          console.warn(`[Import] Skipping plan "${planData.plan.name}" and its ${planData.points.size} points due to missing PDF`);
          continue; // Skip to next plan
        }
      }
    } else {
      // Always create new plan
      targetPlanId = uuidv4();
      planMapping.set(importedPlanId, targetPlanId);
      const pdfData = parsed.pdfFiles.get(importedPlanId);
      console.log(`[Import] Looking up PDF for plan "${planData.plan.name}" (importedPlanId: "${importedPlanId}")`);
      console.log(`[Import] PDF files Map keys:`, Array.from(parsed.pdfFiles.keys()));
      console.log(`[Import] PDF data found:`, pdfData ? `${pdfData.length} bytes` : 'undefined');
      const planCreated = await createPlan(targetProjectId, targetPlanId, planData, pdfData);
      if (planCreated) {
        plansCreated++;
      } else {
        // Skip this plan and its points/images - PDF data missing
        console.warn(`[Import] Skipping plan "${planData.plan.name}" and its ${planData.points.size} points due to missing PDF`);
        continue; // Skip to next plan
      }
    }

    // Get existing points for this plan if merging (to check for duplicates)
    const existingPoints = isMergingIntoExistingPlan 
      ? await database.getPointsByPlan(targetPlanId)
      : [];
    
    // Tolerance for matching points by location (in pixels)
    const LOCATION_TOLERANCE = 5; // Points within 5 pixels are considered the same location

    // Process points and images
    const pointEntries = Array.from(planData.points.entries());
    for (const [importedPointId, pointData] of pointEntries) {
      let targetPointId: string;
      let pointWasCreated = false;

      // If merging into existing plan, try to match the point
      if (isMergingIntoExistingPlan) {
        // Strategy 1: Match by Point ID (same pin, same ID)
        let existingPoint = existingPoints.find(p => p.id === importedPointId);
        
        if (existingPoint) {
          // Found by ID - this is the same pin
          targetPointId = existingPoint.id;
          console.log(`[Import] Matched point by ID "${importedPointId}" at (${pointData.point.x}, ${pointData.point.y})`);
        } else {
          // Strategy 2: Match by location (same location, might be same pin moved or ID changed)
          existingPoint = existingPoints.find(p => {
            const dx = Math.abs(p.x - pointData.point.x);
            const dy = Math.abs(p.y - pointData.point.y);
            return dx <= LOCATION_TOLERANCE && dy <= LOCATION_TOLERANCE;
          });

          if (existingPoint) {
            // Found by location - merge images into existing point
            targetPointId = existingPoint.id;
            console.log(`[Import] Matched point by location at (${pointData.point.x}, ${pointData.point.y}) - merging into existing point "${existingPoint.id}"`);
          } else {
            // No match - create new point (restoring deleted pin or adding new one)
            targetPointId = uuidv4();
            const dbPoint: DBPoint = {
              id: targetPointId,
              plan_id: targetPlanId,
              x: pointData.point.x,
              y: pointData.point.y,
              status: pointData.point.status,
              comment: pointData.point.comment,
              site_visit_number: pointData.point.siteVisitNumber || 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            await database.createPoint(dbPoint);
            pointsCreated++;
            pointWasCreated = true;
            console.log(`[Import] Created new point at (${pointData.point.x}, ${pointData.point.y}) - restoring deleted pin (visit: ${pointData.point.siteVisitNumber || 1})`);
          }
        }
      } else {
        // Always create new point (new plan or create-new strategy)
        targetPointId = uuidv4();
        const dbPoint: DBPoint = {
          id: targetPointId,
          plan_id: targetPlanId,
          x: pointData.point.x,
          y: pointData.point.y,
          status: pointData.point.status,
          comment: pointData.point.comment,
          site_visit_number: pointData.point.siteVisitNumber || 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await database.createPoint(dbPoint);
        pointsCreated++;
        pointWasCreated = true;
      }

      // Process images - always add them (they'll be added to existing point if merging)
      for (const img of pointData.images) {
        const imageData = parsed.imageFiles.get(img.fileName);
        if (imageData) {
          // Generate new image ID (filename)
          const imageId = uuidv4();
          
          // Convert Uint8Array to base64 (in chunks to avoid stack overflow)
          const base64 = uint8ToBase64(imageData);
          
          // Save image to filesystem
          await Filesystem.writeFile({
            path: imageId,
            data: base64,
            directory: Directory.Data
          });

          const dbImage: DBImage = {
            id: imageId,
            point_id: targetPointId,
            url: imageId, // Store filename as URL (consistent with current pattern)
            comment: img.comment,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          await database.createImage(dbImage);
          imagesCreated++;
        }
      }
    }
  }

  // Reload projects in store
  onProgress?.('Reloading projects...', 95);
  await useSiteStore.getState().loadProjects();

  onProgress?.('Import complete!', 100);

  return {
    projectId: targetProjectId,
    plansCreated,
    pointsCreated,
    imagesCreated
  };
}

async function createPlan(
  projectId: string,
  planId: string,
  planData: ParsedImportData['plans'] extends Map<string, infer V> ? V : never,
  pdfData: Uint8Array | undefined
): Promise<boolean> {
  // Return false if PDF data is missing instead of throwing - allows import to continue
  if (!pdfData || pdfData.length === 0) {
    console.warn(`[Import] Skipping plan "${planData.plan.name}" - PDF data missing or empty (0 bytes)`);
    return false;
  }

  // Convert PDF to base64 data URL (in chunks to avoid stack overflow)
  const base64 = uint8ToBase64(pdfData);
  const pdfDataUrl = `data:application/pdf;base64,${base64}`;

  // Generate thumbnail from PDF
  let thumbnail = '';
  try {
    thumbnail = await generateGrayscaleThumbnailFromPdf(pdfDataUrl);
  } catch (error) {
    console.warn(`Failed to generate thumbnail for plan ${planData.plan.name}:`, error);
    // Continue without thumbnail - it will show as missing but plan will still work
  }

  // Get existing plans to determine display_order
  const existingPlans = await database.getPlansByProject(projectId);
  const maxOrder = existingPlans.reduce((max, p) => Math.max(max, p.display_order), 0);
  const nextOrder = maxOrder + 10;

  const dbPlan: DBPlan = {
    id: planId,
    project_id: projectId,
    name: planData.plan.name,
    url: pdfDataUrl,
    thumbnail,
    width: planData.plan.width,
    height: planData.plan.height,
    display_scale: planData.plan.displayScale,
    display_order: nextOrder,
    site_visit_number: planData.plan.siteVisitNumber || 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await database.createPlan(dbPlan);
  console.log(`[Import] Created plan "${planData.plan.name}" with site_visit_number: ${planData.plan.siteVisitNumber || 1}`);
  return true;
}

/**
 * Legacy function - now redirects to previewImport
 */
export async function validateAndPreviewImport(payload: ImportPayload): Promise<ImportPreview> {
  return previewImport(payload.bytes);
}

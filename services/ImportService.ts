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
    };
    points: Map<string, {
      point: {
        id: string;
        x: number;
        y: number;
        status: 'Open' | 'Closed' | 'Note';
        comment?: string;
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
 * Parse and validate an export zip file
 */
export async function parseExportZip(bytes: Uint8Array): Promise<ParsedImportData> {
  const zip = await JSZip.loadAsync(bytes);
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
  if (lines.length < 2) {
    // Try to get more info about what we have
    console.error('CSV parsing failed. Lines found:', lines.length);
    console.error('First few lines:', lines.slice(0, 5));
    throw new Error(`Invalid CSV: no data rows found (found ${lines.length} lines total)`);
  }

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  
  // Find column indices
  const colIndex = (name: string) => {
    const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    if (idx === -1) throw new Error(`Missing required column: ${name}`);
    return idx;
  };

  const getCol = (row: string[], name: string): string => {
    const idx = colIndex(name);
    const val = row[idx]?.replace(/^"|"$/g, '') || '';
    return val;
  };

  // Extract unique project info from first row
  const firstRow = parseCSVLine(lines[1]);
  const projectId = getCol(firstRow, 'Project ID');
  const projectName = getCol(firstRow, 'Project Name');
  const clientName = getCol(firstRow, 'Client Name') || '';
  const engineerName = getCol(firstRow, 'Engineer Name') || '';
  const siteVisitNumber = parseInt(getCol(firstRow, 'Site Visit Number') || '1', 10) || 1;
  
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
    };
    points: Map<string, {
      point: {
        id: string;
        x: number;
        y: number;
        status: 'Open' | 'Closed' | 'Note';
        comment?: string;
      };
      images: Array<{
        fileName: string;
        comment?: string;
      }>;
    }>;
  }>();

  // Process CSV rows
  let dataRowCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    // Skip empty rows or rows with too few columns
    if (row.length === 0 || row.every(cell => !cell.trim())) continue;
    if (row.length < headers.length) {
      console.warn(`Skipping row ${i}: expected ${headers.length} columns, got ${row.length}`);
      continue;
    }
    dataRowCount++;

    const planId = getCol(row, 'Plan ID');
    const planName = getCol(row, 'Plan Name');
    const planFileName = getCol(row, 'Plan File Name');
    const planWidth = parseFloat(getCol(row, 'Plan Width')) || 0;
    const planHeight = parseFloat(getCol(row, 'Plan Height')) || 0;
    const pointId = getCol(row, 'Point ID');
    const pointX = parseFloat(getCol(row, 'Point X (Original)')) || parseFloat(getCol(row, 'Point X (Normalized)')) * planWidth;
    const pointY = parseFloat(getCol(row, 'Point Y (Original)')) || parseFloat(getCol(row, 'Point Y (Normalized)')) * planHeight;
    const pointComment = getCol(row, 'Point Comment') || undefined;
    const pointStatus = (getCol(row, 'Point Status') || 'Open') as 'Open' | 'Closed' | 'Note';
    const imageFileName = getCol(row, 'Image File Name');
    const imageComment = getCol(row, 'Image Comment') || undefined;

    // Get or create plan
    if (!plans.has(planId)) {
      plans.set(planId, {
        plan: {
          id: planId,
          name: planName,
          fileName: planFileName.replace('.pdf', ''),
          width: planWidth,
          height: planHeight,
          displayScale: 1.5 // Default, can be adjusted
        },
        points: new Map()
      });
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
          comment: pointComment
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

  if (dataRowCount === 0) {
    throw new Error(`Invalid CSV: no valid data rows found after parsing (processed ${lines.length - 1} lines)`);
  }

  // Load PDF files
  const pdfFiles = new Map<string, Uint8Array>();
  const pdfsFolder = zip.folder('pdfs');
  if (pdfsFolder) {
    // Get all PDF files in the folder
    const allPdfFiles = Object.keys(pdfsFolder.files).filter(f => 
      f.toLowerCase().endsWith('.pdf') && !pdfsFolder.files[f].dir
    );
    
    for (const [planId, planData] of plans.entries()) {
      // Try multiple matching strategies:
      // 1. Exact match from CSV Plan File Name
      const csvFileName = `${planData.plan.fileName}.pdf`;
      // 2. Match by actual plan name (how export saves it)
      const planNameFileName = `${planData.plan.name}.pdf`;
      // 3. Match by sanitized plan name (fallback)
      const sanitizedFileName = `plan_${planData.plan.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      
      let pdfFile = pdfsFolder.file(csvFileName) || 
                    pdfsFolder.file(planNameFileName) ||
                    pdfsFolder.file(sanitizedFileName);
      
      // If still not found, try fuzzy matching by name
      if (!pdfFile) {
        const matchingFile = allPdfFiles.find(f => {
          const fileName = f.toLowerCase();
          const planNameLower = planData.plan.name.toLowerCase();
          // Check if filename contains plan name or vice versa
          return fileName.includes(planNameLower) || planNameLower.includes(fileName.replace('.pdf', ''));
        });
        
        if (matchingFile) {
          pdfFile = pdfsFolder.file(matchingFile);
        }
      }
      
      if (pdfFile) {
        try {
          const pdfData = await pdfFile.async('uint8array');
          pdfFiles.set(planId, pdfData);
        } catch (e) {
          warnings.push(`Could not load PDF for plan ${planData.plan.name}: ${e}`);
        }
      } else {
        warnings.push(`PDF not found for plan "${planData.plan.name}" (tried: ${csvFileName}, ${planNameFileName}, ${sanitizedFileName})`);
      }
    }
  } else {
    warnings.push('PDFs folder not found in zip file');
  }

  // Load image files
  const imageFiles = new Map<string, Uint8Array>();
  const imagesFolder = zip.folder('images');
  if (imagesFolder) {
    for (const [planId, planData] of plans.entries()) {
      for (const [pointId, pointData] of planData.points.entries()) {
        for (const img of pointData.images) {
          const imgFile = imagesFolder.file(img.fileName);
          if (imgFile) {
            try {
              const imgData = await imgFile.async('uint8array');
              imageFiles.set(img.fileName, imgData);
            } catch (e) {
              warnings.push(`Could not load image ${img.fileName}: ${e}`);
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
  const parsed = await parseExportZip(bytes);
  
  const plans: ImportPreview['plans'] = [];
  let totalPoints = 0;
  let totalImages = 0;

  for (const [planId, planData] of parsed.plans.entries()) {
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
      hasPdf: parsed.pdfFiles.has(planId)
    });

    totalPoints += pointCount;
    totalImages += imageCount;
  }

  const warnings: string[] = [];
  for (const [planId, planData] of parsed.plans.entries()) {
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
  for (let i = 0; i < planEntries.length; i++) {
    const [importedPlanId, planData] = planEntries[i];
    const progress = 10 + (i / planEntries.length) * 70;
    onProgress?.(`Processing plan: ${planData.plan.name}...`, progress);

    let targetPlanId: string;

    if (strategy.type === 'merge' && strategy.planMatching === 'match-by-name') {
      // Try to find existing plan by name
      const matchingPlan = existingPlans.find(p => 
        p.name.toLowerCase().trim() === planData.plan.name.toLowerCase().trim()
      );

      if (matchingPlan) {
        // Merge into existing plan
        targetPlanId = matchingPlan.id;
        planMapping.set(importedPlanId, targetPlanId);
        onProgress?.(`Merging into existing plan: ${planData.plan.name}...`, progress);
      } else {
        // Create new plan
        targetPlanId = uuidv4();
        planMapping.set(importedPlanId, targetPlanId);
        await createPlan(targetProjectId, targetPlanId, planData, parsed.pdfFiles.get(importedPlanId));
        plansCreated++;
      }
    } else {
      // Always create new plan
      targetPlanId = uuidv4();
      planMapping.set(importedPlanId, targetPlanId);
      await createPlan(targetProjectId, targetPlanId, planData, parsed.pdfFiles.get(importedPlanId));
      plansCreated++;
    }

    // Process points and images
    const pointEntries = Array.from(planData.points.entries());
    for (const [pointId, pointData] of pointEntries) {
      // Always create new point (merge means adding points to existing plan)
      const newPointId = uuidv4();
      
      const dbPoint: DBPoint = {
        id: newPointId,
        plan_id: targetPlanId,
        x: pointData.point.x,
        y: pointData.point.y,
        status: pointData.point.status,
        comment: pointData.point.comment,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await database.createPoint(dbPoint);
      pointsCreated++;

      // Process images
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
            point_id: newPointId,
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
): Promise<void> {
  if (!pdfData) {
    throw new Error(`PDF data missing for plan ${planData.plan.name}`);
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await database.createPlan(dbPlan);
}

/**
 * Legacy function - now redirects to previewImport
 */
export async function validateAndPreviewImport(payload: ImportPayload): Promise<ImportPreview> {
  return previewImport(payload.bytes);
}

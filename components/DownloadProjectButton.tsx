import React, { useState } from 'react';
import JSZip from 'jszip';
import useSiteStore from '@/store/useSiteStore';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { usePDF } from '@/hooks/usePDF';
import { convertPdfToGrayscale } from '@/utils/pdfGrayscale';

// @ts-ignore
const generatePinPreviewImage = async (pdfjs, plan, point, pointIndex, size = 300, zoomLevel = 2) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Create a canvas element
      const canvas = document.createElement('canvas');
      
      // Load pin image
      const pinImage = new Image();
      pinImage.src = '/siteright_pin.png';
      
      // Wait for pin image to load
      await new Promise((imgResolve) => {
        if (pinImage.complete) {
          imgResolve(true);
        } else {
          pinImage.onload = () => imgResolve(true);
          pinImage.onerror = () => reject(new Error("Failed to load pin image"));
        }
      });
      
      // Process PDF
      const base64Data = plan.url.split(',')[1];
      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pdfData = bytes.buffer;
      
      // Load the PDF
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      
      // Set up canvas and context
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d', {
        alpha: false,
        willReadFrequently: false
      });
      
      // Calculate area around point
      const areaSize = size * zoomLevel;
      const x = Math.max(0, point.x - (areaSize/2));
      const y = Math.max(0, point.y - (areaSize/2));
      
      // Set canvas dimensions
      canvas.width = size;
      canvas.height = size;
      
      // Clear canvas
      // @ts-ignore
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      // Render PDF to canvas with transform
      await page.render({
        canvasContext: context,
        viewport: viewport,
        transform: [1/zoomLevel, 0, 0, 1/zoomLevel, -x/zoomLevel, -y/zoomLevel],
        imageSmoothing: true,
        background: 'white'
      }).promise;
      
      // Draw pin on canvas
      const dimensionMultiplier = 30;
      const pinWidth = dimensionMultiplier * 800/1080;
      const pinHeight = dimensionMultiplier;
      
      const pinX = (size/2) - (pinWidth/2);
      const pinY = (size/2) - pinHeight;
      
      // @ts-ignore
      context.drawImage(
        pinImage,
        pinX,
        pinY,
        pinWidth,
        pinHeight
      );
      
      // Draw point number
      // @ts-ignore
      context.fillStyle = 'white';
      // @ts-ignore
      context.font = '12px Arial';
      // @ts-ignore
      context.textAlign = 'center';
      // @ts-ignore
      context.textBaseline = 'middle';
      // @ts-ignore
      context.fillText(
        (pointIndex + 1).toString(),
        size/2,
        size/2 - pinHeight * 13/20
      );
      
      // Convert to JPG Blob and resolve
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create JPEG blob'));
        }
      }, 'image/jpeg', 0.9);
      
    } catch (error) {
      console.error('Error generating pin preview:', error);
      reject(error);
    }
  });
};

// @ts-ignore
const generatePlanOverviewImage = async (pdfjs, plan, points, includePins = true, exportScale = 1.5) => {
  return new Promise(async (resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', {
        alpha: false,
        willReadFrequently: false
      });

      // Load PDF data
      const base64Data = plan.url.split(',')[1];
      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pdfData = bytes.buffer;

      // Load the PDF
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      // Render full page
      const viewport = page.getViewport({ scale: exportScale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        // @ts-ignore
        canvasContext: context,
        viewport,
        background: 'white'
      }).promise;

      if (includePins && context) {
        // Preload pin image
        const pinImage = new Image();
        pinImage.src = '/siteright_pin.png';
        await new Promise((imgResolve, imgReject) => {
          if (pinImage.complete) return imgResolve(true);
          pinImage.onload = () => imgResolve(true);
          pinImage.onerror = () => imgReject(new Error('Failed to load pin image'));
        });

        const displayScale = plan?.dimensions?.displayScale || 1.5;
        const scaleFactor = exportScale / displayScale;
        // Make pins larger relative to the full plan (match visual prominence of previews)
        const relativePinHeight = Math.max(20, 0.05 * Math.min(viewport.width, viewport.height));

        // Draw each pin using same indexing as list order
        // points can be [{ point, images }] or raw points
        // @ts-ignore
        points.forEach((pt, idx) => {
          const p = pt.point || pt;
          const pinHeight = relativePinHeight;
          const pinWidth = pinHeight * (800 / 1080);

          const drawX = (p.x * scaleFactor) - (pinWidth / 2);
          const drawY = (p.y * scaleFactor) - pinHeight;

          // @ts-ignore
          context.drawImage(pinImage, drawX, drawY, pinWidth, pinHeight);

          // Label
          // @ts-ignore
          context.fillStyle = 'white';
          // @ts-ignore
          const fontSize = 12 * (pinHeight / 30); // scale label proportionally to pin size
          context.font = `${fontSize}px Arial`;
          // @ts-ignore
          context.textAlign = 'center';
          // @ts-ignore
          context.textBaseline = 'middle';
          const labelX = (p.x * scaleFactor);
          const labelY = (p.y * scaleFactor) - pinHeight * (13 / 20);
          // @ts-ignore
          context.fillText(String(idx + 1), labelX, labelY);
        });
      }

      // Export PNG Blob (crisper labels)
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create PNG blob'));
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error generating plan overview image:', error);
      reject(error);
    }
  });
};

const DownloadProjectButton = ({ projectId }: { projectId: string }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [percent, setPercent] = useState<number>(0);
  const [cancelRequested, setCancelRequested] = useState<boolean>(false);
  const selectedProject = useSiteStore((state) => 
    state.projects.find(p => p.id === projectId)
  );
  const pdfjs = usePDF();

  const generateCSV = (plans: any[]) => {
    const headers = [
      'Project ID',
      'Project Name',
      'Plan ID',
      'Plan Name',
      'Plan File Name',
      'Plan Width',
      'Plan Height',
      'Point ID',
      'Point X (Normalized)',
      'Point Y (Normalized)',
      'Point X (Original)',
      'Point Y (Original)',
      'Point Comment',
      'Point Status',
      'Image File Name',
      'Image Comment',
      'Timestamp'
    ];

    const rows = plans.flatMap(plan => {
      const planWidth = plan.dimensions?.width || 0;
      const planHeight = plan.dimensions?.height || 0;
      const planFileName = `plan_${plan.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      // @ts-ignore
      return plan.points.flatMap(point => {
        // Calculate normalized coordinates
        const normalizedX = planWidth ? (point.x / planWidth) : 0;
        const normalizedY = planHeight ? (point.y / planHeight) : 0;

        // Base data that will be common for all rows of this point
        const baseData = {
          projectId: selectedProject?.id || '',
          projectName: selectedProject?.name || '',
          planId: plan.id,
          planName: plan.name || '',
          planFileName: planFileName,
          planWidth: planWidth,
          planHeight: planHeight,
          pointId: point.id,
          normalizedX: normalizedX.toFixed(5),
          normalizedY: normalizedY.toFixed(5),
          originalX: point.x.toFixed(2),
          originalY: point.y.toFixed(2),
          pointComment: point.comment || '', // This should be the same for all images from this point
          pointStatus: point.status || 'Open'
        };

        // Debug: Log point comment to ensure it's being accessed correctly
        console.log(`CSV Export - Point ${point.id} comment:`, point.comment);

        // Escape CSV function for proper field handling
        const escapeCsvField = (field: string | number) => {
          const fieldStr = String(field);
          if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
            return `"${fieldStr.replace(/"/g, '""')}"`;
          }
          return fieldStr;
        };

        // If point has no images, create one row for the point
        if (!point.images || point.images.length === 0) {
          return [[
            escapeCsvField(baseData.projectId),
            escapeCsvField(baseData.projectName),
            escapeCsvField(baseData.planId),
            escapeCsvField(baseData.planName),
            escapeCsvField(baseData.planFileName),
            escapeCsvField(baseData.planWidth),
            escapeCsvField(baseData.planHeight),
            escapeCsvField(baseData.pointId),
            escapeCsvField(baseData.normalizedX),
            escapeCsvField(baseData.normalizedY),
            escapeCsvField(baseData.originalX),
            escapeCsvField(baseData.originalY),
            escapeCsvField(baseData.pointComment), // Properly escaped point comment
            escapeCsvField(baseData.pointStatus),
            escapeCsvField(''), // No image file
            escapeCsvField(''), // No image comment
            escapeCsvField(new Date().toISOString())
          ].join(',')];
        }

        // Create a row for each image in the point
        // @ts-ignore
        return point.images.map((image, index) => [
          escapeCsvField(baseData.projectId),
          escapeCsvField(baseData.projectName),
          escapeCsvField(baseData.planId),
          escapeCsvField(baseData.planName),
          escapeCsvField(baseData.planFileName),
          escapeCsvField(baseData.planWidth),
          escapeCsvField(baseData.planHeight),
          escapeCsvField(baseData.pointId),
          escapeCsvField(baseData.normalizedX),
          escapeCsvField(baseData.normalizedY),
          escapeCsvField(baseData.originalX),
          escapeCsvField(baseData.originalY),
          escapeCsvField(baseData.pointComment), // Same point comment for all images from this pin
          escapeCsvField(baseData.pointStatus),
          escapeCsvField(`point_${point.id}_image_${index + 1}.jpg`),
          escapeCsvField(image.comment || ''),
          escapeCsvField(new Date().toISOString())
        ].join(','));
      });
    });

    return [headers.join(','), ...rows].join('\n');
  };

  // Helper function to generate CSV from export data
  const generateCSVFromExportData = (exportData: any) => {
    const headers = [
      'Project ID', 'Project Name', 'Client Name', 'Engineer Name', 'Site Visit Number', 'Project Created At', 'Project Updated At',
      'Plan ID', 'Plan Name', 'Plan File Name', 'Plan Site Visit Number',
      'Plan Width', 'Plan Height', 'Point ID', 'Point Site Visit Number', 'Point X (Normalized)', 'Point Y (Normalized)',
      'Point X (Original)', 'Point Y (Original)', 'Point Comment', 'Point Status', 'Image File Name',
      'Image Comment', 'Timestamp'
    ];

    const rows = exportData.plans.flatMap((planData: any) => {
      const plan = planData.plan;
      const planFileName = `plan_${plan.name?.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      const planWidth = plan.dimensions?.width || 0;
      const planHeight = plan.dimensions?.height || 0;

      return planData.points.flatMap((pointData: any) => {
        const point = pointData.point;
        const normalizedX = planWidth ? (point.x / planWidth) : 0;
        const normalizedY = planHeight ? (point.y / planHeight) : 0;

        const baseData = {
          projectId: exportData.project.id,
          projectName: exportData.project.name,
          clientName: exportData.project.clientName || '',
          engineerName: exportData.project.engineerName || '',
          siteVisitNumber: exportData.project.siteVisitNumber ?? '',
          projectCreatedAt: exportData.project.createdAt ? new Date(exportData.project.createdAt).toISOString() : '',
          projectUpdatedAt: exportData.project.updatedAt ? new Date(exportData.project.updatedAt).toISOString() : '',
          planId: plan.id,
          planName: plan.name || '',
          planFileName,
          planSiteVisitNumber: plan.siteVisitNumber ?? 1,
          planWidth,
          planHeight,
          pointId: point.id,
          pointSiteVisitNumber: point.siteVisitNumber ?? 1,
          normalizedX: normalizedX.toFixed(5),
          normalizedY: normalizedY.toFixed(5),
          originalX: point.x.toFixed(2),
          originalY: point.y.toFixed(2),
          pointComment: point.comment || '',
          pointStatus: point.status || 'Open'
        };

        const escapeCsvField = (field: string | number) => {
          const fieldStr = String(field);
          if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
            return `"${fieldStr.replace(/"/g, '""')}"`;
          }
          return fieldStr;
        };

        if (!pointData.images || pointData.images.length === 0) {
          return [[
            escapeCsvField(baseData.projectId),
            escapeCsvField(baseData.projectName),
            escapeCsvField(baseData.clientName),
            escapeCsvField(baseData.engineerName),
            escapeCsvField(baseData.siteVisitNumber),
            escapeCsvField(baseData.projectCreatedAt),
            escapeCsvField(baseData.projectUpdatedAt),
            escapeCsvField(baseData.planId),
            escapeCsvField(baseData.planName),
            escapeCsvField(baseData.planFileName),
            escapeCsvField(baseData.planSiteVisitNumber),
            escapeCsvField(baseData.planWidth),
            escapeCsvField(baseData.planHeight),
            escapeCsvField(baseData.pointId),
            escapeCsvField(baseData.pointSiteVisitNumber),
            escapeCsvField(baseData.normalizedX),
            escapeCsvField(baseData.normalizedY),
            escapeCsvField(baseData.originalX),
            escapeCsvField(baseData.originalY),
            escapeCsvField(baseData.pointComment),
            escapeCsvField(baseData.pointStatus),
            escapeCsvField(''),
            escapeCsvField(''),
            escapeCsvField(new Date().toISOString())
          ].join(',')];
        }

        return pointData.images.map((image: any, index: number) => [
          escapeCsvField(baseData.projectId),
          escapeCsvField(baseData.projectName),
          escapeCsvField(baseData.clientName),
          escapeCsvField(baseData.engineerName),
          escapeCsvField(baseData.siteVisitNumber),
          escapeCsvField(baseData.projectCreatedAt),
          escapeCsvField(baseData.projectUpdatedAt),
          escapeCsvField(baseData.planId),
          escapeCsvField(baseData.planName),
          escapeCsvField(baseData.planFileName),
          escapeCsvField(baseData.planSiteVisitNumber),
          escapeCsvField(baseData.planWidth),
          escapeCsvField(baseData.planHeight),
          escapeCsvField(baseData.pointId),
          escapeCsvField(baseData.pointSiteVisitNumber),
          escapeCsvField(baseData.normalizedX),
          escapeCsvField(baseData.normalizedY),
          escapeCsvField(baseData.originalX),
          escapeCsvField(baseData.originalY),
          escapeCsvField(baseData.pointComment),
          escapeCsvField(baseData.pointStatus),
          escapeCsvField(`plan_${plan.id}_point_${point.id}_image_${index + 1}.jpg`),
          escapeCsvField(image.comment || ''),
          escapeCsvField(new Date().toISOString())
        ].join(','));
      });
    });

    return [headers.join(','), ...rows].join('\n');
  };

  const handleDownload = async () => {
    if (!selectedProject || !pdfjs) return;
    setIsGenerating(true);
    setProgress('Loading project data...');
    setPercent(0);
    setCancelRequested(false);
    // Yield to the browser so the button + progress bar can render on first click
    await new Promise<void>((resolve) => {
      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });

    try {
      console.log('📦 Starting project export for:', selectedProject.name);
      
      // Load complete export data with base64 image data
      setProgress('Loading images...');
      const loadExportData = useSiteStore.getState().loadExportData;
      const exportData = await loadExportData(selectedProject.id);
      
      // Progress weighting across stages
      const LOAD_WEIGHT = 0.1;      // 10%
      const ASSET_WEIGHT = 0.7;     // 70%
      const COMPRESS_WEIGHT = 0.2;  // 20%
      
      // Initialize progress after data load
      setPercent(Math.round(LOAD_WEIGHT * 100));
      
      console.log('📦 Export data loaded, creating zip file...');

      // Batching configuration
      const MAX_FILES_PER_PART = Number.MAX_SAFE_INTEGER; // single zip (no partitioning)
      let filesAddedThisPart = 0;
      let partIndex = 1;

      // Helper to create a new zip part with folders and CSV
      const createNewZipPart = () => {
        const newZip = new JSZip();
        const pdfs = newZip.folder("pdfs");
        const images = newZip.folder("images");
        const previews = newZip.folder("pin_previews");
        const csvDataLocal = generateCSVFromExportData(exportData);
        newZip.file("project_data.csv", csvDataLocal);
        // Include a project metadata JSON for easy inspection
        // Include all plans (with and without points) for reliable import
        const plansMetadata = exportData.plans.map((planData: any) => {
          const plan = planData.plan;
          const planFileName = plan.name || plan.id;
          return {
            id: plan.id,
            name: plan.name || '',
            fileName: `${planFileName}.pdf`,
            width: plan.dimensions?.width || 0,
            height: plan.dimensions?.height || 0,
            displayScale: plan.dimensions?.displayScale || 1.5,
            siteVisitNumber: plan.siteVisitNumber || 1,
            hasPoints: planData.points && planData.points.length > 0
          };
        });
        
        const metadata = {
          id: exportData.project.id,
          name: exportData.project.name,
          clientName: exportData.project.clientName,
          engineerName: exportData.project.engineerName,
          siteVisitNumber: exportData.project.siteVisitNumber,
          createdAt: exportData.project.createdAt,
          updatedAt: exportData.project.updatedAt,
          plans: plansMetadata
        };
        newZip.file("project_metadata.json", JSON.stringify(metadata, null, 2));
        return { newZip, pdfs, images, previews };
      };

      // Helper to save a zip part to Downloads/web
      const saveZipPart = async (zipToSave: JSZip, idx: number) => {
        setProgress(`Compressing part ${idx}...`);
        console.log('📦 Generating zip file part', idx);
        const partSuffix = `_part_${idx}`;
        const fileName = `project_${selectedProject.name}${idx > 1 ? partSuffix : ''}_${Date.now()}.zip`;
        let lastPercent = 0;

        if (Capacitor.isNativePlatform()) {
          // Stream out using generateInternalStream and appendFile
          const path = `Download/${fileName}`;
          // Start with empty file (overwrite if exists)
          await Filesystem.writeFile({
            path,
            data: '',
            directory: Directory.ExternalStorage,
            recursive: true
          });

          await new Promise<void>((resolve, reject) => {
            try {
              // Helper: convert Uint8Array to base64 efficiently in chunks
              const uint8ToBase64 = (bytes: Uint8Array): string => {
                let binary = '';
                const chunkSize = 0x8000; // 32KB chunks to avoid call stack limits
                for (let i = 0; i < bytes.length; i += chunkSize) {
                  const sub = bytes.subarray(i, i + chunkSize);
                  binary += String.fromCharCode.apply(null, Array.from(sub));
                }
                // @ts-ignore btoa available in browser/webview
                return btoa(binary);
              };

              const stream = zipToSave.generateInternalStream({ type: 'uint8array', streamFiles: true });

              stream.on('data', async (chunk: any) => {
                // Backpressure: ensure sequential writes
                // @ts-ignore pause exists on JSZip stream
                if (typeof stream.pause === 'function') stream.pause();
                if (cancelRequested) {
                  try { await Filesystem.deleteFile({ directory: Directory.ExternalStorage, path }); } catch {}
                  reject(new Error('Export cancelled'));
                  return;
                }
                try {
                  const base64Chunk = uint8ToBase64(chunk as Uint8Array);
                  await Filesystem.appendFile({ path, data: base64Chunk, directory: Directory.ExternalStorage });
                } catch (e) {
                  reject(e);
                  return;
                } finally {
                  // @ts-ignore resume exists on JSZip stream
                  if (typeof stream.resume === 'function') stream.resume();
                }
              });

              stream.on('end', () => {
                resolve();
              });

              stream.on('error', (e: any) => {
                reject(e);
              });

              // Update percent periodically based on stream progress metadata (not directly available per chunk)
              // Fallback to keeping existing percent logic; no-op here.
              stream.resume();
            } catch (e) {
              reject(e as any);
            }
          });
        } else {
          // Web fallback: use blob as before
          const zipContent = await zipToSave.generateAsync(
            { type: 'blob' },
            (metadata) => {
              const base = (LOAD_WEIGHT + ASSET_WEIGHT) * 100;
              const total = Math.min(100, Math.floor(base + (COMPRESS_WEIGHT * metadata.percent)));
              if (total > lastPercent) setPercent(total);
              if (metadata.currentFile) {
                setProgress(`Compressing part ${idx}: ${metadata.currentFile} (${Math.floor(metadata.percent)}%)`);
              }
            }
          );
          const url = URL.createObjectURL(zipContent);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      };

      // Initialize first part
      let { newZip: zip, pdfs: pdfsFolder, images: imagesFolder, previews: previewsFolder } = createNewZipPart();
      
      // Compute units for asset generation phase
      const planCount = exportData.plans.length;
      const pointCount = exportData.plans.reduce((sum: number, p: any) => sum + p.points.length, 0);
      const imageCount = exportData.plans.reduce(
        (sum: number, p: any) => sum + p.points.reduce((s: number, pt: any) => s + pt.images.length, 0),
        0
      );
      const overviewCount = planCount * 2; // with pins + clean
      const pdfCount = planCount;          // each plan PDF
      const assetUnits = Math.max(1, pdfCount + overviewCount + pointCount + imageCount);
      let assetCompleted = 0;
      const updateAssetProgress = (label?: string) => {
        const base = LOAD_WEIGHT * 100;
        const assetPortion = (assetCompleted / assetUnits) * (ASSET_WEIGHT * 100);
        const next = Math.min(99, Math.floor(base + assetPortion));
        setPercent(next);
        if (label) setProgress(label);
      };

      const checkRotatePart = async () => {
        if (filesAddedThisPart >= MAX_FILES_PER_PART) {
          await saveZipPart(zip, partIndex);
          partIndex += 1;
          filesAddedThisPart = 0;
          const created = createNewZipPart();
          zip = created.newZip;
          pdfsFolder = created.pdfs;
          imagesFolder = created.images;
          previewsFolder = created.previews;
          setProgress(`Starting part ${partIndex}...`);
        }
      };

      // Add PDFs
      for (const planData of exportData.plans) {
        const plan = planData.plan;
        if (plan.url) {
          let grayscaleDataUrl = plan.url;
          try {
            grayscaleDataUrl = await convertPdfToGrayscale(plan.url);
          } catch (e) {
            console.warn('Export grayscale conversion failed, using original PDF:', e);
          }
          const pdfData = grayscaleDataUrl.split(',')[1]; // Remove data URL prefix
          const fileName = `${plan.name || plan.id}.pdf`;
          pdfsFolder?.file(fileName, pdfData, { base64: true });
          assetCompleted += 1; // PDF added
          updateAssetProgress(`Added PDF ${fileName}`);
          filesAddedThisPart += 1;
          await checkRotatePart();
        }

        // Generate full-plan overview images (with pins and clean)
        try {
          const exportScale = plan?.dimensions?.displayScale || 1.5; // match viewer scale by default
          const baseName = `${plan.name || plan.id}`;
          const withPinsBlob = await generatePlanOverviewImage(pdfjs, plan, planData.points, true, exportScale);
          const cleanBlob = await generatePlanOverviewImage(pdfjs, plan, planData.points, false, exportScale);
          // Store alongside the existing plan export assets as Blobs
          pdfsFolder?.file(`${baseName}.png`, withPinsBlob as Blob);
          pdfsFolder?.file(`${baseName}_clean.png`, cleanBlob as Blob);
          assetCompleted += 2; // two overviews
          updateAssetProgress(`Generated overviews for ${baseName}`);
          filesAddedThisPart += 2;
          await checkRotatePart();
        } catch (error) {
          console.error(`Error generating overview images for plan ${plan.id}:`, error);
        }

        // Process each point
        for (const pointData of planData.points) {
          const point = pointData.point;
          
          // Generate pin preview
          try {
            console.log(`Generating preview for point ${point.id} in plan ${plan.id}`);
            const pointIndex = planData.points.findIndex(p => p.point.id === point.id);
            const previewBlob = await generatePinPreviewImage(pdfjs, plan, point, pointIndex);
            const previewFileName = `plan_${plan.id}_point_${point.id}_preview.jpg`;
            previewsFolder?.file(previewFileName, previewBlob as Blob);
            assetCompleted += 1; // preview
            updateAssetProgress(`Generated preview for pin ${point.id}`);
            filesAddedThisPart += 1;
            await checkRotatePart();
          } catch (error) {
            console.error(`Error generating preview for point ${point.id}:`, error);
          }

          // Add images for each point
          for (let i = 0; i < pointData.images.length; i++) {
            const image = pointData.images[i];
            if (image.data) { // Use the loaded base64 data
              const fileName = `plan_${plan.id}_point_${point.id}_image_${i + 1}.jpg`;
              imagesFolder?.file(fileName, image.data, { base64: true });
              console.log(`✅ Added image ${fileName} to zip`);
              assetCompleted += 1; // image
              updateAssetProgress(`Added image ${fileName}`);
              filesAddedThisPart += 1;
              await checkRotatePart();
            } else {
              console.warn(`⚠️ Skipping image ${image.key} - no data available`);
            }
          }
        }
      }

      // Finalize last part if any files added
      if (filesAddedThisPart > 0) {
        await saveZipPart(zip, partIndex);
      }
      
      setProgress('Export complete!');
      setPercent(100);
      console.log('📦 Project export completed successfully');
    } catch (error) {
      console.error('Error generating zip:', error);
      setProgress(cancelRequested ? 'Export cancelled' : 'Export failed');
      if (!cancelRequested) alert('Failed to generate project export. Please try again.');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  return (
    <div>
      <button
        onClick={handleDownload}
        disabled={isGenerating}
        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-400 w-full"
      >
        {isGenerating ? `Exporting... ${progress}` : 'Export Zip'}
      </button>
      {isGenerating && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-200 rounded-full w-full">
            <div
              className="h-2 bg-green-500 rounded-full transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <button
            onClick={() => setCancelRequested(true)}
            className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
          >
            Cancel
          </button>
        </div>
      )}
      {isGenerating && (
        <div className="mt-2 h-2 bg-gray-200 rounded-full w-full">
          <div
            className="h-2 bg-green-500 rounded-full transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default DownloadProjectButton; 
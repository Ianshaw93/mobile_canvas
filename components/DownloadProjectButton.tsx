import React, { useState } from 'react';
import JSZip from 'jszip';
import useSiteStore from '@/store/useSiteStore';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { usePDF } from '@/hooks/usePDF';

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
      
      // Convert to JPG and resolve
      const jpgData = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      resolve(jpgData);
      
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

      // Export PNG (crisper labels)
      const pngData = canvas.toDataURL('image/png').split(',')[1];
      resolve(pngData);
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
          pointComment: point.comment || '' // This should be the same for all images from this point
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
      'Project ID', 'Project Name', 'Plan ID', 'Plan Name', 'Plan File Name',
      'Plan Width', 'Plan Height', 'Point ID', 'Point X (Normalized)', 'Point Y (Normalized)',
      'Point X (Original)', 'Point Y (Original)', 'Point Comment', 'Image File Name',
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
          planId: plan.id,
          planName: plan.name || '',
          planFileName,
          planWidth,
          planHeight,
          pointId: point.id,
          normalizedX: normalizedX.toFixed(5),
          normalizedY: normalizedY.toFixed(5),
          originalX: point.x.toFixed(2),
          originalY: point.y.toFixed(2),
          pointComment: point.comment || ''
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
            escapeCsvField(baseData.pointComment),
            escapeCsvField(''),
            escapeCsvField(''),
            escapeCsvField(new Date().toISOString())
          ].join(',')];
        }

        return pointData.images.map((image: any, index: number) => [
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
          escapeCsvField(baseData.pointComment),
          escapeCsvField(`point_${point.id}_image_${index + 1}.jpg`),
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
      
      const zip = new JSZip();
      
      // Create folders in the zip
      const pdfsFolder = zip.folder("pdfs");
      const imagesFolder = zip.folder("images");
      const previewsFolder = zip.folder("pin_previews");
      
      // Generate CSV with the loaded data
      const csvData = generateCSVFromExportData(exportData);
      zip.file("project_data.csv", csvData);
      
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

      // Add PDFs
      for (const planData of exportData.plans) {
        const plan = planData.plan;
        if (plan.url) {
          const pdfData = plan.url.split(',')[1]; // Remove data URL prefix
          const fileName = `${plan.name || plan.id}.pdf`;
          pdfsFolder?.file(fileName, pdfData, { base64: true });
          assetCompleted += 1; // PDF added
          updateAssetProgress(`Added PDF ${fileName}`);
        }

        // Generate full-plan overview images (with pins and clean)
        try {
          const exportScale = plan?.dimensions?.displayScale || 1.5; // match viewer scale by default
          const baseName = `${plan.name || plan.id}`;
          const withPinsPng = await generatePlanOverviewImage(pdfjs, plan, planData.points, true, exportScale);
          const cleanPng = await generatePlanOverviewImage(pdfjs, plan, planData.points, false, exportScale);
          // Store alongside the existing plan export assets
          pdfsFolder?.file(`${baseName}.png`, withPinsPng as string, { base64: true });
          pdfsFolder?.file(`${baseName}_clean.png`, cleanPng as string, { base64: true });
          assetCompleted += 2; // two overviews
          updateAssetProgress(`Generated overviews for ${baseName}`);
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
            const previewJpg = await generatePinPreviewImage(pdfjs, plan, point, pointIndex);
            const previewFileName = `plan_${plan.id}_point_${point.id}_preview.jpg`;
            previewsFolder?.file(previewFileName, previewJpg as string, { base64: true });
            assetCompleted += 1; // preview
            updateAssetProgress(`Generated preview for pin ${point.id}`);
          } catch (error) {
            console.error(`Error generating preview for point ${point.id}:`, error);
          }

          // Add images for each point
          for (let i = 0; i < pointData.images.length; i++) {
            const image = pointData.images[i];
            if (image.data) { // Use the loaded base64 data
              const fileName = `point_${point.id}_image_${i + 1}.jpg`;
              imagesFolder?.file(fileName, image.data, { base64: true });
              console.log(`✅ Added image ${fileName} to zip`);
              assetCompleted += 1; // image
              updateAssetProgress(`Added image ${fileName}`);
            } else {
              console.warn(`⚠️ Skipping image ${image.key} - no data available`);
            }
          }
        }
      }

      setProgress('Compressing files...');
      console.log('📦 Generating zip file...');
      // Ensure asset phase ends at LOAD+ASSET weights before compression
      updateAssetProgress('Compressing files...');
      const zipContent = await zip.generateAsync(
        { type: "blob" },
        (metadata) => {
          // metadata.percent is 0..100 for compression only
          const base = (LOAD_WEIGHT + ASSET_WEIGHT) * 100;
          const total = Math.min(100, Math.floor(base + (COMPRESS_WEIGHT * metadata.percent)));
          setPercent(total);
          if (metadata.currentFile) {
            setProgress(`Compressing ${metadata.currentFile} (${Math.floor(metadata.percent)}%)`);
          }
        }
      );

      if (Capacitor.isNativePlatform()) {
        // For mobile devices: Save to Downloads directory
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          const fileName = `project_${selectedProject.name}_${Date.now()}.zip`;
          
          try {
            // Save to Downloads directory
            await Filesystem.writeFile({
              path: `Download/${fileName}`,
              data: base64Data.split(',')[1],
              directory: Directory.ExternalStorage,
              recursive: true
            });

            // Get the file URI
            const fileUri = await Filesystem.getUri({
              directory: Directory.ExternalStorage,
              path: `Download/${fileName}`
            });

            // Share the file
            await Share.share({
              title: 'Project Export',
              text: 'Project Export Data',
              url: fileUri.uri,
              dialogTitle: 'Export Project Data'
            });

            alert('Project exported successfully to Downloads folder');
          } catch (error) {
            console.error('Error saving or sharing file:', error);
            alert('Failed to save project export. Please check app permissions.');
          }
        };
        reader.readAsDataURL(zipContent);
      } else {
        // For web: Direct download
        const url = URL.createObjectURL(zipContent);
        const a = document.createElement('a');
        a.href = url;
        a.download = `project_${selectedProject.name}_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
      setProgress('Export complete!');
      setPercent(100);
      console.log('📦 Project export completed successfully');
    } catch (error) {
      console.error('Error generating zip:', error);
      setProgress('Export failed');
      alert('Failed to generate project export. Please try again.');
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
        {isGenerating ? `Exporting... ${progress}` : 'Export Project'}
      </button>
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
import React, { useState } from 'react';
import JSZip from 'jszip';
import useSiteStore from '@/store/useSiteStore';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { usePDF } from '@/hooks/usePDF';

// @ts-ignore
const generatePinPreviewImage = async (pdfjs, plan, point, size = 300, zoomLevel = 2) => {
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
      const pointIndex = plan.points.findIndex(p => p.id === point.id);
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

const DownloadProjectButton = ({ projectId }: { projectId: string }) => {
  const [isGenerating, setIsGenerating] = useState(false);
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
          pointComment: point.comment || ''
        };

        // If point has no images, create one row for the point
        if (!point.images || point.images.length === 0) {
          return [[
            baseData.projectId,
            baseData.projectName,
            baseData.planId,
            baseData.planName,
            baseData.planFileName,
            baseData.planWidth,
            baseData.planHeight,
            baseData.pointId,
            baseData.normalizedX,
            baseData.normalizedY,
            baseData.originalX,
            baseData.originalY,
            baseData.pointComment,
            '', // No image file
            '', // No image comment
            new Date().toISOString()
          ].join(',')];
        }

        // Create a row for each image in the point
        // @ts-ignore
        return point.images.map((image, index) => [
          baseData.projectId,
          baseData.projectName,
          baseData.planId,
          baseData.planName,
          baseData.planFileName,
          baseData.planWidth,
          baseData.planHeight,
          baseData.pointId,
          baseData.normalizedX,
          baseData.normalizedY,
          baseData.originalX,
          baseData.originalY,
          baseData.pointComment,
          `point_${point.id}_image_${index + 1}.jpg`,
          image.comment || '',
          new Date().toISOString()
        ].join(','));
      });
    });

    // Escape any commas in text fields and wrap in quotes if needed
    const escapeCsvField = (field: string) => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    return [headers.join(','), ...rows].join('\n');
  };

  const handleDownload = async () => {
    if (!selectedProject || !pdfjs) return;
    setIsGenerating(true);

    try {
      const zip = new JSZip();
      
      // Create folders in the zip
      const pdfsFolder = zip.folder("pdfs");
      const imagesFolder = zip.folder("images");
      const previewsFolder = zip.folder("pin_previews"); // New folder for pin previews
      
      // Add project data as CSV
      const csvData = generateCSV(selectedProject.plans);
      zip.file("project_data.csv", csvData);

      // Add PDFs
      for (const plan of selectedProject.plans) {
        if (plan.url) {
          const pdfData = plan.url.split(',')[1]; // Remove data URL prefix
          const fileName = `${plan.name || plan.id}.pdf`;
          pdfsFolder?.file(fileName, pdfData, { base64: true });
        }

        // Process each point
        for (const point of plan.points) {
          // Generate pin preview
          try {
            console.log(`Generating preview for point ${point.id} in plan ${plan.id}`);
            const previewJpg = await generatePinPreviewImage(pdfjs, plan, point);
            const previewFileName = `plan_${plan.id}_point_${point.id}_preview.jpg`;
            // @ts-ignore
            previewsFolder?.file(previewFileName, previewJpg, { base64: true });
          } catch (error) {
            console.error(`Error generating preview for point ${point.id}:`, error);
          }

          // Add images for each point
          for (let i = 0; i < point.images.length; i++) {
            const image = point.images[i];
            if (image.url) {
              const imageData = image.url.split(',')[1]; // Remove data URL prefix
              const fileName = `point_${point.id}_image_${i + 1}.jpg`;
              imagesFolder?.file(fileName, imageData, { base64: true });
            }
          }
        }
      }

      // Generate zip file
      const zipContent = await zip.generateAsync({ type: "blob" });

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
    } catch (error) {
      console.error('Error generating zip:', error);
      alert('Failed to generate project export');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={isGenerating}
      className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-400"
    >
      {isGenerating ? 'Generating Export...' : 'Export Project'}
    </button>
  );
};

export default DownloadProjectButton; 
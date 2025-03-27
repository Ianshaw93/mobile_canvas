import React, { useState } from 'react';
import JSZip from 'jszip';
import useSiteStore from '@/store/useSiteStore';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

const DownloadProjectButton = ({ projectId }: { projectId: string }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const selectedProject = useSiteStore((state) => 
    state.projects.find(p => p.id === projectId)
  );

  const generateCSV = (plans: any[]) => {
    const headers = ['Plan Name', 'Point ID', 'X', 'Y', 'Comment', 'Image Count'];
    const rows = plans.flatMap(plan => 
      plan.points.map(point => [
        plan.name || 'Unnamed Plan',
        point.id,
        point.x,
        point.y,
        point.comment || '',
        point.images.length
      ].join(','))
    );
    return [headers.join(','), ...rows].join('\n');
  };

  const handleDownload = async () => {
    if (!selectedProject) return;
    setIsGenerating(true);

    try {
      const zip = new JSZip();
      
      // Create folders in the zip
      const pdfsFolder = zip.folder("pdfs");
      const imagesFolder = zip.folder("images");
      
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

        // Add images for each point
        for (const point of plan.points) {
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
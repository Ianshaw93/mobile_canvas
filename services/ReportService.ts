import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

interface Project {
  id: string;
  name: string;
}

interface Image {
  key?: string;
  comment?: string;
  url?: string;
}

interface Point {
  id: string;
  x: number;
  y: number;
  comment?: string;
  images: Image[];
}

interface Plan {
  id: string;
  name: string;
  url: string;
  points: Point[];
  dimensions?: {
    width: number;
    height: number;
  };
}

// Add new interface for CSV data structure
interface CsvPoint {
  projectId: string;
  projectName: string;
  planId: string;
  planName: string;
  planFileName: string;
  planWidth: number;    // Original PDF width
  planHeight: number;   // Original PDF height
  pointId: string;
  pointX: number;      // Normalized X (0-1)
  pointY: number;      // Normalized Y (0-1)
  pointXOriginal: number;  // Original X coordinate
  pointYOriginal: number;  // Original Y coordinate
  pointComment: string;
  imageFileName: string;
  imageComment: string;
  timestamp: string;
}

const extractBase64Data = (dataUrl: string): string => {
  // If it's already just base64 data, return it
  if (!dataUrl.includes('data:')) {
    return dataUrl;
  }
  // Otherwise extract the base64 part from the data URL
  const base64Matches = dataUrl.match(/^data:.*?;base64,(.*)$/);
  return base64Matches ? base64Matches[1] : dataUrl;
};

const generateCsvContent = (points: CsvPoint[]): string => {
  // Define CSV headers
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

  // Convert data to CSV rows
  const rows = points.map(point => [
    point.projectId,
    point.projectName,
    point.planId,
    point.planName,
    point.planFileName,
    point.planWidth,
    point.planHeight,
    point.pointId,
    point.pointX.toFixed(6),
    point.pointY.toFixed(6),
    point.pointXOriginal.toFixed(2),
    point.pointYOriginal.toFixed(2),
    point.pointComment || '',
    point.imageFileName || '',
    point.imageComment || '',
    point.timestamp
  ].map(field => `"${String(field).replace(/"/g, '""')}"`));

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
};

const generateProjectCsv = async (project: Project, plans: Plan[], folderName: string) => {
  try {
    const csvPoints: CsvPoint[] = [];
    const timestamp = new Date().toISOString();

    // Iterate through all plans and their points
    for (const plan of plans) {
      const planFileName = `plan_${plan.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      const planWidth = plan.dimensions?.width || 0;
      const planHeight = plan.dimensions?.height || 0;
      
      for (const point of plan.points) {
        // Calculate normalized coordinates (0-1)
        const pointXNormalized = planWidth ? point.x / planWidth : 0;
        const pointYNormalized = planHeight ? point.y / planHeight : 0;
        
        // Add a row for the point itself, even if it has no images
        const basePoint: CsvPoint = {
          projectId: project.id,
          projectName: project.name,
          planId: plan.id,
          planName: plan.name || '',
          planFileName,
          planWidth,
          planHeight,
          pointId: point.id,
          pointX: pointXNormalized,
          pointY: pointYNormalized,
          pointXOriginal: point.x,
          pointYOriginal: point.y,
          pointComment: point.comment || '',
          imageFileName: '',
          imageComment: '',
          timestamp
        };

        if (!point.images || point.images.length === 0) {
          csvPoints.push(basePoint);
        } else {
          point.images.forEach((image: Image, index: number) => {
            const imageFileName = `point_${point.id.toString().replace(/[^a-z0-9]/gi, '_')}_image_${index + 1}.jpg`;
            csvPoints.push({
              ...basePoint,
              imageFileName,
              imageComment: image.comment || ''
            });
          });
        }
      }
    }

    // Generate CSV content
    const csvContent = generateCsvContent(csvPoints);

    // Save CSV file
    const csvFileName = `${folderName}/project_data.csv`;
    await Filesystem.writeFile({
      path: csvFileName,
      data: csvContent,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true
    });

    console.log(`CSV data saved to: ${csvFileName}`);
    return csvFileName;
  } catch (error) {
    console.error('Error generating CSV:', error);
    throw error;
  }
};

export const generateProjectReport = async (project: Project, plans: Plan[]) => {
  try {
    // Create a folder for the project report
    const timestamp = Date.now();
    const sanitizedProjectName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folderName = `report_${sanitizedProjectName}_${timestamp}`;
    
    // Generate and save CSV data first
    await generateProjectCsv(project, plans, folderName);
    
    // Save each original PDF plan and its associated images
    for (const plan of plans) {
      // Save the plan PDF
      if (plan.url) {
        const planFileName = `${folderName}/plan_${plan.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        try {
          // Extract the original PDF data
          let pdfData = plan.url;
          if (plan.url.startsWith('data:')) {
            // If it's a data URL, extract just the base64 data
            pdfData = extractBase64Data(plan.url);
          }
          
          // Save the original PDF data
          await Filesystem.writeFile({
            path: planFileName,
            data: `data:application/pdf;base64,${pdfData}`,
            directory: Directory.Documents,
            recursive: true
          });
          console.log(`Saved original plan: ${planFileName}`);
        } catch (error) {
          console.error(`Error saving plan ${plan.name}:`, error);
        }
      }

      // Save images for each point in the plan
      for (const point of plan.points) {
        if (point.images && point.images.length > 0) {
          for (let i = 0; i < point.images.length; i++) {
            const image = point.images[i];
            if (image && image.url) {
              try {
                const sanitizedPointId = point.id.toString().replace(/[^a-z0-9]/gi, '_');
                const imageFileName = `${folderName}/point_${sanitizedPointId}_image_${i + 1}.jpg`;
                
                // Extract the base64 data, maintaining original quality
                let imageData = image.url;
                if (image.url.startsWith('data:')) {
                  // Extract base64 without re-encoding
                  imageData = extractBase64Data(image.url);
                }
                
                // Save with original quality
                await Filesystem.writeFile({
                  path: imageFileName,
                  data: `data:image/jpeg;base64,${imageData}`,
                  directory: Directory.Documents,
                  recursive: true
                });
                console.log(`Saved high quality image: ${imageFileName}`);
              } catch (error) {
                console.error(`Error saving high quality image for point ${point.id}:`, error);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error generating project report:', error);
    throw error;
  }
}; 
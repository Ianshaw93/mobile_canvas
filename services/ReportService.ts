import { generateProjectPdfReport } from '../utils/reportGenerator/pdfReport';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

interface Project {
  id: string;
  name: string;
}

interface Plan {
  id: string;
  name: string;
  url?: string;
  points: any[];
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

export const generateProjectReport = async (project: Project, plans: Plan[]) => {
  try {
    // Create a folder for the project report
    const timestamp = Date.now();
    const sanitizedProjectName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folderName = `report_${sanitizedProjectName}_${timestamp}`;
    
    // Save each original PDF plan
    for (const plan of plans) {
      if (plan.url) {
        const planFileName = `${folderName}/plan_${plan.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        try {
          // If the URL is already a data URL, use it directly, otherwise create one
          const dataUrl = plan.url.startsWith('data:') ? 
            plan.url : 
            `data:application/pdf;base64,${extractBase64Data(plan.url)}`;

          await Filesystem.writeFile({
            path: planFileName,
            data: dataUrl,
            directory: Directory.Documents,
            recursive: true
          });
          console.log(`Saved original plan: ${planFileName}`);
        } catch (error) {
          console.error(`Error saving plan ${plan.name}:`, error);
        }
      }
    }

    // Generate and save the report PDF
    const pdfBuffer = await generateProjectPdfReport(project, plans);
    const reportFileName = `${folderName}/report.pdf`;
    
    // Create a data URL with the PDF content
    const base64Data = pdfBuffer.toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64Data}`;
    
    await Filesystem.writeFile({
      path: reportFileName,
      data: dataUrl,
      directory: Directory.Documents,
      recursive: true
    });
    
    // Get URI for the saved report file
    const uriResult = await Filesystem.getUri({
      directory: Directory.Documents,
      path: reportFileName
    });
    
    console.log(`Report saved to folder: ${folderName}`);
    return uriResult.uri;
  } catch (error) {
    console.error('Error in report service:', error);
    throw error;
  }
}; 
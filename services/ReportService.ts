import { generateProjectPdfReport } from '../utils/reportGenerator/pdfReport';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export const generateProjectReport = async (project, plans) => {
  try {
    // Generate PDF report
    const pdfBuffer = await generateProjectPdfReport(project, plans);
    
    // Create filename with project name and timestamp
    const sanitizedProjectName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `report_${sanitizedProjectName}_${Date.now()}.pdf`;
    
    // Save file to device
    await Filesystem.writeFile({
      path: fileName,
      data: pdfBuffer.toString('base64'),
      directory: Directory.Documents,
      encoding: Encoding.BASE64,
      recursive: true
    });
    
    // Get URI for the saved file
    const uriResult = await Filesystem.getUri({
      directory: Directory.Documents,
      path: fileName
    });
    
    return uriResult.uri;
  } catch (error) {
    console.error('Error in report service:', error);
    throw error;
  }
}; 
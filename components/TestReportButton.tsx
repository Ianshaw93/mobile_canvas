import { generateTestPdf } from '../utils/reportGenerator/pdfReport';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import useSiteStore from '@/store/useSiteStore';
import { ReportTemplateData } from '../utils/reportGenerator/types';

export const TestReportButton = () => {
  const selectedProject = useSiteStore((state) => 
    state.projects.find(p => p.id === state.selectedProjectId)
  );

  const handleGenerateTest = async () => {
    try {
      console.log('Starting test PDF generation...');
      
      // Get first plan if available
      const firstPlan = selectedProject?.plans?.[0];
      if (!firstPlan?.url) {
        throw new Error('No plan URL available for test');
      }

      // Create test data with the plan URL
      const testData: ReportTemplateData = {
        projectName: "Test Project",
        generatedDate: new Date().toLocaleDateString(),
        plans: [{
          id: firstPlan.id,
          name: "Test Plan",
          url: firstPlan.url,
          points: [{
            id: "test1",
            x: 100,
            y: 100,
            comment: "Test point with URL",
            images: [firstPlan.url],
            locationPreview: null
          }]
        }]
      };
      
      console.log('Using test data with URL:', testData);
      const pdfBuffer = await generateTestPdf(testData);
      const fileName = `report_Test_${Date.now()}.pdf`;
      
      await Filesystem.writeFile({
        path: fileName,
        data: pdfBuffer.toString('base64'),
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      console.log('Test PDF saved:', fileName);
      return fileName;
    } catch (error: unknown) {
      console.error('Error generating test PDF:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  };

  return (
    <button 
      onClick={handleGenerateTest}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      disabled={!selectedProject?.plans?.length}
    >
      Generate Test PDF
    </button>
  );
}; 
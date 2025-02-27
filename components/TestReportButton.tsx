import { generateTestDocument } from '@/utils/reportGenerator/docxReport';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import useSiteStore from '@/store/useSiteStore';

export const TestReportButton = () => {
  const selectedProject = useSiteStore((state) => 
    state.projects.find(p => p.id === state.selectedProjectId)
  );

  const handleGenerateTest = async () => {
    try {
      console.log('Starting test document generation...');
      
      // Get thumbnail from first plan if available
      const firstPlan = selectedProject?.plans?.[0];
      if (!firstPlan?.thumbnail) {
        throw new Error('No plan thumbnail available for test');
      }

      // Create test data with the plan thumbnail
      const testData = {
        projectName: "Test Project",
        generatedDate: new Date().toLocaleDateString(),
        plans: [{
          name: "Test Plan",
          points: [{
            id: "test1",
            x: 100,
            y: 100,
            comment: "Test point with thumbnail",
            images: [firstPlan.thumbnail]
          }]
        }]
      };
      
      console.log('Using test data with thumbnail:', testData);
      const buffer = await generateTestDocument(testData);
      const fileName = `report_Test_${Date.now()}.docx`;
      
      await Filesystem.writeFile({
        path: fileName,
        data: buffer.toString('base64'),
        directory: Directory.Documents,
        encoding: Encoding.BASE64,
        recursive: true
      });

      const uriResult = await Filesystem.getUri({
        directory: Directory.Documents,
        path: fileName
      });

      if (uriResult?.uri) {
        window.open(uriResult.uri, '_blank');
      }

    } catch (error) {
      console.error('Error generating test document:', error);
      alert('Failed to generate test document: ' + error.message);
    }
  };

  return (
    <button 
      onClick={handleGenerateTest}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      disabled={!selectedProject?.plans?.length}
    >
      Generate Test Document
    </button>
  );
}; 
import React from 'react';
import useSiteStore from '@/store/useSiteStore';

interface ReportButtonProps {
  projectId: string;
}

const ReportButton = ({ projectId }: ReportButtonProps) => {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      const uri = await useSiteStore.getState().generateReport(projectId);
      window.open(uri, '_blank');
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      onClick={handleGenerateReport}
      disabled={isGenerating}
      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
    >
      {isGenerating ? 'Generating Report...' : 'Generate Report'}
    </button>
  );
};

export default ReportButton; 
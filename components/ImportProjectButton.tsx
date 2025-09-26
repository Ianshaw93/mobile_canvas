import React, { useState } from 'react';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { validateAndPreviewImport } from '@/services/ImportService';

const base64ToUint8 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

interface ImportProjectButtonProps {
  projectId: string;
}

const ImportProjectButton: React.FC<ImportProjectButtonProps> = ({ projectId }) => {
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const { files } = await FilePicker.pickFiles({
        types: ['application/zip', '.zip'],
        multiple: false,
        readData: true
      });
      if (!files?.length || !files[0].data) {
        setIsImporting(false);
        return;
      }

      const name = files[0].name ?? 'import.zip';
      const bytes = base64ToUint8(files[0].data);

      // Hand off to import service (Task 5.2 will flesh this out)
      await validateAndPreviewImport({ projectId, name, bytes });
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import zip. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <button
      onClick={handleImport}
      disabled={isImporting}
      className="ml-2 bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:bg-gray-400"
    >
      {isImporting ? 'Importing…' : 'Import Zip'}
    </button>
  );
};

export default ImportProjectButton;



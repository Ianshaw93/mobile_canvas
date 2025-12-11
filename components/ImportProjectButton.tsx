import React, { useState } from 'react';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { previewImport } from '@/services/ImportService';
import ImportPreviewModal from './ImportPreviewModal';
import useSiteStore from '@/store/useSiteStore';

const base64ToUint8 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

interface ImportProjectButtonProps {
  projectId?: string; // Optional - can import without being tied to a specific project
}

const ImportProjectButton: React.FC<ImportProjectButtonProps> = ({ projectId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [zipBytes, setZipBytes] = useState<Uint8Array | null>(null);
  const loadProjects = useSiteStore((state) => state.loadProjects);
  const setSelectedProjectId = useSiteStore((state) => state.setSelectedProjectId);

  const handleImport = async () => {
    try {
      setIsLoading(true);
      const { files } = await FilePicker.pickFiles({
        types: ['application/zip', '.zip'], 
        limit: 1, 
        readData: true 
      });
      if (!files?.length || !files[0].data) {
        setIsLoading(false);
        return;
      }

      const bytes = base64ToUint8(files[0].data);

      // Preview the import
      const importPreview = await previewImport(bytes);
      setPreview(importPreview);
      setZipBytes(bytes);
    } catch (err) {
      console.error('Import failed:', err);
      alert(`Failed to import zip: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setPreview(null);
    setZipBytes(null);
  };

  const handleComplete = async (importedProjectId: string) => {
    // Reload projects and select the imported/merged project
    await loadProjects();
    setSelectedProjectId(importedProjectId);
    handleClose();
  };

  return (
    <>
      <button
        onClick={handleImport}
        disabled={isLoading}
        className="ml-2 bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:bg-gray-400"
      >
        {isLoading ? 'Loading…' : 'Import Zip'}
      </button>

      {preview && zipBytes && (
        <ImportPreviewModal
          preview={preview}
          zipBytes={zipBytes}
          onClose={handleClose}
          onComplete={handleComplete}
        />
      )}
    </>
  );
};

export default ImportProjectButton;



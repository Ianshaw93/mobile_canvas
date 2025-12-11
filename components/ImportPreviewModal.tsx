import React, { useState } from 'react';
import useSiteStore from '@/store/useSiteStore';
import { ImportPreview, ImportStrategy, applyImport } from '@/services/ImportService';

interface ImportPreviewModalProps {
  preview: ImportPreview;
  zipBytes: Uint8Array;
  onClose: () => void;
  onComplete: (projectId: string) => void;
}

const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  preview,
  zipBytes,
  onClose,
  onComplete
}) => {
  const projects = useSiteStore((state) => state.projects);
  const [strategy, setStrategy] = useState<ImportStrategy>({
    type: 'new',
    planMatching: 'create-new'
  });
  const [targetProjectId, setTargetProjectId] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const handleImport = async () => {
    try {
      setIsImporting(true);
      setProgress('Starting import...');
      setProgressPercent(0);

      const importStrategy: ImportStrategy = strategy.type === 'new'
        ? { type: 'new', planMatching: 'create-new' }
        : {
            type: 'merge',
            targetProjectId: targetProjectId || undefined,
            planMatching: strategy.planMatching
          };

      if (importStrategy.type === 'merge' && !importStrategy.targetProjectId) {
        alert('Please select a project to merge into');
        return;
      }

      const result = await applyImport(zipBytes, importStrategy, (msg, percent) => {
        setProgress(msg);
        setProgressPercent(percent);
      });

      setIsImporting(false);
      onComplete(result.projectId);
      onClose();
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto text-gray-900">
        <h2 className="text-2xl font-bold mb-4 text-gray-900">Import Project Preview</h2>

        {/* Project Info */}
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2 text-gray-900">Project: {preview.project.name}</h3>
          <div className="text-sm text-gray-700">
            <p>Client: {preview.project.clientName || '(not set)'}</p>
            <p>Engineer: {preview.project.engineerName || '(not set)'}</p>
            <p>Site Visit: {preview.project.siteVisitNumber}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-6">
          <h3 className="font-semibold mb-2 text-gray-900">Import Summary</h3>
          <ul className="list-disc list-inside text-sm space-y-1 text-gray-700">
            <li>{preview.plans.length} plan(s)</li>
            <li>{preview.totalPoints} point(s)</li>
            <li>{preview.totalImages} image(s)</li>
          </ul>
        </div>

        {/* Plans List */}
        <div className="mb-6">
          <h3 className="font-semibold mb-2 text-gray-900">Plans</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {preview.plans.map((plan) => (
              <div key={plan.id} className="p-2 bg-gray-50 rounded text-sm">
                <div className="font-medium text-gray-900">{plan.name}</div>
                <div className="text-gray-700">
                  {plan.pointCount} points, {plan.imageCount} images
                  {!plan.hasPdf && <span className="text-red-600 ml-2">⚠ Missing PDF</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Warnings */}
        {preview.warnings.length > 0 && (
          <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <h3 className="font-semibold text-gray-900 mb-2">Warnings</h3>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              {preview.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Import Strategy */}
        <div className="mb-6">
          <h3 className="font-semibold mb-3 text-gray-900">Import Options</h3>

          {/* Strategy Type */}
          <div className="mb-4">
            <label className="block mb-2 font-medium text-gray-900">Import Type</label>
            <div className="space-y-2">
              <label className="flex items-center text-gray-900">
                <input
                  type="radio"
                  name="strategy-type"
                  value="new"
                  checked={strategy.type === 'new'}
                  onChange={() => setStrategy({ ...strategy, type: 'new', planMatching: 'create-new' })}
                  disabled={isImporting}
                  className="mr-2"
                />
                <span className="text-gray-900">Create New Project</span>
              </label>
              <label className="flex items-center text-gray-900">
                <input
                  type="radio"
                  name="strategy-type"
                  value="merge"
                  checked={strategy.type === 'merge'}
                  onChange={() => setStrategy({ ...strategy, type: 'merge', planMatching: 'match-by-name' })}
                  disabled={isImporting}
                  className="mr-2"
                />
                <span className="text-gray-900">Merge into Existing Project</span>
              </label>
            </div>
          </div>

          {/* Target Project Selection (for merge) */}
          {strategy.type === 'merge' && (
            <div className="mb-4">
              <label className="block mb-2 font-medium text-gray-900">Select Project to Merge Into</label>
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                disabled={isImporting}
                className="w-full p-2 border rounded text-gray-900 bg-white"
              >
                <option value="" className="text-gray-900">-- Select Project --</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id} className="text-gray-900">
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Plan Matching Strategy (for merge) */}
          {strategy.type === 'merge' && (
            <div className="mb-4">
              <label className="block mb-2 font-medium text-gray-900">Plan Matching</label>
              <div className="space-y-2">
                <label className="flex items-center text-gray-900">
                  <input
                    type="radio"
                    name="plan-matching"
                    value="match-by-name"
                    checked={strategy.planMatching === 'match-by-name'}
                    onChange={() => setStrategy({ ...strategy, planMatching: 'match-by-name' })}
                    disabled={isImporting}
                    className="mr-2"
                  />
                  <span className="text-gray-900">
                    Match plans by name (merge points into existing plans, create new if no match)
                  </span>
                </label>
                <label className="flex items-center text-gray-900">
                  <input
                    type="radio"
                    name="plan-matching"
                    value="create-new"
                    checked={strategy.planMatching === 'create-new'}
                    onChange={() => setStrategy({ ...strategy, planMatching: 'create-new' })}
                    disabled={isImporting}
                    className="mr-2"
                  />
                  <span className="text-gray-900">Always create new plans</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        {isImporting && (
          <div className="mb-6">
            <div className="text-sm text-gray-700 mb-2">{progress}</div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting || (strategy.type === 'merge' && !targetProjectId)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportPreviewModal;


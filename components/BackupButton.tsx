import React, { useState } from 'react';
import useSiteStore from '../store/useSiteStore';
import { sendData } from './ApiCalls';

type FileQueueItem = {
    file: File;
    projectId: string;
    planId: string;
  };

const BackupButton = () => {
  const { offlineQueue, setUserTriggeredBackup } = useSiteStore();
  
  const [localQueue, setLocalQueue] = useState<FileQueueItem[]>([]);
  const [processedItems, setProcessedItems] = useState<FileQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBackup = async () => {
    // Set backup as triggered by user in Zustand
    setUserTriggeredBackup(true);

    // Copy Zustand offline queue to local state
    setLocalQueue([...offlineQueue]);
    setIsProcessing(true);

    // Call the function to process the queue locally
    await processLocalQueue();
    
    // Once done, update Zustand with the processed queue
    finalizeQueueState();
  };

  const processLocalQueue = async () => {
    for (let i = 0; i < localQueue.length; i++) {
        // TODO: queue to have project and pdf id
      const {file, projectId, planId} = localQueue[i];
      console.log(`************Processing file: ${file.name}`, projectId, planId, "*******");
      try {
        console.log(`Attempting to upload file: ${file.name}`);
        await sendData( file, planId, projectId );

        // Move successfully processed file to processed items
        setProcessedItems((prev) => [...prev, { file, planId, projectId }]);

        // Remove the file from local queue
        setLocalQueue((prev) => prev.filter((item) => item !== localQueue[i]));

        // Adding a small delay between uploads to prevent rapid retries
        await new Promise((resolve) => setTimeout(resolve, 500));

      } catch (error) {
        console.log(`Failed to upload file: ${file.name}. Stopping processing.`);
        break; // Stop processing if there's a failure
      }
    }
  };

  const finalizeQueueState = () => {
    const { setOfflineQueue } = useSiteStore.getState();

    // Filter out processed items from the original Zustand queue
    const updatedQueue = offlineQueue.filter(
      (file) => !processedItems.includes(file)
    );

    // Update Zustand with the processed queue state
    setOfflineQueue(updatedQueue);
    setProcessedItems([]); // Clear local processed items
    setIsProcessing(false); // Mark processing as complete
    console.log("Queue processing complete. Zustand updated.");
  };

  return (
    <button 
      onClick={handleBackup}
      disabled={isProcessing}
      className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-0.1 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800" 
    >
      {isProcessing ? "Processing..." : "Backup to Dropbox"}
    </button>
  );
};

export default BackupButton;

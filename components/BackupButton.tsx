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
  const [isSuccess, setIsSuccess] = useState(false);

  const handleBackup = async () => {
    // Set backup as triggered by user in Zustand
    setUserTriggeredBackup(true);

    // Copy Zustand offline queue to local state
    setLocalQueue([...offlineQueue]);
    setIsProcessing(true);
    setIsSuccess(false);

    // Call the function to process the queue locally
    await processLocalQueue();
    
    // Once done, update Zustand with the processed queue
    finalizeQueueState();
    
    // Set success state and reset after 3 seconds
    setIsSuccess(true);
    setTimeout(() => setIsSuccess(false), 3000);
  };

  const processLocalQueue = async () => {
    for (let i = 0; i < localQueue.length; i++) {
      const {file, projectId, planId} = localQueue[i];
      try {
        console.log(`Attempting to upload file: ${file.name}`);
        const success = await sendData(file, planId, projectId);

        if (success) {
          // Move successfully processed file to processed items
          setProcessedItems((prev) => [...prev, { file, planId, projectId }]);
          // Remove the file from local queue
          setLocalQueue((prev) => prev.filter((item) => item !== localQueue[i]));
        } else {
          throw new Error('Upload failed');
        }

        await new Promise((resolve) => setTimeout(resolve, 500));

      } catch (error) {
        console.log(`Failed to upload file: ${file.name}. Stopping processing.`);
        setIsSuccess(false);
        break;
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

  // Check if queue is empty
  const isQueueEmpty = offlineQueue.length === 0;

  return (
    <button 
      onClick={handleBackup}
      disabled={isProcessing || isQueueEmpty}
      className={`text-white font-medium rounded-lg text-sm px-5 py-0.1 mr-2 mb-2 focus:outline-none ${
        isSuccess 
          ? "bg-green-600 hover:bg-green-700" 
          : isQueueEmpty
          ? "bg-gray-400 cursor-not-allowed" // Gray out when queue is empty
          : "bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700"
      }`}
    >
      {isProcessing 
        ? "Processing..." 
        : isSuccess 
        ? "Successfully backed up!" 
        : isQueueEmpty 
        ? "Nothing to backup" 
        : "Backup to Dropbox"}
    </button>
  );
};

export default BackupButton;

import React from 'react';
import useSiteStore from '@/store/useSiteStore';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { sendData } from './ApiCalls';


// Utility function to convert state to CSV
const convertStateToCSV = (plans: any[]) => {
  const headers = ['Plan ID', 'Point X', 'Point Y', 'Image Name', 'Comment'];

  const rows = plans.flatMap((plan) => {
    return plan.points
      // @ts-ignore
      .filter(point => !isNaN(point.x) && !isNaN(point.y)) // Filter out invalid points
      // @ts-ignore
      .map((point, index) => {
        const x = parseFloat(point.x.toFixed(5));
        const y = parseFloat(point.y.toFixed(5));
        if (isNaN(x) || isNaN(y)) return null; // Skip invalid points

        const imageName = plan.images[index]?.name || ''; // Read the image name from the state
        const comment = point.comment || ''; // Assuming each point has a comment field
        return `${plan.id},${x},${y},${imageName},${comment}`;
      })
      // @ts-ignore
      .filter(row => row !== null); // Filter out null rows
  });

  return `${headers.join(",")}\n${rows.join("\n")}`;
};

// // Function to download the CSV file
// const downloadCSV = (csv: string, filename: string) => {
//   const blob = new Blob([csv], { type: 'text/csv' });
//   const url = window.URL.createObjectURL(blob);

//   const a = document.createElement('a');
//   a.setAttribute('href', url);
//   a.setAttribute('download', filename);
//   document.body.appendChild(a);
//   a.click();
//   document.body.removeChild(a);

//   window.URL.revokeObjectURL(url); // Clean up after download
// };

// Updated function to handle CSV download/share
const downloadCSV = async (csv: string, filename: string) => {
  if (Capacitor.isNativePlatform()) {
    try {
      // Write the CSV to a file
      const result = await Filesystem.writeFile({
        path: filename,
        data: csv,
        directory: Directory.Cache,
        // @ts-ignore
        encoding: 'utf8',
      });

      // Share the file
      await Share.share({
        title: 'CSV Data',
        text: 'Here is the CSV data',
        url: result.uri,
        dialogTitle: 'Share CSV Data',
      });
    } catch (error) {
      console.error('Error sharing CSV:', error);
    }
  } else {
    // For web, use the existing download method
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
};

const DownloadStateButton = () => {
  const selectedProjectId = useSiteStore((state) => state.selectedProjectId);
  const selectedProject = useSiteStore((state) => 
    state.projects.find(p => p.id === state.selectedProjectId)
  );
  const plans = selectedProject?.plans || [];
  // sendData()

  const handleDownload = () => {
    console.log('Download button clicked');
    // const csv = convertStateToCSV(plans); // Convert the state to CSV
    // downloadCSV(csv, 'plans_data.csv'); // Trigger download
    // sendData()
  };

  return (
    <button 
      className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-0.1 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800" 
      type="button"
      onClick={handleDownload}
    >
      Save to Server
    </button>
  );
};

export default DownloadStateButton;

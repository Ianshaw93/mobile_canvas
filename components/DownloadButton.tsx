import React from 'react';
import useSiteStore from '@/store/useSiteStore';

// Utility function to convert state to CSV
const convertStateToCSV = (plans: any[]) => {
  const headers = ['Plan ID', 'Plan URL', 'Point X', 'Point Y', 'Image Name', 'Comment'];

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
        return `${plan.id},${plan.url},${x},${y},${imageName},${comment}`;
      })
      // @ts-ignore
      .filter(row => row !== null); // Filter out null rows
  });

  return `${headers.join(",")}\n${rows.join("\n")}`;
};

// Function to download the CSV file
const downloadCSV = (csv: string, filename: string) => {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  window.URL.revokeObjectURL(url); // Clean up after download
};

const DownloadStateButton = () => {
  const plans = useSiteStore((state) => state.plans);

  const handleDownload = () => {
    const csv = convertStateToCSV(plans); // Convert the state to CSV
    downloadCSV(csv, 'plans_data.csv'); // Trigger download
  };

  return (
    <button onClick={handleDownload}>
      Download State as CSV
    </button>
  );
};

export default DownloadStateButton;

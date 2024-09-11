import React from 'react';
import useSiteStore from '@/store/useSiteStore';

// Utility function to convert state to CSV
const convertStateToCSV = (plans: any[]) => {
  const headers = ['Plan ID', 'Plan URL', 'Point X', 'Point Y', 'Image Key'];

  const rows = plans.map((plan) => {
    // @ts-ignore
    return plan.points.map((point, index) => {
      const imageKey = plan.images[index]?.key || '';
      return `${plan.id},${plan.url},${point.x},${point.y},${imageKey}`;
    }).join("\n");
  }).join("\n");

  return `${headers.join(",")}\n${rows}`;
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
    console.log("plans: ", plans)
    // const 
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

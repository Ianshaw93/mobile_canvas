import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Browser } from '@capacitor/browser';
import useSiteStore from '@/store/useSiteStore';

const server_urls = {
    "localhost": 'http://192.168.0.14:8080',
    // "server": 'https://mobileappbackend-production-0b73.up.railway.app'
    "server": 'web-production-44b8.up.railway.app'
  }
  var subEndpoint = server_urls.localhost;

// get access token for dropbox
export const loginToDropbox = async () => {
  let endpoint = `${subEndpoint}/auth/dropbox`;
  const offlineQueue = useSiteStore.getState().offlineQueue;
  console.log("Files in Offline Queue:");
  offlineQueue.forEach(({file}, index) => {
    console.log(`file: ${index + 1}. ${file.name}`);
  });
  try {
    // Open the Dropbox OAuth flow in the system's browser
    await Browser.open({ url: endpoint });

    console.log("Dropbox OAuth flow opened in browser.");
  } catch (err) {
    console.log("Error opening Dropbox OAuth flow: ", err);
  }
}

// get access token for dropbox
export const getAccessToken = async () => {
  let endpoint = `${subEndpoint}/auth/token`;
  const response = await fetch(
    endpoint, 
    {
    method: 'GET',
    // body: formData, // needs to be what project to download from server
  });  
  try {

    console.log("Dropbox OAuth flow opened in browser.");
  } catch (err) {
    console.log("Error opening Dropbox OAuth flow: ", err);
  }
}



// @ts-ignore
const convertAndSaveFile = async (file) => {
  try {
      // Read the file as a Blob
      const fileBlob = new Blob([file], { type: file.type });

      // Use the helper function to convert Blob to Base64 and save
      const fileName = file.name; // Change the file extension as needed
      await saveBlobAsBase64(fileBlob, fileName);
      
      console.log("File converted and saved successfully!");
  } catch (error) {
      console.log("Error converting and saving file: ", error);
  }
};

// Helper function to convert Blob to Base64 and save using Capacitor Filesystem
const saveBlobAsBase64 = async (blob: Blob, fileName: string) => {
  return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);

          let binaryString = '';
          const chunkSize = 8192; // Adjust the chunk size if needed
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.slice(i, i + chunkSize);
              binaryString += String.fromCharCode.apply(null, Array.from(chunk));
          }
          const base64data = btoa(binaryString);

          try {
              // Save the file using Capacitor's Filesystem
              await Filesystem.writeFile({
                  path: fileName,
                  data: base64data,
                  directory: Directory.Documents,
              });

              console.log("File saved successfully!");
              resolve();
          } catch (error) {
              console.log("Error saving file: ", error);
              reject(error);
          }
      };

      reader.onerror = (error) => {
          console.log("Error reading blob: ", error);
          reject(error);
      };

      reader.readAsArrayBuffer(blob);
  });
};
  // @ts-ignore
  export const sendData = async (file: File, projectId: string, planId: string) => {
      const { accessToken } = useSiteStore.getState();
      console.log('Starting sendData with token:', !!accessToken);

      try {
        console.log('Attempting to write file:', JSON.stringify(file, null, 2));

        const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Dropbox-API-Arg': JSON.stringify({
              path: `/${projectId}/${planId}/${file.name}`,
              mode: 'add',
              autorename: true,
              mute: false,
            }),
            'Content-Type': 'application/octet-stream',
          },
          body: file,
        });

        console.log('Dropbox response:', JSON.stringify(response, null, 2));

        const data = await response.json();
        console.log('Dropbox data:', data);

        return response.ok;
      } catch (error) {
        console.error('Error in sendData:', {
          message: (error as Error).message,
          type: (error as Error).name,
          stack: (error as Error).stack
        });
        throw error;
      }
  };

    // Function to send JSON data as a file to Dropbox
export const sendJsonAsFileToDropbox = async (jsonData: object, fileName: string, projectId: string) => {
  const { accessToken } = useSiteStore.getState();

  if (!accessToken) {
    console.error('Access token not available. Please authenticate first.');
    return;
  }

  // Convert the JSON object to a string
  const jsonString = JSON.stringify(jsonData);

  // Create a Blob from the JSON string
  const jsonBlob = new Blob([jsonString], { type: 'application/json' });

  try {
    // Use the Dropbox API to upload the file
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: `/${projectId}/${fileName}`,
          mode: 'add',
          autorename: true,
          mute: false,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: jsonBlob,
    });

    const data = await response.json();
    if (response.ok) {
      console.log('JSON file uploaded successfully:', data);
    } else {
      console.error('Error uploading JSON file:', data.error_summary);
    }
  } catch (error) {
    console.error('Failed to upload JSON file to Dropbox:', error);
  }
};
   
    // @ts-ignore
    export const downloadProject = async () => {
      console.log("Downloading project")

      let endpoint = `${subEndpoint}/downloadProject`;
      let docName = "Oil Pan Fire Appendix - Template.docx"
      console.log(endpoint);
      const response = await fetch(
        endpoint, 
        {
        method: 'GET',
        // body: formData, // needs to be what project to download from server
      });  
      try{
    // Convert the response to a blob
    const blob = await response.blob();

    // Create a file reader to read the blob as an array buffer
    const reader = new FileReader();
    reader.onloadend = async () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const uint8Array = new Uint8Array(arrayBuffer);

      // Convert the array buffer to a base64 string in chunks
      let binaryString = '';
      const chunkSize = 8192; // Adjust the chunk size as necessary
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64data = btoa(binaryString);

      // Save the file using Capacitor's Filesystem to a public directory
      await Filesystem.writeFile({
        path: docName,
        data: base64data,
        directory: Directory.Documents, // Use a public directory like Documents or ExternalStorage
        // @ts-ignore
        // encoding: "base64", // Use base64 enco@ding
      });

      console.log("File downloaded and saved successfully!");
    };

    reader.readAsArrayBuffer(blob);
  } catch (err) {
    console.log("Error downloading project: ", err);
  }
};

/**
 * Sends the complete project data to the backend
 * @param projectData The project object containing all project information
 * @returns The response from the server
 */
export const sendProjectToBackend = async (projectData: any) => {
  try {
    // Check if we have a valid subEndpoint
    if (!subEndpoint) {
      console.error('No valid API endpoint configured');
      throw new Error('No valid API endpoint configured. Please check your API settings.');
    }
    
    // Fix the endpoint URL - add https:// prefix if using server URL
    let endpoint = `${subEndpoint}/api/projects`;
    console.log('Using endpoint:', endpoint);
    
    // Create a sanitized copy for logging (truncate large base64 strings)
    const sanitizedProject = JSON.parse(JSON.stringify(projectData));
    
    // Sanitize plan URLs (PDFs)
    if (sanitizedProject.plans) {
      sanitizedProject.plans = sanitizedProject.plans.map((plan: any) => {
        const sanitizedPlan = { ...plan };
        
        // Truncate PDF base64 data
        if (sanitizedPlan.url && sanitizedPlan.url.startsWith('data:')) {
          sanitizedPlan.url = `${sanitizedPlan.url.substring(0, 50)}... (truncated)`;
        }
        
        // Truncate image base64 data
        if (sanitizedPlan.images && sanitizedPlan.images.length > 0) {
          sanitizedPlan.images = sanitizedPlan.images.map((img: any) => ({
            ...img,
            url: img.url ? `${img.url.substring(0, 50)}... (truncated)` : img.url
          }));
        }
        
        // Also check for images in points
        if (sanitizedPlan.points && sanitizedPlan.points.length > 0) {
          sanitizedPlan.points = sanitizedPlan.points.map((point: any) => {
            const sanitizedPoint = { ...point };
            if (sanitizedPoint.images && sanitizedPoint.images.length > 0) {
              sanitizedPoint.images = sanitizedPoint.images.map((img: any) => ({
                ...img,
                url: img.url ? `${img.url.substring(0, 50)}... (truncated)` : img.url
              }));
            }
            return sanitizedPoint;
          });
        }
        
        return sanitizedPlan;
      });
    }
    
    console.log('Sending project data to backend:', JSON.stringify(sanitizedProject, null, 2));
    
    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Check if response is HTML instead of JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.error('Server returned HTML instead of JSON. Check if the endpoint exists.');
        throw new Error('Server returned HTML instead of JSON. Check if the endpoint exists.');
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Error sending project to backend:', errorData || response.statusText);
        throw new Error(`Failed to send project: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Project sent successfully:', data);
      return data;
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        console.error('Request timed out after 30 seconds');
        throw new Error('Request timed out. Please check your network connection and try again.');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error in sendProjectToBackend:', error);
    throw new Error(`Failed to send project: ${(error as Error).message}`);
  }
};

      
      

    
    





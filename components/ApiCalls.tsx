import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Browser } from '@capacitor/browser';
import useSiteStore from '@/store/useSiteStore';

const server_urls = {
    "localhost": 'http://192.168.0.14:8080',
    "server": 'https://mobileappbackend-production-0b73.up.railway.app'
  }
  var subEndpoint = server_urls.server;

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

  if (!accessToken) {
    console.error('Access token not available. Please authenticate first.');
    return;
  }
  console.log("Sending data for: ", file.name)

  // Prepare the file for upload
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          // folder should be project & then pdf plan
          path: `/${projectId}/${planId}/${file.name}`,
          mode: 'add',
          autorename: true,
          mute: false,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    });

    const data = await response.json();
    if (response.ok) {
      console.log('File uploaded successfully:', data);
    } else {
      console.error('Error uploading file:', data.error_summary);
    }
  } catch (error) {
    console.error('Failed to upload file to Dropbox:', error);
  }
      // TODO: change to send to dropbox -> in project folder

      // const formData = new FormData();

      // formData.append('file', file);
      // formData.append('description', 'This is a test PDF file');
      // console.log("File: ", file);

      // let endpoint = `${subEndpoint}/uploadFormData`;

      // console.log(endpoint);
      // console.log(formData);
      // const response = await fetch(
      //   endpoint, 
      //   {
      //   method: 'POST',
      //   body: formData,
      // });  
      // try{
      //   const data = await response.json();
      //   console.log("data received: ", data)

      //   return data;
    
      // } catch (err) { 
      //   console.log("Error: ",err)
      // }
    
    }

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

      
      

    
    





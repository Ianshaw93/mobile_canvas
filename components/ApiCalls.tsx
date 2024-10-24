import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Browser } from '@capacitor/browser';

const server_urls = {
    "localhost": 'http://192.168.0.14:8080',
    "server": 'https://mobileappbackend-production-0b73.up.railway.app'
  }
  var subEndpoint = server_urls.localhost;

// get access token for dropbox
export const getAccessToken = async () => {
  let endpoint = `${subEndpoint}/auth/dropbox`;
  try {
    // Open the Dropbox OAuth flow in the system's browser
    await Browser.open({ url: endpoint });

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
    export const sendData = async (file) => {
      // TODO: change to send to dropbox -> in project folder

      const formData = new FormData();

      formData.append('file', file);
      formData.append('description', 'This is a test PDF file');
      console.log("File: ", file);

      let endpoint = `${subEndpoint}/uploadFormData`;

      console.log(endpoint);
      console.log(formData);
      const response = await fetch(
        endpoint, 
        {
        method: 'POST',
        body: formData,
      });  
      try{
        const data = await response.json();
        console.log("data received: ", data)

        return data;
    
      } catch (err) { 
        console.log("Error: ",err)
      }
    
    }
   
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

      
      

    
    





import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const server_urls = {
    "localhost": 'http://192.168.0.14:8080',
    "server": 'https://mobileappbackend-production-0b73.up.railway.app'
  }
  var subEndpoint = server_urls.localhost;
    // @ts-ignore
    export const sendData = async (file) => {

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
        // encoding: "base64", // Use base64 encoding
      });

      console.log("File downloaded and saved successfully!");
    };

    reader.readAsArrayBuffer(blob);
  } catch (err) {
    console.log("Error downloading project: ", err);
  }
};

      
      

    
    





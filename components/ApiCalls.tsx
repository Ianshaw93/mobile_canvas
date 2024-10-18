const server_urls = {
    "localhost": 'http://192.168.0.14:8080',
    "server": 'https://mobileappbackend-production-0b73.up.railway.app'
  }
    // @ts-ignore
    export const sendData = async (file) => {

      const formData = new FormData();

      formData.append('file', file);
      formData.append('description', 'This is a test PDF file');
      console.log("File: ", file);

      let endpoint = `${server_urls.localhost}/uploadFormData`;

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
   


      
      

    
    





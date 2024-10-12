const server_urls = {
    "localhost": 'http://192.168.0.14:8000',
    "server": 'mobileappbackend-production-0b73.up.railway.app'
  }

   
    export const sendData = async (
    ) => {

        const bodyContent = JSON.stringify( {
          "image": `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4QIJBywfp3IOswAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAAFklEQVQ4y2P8z8AARMU0GTaMhjQDAEmqCfmceEibAAAAAElFTkSuQmCC`
        })
        const response = await fetch(`${server_urls.server}/uploadImage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: bodyContent,
        });  
        try{
          const data = await response.json();
          console.log("data received: ", data)
          // const blob = new Blob([data], { type: "text/plain;charset=utf-8" });
          // saveAs(blob, "test.fds");
          return data;
    
        } catch (err) { 
          console.log("Error: ",err)
        }
     
      }
    
    





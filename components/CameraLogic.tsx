import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera'
import React from 'react'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core';

const IMAGE_DIR = 'stored-images'; // is this an angular thing?

const CameraLogic= () => {
  // how to have Platform check?
  // Capacitor.getPlatform()
  const isAvailable = Capacitor.isPluginAvailable('Camera');
  const takePicture = async () => {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: true,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera
    });
    console.log("imaage: ", image)
    var imageUrl = image.webPath;
    if (image) {
      saveImage(image);
    }
    // Can be set to the src of an image now
    // imageElement.src = imageUrl;
  }

  const saveImage = async (photo: Photo) => {
      const base64Data = await readAsBase64(photo);
      console.log("base64Data: ", base64Data)

      const fileName = new Date().getTime() + '.jpeg';
      const savedFile = await Filesystem.writeFile({
        directory: Directory.Data,
        path: `${IMAGE_DIR}/${fileName}`,
        data: base64Data,
      })
      console.log("savedFile: ", savedFile)

      async function readAsBase64(photo: Photo) {
        if (Capacitor.isNativePlatform()) {
          // do something
          const file = await Filesystem.readFile({
            // @ts-ignore
            path: photo.path,
          })

          return file.data
        } else {
          // web app

          const response = await fetch(photo.webPath!)
          const blob = await response.blob()

          return await convertBlobToBase64(blob) as string
        }
      }
      
    }
    const convertBlobToBase64 = (blob: Blob) => new Promise((resolve, reject) => { 
      const reader = new FileReader
      reader.onerror = reject
      reader.onload = () => {
        resolve(reader.result)
      }
      reader.readAsDataURL(blob)
    })


  return (
    <>
      <div>Camera</div>
      <button onClick={takePicture}>Take Picture</button>
    </>
  )
}
 
export default CameraLogic

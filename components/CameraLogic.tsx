import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import React from 'react'

const CameraLogic
 = () => {

  const takePicture = async () => {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: true,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera
    });
    console.log("imaage: ", image)
    var imageUrl = image.webPath;

    // Can be set to the src of an image now
    // imageElement.src = imageUrl;
  }
  return (
    <>
      <div>Camera</div>
      <button onClick={takePicture}>Take Picture</button>
    </>
  )
}
 
export default CameraLogic

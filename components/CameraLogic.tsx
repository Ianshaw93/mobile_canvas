import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera'
import React, { useEffect, useState } from 'react'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core';
import useSiteStore from '@/store/useSiteStore';
import { sendData } from './ApiCalls';
import { send } from 'process';
import { getFirstPlanIdOrDatetime } from './ReturnProjectId';

const IMAGE_DIR = 'stored-images'; // is this an angular thing?
type Image = {
  key: string;
  pointId: string;
  url: string;
  pointIndex: number;
  projectId: string;
  planId: string;
};

type Point = {
  id: string;
  x: number;
  y: number;
  images: Image[];
};

const requestFilesystemPermission = async () => {
  if (Capacitor.getPlatform() === 'android') {
    const permission = await Filesystem.requestPermissions();
    console.log('Filesystem permission status:', permission);
  }
};
// send in images to be displayed
// @ts-ignore
const CameraLogic= ({selectedPoint, planId}) => {
  // how to have Platform check?
  // Capacitor.getPlatform()
  const addImageToPin = useSiteStore((state) => state.addImageToPin);
  const plan = useSiteStore((state) => state.plans.find(plan => plan.id === planId));
  const points = plan ? plan.points : [];
  const addCommentToPin = useSiteStore((state) => state.addCommentToPin);
  const addToOfflineQueue = useSiteStore((state) => state.addToOfflineQueue);
  const [comment, setComment] = useState<string>(''); // State variable for comment
  // const point = points.find((p) => p.id === selectedPoint);
  console.log("plan: ", plan)
  console.log("points: ", points)
  // console.log("selectedPoint: ", selectedPoint)
  // console.log("point: ", point)
  // @ts-ignore
  const [imageArray, setImageArray] = useState<string[]>(selectedPoint?.images.map(img => img.url) || []);
  console.log("imageArray@top: ", imageArray)


  const platform = Capacitor.getPlatform();
  console.log("Platform: ", platform);  // 'ios', 'android', or 'web'

    const saveImageToLocalStorage = async (photo: Photo, projectId: string, planId: string) => {
      const base64Data = await readAsBase64(photo);
      const fileName = new Date().getTime() + '.jpeg';

      // await uploadToDropbox(base64Data, fileName);
      console.log("fileName @ save function: ", fileName)
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Data
      });
        // Convert Base64 to Blob
    const byteCharacters = atob(base64Data.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    // Create a File object from the Blob
    // const fileName = new Date().getTime() + '.jpeg';
    // check if online -> likely need to do this logic in apiCall?S
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    addToOfflineQueue(file, projectId, planId);

      //   // Check platform and request permissions for Android
      // if (Capacitor.getPlatform() === 'android') {
      //   const permissionGranted = await requestFilesystemPermission();
      //   // @ts-ignore
      //   if (!permissionGranted) {
      //     console.error("Permission to write to external storage was denied");
      //     return fileName;
      //   }
      // }
      // await new Promise(resolve => setTimeout(resolve, 100)); // Small delay (e.g., 100ms)
      
      // await Filesystem.writeFile({
      //   path: fileName,
      //   data: base64Data,
      //   directory: Directory.ExternalStorage//Documents
      // });    
      // console.log("filepath: ",Capacitor.convertFileSrc(`Documents/${fileName}`))

      return fileName;
    };
  
    const readAsBase64 = async (photo: Photo) => {
      const response = await fetch(photo.webPath!);
      const blob = await response.blob();
      return await convertBlobToBase64(blob) as string;
    };
  
    const convertBlobToBase64 = (blob: Blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });
    const saveImageToFilesystem = async (base64Data: string, fileName: string) => {
      try {
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Data // Using app-specific storage instead of external
        });
      } catch (err) {
        console.error('Error saving file:', err);
      }
    };

    const convertPhotoToBase64 = async (photo: Photo) => {
      const response = await fetch(photo.webPath!);
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };
  
    const takePicture = async () => {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });
      console.log("image: ", image);
      const projectId = getFirstPlanIdOrDatetime();;
      if (image) {
        const base64Data = await convertPhotoToBase64(image);
        const fileName = `${new Date().getTime()}.jpeg`;
        // const fileName = await saveImageToLocalStorage(image, projectId, planId);
        const filePath = `${Directory.Data}/${fileName}`;
        console.log("fileName: ", fileName);
        // Find the index of the point
        const pointIndex = points.findIndex(p => p.id === selectedPoint.id);
        await saveImageToFilesystem(base64Data.split(',')[1], fileName);
  
        // Transform the Photo object into the Image type
        const transformedImage: Image = {
          key: fileName,
          pointId: selectedPoint.id,
          url: base64Data,
          pointIndex: pointIndex,
          projectId: projectId,
          planId: planId
        };
  
        // Save the image and update the state
        setImageArray((prevImages) => [...prevImages, base64Data]);
        await saveImageToLocalStorage(image, projectId, planId);
  
        // Add the image to the pin
        addImageToPin(planId, selectedPoint.id, transformedImage);
        // addCommentToPin(planId, selectedPoint.id, comment);
      }
    };
  
    const loadFileData = async (fileNames: Image[]) => {
      console.log("fileNames: ", fileNames);
      let temp = [];
      for (let f of fileNames) {
        const filePath = `${Directory.Data}/${f.key}`;
        const readFile = await Filesystem.readFile({
          directory: Directory.Data,
          path: f.key
        });
        console.log("readFile: ", readFile);
        temp.push({
          ...f,
          data: `data:image/jpeg;base64,${readFile.data}`,
        });
      }
      // @ts-ignore
      setImageArray(temp);
      console.log("temp: ", temp, "imageArray: ", imageArray);
      // Do something with temp, e.g., set state
    }
    const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newComment = e.target.value;
      setComment(newComment);
      addCommentToPin(planId, selectedPoint.id, newComment);
    };

    useEffect(() => {
      if (selectedPoint) {
        loadFileData(selectedPoint.images);
        setComment(selectedPoint.comment || ''); // Load the comment for the selected point
      }
    }, [selectedPoint]);  
    return (
      <div>
        <button onClick={takePicture}>Take Picture</button>
        <div>
        {imageArray.map((img, index) => {
          console.log(`Rendering image ${index}: `, img);
          // const src = img.data || `capacitor://localhost/_capacitor_file_/${Directory.Data}/${img.url}`;
          // @ts-ignore
          const src = img.data || img;
          console.log(`Image src for image ${index}: `, src);
          return (
            <img key={index} src={src} alt={`Image ${index}`} width={100}/>
          )
        })}

          
          {/* // {imageArray.map((img, index) => (
          //   <img key={index} src={`${Directory.Data}/${img.url || img}`} alt={`Image ${index}`} />
          // ))} */}
          <textarea
            placeholder="Write a comment..."
            value={comment}
            onChange={handleCommentChange}
          />
        </div>
      </div>
    );
  };
  
  export default CameraLogic;

  // useEffect(() => {
  //   if (selectedPoint) {
  //     loadFileData(selectedPoint.images);
  //   }
  // }, [selectedPoint]);

//   async function loadFiles() { // perhaps should get from state?
//     setImageArray([])
    

//     Filesystem.readdir({
//       directory: Directory.Data,
//       path: IMAGE_DIR
//     }).then(result => {
//       console.log("result: ", result)
//       // @ts-ignore
//       loadFileData(result.files)
//       // setImageArray(result.files)
//     }).catch(err => {
//       console.log("err: ", err)
//       Filesystem.mkdir({ // removed await
//         directory: Directory.Data,
//         path: IMAGE_DIR        
//       })
//     })
//   } 

//   async function loadFileData(fileNames: any[]) {
//     console.log("fileNames: ", fileNames)
//     let temp = []
//     for (let f of fileNames) {
//       const filePath = `${IMAGE_DIR}/${f.name}`
//       const readFile = await Filesystem.readFile({
//         directory: Directory.Data,
//         path: filePath
//       })
//       console.log("readFile: ", readFile)
//       temp.push({
//         name: f.name,
//         webPath: filePath,
//         data: `data:image/jpeg;base64,${readFile.data}`,
//       })
      
//     }
//     setImageArray(temp)
//   }

//   const takePicture = async () => {
//     const image = await Camera.getPhoto({
//       quality: 90,
//       allowEditing: true,
//       resultType: CameraResultType.Uri,
//       source: CameraSource.Camera
//     });
//     console.log("imaage: ", image)
//     var imageUrl = image.webPath;
//     if (image) {
//       // saveImage(image);
//       // @ts-ignore
//       // setImageArray((prevImages) => [...prevImages, image])
//       // saveImage(image);

//       // // @ts-ignore
//       // addImageToPin(planId, point.id, image );
 
//       const transformedImage: Image = {
//         key: image.path || '', // Assuming `path` is a unique identifier
//         // @ts-ignore
//         pointId: selectedPoint.id,
//         url: image.webPath || ''
//       };
  
//       // Save the image and update the state
//       setImageArray((prevImages) => [...prevImages, transformedImage]);
//       saveImage(transformedImage);
  
//       // Add the image to the pin
//       // @ts-ignore
//       addImageToPin(planId, selectedPoint.id, transformedImage);
//     }
//     // Can be set to the src of an image now
//     // imageElement.src = imageUrl;
//   }

//   const saveImage = async (photo: Photo) => {
//       const base64Data = await readAsBase64(photo);
//       console.log("base64Data: ", base64Data)

//       const fileName = new Date().getTime() + '.jpeg';
//       const savedFile = await Filesystem.writeFile({
//         directory: Directory.Data,
//         path: `${IMAGE_DIR}/${fileName}`,
//         data: base64Data,
//       })
//       console.log("savedFile: ", savedFile)
//       loadFiles();
//       async function readAsBase64(photo: Photo) {
//         if (Capacitor.isNativePlatform()) {
//           // do something
//           const file = await Filesystem.readFile({
//             // @ts-ignore
//             path: photo.path,
//           })

//           return file.data
//         } else {
//           // web app

//           const response = await fetch(photo.webPath!)
//           const blob = await response.blob()
          
//           return await convertBlobToBase64(blob) as string
//         }
//       }
      
//     }
//     const convertBlobToBase64 = (blob: Blob) => new Promise((resolve, reject) => { 
//       const reader = new FileReader
//       reader.onerror = reject
//       reader.onload = () => {
//         resolve(reader.result)
//       }
//       reader.readAsDataURL(blob)
//     })


//   return (
//     <>
//       <button onClick={takePicture}>Take Picture</button>
//       {imageArray.map((image, index) => {
//         console.log("image at popup: ", image, index)
//         return (
//           <div key={index} className='max-w-sm max-h-sm'>
//             {/* <img src={image.data} alt={image.name} /> */}
//             <img src={image.webPath} alt={image.name} />
//           </div>
//         )
//       })}
//     </>
//   )
// }
 
// export default CameraLogic

import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera'
import React, { useEffect, useState } from 'react'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
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
  const selectedProjectId = useSiteStore((state) => state.selectedProjectId);
  const selectedProject = useSiteStore((state) => 
    state.projects.find(p => p.id === state.selectedProjectId)
  );
  const plan = selectedProject?.plans.find(plan => plan.id === planId);
  const points = plan ? plan.points : [];
  const addCommentToPin = useSiteStore((state) => state.addCommentToPin);
  const deleteImageFromPin = useSiteStore((state) => state.deleteImageFromPin);
  const addToOfflineQueue = useSiteStore((state) => state.addToOfflineQueue);
  const updateProjectImages = useSiteStore((state) => state.updateProjectImages);
  const [imageComments, setImageComments] = useState<{ [key: string]: string }>({});
  const [comment, setComment] = useState<string>('');
  // Update the type to match the image data structure
  const [imageArray, setImageArray] = useState<Array<{ data: string; key: string; pointId: string; url: string; pointIndex: number; projectId: string; planId: string; }>>([]);
  console.log("imageArray@top: ", imageArray)

  const [refreshKey, setRefreshKey] = useState(0);

  const platform = Capacitor.getPlatform();
  console.log("Platform: ", platform);  // 'ios', 'android', or 'web'

    const saveImageToLocalStorage = async (photo: Photo, projectId: string, planId: string): Promise<string> => {
      const base64Data = await readAsBase64(photo);
      if (!base64Data) {
        throw new Error('Failed to read photo as base64');
      }
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
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    addToOfflineQueue(file, projectId, planId);

    return fileName;
    };
  
    const readAsBase64 = async (photo: Photo): Promise<string> => {
      if (!photo.webPath) {
        throw new Error('No webPath available for photo');
      }
      const response = await fetch(photo.webPath);
      if (!response.ok) {
        throw new Error('Failed to fetch photo');
      }
      const blob = await response.blob();
      const base64 = await convertBlobToBase64(blob);
      if (!base64 || typeof base64 !== 'string') {
        throw new Error('Failed to convert blob to base64');
      }
      return base64;
    };
  
    const convertBlobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to convert blob to base64 string'));
          return;
        }
        resolve(result);
      };
      reader.readAsDataURL(blob);
    });
    const saveImageToFilesystem = async (base64Data: string, fileName: string) => {
      try {
        // Save with maximum quality
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Data,
          encoding: Encoding.UTF8 // Using UTF8 for base64 data
        });
      } catch (err) {
        console.error('Error saving file:', err);
      }
    };

    const convertPhotoToBase64 = async (photo: Photo): Promise<string> => {
      if (!photo.webPath) {
        throw new Error('No webPath available for photo');
      }

      try {
        const response = await fetch(photo.webPath);
        if (!response.ok) {
          throw new Error('Failed to fetch photo');
        }
        const blob = await response.blob();
        
        // Create a canvas to handle the image
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        return new Promise<string>((resolve, reject) => {
          img.onload = () => {
            try {
              // Set canvas size to match image
              canvas.width = img.width;
              canvas.height = img.height;
              
              // Draw image with best quality
              ctx.drawImage(img, 0, 0);
              
              // Get as high quality JPEG
              const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
              if (!dataUrl) {
                reject(new Error('Failed to convert image to data URL'));
                return;
              }
              resolve(dataUrl);
            } catch (error) {
              reject(error);
            }
          };
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = URL.createObjectURL(blob);
        });
      } catch (error) {
        console.error('Error converting photo:', error);
        throw error;
      }
    };
  
    const takePicture = async () => {
      const image = await Camera.getPhoto({
        quality: 100,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        correctOrientation: true,
        width: 4096, // Set a high max width
        height: 4096 // Set a high max height
      });
      console.log("image: ", image);
      const projectId = getFirstPlanIdOrDatetime();
      if (!projectId) {
        console.error('No project ID available');
        return;
      }
      if (image) {
        const base64Data = await convertPhotoToBase64(image);
        if (!base64Data) {
          console.error('Failed to convert photo to base64');
          return;
        }
        const fileName = `${new Date().getTime()}.jpeg`;
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
        setImageArray((prevImages) => [...prevImages, { data: base64Data, key: fileName, pointId: selectedPoint.id, url: base64Data, pointIndex: pointIndex, projectId: projectId, planId: planId }]);
        await saveImageToLocalStorage(image, projectId, planId);
  
        // Add the image to the pin
        addImageToPin(planId, selectedPoint.id, transformedImage);

        // Update project images
        updateProjectImages(projectId, transformedImage);

        // Initialize empty comment for the new image
        setImageComments(prev => ({
          ...prev,
          [fileName]: ''
        }));
      }
    };
  
    const loadFileData = async (fileNames: Image[]) => {
      console.log("fileNames: ", fileNames);
      let temp: Array<{ data: string; key: string; pointId: string; url: string; pointIndex: number; projectId: string; planId: string; }> = [];
      for (let f of fileNames) {
        try {
          // If the image already has a data URL, use it directly
          if (f.url.startsWith('data:')) {
            temp.push({
              ...f,
              data: f.url
            });
          } else {
            // Otherwise, try to read from filesystem
            const readFile = await Filesystem.readFile({
              directory: Directory.Data,
              path: f.key
            });
            temp.push({
              ...f,
              data: `data:image/jpeg;base64,${readFile.data}`
            });
          }
        } catch (error) {
          console.error('Error loading image:', error);
          // If there's an error, try to use the URL directly
          temp.push({
            ...f,
            data: f.url
          });
        }
      }
      setImageArray(temp);
      console.log("temp: ", temp, "imageArray: ", imageArray);
    }
    const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newComment = e.target.value;
      setComment(newComment);

    };

    const handleCommentBlur = () => {
      if (comment && comment !== selectedPoint.comment) {
      // only update when focus is lost
      addCommentToPin(planId, selectedPoint.id, comment);
      }
    };

    const addCommentToImage = useSiteStore((state) => state.addCommentToImage);

    // Add this function to handle image comment changes
    const handleImageCommentChange = (imageKey: string, newComment: string) => {
      setImageComments(prev => ({ ...prev, [imageKey]: newComment }));
    };

    // Add this function to handle image comment blur
    const handleImageCommentBlur = (imageKey: string) => {
      const comment = imageComments[imageKey];
      if (comment !== undefined) {
        addCommentToImage(planId, selectedPoint.id, imageKey, comment);
      }
    };

    // Add delete handler
    const handleDeleteImage = async (imageKey: string, index: number) => {
      if (window.confirm('Are you sure you want to delete this image?')){

        try {
          // Remove from local UI state
          const newImageArray = imageArray.filter((_, i) => i !== index);
          setImageArray(newImageArray);

          // Let the store handle file deletion and state updates
          await deleteImageFromPin(planId, selectedPoint.id, imageKey);

        } catch (error) {
          console.error('Error deleting image:', error);
        }
      }
    };

    useEffect(() => {
      if (selectedPoint) {
        loadFileData(selectedPoint.images);
        setComment(selectedPoint.comment || '');
        // Load image comments
        const comments: { [key: string]: string } = {};
        // @ts-ignore
        selectedPoint.images.forEach(img => {
          if (img.comment) {
            comments[img.key] = img.comment;
          }
        });
        setImageComments(comments);
      }
    }, [selectedPoint]);  

    const handlePhotoTaken = async (photo: Photo) => {
      try {
        const base64Data = await convertPhotoToBase64(photo);
        if (!base64Data) {
          throw new Error('Failed to convert photo to base64');
        }
        const fileName = await saveImageToLocalStorage(photo, selectedProjectId, planId);
        
        // Create a copy of the current imageArray
        const updatedImageArray = [...imageArray];
        
        // Add the new image
        updatedImageArray.push({ 
          data: base64Data, 
          key: fileName, 
          pointId: selectedPoint.id, 
          url: base64Data, 
          pointIndex: 0, 
          projectId: selectedProjectId, 
          planId: planId 
        });
        
        // Update state with the new array
        setImageArray(updatedImageArray);
        
        // Save to filesystem
        await saveImageToFilesystem(base64Data.split(',')[1], fileName);
        
        // Update state via Zustand
        const transformedImage: Image = {
          key: fileName,
          pointId: selectedPoint.id,
          url: base64Data,
          pointIndex: 0,
          projectId: selectedProjectId,
          planId: planId
        };
        
        // Add the image to the pin
        addImageToPin(planId, selectedPoint.id, transformedImage);
        
        // Update project images
        updateProjectImages(selectedProjectId, transformedImage);
        
        // Initialize empty comment for the new image
        setImageComments(prev => ({
          ...prev,
          [fileName]: ''
        }));
      } catch (error) {
        console.error('Error handling photo:', error);
      }
    };

    

    return (
      <div>
        <button onClick={takePicture} className="mb-4 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2">
          Take Picture
        </button>
        <div>
          {imageArray.map((img, index) => {
            const imageKey = img.key || `image-${index}`;
            return (
              <div key={imageKey} className="mb-6 p-4 border rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-medium">Image {index + 1}</h3>
                  <button
                    onClick={() => handleDeleteImage(imageKey, index)}
                    className="text-white bg-red-600 hover:bg-red-700 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-3 py-1"
                  >
                    Delete Image
                  </button>
                </div>
                <img src={img.data} alt={`Image ${index + 1}`} className="max-w-[90%] max-h-sm mb-2" />
                <textarea
                  placeholder={`Comment for image ${index + 1}...`}
                  value={imageComments[imageKey] || ''}
                  onChange={(e) => handleImageCommentChange(imageKey, e.target.value)}
                  onBlur={() => handleImageCommentBlur(imageKey)}
                  className="mt-2 w-full p-2 border rounded"
                />
              </div>
            );
          })}
          
          {/* Pin comment */}
          <textarea
            placeholder="Write a comment..."
            value={comment}
            onChange={handleCommentChange}
            onBlur={handleCommentBlur}
            className="mt-4 w-full p-2 border rounded"
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

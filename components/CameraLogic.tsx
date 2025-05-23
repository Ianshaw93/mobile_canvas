import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera'
import React, { useEffect, useState } from 'react'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core';
import useSiteStore from '@/store/useSiteStore';
import { getFirstPlanIdOrDatetime } from './ReturnProjectId';
import { requestFileSystemPermissions } from '@/components/requestiPermission';

const IMAGE_DIR = 'stored-images'; // is this an angular thing?
type ImageData = {
  data: string;
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
  images: ImageData[];
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
  // @ts-ignore
  const [imageArray, setImageArray] = useState<ImageData[]>([]);
  console.log("imageArray@top: ", imageArray)

  const [refreshKey, setRefreshKey] = useState(0);

  const platform = Capacitor.getPlatform();
  console.log("Platform: ", platform);  // 'ios', 'android', or 'web'

    const saveImageToLocalStorage = async (photo: Photo, projectId: string, planId: string) => {
      try {
        // Check permissions first
        const permissionStatus = await requestFileSystemPermissions();
        if (!permissionStatus) {
          throw new Error('Storage permission not granted');
        }

        const base64Data = await readAsBase64(photo);
        const fileName = new Date().getTime() + '.jpeg';

        // Optimize image size before saving
        const optimizedBase64 = await optimizeImage(base64Data, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 0.8
        });

        // Save the optimized image
        await Filesystem.writeFile({
          path: fileName,
          data: optimizedBase64,
          directory: Directory.Data
        });

        // Create a File object for offline queue
        const byteCharacters = atob(optimizedBase64.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        
        // Add to offline queue
        // addToOfflineQueue(file, projectId, planId);

        return fileName;
      } catch (error) {
        console.error('Error saving image:', error);
        throw error;
      }
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

    const convertPhotoToBase64 = async (photo: Photo) => {
      try {
        const response = await fetch(photo.webPath!);
        const blob = await response.blob();
        
        // Create a canvas to handle the image
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        return new Promise<string>((resolve, reject) => {
          img.onload = () => {
            // Set canvas size to match image
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw image with best quality
            ctx?.drawImage(img, 0, 0);
            
            // Get as high quality JPEG
            const quality = 1.0; // Maximum quality
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(blob);
        });
      } catch (error) {
        console.error('Error converting photo:', error);
        throw error;
      }
    };
  
    const takePicture = async () => {
      try {
        const image = await Camera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          correctOrientation: true,
          width: 2048,
          height: 2048
        });

        if (!image) return;

        const projectId = getFirstPlanIdOrDatetime();
        const base64Data = await convertPhotoToBase64(image);
        const fileName = `${new Date().getTime()}.jpeg`;
        const pointIndex = points.findIndex(p => p.id === selectedPoint.id);

        // Optimize image before saving
        const optimizedBase64 = await optimizeImage(base64Data, {
          maxWidth: 1024,
          maxHeight: 1024,
          quality: 0.7
        });

        // Save optimized image
        await saveImageToFilesystem(optimizedBase64.split(',')[1], fileName);

        // Transform the Photo object into the Image type
        const transformedImage: ImageData = {
          key: fileName,
          pointId: selectedPoint.id,
          url: optimizedBase64,
          pointIndex: pointIndex,
          projectId: projectId,
          planId: planId,
          data: optimizedBase64 // Add the data field
        };

        // Update state with optimized image
        setImageArray((prevImages) => [...prevImages, transformedImage]);
        await saveImageToLocalStorage(image, projectId, planId);

        // Add the image to the pin
        // @ts-ignore
        addImageToPin(planId, selectedPoint.id, transformedImage);

        // Initialize empty comment
        setImageComments(prev => ({
          ...prev,
          [fileName]: ''
        }));
      } catch (error) {
        console.error('Error taking picture:', error);
        alert('Failed to take picture. Please try again.');
      }
    };
  
    const loadFileData = async (fileNames: ImageData[]) => {
      try {
        const temp: ImageData[] = [];
        for (const f of fileNames) {
          try {
            const readFile = await Filesystem.readFile({
              directory: Directory.Data,
              path: f.key
            });

            // Create optimized image object
            temp.push({
              ...f,
              data: `data:image/jpeg;base64,${readFile.data}`,
            });

            // Add small delay between reads to prevent memory issues
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error) {
            console.error(`Error loading file ${f.key}:`, error);
          }
        }
        setImageArray(temp);
      } catch (error) {
        console.error('Error loading files:', error);
      }
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
      const base64Data = await convertPhotoToBase64(photo);
      // @ts-ignore
      const fileName = await saveImageToLocalStorage(photo, selectedProjectId, planId);
      
      // Create a copy of the current imageArray
      const updatedImageArray = [...imageArray];
      
      // Add the new image
      updatedImageArray.push({
        key: fileName,
        pointId: selectedPoint.id,
        url: base64Data,
        pointIndex: 0,
        // @ts-ignore
        projectId: selectedProjectId,
        planId: planId,
        data: base64Data
      });
      
      // Update state with the new array
      setImageArray(updatedImageArray);
      
      // Save to filesystem
      await saveImageToFilesystem(base64Data.split(',')[1], fileName);
      
      // Update state via Zustand
      // @ts-ignore
      updateProjectImages(selectedProjectId, base64Data);
      
      // Force a re-render
      setRefreshKey(prev => prev + 1);
    };

    // Optimize image function with better memory management
    const optimizeImage = async (base64: string, options: { maxWidth: number; maxHeight: number; quality: number }) => {
      return new Promise<string>((resolve) => {
        const img = new Image();
        
        // Add error handling
        img.onerror = () => {
          console.error('Error loading image for optimization');
          resolve(base64); // Return original if optimization fails
        };

        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions while maintaining aspect ratio
            if (width > options.maxWidth) {
              height = Math.round((options.maxWidth * height) / width);
              width = options.maxWidth;
            }
            if (height > options.maxHeight) {
              width = Math.round((options.maxHeight * width) / height);
              height = options.maxHeight;
            }

            // Set canvas size
            canvas.width = width;
            canvas.height = height;

            // Draw image with better quality settings
            const ctx = canvas.getContext('2d', { alpha: false });
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, width, height);
              
              // Get optimized image
              const optimizedDataUrl = canvas.toDataURL('image/jpeg', options.quality);
              
              // Clean up
              canvas.width = 1;
              canvas.height = 1;
              img.src = '';
              
              resolve(optimizedDataUrl);
            } else {
              resolve(base64);
            }
          } catch (error) {
            console.error('Error optimizing image:', error);
            resolve(base64);
          }
        };

        // Set source after setting up handlers
        img.src = base64;
      });
    };

    return (
      <div>
        <button onClick={takePicture} className="mb-4 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2">
          Take Picture
        </button>
        <div>
          {imageArray.map((img, index) => {
            const imageKey = selectedPoint?.images?.[index]?.key || `image-${index}`;
            const src = img.data || img.url || ''; // Provide empty string as fallback
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
                <img src={src} alt={`Image ${index + 1}`} className="max-w-[90%] max-h-sm mb-2" />
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

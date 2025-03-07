import { ReportTemplateData } from '@/utils/reportGenerator/types';
import dynamic from 'next/dynamic';
import { renderToStaticMarkup } from 'react-dom/server';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

// Simplified pdfMake initialization without custom fonts
// @ts-ignore
let pdfMake;
if (typeof window !== 'undefined') {
  try {
    pdfMake = require('pdfmake/build/pdfmake');
    const pdfFonts = require('pdfmake/build/vfs_fonts');
    
    // Check the structure - some versions have different exports
    if (pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) {
      pdfMake.vfs = pdfFonts.pdfMake.vfs;
    } else if (pdfFonts.vfs) {
      pdfMake.vfs = pdfFonts.vfs;
    } else {
      console.error('Could not find virtual file system in pdfFonts');
    }
    
    console.log('pdfMake initialized with default fonts');
  } catch (error) {
    console.error('Error initializing pdfMake:', error);
  }
}

const imageToDataURL = async (base64Image: string): Promise<string> => {
  try {
    // If the image is already a data URL, return it
    if (base64Image.startsWith('data:image')) {
      return base64Image;
    }
    
    // Otherwise, assume it's base64 and convert it to a data URL
    return `data:image/jpeg;base64,${base64Image}`;
  } catch (error) {
    console.error('Error converting image:', error);
    return '';
  }
};

export const generatePdfReport = async (data: ReportTemplateData): Promise<Buffer> => {
  console.log('Starting PDF report generation with:', {
    planCount: data.plans?.length,
    plans: data.plans.map(p => ({
      name: p.name,
      pointCount: p.points?.length
    }))
  });

  const docDefinition = {
    content: [
      { text: `Project Report: ${data.projectName}`, style: 'header' },
      { text: `Generated: ${data.generatedDate}`, style: 'subheader' },
      
      // Generate content for each plan
      ...await Promise.all(data.plans.map(async (plan) => {
        return [
          { text: `Plan: ${plan.name}`, style: 'planTitle', margin: [0, 20, 0, 10] },
          {
            table: {
              headerRows: 1,
              widths: ['auto', 'auto', '*', 'auto'],
              body: [
                // Header row
                ['Point ID', 'Location', 'Comment', 'Images'],
                
                // Data rows for each point
                ...await Promise.all(plan.points.map(async (point) => {
                  const images = await Promise.all(
                    point.images.map(async (img) => {
                      return {
                        image: await imageToDataURL(img),
                        width: 150,
                        height: 100
                      };
                    })
                  );
                  
                  return [
                    point.id,
                    `X: ${point.x.toFixed(2)}, Y: ${point.y.toFixed(2)}`,
                    point.comment || '',
                    {
                      stack: images.length ? images : [{ text: 'No images' }]
                    }
                  ];
                }))
              ]
            }
          }
        ];
      }))
    ],
    styles: {
      header: {
        fontSize: 18,
        bold: true,
        margin: [0, 0, 0, 10]
      },
      subheader: {
        fontSize: 14,
        margin: [0, 10, 0, 5]
      },
      planTitle: {
        fontSize: 16,
        bold: true
      },
      pointHeader: {
        fontSize: 12,
        bold: true
      },
      italic: {
        italics: true
      }
    },
    defaultStyle: {
      fontSize: 12
    }
  };

  return new Promise((resolve, reject) => {
    try {
      // @ts-ignore
      const pdfDocGenerator = pdfMake.createPdf(docDefinition);
      // @ts-ignore
      pdfDocGenerator.getBuffer((buffer) => {
        console.log('Project PDF generated, buffer size:', buffer.length);
        resolve(buffer);
      });
    } catch (error) {
      console.error('Error creating PDF:', error);
      reject(error);
    }
  });
};

export const generateTestPdf = async (testData: ReportTemplateData): Promise<Buffer> => {
  try {
    console.log('Starting test PDF generation...');

    // If we have image data, create document with image
    if (testData.plans?.[0]?.points?.[0]?.images?.[0]) {
      console.log('Creating PDF with image...');
      const imageData = testData.plans[0].points[0].images[0];
      
      // Create document definition for pdfmake
      const docDefinition = {
        content: [
          { text: 'Test PDF with Image', style: 'header' },
          { text: `Generated: ${testData.generatedDate}`, margin: [0, 0, 0, 20] },
          {
            image: imageData,
            width: 300,
            height: 200
          },
          { text: 'Test point comment: ' + testData.plans[0].points[0].comment, margin: [0, 10, 0, 0] }
        ],
        styles: {
          header: {
            fontSize: 18,
            bold: true,
            margin: [0, 0, 0, 10]
          }
        },
        defaultStyle: {
          fontSize: 12,
          font: 'Helvetica'
        }
      };

      return new Promise((resolve, reject) => {
        try {
          console.log('Generating PDF...');
          // @ts-ignore
          const pdfDocGenerator = pdfMake.createPdf(docDefinition);
          // @ts-ignore
          pdfDocGenerator.getBuffer((buffer) => {
            console.log('PDF generated, buffer size:', buffer.length);
            resolve(buffer);
          });
        } catch (error) {
          reject(error);
        }
      });
    }

    // Fallback to basic document if no image
    console.log('No image data found, creating basic PDF');
    const docDefinition = {
      content: [
        { text: 'Test PDF Document', style: 'header' },
        { text: `Generated: ${testData.generatedDate}`, margin: [0, 0, 0, 10] }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10]
        }
      },
      defaultStyle: {
        fontSize: 12,
        font: 'Helvetica'
      }
    };

    return new Promise((resolve, reject) => {
      try {
        // @ts-ignore
        const pdfDocGenerator = pdfMake.createPdf(docDefinition);
        // @ts-ignore
        pdfDocGenerator.getBuffer((buffer) => {
          console.log('Basic PDF created, buffer size:', buffer.length);
          resolve(buffer);
        });
      } catch (error) {
        reject(error);
      }
    });

  } catch (error) {
    console.error('Error generating test PDF:', {
      // @ts-ignore
      error: error.message,
      // @ts-ignore
      stack: error.stack
    });
    throw error;
  }
};

// Add this helper function for image conversion
const convertImageForPdf = async (imageData: string): Promise<string> => {
  // If image is already a data URL, return it
  if (imageData.startsWith('data:image')) {
    return imageData;
  }
  
  // If it's a filesystem path, try to load it
  try {
    if (typeof window !== 'undefined') {
      // Create a canvas to convert the image
      const img = new Image();
      const loadPromise = new Promise<string>((resolve, reject) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg'));
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${imageData}`));
      });
      
      // Set source and wait for load
      img.src = imageData;
      return await loadPromise;
    }
    return ''; // Return empty string if not in browser
  } catch (error) {
    console.error('Error converting image:', error);
    return ''; // Return empty on error
  }
};

// Use dynamic import to handle client-side rendering
const PinPreviewComponent = dynamic(
  () => import('@/components/PinPreview'),
  { ssr: false }
);

// Updated pin preview generation function without JSX
const generatePinPreviewImage = async (pdfId: string, point: any): Promise<string> => {
  if (typeof window === 'undefined') {
    console.log('Cannot generate pin preview on server');
    return '';
  }
  
  try {
    console.log(`Generating preview for point ${point.id} on plan ${pdfId}`);
    
    // Create a wrapper component to properly handle React lifecycle
    // @ts-ignore
    function PinPreviewWrapper(props) {
      const [rendered, setRendered] = useState(false);
      const { onRender } = props; // Destructure onRender from props
      
      useEffect(() => {
        // Give time for the component to fully render
        const timer = setTimeout(() => {
          if (!rendered) {
            setRendered(true);
            onRender();
          }
        }, 1500);
        
        return () => clearTimeout(timer);
      }, [rendered, onRender]); // Use destructured value in dependency array
      
      // Use React.createElement instead of JSX
      return React.createElement(
        'div', 
        { style: { width: 300, height: 300 } },
        React.createElement(PinPreviewComponent, {
          pdfId: pdfId,
          point: point,
          size: 300,
          zoomLevel: 5,
          lowQuality: false
        })
      );
    }
    
    // Mount in the DOM where it's visible during rendering
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.zIndex = '-1000';
    container.style.opacity = '0.01';
    container.style.width = '300px';
    container.style.height = '300px';
    document.body.appendChild(container);
    
    return new Promise((resolve) => {
      const captureCanvas = () => {
        try {
          console.log('Attempting to capture canvas...');
          const canvases = container.querySelectorAll('canvas');
          console.log(`Found ${canvases.length} canvas elements`);
          
          if (canvases.length > 0) {
            const canvas = canvases[0];
            try {
              console.log(`Canvas dimensions: ${canvas.width}x${canvas.height}`);
              const dataUrl = canvas.toDataURL('image/png');
              console.log(`Canvas data URL length: ${dataUrl.length}`);
              
              // Test the image data
              const testImg = new Image();
              testImg.onload = () => console.log('Canvas data is valid');
              testImg.onerror = () => console.error('Canvas data is invalid');
              testImg.src = dataUrl;
              
              resolve(dataUrl);
            } catch (err) {
              console.error('Error converting canvas to data URL:', err);
              resolve('');
            }
          } else {
            console.error('No canvas found in the container');
            resolve('');
          }
          
          // Clean up
          setTimeout(() => {
            // @ts-ignore
            ReactDOM.unmountComponentAtNode(container);
            document.body.removeChild(container);
          }, 100);
        } catch (err) {
          console.error('Error during canvas capture:', err);
          resolve('');
        }
      };
      
      // Render with the wrapper using React.createElement instead of JSX
      ReactDOM.render(
        React.createElement(PinPreviewWrapper, { onRender: captureCanvas }),
        container
      );
    });
  } catch (error) {
    console.error('Error in generatePinPreviewImage:', error);
    return '';
  }
};
// @ts-ignore
export const generateProjectPdfReport = async (project, plans): Promise<Buffer> => {
  console.log('Generating full project PDF report');
  console.log('Project:', project.name, 'Plans count:', plans.length);
  
  try {
    // Log image information for debugging
    plans.forEach(plan => {
      console.log(`Plan ${plan.name} has ${plan.points.length} points`);
      plan.points.forEach(point => {
        console.log(`Point ${point.id} has ${point.images?.length || 0} images and comment: "${point.comment || 'none'}"`);
        if (point.images && point.images.length > 0) {
          point.images.forEach((img, idx) => {
            console.log(`  Image ${idx}: comment="${img.comment || 'none'}" url=${img.url ? 'exists' : 'missing'}`);
          });
        }
      });
    });
    
    const reportData: ReportTemplateData = {
      projectName: project.name,
      generatedDate: new Date().toLocaleDateString(),
      plans: plans.map(plan => ({
        id: plan.id,
        name: plan.name || 'Unnamed Plan',
        points: plan.points.map(point => ({
          id: point.id,
          x: point.x,
          y: point.y,
          comment: point.comment || '',
          images: point.images ? point.images.map(img => img.url) : [],
          locationPreview: null // Will be populated with the pin preview image
        }))
      }))
    };
    
    // Process and convert all images in advance
    for (const plan of reportData.plans) {
      for (const point of plan.points) {
        // Generate pin preview using the PinPreview component
        try {
          const previewImage = await generatePinPreviewImage(plan.id, point);
          point.locationPreview = previewImage;
        } catch (err) {
          console.error(`Failed to generate pin preview: ${err}`);
        }
        
        // Convert images to data URLs (existing code)
        if (point.images && point.images.length) {
          const processedImages = [];
          for (const imgUrl of point.images) {
            if (imgUrl) {
              try {
                const dataUrl = await convertImageForPdf(imgUrl);
                if (dataUrl) processedImages.push(dataUrl);
              } catch (err) {
                console.error(`Failed to process image: ${err}`);
              }
            }
          }
          point.images = processedImages;
        }

        // If pin preview generation fails, use a fallback
        if (!point.locationPreview || point.locationPreview.length <= 100) {
          // Create a simple canvas with a marker (fallback)
          const canvas = document.createElement('canvas');
          canvas.width = 300;
          canvas.height = 200;
          const ctx = canvas.getContext('2d');
          
          // Draw fallback image
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, 300, 200);
          ctx.fillStyle = '#3b82f6'; // Blue color like your app's pins
          ctx.beginPath();
          ctx.arc(150, 100, 10, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Add text
          ctx.fillStyle = 'black';
          ctx.font = '14px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`Point ID: ${point.id}`, 150, 130);
          ctx.fillText(`X: ${point.x.toFixed(2)}, Y: ${point.y.toFixed(2)}`, 150, 150);
          
          point.locationPreview = canvas.toDataURL('image/png');
          console.log('Using fallback image for pin preview');
        }
      }
    }
    
    // Build the PDF content
    const docDefinition = {
      content: [
        { text: `Project Report: ${reportData.projectName}`, style: 'header' },
        { text: `Generated: ${reportData.generatedDate}`, style: 'subheader' },
        
        ...reportData.plans.map(plan => [
          { text: `Plan: ${plan.name}`, style: 'planTitle', margin: [0, 20, 0, 10] },
          ...plan.points.map(point => [
            { 
              text: `Point ID: ${point.id}`, 
              style: 'pointHeader',
              margin: [0, 15, 0, 5]
            },
            { 
              text: `Location: X: ${point.x.toFixed(2)}, Y: ${point.y.toFixed(2)}`,
              margin: [0, 0, 0, 5]
            },
            // Add the pin preview image
            { text: 'Pin Location:', margin: [0, 5, 0, 5] },
            point.locationPreview ? {
              image: point.locationPreview,
              width: 300,
              height: 200, // Add explicit height to maintain aspect ratio
              alignment: 'center',
              margin: [0, 0, 0, 10]
            } : { text: 'No location preview available', style: 'italic', margin: [0, 0, 0, 10] },
            {
              text: `Comment: ${point.comment || 'No comment'}`,
              margin: [0, 0, 0, 10],
              style: point.comment ? 'normal' : 'italic'
            },
            { text: 'Images:', margin: [0, 5, 0, 5] },
            point.images.length > 0 ? {
              table: {
                widths: ['*'],
                body: point.images.map(img => [{
                  stack: [
                    {
                      image: img,
                      width: 300,
                      alignment: 'center'
                    }
                  ]
                }])
              },
              layout: 'noBorders'
            } : { text: 'No images', style: 'italic', margin: [0, 0, 0, 10] }
          ])
        ])
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10]
        },
        subheader: {
          fontSize: 14,
          margin: [0, 10, 0, 5]
        },
        planTitle: {
          fontSize: 16,
          bold: true
        },
        pointHeader: {
          fontSize: 12,
          bold: true
        },
        italic: {
          italics: true
        }
      },
      defaultStyle: {
        fontSize: 12
      }
    };

    return new Promise((resolve, reject) => {
      try {
        const pdfDocGenerator = pdfMake.createPdf(docDefinition);
        pdfDocGenerator.getBuffer((buffer) => {
          console.log('Project PDF generated, buffer size:', buffer.length);
          resolve(buffer);
        });
      } catch (error) {
        console.error('Error creating PDF:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error('Error preparing project data for PDF:', error);
    throw error;
  }
}; 
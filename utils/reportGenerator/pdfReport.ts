import { ReportTemplateData } from '@/utils/reportGenerator/types';

// Initialize pdfMake with fonts - needs to be handled differently in Next.js
let pdfMake;
if (typeof window !== 'undefined') {
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
  
  // Define fonts - using standard PDF fonts that don't need to be loaded
  pdfMake.fonts = {
    // Default fonts that come with pdfmake
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf'
    },
    // Built-in PDF fonts that don't require loading
    Courier: {
      normal: 'Courier',
      bold: 'Courier-Bold',
      italics: 'Courier-Oblique',
      bolditalics: 'Courier-BoldOblique'
    },
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique'
    },
    Times: {
      normal: 'Times-Roman',
      bold: 'Times-Bold',
      italics: 'Times-Italic',
      bolditalics: 'Times-BoldItalic'
    }
  };
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
      }
    },
    defaultStyle: {
      fontSize: 12,
      font: 'Helvetica'
    }
  };

  return new Promise((resolve, reject) => {
    try {
      const pdfDocGenerator = pdfMake.createPdf(docDefinition);
      pdfDocGenerator.getBuffer((buffer) => {
        resolve(buffer);
      });
    } catch (error) {
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
          const pdfDocGenerator = pdfMake.createPdf(docDefinition);
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
        const pdfDocGenerator = pdfMake.createPdf(docDefinition);
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
      error: error.message,
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
        name: plan.name || 'Unnamed Plan',
        points: plan.points.map(point => ({
          id: point.id,
          x: point.x,
          y: point.y,
          comment: point.comment || '',
          images: point.images ? point.images.map(img => img.url) : []
        }))
      }))
    };
    
    // Process and convert all images in advance
    for (const plan of reportData.plans) {
      for (const point of plan.points) {
        // Convert images to data URLs
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
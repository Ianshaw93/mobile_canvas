import { Document, Packer, Paragraph, Table, TableCell, TableRow, ImageRun, TextRun, Media, AlignmentType, VerticalAlign, WidthType } from 'docx';
import { ReportTemplateData } from '@/utils/reportGenerator/types';
import * as fs from 'fs';

const createImageRun = async (imageData: string): Promise<ImageRun | null> => {
  try {
    if (!imageData || !imageData.includes('base64,')) {
      console.warn('Invalid image data format');
      return null;
    }

    // Extract the base64 data after the comma
    const base64Data = imageData.split('base64,')[1];
    
    if (!base64Data) {
      console.warn('No base64 data found in image');
      return null;
    }

    // Convert base64 to binary
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    if (!imageBuffer || imageBuffer.length === 0) {
      console.warn('Failed to create image buffer');
      return null;
    }

    console.log('Creating image run with buffer size:', imageBuffer.length);

    return new ImageRun({
      data: imageBuffer,
      transformation: {
        width: 300,
        height: 200,
        rotation: 0
      }
    });
  } catch (error) {
    console.error('Error creating image run:', error);
    return null;
  }
};

const generatePointTable = async (doc: Document, point: Point): Promise<TableRow[]> => {
  try {
    console.log('Processing point:', point);
    const rows: TableRow[] = [];

    // Create header cells with consistent styling
    const headerCells = [
      new TableCell({
        children: [new Paragraph({ 
          text: point.id,
          alignment: AlignmentType.CENTER
        })]
      }),
      new TableCell({
        children: [new Paragraph({ 
          text: `X: ${point.x.toFixed(2)}, Y: ${point.y.toFixed(2)}`,
          alignment: AlignmentType.CENTER
        })]
      }),
      new TableCell({
        children: [new Paragraph({ 
          text: point.comment || '',
          alignment: AlignmentType.LEFT
        })]
      })
    ];

    // Add header row
    rows.push(new TableRow({ children: headerCells }));

    // Process images if they exist
    if (point.images?.length > 0) {
      for (const image of point.images) {
        try {
          console.log('Processing image:', image.key);
          if (image.url) {
            const imageRun = await createImageRun(image.url);
            if (imageRun) {
              rows.push(new TableRow({
                children: [
                  new TableCell({
                    columnSpan: 3,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({
                      children: [imageRun],
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 200, after: 200 }
                    })]
                  })
                ]
              }));
            }
          }
        } catch (error) {
          console.error(`Error processing image ${image.key}:`, error);
        }
      }
    }

    return rows;
  } catch (error) {
    console.error('Error in generatePointTable:', error);
    return [];
  }
};

export const generateDocxReport = async (data: ReportTemplateData): Promise<Buffer> => {
  console.log('Starting report generation with:', {
    planCount: data.plans?.length,
    plans: data.plans.map(p => ({
      name: p.name,
      pointCount: p.points?.length
    }))
  });

  const doc = new Document({
    sections: []
  });

  const sections = await Promise.all(data.plans.map(async plan => {
    const pointTables = await Promise.all(plan.points.map(point => generatePointTable(doc, point)));
    
    return [
      new Paragraph({ text: `Plan: ${plan.name}`, heading: 'Heading2' }),
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: 'Point ID' })] }),
              new TableCell({ children: [new Paragraph({ text: 'Location' })] }),
              new TableCell({ children: [new Paragraph({ text: 'Comment' })] })
            ]
          }),
          ...pointTables.flat()
        ]
      })
    ];
  }));

  doc.addSection({
    children: sections.flat()
  });

  return Packer.toBuffer(doc);
};

export const generateTestDocument = async (testData: ReportTemplateData) => {
  try {
    console.log('Starting test document generation...');

    // If we have image data, create document with image
    if (testData.plans?.[0]?.points?.[0]?.images?.[0]) {
      console.log('Creating document with image...');
      const imageData = testData.plans[0].points[0].images[0];
      
      // Extract image format and base64 data
      const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid image data format');
      }
      
      const [, format, base64Data] = matches;
      const docImageBuffer = Buffer.from(base64Data, 'base64');
      console.log('Image buffer created:', {
        size: docImageBuffer.length,
        format,
        isBuffer: Buffer.isBuffer(docImageBuffer)
      });

      // Create simple document with minimal configuration
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Test Document with Image",
                  bold: true,
                  size: 32
                })
              ]
            }),
            new Paragraph({
              children: [
                new ImageRun({
                  data: docImageBuffer,
                  transformation: {
                    width: 200,
                    height: 150
                  }
                })
              ]
            })
          ]
        }]
      });

      console.log('Document created, packing...');
      const docBuffer = await Packer.toBuffer(doc);
      console.log('Document packed:', {
        size: docBuffer.length,
        isBuffer: Buffer.isBuffer(docBuffer)
      });
      
      return docBuffer;
    }

    // Fallback to basic document if no image
    console.log('No image data found, creating basic document');
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "Test Document",
                bold: true,
                size: 32
              })
            ]
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    console.log('Basic document created:', {
      size: buffer.length,
      isBuffer: Buffer.isBuffer(buffer)
    });
    return buffer;

  } catch (error) {
    console.error('Error generating test document:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}; 
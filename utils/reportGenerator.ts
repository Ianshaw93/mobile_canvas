export interface ReportTemplateData {
  projectName: string;
  plans: {
    name: string;
    points: {
      id: string;
      x: number;
      y: number;
      comment: string;
      images: {
        data: string; // base64 image data
        comment?: string;
      }[];
    }[];
  }[];
  generatedDate: string;
}

export const generateReportHTML = (data: ReportTemplateData): string => {
  const styles = `
    body { font-family: Arial, sans-serif; margin: 20px; }
    .report-header { text-align: center; margin: 20px 0; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .image-gallery { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
    .image-container { 
      border: 1px solid #ddd;
      padding: 10px;
      margin-bottom: 10px;
    }
    .point-image {
      max-width: 200px;
      max-height: 200px;
      object-fit: contain;
    }
    .image-comment {
      font-size: 0.9em;
      color: #666;
      margin-top: 5px;
    }
  `;

  const generateImageGallery = (images: ReportTemplateData['plans'][0]['points'][0]['images']) => {
    if (images.length === 0) return '';

    return `
      <tr>
        <td colspan="4">
          <div class="image-gallery">
            ${images.map(image => `
              <div class="image-container">
                <img 
                  src="data:image/jpeg;base64,${image.data}" 
                  class="point-image" 
                  alt="Point image"
                />
                ${image.comment ? `
                  <div class="image-comment">
                    Comment: ${image.comment}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </td>
      </tr>
    `;
  };

  const generatePlanTable = (plan: ReportTemplateData['plans'][0]) => `
    <h2>Plan: ${plan.name || 'Unnamed Plan'}</h2>
    <table>
      <thead>
        <tr>
          <th>Point ID</th>
          <th>Location</th>
          <th>Comment</th>
          <th>Number of Images</th>
        </tr>
      </thead>
      <tbody>
        ${plan.points.map(point => `
          <tr>
            <td>${point.id}</td>
            <td>(${point.x}, ${point.y})</td>
            <td>${point.comment || ''}</td>
            <td>${point.images.length}</td>
          </tr>
          ${generateImageGallery(point.images)}
        `).join('')}
      </tbody>
    </table>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>${styles}</style>
      </head>
      <body>
        <div class="report-header">
          <h1>Project Report: ${data.projectName}</h1>
          <p>Generated: ${data.generatedDate}</p>
        </div>
        ${data.plans.map(generatePlanTable).join('')}
      </body>
    </html>
  `;
}; 
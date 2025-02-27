import { generateImageGallery } from './ImageGallery';
import { ReportTemplateData } from '../reportGenerator';

export const generatePlanTable = (plan: ReportTemplateData['plans'][0]) => `
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

// return `
// <!DOCTYPE html>
// <html>
//   <head>
//     <style>${styles}</style>
//   </head>
//   <body>
//     <div class="report-header">
//       <h1>Project Report: ${data.projectName}</h1>
//       <p>Generated: ${data.generatedDate}</p>
//     </div>
//     ${data.plans.map(generatePlanTable).join('')}
//   </body>
// </html>
// `;
// };
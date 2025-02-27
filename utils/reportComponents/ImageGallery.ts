import { ReportTemplateData } from "../reportGenerator";

export   const generateImageGallery = (images: ReportTemplateData['plans'][0]['points'][0]['images']) => {
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
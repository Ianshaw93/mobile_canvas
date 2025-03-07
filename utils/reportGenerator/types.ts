export interface ReportTemplateData {
  projectName: string;
  generatedDate: string;
  plans: {
    id: string;
    name: string;
    url?: string;  // URL to the original PDF
    points: {
      id: string;
      x: number;
      y: number;
      comment: string;
      images: string[];  // Array of image URLs/data
      locationPreview?: string | null;  // Preview image data
    }[];
  }[];
} 
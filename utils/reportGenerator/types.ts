export interface ReportTemplateData {
  projectName: string;
  generatedDate: string;
  plans: {
    name: string;
    points: {
      id: string;
      x: number;
      y: number;
      comment: string;
      images: {
        data: string;
        comment?: string;
      }[];
    }[];
  }[];
} 
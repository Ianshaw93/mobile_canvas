// hooks/usePDF.js
import { useState, useEffect } from 'react';

export function usePDF() {
  const [pdf, setPdf] = useState(null);

  useEffect(() => {
    // @ts-ignore
    import('pdfjs-dist/build/pdf').then((pdfjs) => {
      // Use the local worker file from public/
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      setPdf(pdfjs);
    });
  }, []);

  return pdf;
}
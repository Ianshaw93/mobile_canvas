// hooks/usePDF.js
import { useState, useEffect } from 'react';

export function usePDF() {
  const [pdf, setPdf] = useState(null);

  useEffect(() => {
    // @ts-ignore
    import('pdfjs-dist/build/pdf').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
      setPdf(pdfjs);
    });
  }, []);

  return pdf;
}
// Utility to convert a single-page PDF to grayscale and return as base64 data URL
// Uses pdf.js to render and pdfmake to rebuild a PDF with a grayscale image
export async function convertPdfToGrayscale(base64PdfDataUrl: string): Promise<string> {
  // Lazy-load libraries to avoid increasing initial bundle size
  // @ts-ignore
  const pdfjs = await import('pdfjs-dist/build/pdf');
  // Ensure worker set (same pattern as usePDF hook)
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

  const { default: pdfMake } = await import('pdfmake/build/pdfmake');
  // Load fonts module; depending on bundler, this may set pdfMake.vfs as a side-effect
  const fontsModule: any = await import('pdfmake/build/vfs_fonts');
  // Collect candidates across common export shapes and side-effect
  // @ts-ignore
  const vfsCandidates = [
    // Side-effect assignment (most reliable in UMD builds)
    (pdfMake && pdfMake.vfs),
    fontsModule?.pdfMake?.vfs,
    fontsModule?.default?.pdfMake?.vfs,
    fontsModule?.vfs,
    fontsModule?.default?.vfs
  ];
  // @ts-ignore
  const resolvedVfs = vfsCandidates.find(Boolean);
  if (!resolvedVfs) throw new Error('pdfmake vfs not found from vfs_fonts module');
  // @ts-ignore
  pdfMake.vfs = resolvedVfs;

  // Extract raw base64 if a data URL is provided
  const base64 = base64PdfDataUrl.includes(',')
    ? base64PdfDataUrl.split(',')[1]
    : base64PdfDataUrl;

  // Decode base64 to Uint8Array
  const binaryString = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Load PDF (first page only, matching current app behavior)
  // @ts-ignore
  const loadingTask = pdfjs.getDocument({ data: bytes.buffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  // Render page to canvas
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({
    // @ts-ignore
    canvasContext: ctx,
    viewport,
    background: 'white'
  }).promise;

  // Grayscale pixels (luminance)
  if (ctx) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      data[i] = y;
      data[i + 1] = y;
      data[i + 2] = y;
      // data[i + 3] unchanged (alpha)
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Build new PDF with pdfmake at exact page size, no margins
  const pngDataUrl = canvas.toDataURL('image/png');
  const docDefinition = {
    pageSize: { width: viewport.width, height: viewport.height },
    pageMargins: [0, 0, 0, 0],
    content: [
      {
        image: pngDataUrl,
        width: viewport.width,
        height: viewport.height
      }
    ]
  } as any;

  const newPdfBase64: string = await new Promise((resolve) => {
    // @ts-ignore
    pdfMake.createPdf(docDefinition).getBase64((b64: string) => resolve(b64));
  });

  return `data:application/pdf;base64,${newPdfBase64}`;
}

// Apply grayscale to an existing canvas (in-place), returns void
export function grayscaleCanvasInPlace(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
  }
  ctx.putImageData(imageData, 0, 0);
}



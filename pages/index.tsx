import { Inter } from 'next/font/google'
import { useRef, useState } from 'react';
// import * as PDFJS from 'pdfjs-dist/build/pdf';

// PDFJS.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS.version}/pdf.worker.min.js`;
// @ts-ignore
const pdfjs = await import('pdfjs-dist/build/pdf');
// @ts-ignore
const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.entry');

pdfjs.GlobalWorkerOptions.workerSrc = null;
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const inter = Inter({ subsets: ['latin'] })

export default function Home() {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const [ previewImage, setPreviewImage ] = useState<boolean>();
  const [ canvasDimensions, setCanvasDimensions ] = useState({})
// have pdf from local storage??
// then draw point
// @ts-ignore
function handleFileChange(event) {
  const file = event.target.files[0]
  if (file && pdfCanvasRef.current) {
    
    const loadingTask = pdfjs.getDocument(URL.createObjectURL(file))
    // @ts-ignore
    loadingTask.promise.then((pdf) => {

      const pageNumber = 1
      // @ts-ignore
      pdf.getPage(pageNumber).then((page) => {
        console.log("setting up pdf", pdfCanvasRef.current)
        const canvas = pdfCanvasRef.current
        const context = canvas.getContext("2d")

        const scale = 1.5
        const viewport = page.getViewport({ scale: scale })

          // Prepare canvas using PDF page dimensions

          canvas.height = viewport.height;
          canvas.width = viewport.width;
          setCanvasDimensions({width: canvas.width, height: canvas.height})

          // Render PDF page into canvas context
          var renderContext = {
            canvasContext: context,
            viewport: viewport,
          };
          var renderTask = page.render(renderContext);
          renderTask.promise.then(() => {
            console.log("Page rendered");
          });
          setPreviewImage(true)
          
      })
    })
  }  
}
  return (
    <>
      <div>
        <label>
          <input 
            id="image"
            name="image"
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
          />
        </label>
      </div>
      <div>
        <canvas 
          ref={pdfCanvasRef}
          className='z-1'
        />
      </div>
    {/* </div> */}
    </>
  )
}

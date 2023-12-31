import React from 'react'
import { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import useSiteStore from '../store/useSiteStore'

type Dimensions = {
  width: number
  height: number
}

type State = {
  plans: Array<React.ReactNode>
  canvasDimensions: Dimensions | {}
  addPlan: (plan: React.ReactNode) => void
  setCanvasDimensions: (dimensions: Dimensions) => void
}
// @ts-ignore
const pdfjs = await import('pdfjs-dist/build/pdf');
// @ts-ignore
const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.entry');

pdfjs.GlobalWorkerOptions.workerSrc = null;
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
// TODO: save pdfs to state
// allow multiple
// show small versions in column
// click on pdf, go to page with pdf in canvas
// TODO: show small versions, but data reflects large version
const PdfPicker = () => {
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const [ previewImage, setPreviewImage ] = useState<boolean>();
    // const [ canvasDimensions, setCanvasDimensions ] = useState({})
    // @ts-ignore
    const setCanvasDimensions = useSiteStore((state) => state.setCanvasDimensions) 
    const [pdfs, setPdfs] = useState([]);
    const router = useRouter();

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
            // console.log("setting up pdf", pdfCanvasRef.current)
            const canvas = pdfCanvasRef.current
            // const canvas = document.createElement('canvas');
            // @ts-ignore
            const context = canvas.getContext("2d")
    
            const scale = 1 // was 1.5
            const viewport = page.getViewport({ scale: scale })
    
                // Prepare canvas using PDF page dimensions
                // @ts-ignore
                canvas.height = viewport.height;
                // @ts-ignore
                canvas.width = viewport.width;
                console.log("viewport: ",viewport.width, viewport.height)
                // @ts-ignore
                setCanvasDimensions({width: canvas.width, height: canvas.height})
    
                // Render PDF page into canvas context
                var renderContext = {
                canvasContext: context,
                viewport: viewport,
                };
                var renderTask = page.render(renderContext);
                renderTask.promise.then(() => {
                // @ts-ignore
                setPdfs((prevPdfs) => [...prevPdfs, canvas.toDataURL()]);
                });
                setPreviewImage(true)
            
        })
      })
    }  
  }
  // @ts-ignore
  const viewPdf = (dataUrl) => {
    router.push({
      pathname: '/pdf-view',
      query: { dataUrl },
    });
  };

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
            className='z-1 hidden'
            />
        {pdfs.map((pdf, index) => (
            <>
                {index + 1}
            <img
                key={index}
                src={pdf}
                alt={`PDF ${index + 1}`}
                onClick={() => viewPdf(pdf)}
                className='max-w-sm'
            />
            </>
        ))}
        </div>
    </>
  )
}

export default PdfPicker
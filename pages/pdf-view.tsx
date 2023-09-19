import React, { useState } from 'react';
import { useRouter } from 'next/router';
import PinPopup from '@/components/PinPopup';
import useSiteStore from '@/store/useSiteStore';

type Point = {
  x: number;
  y: number;
}

const PdfView = () => {
  let tool = 'point'
  const [points, setPoints] = useState<Point[]>([])
  const [showPinPopup, setShowPinPopup] = useState<boolean>(false)


  // @ts-ignore
  const canvasDimensions = useSiteStore((state) => state.canvasDimensions)
  console.log("canvasDimensions: ", canvasDimensions)
  // LATER allow editing of points
  // TODO: full size pdf here
  // allow drawing of pins
  // select pin
  // add images to pin
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const { dataUrl } = router.query;

  function calcDistance(p1: Point, p2: Point) {
    let a = p1.x - p2.x
    let b = p1.y - p2.y
    return Math.sqrt( a*a + b*b );
}

  function findClosestPin(pointer: Point) {
    // find closest point of all elements
    let closestPoint = null
    let closestDistance = null
    let closestElement = null
    for (let i = 0; i < points.length; i++) {
      let currentEl = points[i]
      // loop through elements
      // initially allow movement of entire shape only
      let currentP = currentEl
      
      // requires to loop through all points in element 

        let currentDistance = calcDistance(pointer, currentP)
        //-> check what is closest shape and 
        // find distance
        // TODO: add threshold of certain pixels
        // check within certain threshold close enough
        // @ts-ignore
        if (currentDistance < 10 && closestDistance === null || currentDistance < closestDistance) {
            closestDistance = currentDistance
            closestPoint = currentP
            closestElement = currentEl    
        }

        // LATER: allow manipulation of corners for mesh and individual points for polyline
        // returns closest element to mouse pointer
                
            
        } 
        return closestPoint
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    if (tool === 'point') {

      let pointer = {x: event.pageX, y: event.pageY}

      let closestPoint = findClosestPin(pointer)
      if (closestPoint) {
        console.log("closest point", closestPoint)
        setShowPinPopup(true)
        // action popup modal
        //   // if pointer is over/close to a pin
        //   // allow adding images to pin
        //   // open up camera
        //   // add image to pin closest to pointer

      } else {

        context.fillStyle = 'blue'
    
        let dimension = 5
        let newP = pointer
        setPoints((prevPoints) => [...prevPoints, newP])
        context.fillRect(newP.x - dimension/2, newP.y - dimension/2, dimension, dimension) 
      }
    }
    
  
  }
  // let showPinPopup = true
  return (
    <>
      <canvas
      ref={canvasRef}
      width={canvasDimensions.width}
      height={canvasDimensions.height}
      className='border border-black rounded-md bg-transparent inset-0 absolute z-10'
      onPointerDown={handlePointerDown}
      // onPointerUp={handlePointerUp}      
      />
        
      <div className='z-0'>
        <img
          src={dataUrl} 
          alt="Full PDF" 
          width={canvasDimensions.width}
          height={canvasDimensions.height}
        />
      </div>
      {/* <CameraLogic /> */}
      {showPinPopup && <PinPopup setShowPinPopup={setShowPinPopup}/>}
    </>
  );
};

export default PdfView;

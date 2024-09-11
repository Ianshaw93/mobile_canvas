import React from 'react'
import CameraLogic from './CameraLogic'
// read the selectedPoint and show previous images/notes from it from state

// TODO: all pin data to be stored in store or other state management
// TODO: later have text box for pin
// @ts-ignore
const PinPopup = ({setShowPinPopup, selectedPoint, planId}) => {
  // read selectedPoint and show previous images/notes from it
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 text-black">
        <div className="bg-white p-4 grid-cols-1 align-items-center rounded-lg shadow-lg overflow-y-auto max-h-screen" style={{ maxHeight: '80vh' }}>
            <CameraLogic selectedPoint={selectedPoint} planId={planId}/>
            <div>
                <button onClick={() => setShowPinPopup(false)}>Close</button>
            </div>
        </div>
    </div>
  )
}

export default PinPopup
import React from 'react'
import CameraLogic from './CameraLogic'

const PinPopup = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
    <div className="bg-white p-4 rounded-lg shadow-lg overflow-y-auto max-h-screen" style={{ maxHeight: '80vh' }}>
        <CameraLogic />
    </div>
    </div>
  )
}

export default PinPopup
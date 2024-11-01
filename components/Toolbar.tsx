export const menuOverlay = (<>
  
    <div className="fixed bottom-0 left-0 right-0 bg-gray-800 text-white z-30 h-5vh">
      <svg
        className="w-full h-1"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 320"
        style={{ zIndex: -1 }}
      >
        <polygon
          points="0 0 1440 0 1440 120"
          className="fill-current bg-gray-900"
        />
        <polygon
          points="1440 0 0 0 0 120"
          className="fill-current bg-gray-800"
        />
      </svg>
      <div className="flex justify-center py-4 relative absolute z-30" style={{ zIndex: 100 }} >
        {/* <Toolbar setShowModePopup={setShowModePopup}/> */}
      </div>
    </div>
    
        </>
    )
import { useState } from 'react';

// not working
// should show where the user is touching the screen
const TouchFeedback = () => {
  const [touches, setTouches] = useState([]);
    // @ts-ignore
  const handleTouch = (e) => {
    const touch = e.touches[0];
    const newTouch = { x: touch.clientX, y: touch.clientY };
    // @ts-ignore
    setTouches([...touches, newTouch]);

    setTimeout(() => {
      setTouches((current) => current.filter((t) => t !== newTouch));
    }, 500); // Remove after 500ms
  };

  return (
    <div
      onTouchStart={handleTouch}
      style={{ position: 'relative', height: '100vh', width: '100vw' }}
    >
      {touches.map((touch, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            // @ts-ignore
            top: touch.y - 10,
            // @ts-ignore
            left: touch.x - 10,
            width: '20px',
            height: '20px',
            backgroundColor: 'rgba(0, 0, 255, 0.5)',
            borderRadius: '50%',
            pointerEvents: 'none',
            transition: 'opacity 0.5s ease-out',
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
};

export default TouchFeedback;
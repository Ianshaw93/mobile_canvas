import React from 'react';
import { useRouter } from 'next/router';

const PdfView = () => {
  // TODO: full size pdf here
  // allow drawing of pins
  // select pin
  // add images to pin
  const router = useRouter();
  const { dataUrl } = router.query;

  return (
    <div>
      <img src={dataUrl} alt="Full PDF" />
    </div>
  );
};

export default PdfView;

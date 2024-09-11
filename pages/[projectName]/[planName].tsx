import React from 'react';
import { useRouter } from 'next/router';

const PdfPlanPage = () => {
  const router = useRouter();
  const { projectName, planNumber } = router.query;

  return (
    <div>
      <h1>Project: {projectName}</h1>
      <h2>Plan Number: {planNumber}</h2>
      {/* Add your PDF rendering logic here */}
    </div>
  );
}

export default PdfPlanPage;
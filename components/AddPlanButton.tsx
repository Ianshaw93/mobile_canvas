import React from 'react';
import useSiteStore from '@/store/useSiteStore';

const AddPlanButton = () => {
  const addPlan = useSiteStore((state) => state.addPlan);

  const handleAddPlan = () => {
    const newPlan = {
      id: 'plan-1',
      url: 'https://example.com/plan1.pdf',
      points: [],
      images: [],
      planId: 'plan-1',
      projectId: 'project-1',
    };
    addPlan(newPlan);
  };

  return (
    <button onClick={handleAddPlan}>
      Add Plan
    </button>
  );
};

export default AddPlanButton;

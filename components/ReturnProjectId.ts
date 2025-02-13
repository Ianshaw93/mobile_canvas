import useSiteStore from "@/store/useSiteStore";

export const getFirstPlanIdOrDatetime = () => {
  const { projects, selectedProjectId } = useSiteStore.getState();
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const plans = selectedProject?.plans || [];
  
  if (plans.length > 0) {
    return plans[0].id;
  }
  return new Date().toISOString();
};
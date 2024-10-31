import useSiteStore from "@/store/useSiteStore";

export const getFirstPlanIdOrDatetime = () => {
    const plans = useSiteStore.getState().plans;
    if (plans.length > 0) {
      return plans[0].id;
    } else {
      return new Date().toISOString();
    }
  };
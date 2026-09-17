import { Preferences } from '@capacitor/preferences';

export type PlanDisplayMode = 'color' | 'grayscale';
const KEY = 'plan_display_mode';

export async function loadPlanDisplayMode(): Promise<PlanDisplayMode> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value === 'grayscale' ? 'grayscale' : 'color';
  } catch {
    return 'color';
  }
}

export async function savePlanDisplayMode(mode: PlanDisplayMode): Promise<void> {
  await Preferences.set({ key: KEY, value: mode });
}

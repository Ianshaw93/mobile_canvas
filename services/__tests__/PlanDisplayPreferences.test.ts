import { Preferences } from '@capacitor/preferences';
import { loadPlanDisplayMode, savePlanDisplayMode } from '../PlanDisplayPreferences';

jest.mock('@capacitor/preferences', () => ({ Preferences: { get: jest.fn(), set: jest.fn() } }));
const prefs = Preferences as jest.Mocked<typeof Preferences>;

beforeEach(() => jest.resetAllMocks());

test.each([null, 'invalid', 'color'])('defaults to color for %s', async value => {
  prefs.get.mockResolvedValue({ value });
  expect(await loadPlanDisplayMode()).toBe('color');
});
test('restores grayscale', async () => {
  prefs.get.mockResolvedValue({ value: 'grayscale' });
  expect(await loadPlanDisplayMode()).toBe('grayscale');
});
test('uses color when storage is unavailable', async () => {
  prefs.get.mockRejectedValue(new Error('Unavailable'));
  expect(await loadPlanDisplayMode()).toBe('color');
});
test.each(['color', 'grayscale'] as const)('persists %s on this device', async mode => {
  await savePlanDisplayMode(mode);
  expect(prefs.set).toHaveBeenCalledWith({ key: 'plan_display_mode', value: mode });
});

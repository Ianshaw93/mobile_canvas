export function requireProjectId(projectId: string | null): string {
  if (projectId === null || projectId === '') {
    throw new Error('No project selected. Select a project before taking a photo.');
  }
  return projectId;
}

export function requireConvertedPhotoData(
  base64Data: string | null | undefined
): string {
  if (base64Data == null || base64Data === '') {
    throw new Error('Failed to convert photo to base64');
  }
  return base64Data;
}

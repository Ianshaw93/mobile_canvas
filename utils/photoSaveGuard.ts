export function requireProjectId(projectId: string | null): string {
  return projectId ?? 'missing-project';
}

export function requireConvertedPhotoData(
  base64Data: string | null | undefined
): string {
  return base64Data ?? 'missing-photo';
}

# Image Recovery Guide

This guide explains how to recover corrupted image URLs in the SQL database.

## The Problem

Due to a bug in the `addCommentToImage` function, when users add or edit comments on images, the image URL in the SQL database gets overwritten with an empty string. This causes those images to not appear in exports, even though the actual image files are still intact on the device.

## Quick Recovery

### Method 1: Using Browser Console (Recommended)

1. Open the app in development mode
2. Open browser developer tools (F12)
3. Go to Console tab
4. Run one of these commands:

```javascript
// Analyze corruption (safe - no changes made)
await window.analyzeImages();

// Recover all corrupted images
await window.recoverImages();
```

### Method 2: Using Recovery Service Directly

If you need more control, you can use the recovery service directly:

```typescript
import { dataRecoveryService } from '@/services/dataRecovery';

// Analyze corruption first
const analysis = await dataRecoveryService.analyzeCorruption();
console.log('Corruption analysis:', analysis);

// Then recover if needed
const result = await dataRecoveryService.recoverCorruptedImageUrls();
console.log('Recovery result:', result);
```

## How Recovery Works

1. **Scans SQL database** for all image records
2. **Identifies corrupted images** (empty or invalid URLs)
3. **Matches with filesystem** using the image ID (filename)
4. **Reconstructs base64 URLs** from the actual image files
5. **Updates SQL records** with proper URLs

## Recovery Success Scenarios

### ✅ High Success Rate
- Images where `image.id` matches the filesystem filename exactly
- Recent images with timestamp-based IDs
- Images where only the URL field was corrupted

### ⚠️ Partial Success Rate  
- Images where the ID field was also corrupted
- Very old images with different naming patterns

### ❌ Cannot Recover
- Images where the actual file was deleted from filesystem
- Images where both SQL record and file are completely corrupted

## Prevention

To prevent this issue in the future, the `addCommentToImage` function should be fixed:

```typescript
// Current broken code:
await database.updateImage({
  id: imageKey,
  point_id: pointId,
  url: '', // ❌ This overwrites the URL!
  comment: comment,
  // ...
});

// Fixed code should be:
const existingImage = await database.getImageById(imageKey);
await database.updateImage({
  ...existingImage, // ✅ Preserve all existing data
  comment: comment,  // ✅ Only update the comment
  updated_at: new Date().toISOString()
});
```

## Recovery Output

The recovery process provides detailed feedback:

```
Recovery Results:
   Total images: 25
   Corrupted images: 8
   Successfully recovered: 6
   Failed recoveries: 2
```

## Troubleshooting

### "Recovery only available on native platforms"
- Recovery only works on mobile devices, not in browser
- Make sure you're running on actual device or emulator

### "No corrupted images found"
- This is good! Your data is healthy
- Export should work normally

### "Could not recover X images"
- Check console logs for specific error details
- Those images may have missing files or corrupted IDs
- Manual intervention may be needed

## Files Created

- `services/dataRecovery.ts` - Main recovery service
- `utils/imageRecoveryHelper.ts` - Helper functions and console commands
- `docs/IMAGE_RECOVERY_GUIDE.md` - This guide

## Testing

To test the recovery:

1. First run analysis to see current state
2. Run recovery
3. Test export functionality to confirm images appear
4. Check specific images that had comments to ensure they export correctly
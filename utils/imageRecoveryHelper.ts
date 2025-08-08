import { dataRecoveryService } from '@/services/dataRecovery';

/**
 * Helper functions for image recovery that can be called from components or debugging
 */

/**
 * Quick recovery function - attempts to recover all corrupted images
 */
export async function recoverAllCorruptedImages() {
  try {
    console.log('🚀 Starting image recovery process...');
    const result = await dataRecoveryService.recoverCorruptedImageUrls();
    
    console.log('📊 Recovery Results:');
    console.log(`   Total images: ${result.totalImages}`);
    console.log(`   Corrupted images: ${result.corruptedImages}`);
    console.log(`   Successfully recovered: ${result.recoveredImages}`);
    console.log(`   Failed recoveries: ${result.failedRecoveries}`);
    
    if (result.errors.length > 0) {
      console.log('❌ Errors encountered:');
      result.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    if (result.recoveredImages > 0) {
      alert(`✅ Recovery completed! Recovered ${result.recoveredImages} out of ${result.corruptedImages} corrupted images.`);
    } else if (result.corruptedImages === 0) {
      alert('✅ No corrupted images found - your data is healthy!');
    } else {
      alert(`⚠️ Recovery completed but could not recover ${result.failedRecoveries} images. Check console for details.`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Recovery failed:', error);
    alert(`❌ Recovery failed: ${error}`);
    throw error;
  }
}

/**
 * Analysis only - check for corruption without making changes
 */
export async function analyzeImageCorruption() {
  try {
    console.log('🔍 Analyzing image corruption...');
    const analysis = await dataRecoveryService.analyzeCorruption();
    
    console.log('📊 Corruption Analysis:');
    console.log(`   Total images: ${analysis.totalImages}`);
    console.log(`   Corrupted images: ${analysis.corruptedImages.length}`);
    console.log(`   Available files: ${analysis.availableFiles.length}`);
    console.log(`   Potential matches: ${analysis.potentialMatches.filter(m => m.matchingFiles.length > 0).length}`);
    
    if (analysis.corruptedImages.length > 0) {
      console.log('❌ Corrupted images found:');
      analysis.corruptedImages.forEach(img => {
        const matches = analysis.potentialMatches.find(m => m.image.id === img.id);
        console.log(`   - ${img.id} (${matches?.matchingFiles.length || 0} potential matches)`);
      });
    }
    
    return analysis;
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  }
}

/**
 * Window global functions for debugging (add to window object for console access)
 */
declare global {
  interface Window {
    recoverImages: () => Promise<void>;
    analyzeImages: () => Promise<void>;
  }
}

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.recoverImages = recoverAllCorruptedImages;
  // @ts-ignore
  window.analyzeImages = analyzeImageCorruption;
}
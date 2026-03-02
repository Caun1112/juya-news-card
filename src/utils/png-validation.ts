/** PNG file signature (first 8 bytes). */
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Minimum valid PNG size in bytes.
 * Signature(8) + IHDR chunk(25) + IEND chunk(12) = 45 minimum,
 * but in practice any real image is larger, so we use 67 to account
 * for at least one IDAT chunk header.
 */
const MIN_PNG_SIZE = 67;

export type PngValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * Validates a PNG blob using three levels of checking:
 * 1. Minimum file size
 * 2. PNG magic bytes (header signature)
 * 3. Decode via Image element with optional dimension matching
 *
 * @param blob         The blob to validate.
 * @param expected     Optional expected decoded dimensions (before devicePixelRatio).
 */
export async function validatePngBlob(
  blob: Blob,
  expected?: { width: number; height: number },
): Promise<PngValidationResult> {
  // Level 1: minimum size
  if (blob.size < MIN_PNG_SIZE) {
    return { valid: false, reason: `PNG too small (${blob.size} bytes, minimum ${MIN_PNG_SIZE})` };
  }

  // Level 2: PNG header magic bytes
  const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  for (let i = 0; i < PNG_HEADER.length; i++) {
    if (header[i] !== PNG_HEADER[i]) {
      return { valid: false, reason: 'Invalid PNG header (magic bytes mismatch)' };
    }
  }

  // Level 3: decode and dimension check
  const url = URL.createObjectURL(blob);
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => {
          img.onload = null;
          img.onerror = null;
          reject(new Error('PNG decode timed out (5s)'));
        }, 5000);
        img.onload = () => {
          clearTimeout(timer);
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Failed to decode PNG image'));
        };
        img.src = url;
      },
    );

    if (width === 0 || height === 0) {
      return { valid: false, reason: `Decoded dimensions are zero (${width}x${height})` };
    }

    if (expected) {
      // Allow 1px tolerance for rounding differences
      const widthOk = Math.abs(width - expected.width) <= 1;
      const heightOk = Math.abs(height - expected.height) <= 1;
      if (!widthOk || !heightOk) {
        return {
          valid: false,
          reason: `Dimension mismatch: expected ~${expected.width}x${expected.height}, got ${width}x${height}`,
        };
      }
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, reason: e instanceof Error ? e.message : 'PNG decode failed' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

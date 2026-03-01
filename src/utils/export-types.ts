import type { ExportFormat } from './global-settings';

/** Identifies which renderer produced the final output. */
export type RenderSource = 'render-api' | 'snapdom' | 'html2canvas';

/** A single renderer attempt within the export pipeline. */
export interface RenderAttempt {
  renderer: RenderSource;
  success: boolean;
  failureReason?: string;
  durationMs: number;
}

/** Structured metadata about how an export was produced. */
export interface ExportMetadata {
  /** The renderer that produced the final blob. */
  renderSource: RenderSource;
  /** Non-null when a fallback occurred; describes why the primary renderer failed. */
  fallbackReason: string | null;
  /** Ordered list of all renderer attempts with timing and outcome. */
  attemptTrace: RenderAttempt[];
}

/** Result of an image export operation. */
export interface ExportResult {
  blob: Blob;
  format: ExportFormat;
  filename: string;
  metadata: ExportMetadata;
}

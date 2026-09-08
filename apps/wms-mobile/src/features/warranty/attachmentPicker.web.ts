import {
  ATTACHMENT_LIMITS,
  validateAttachment,
  type AttachmentCounts,
} from './warrantyPolicy';
import type { AttachmentFile } from '../../services/wms/warrantyWrite';

export interface PickedAttachment {
  readonly file: AttachmentFile;
  readonly bytes: number;
  readonly seconds?: number;
  readonly isVideo: boolean;
}

export type PickOutcome =
  | { readonly kind: 'picked'; readonly items: readonly PickedAttachment[] }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'partial'; readonly items: readonly PickedAttachment[]; readonly rejected: readonly string[] };

function toPicked(file: File): PickedAttachment {
  const type = file.type || 'application/octet-stream';
  return {
    file: { uri: URL.createObjectURL(file), name: file.name || 'attachment-' + String(Date.now()), type, blob: file },
    bytes: file.size,
    isVideo: ATTACHMENT_LIMITS.videoTypes.includes(type),
  };
}

function filterByLimits(candidates: readonly PickedAttachment[], counts: AttachmentCounts): { accepted: PickedAttachment[]; rejected: string[] } {
  const accepted: PickedAttachment[] = [];
  const rejected: string[] = [];
  let images = counts.images;
  let videos = counts.videos;
  for (const candidate of candidates) {
    const problem = validateAttachment({ mimeType: candidate.file.type, bytes: candidate.bytes }, { images, videos });
    if (problem !== undefined) {
      rejected.push(candidate.file.name + ': ' + problem);
      continue;
    }
    accepted.push(candidate);
    if (candidate.isVideo) videos += 1;
    else images += 1;
  }
  return { accepted, rejected };
}

function selectFiles(capture: boolean, multiple: boolean): Promise<readonly File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.multiple = multiple;
    if (capture) input.setAttribute('capture', 'environment');
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

async function choose(counts: AttachmentCounts, capture: boolean): Promise<PickOutcome> {
  const remaining = Math.max(0, ATTACHMENT_LIMITS.maxImages - counts.images + (ATTACHMENT_LIMITS.maxVideos - counts.videos));
  if (remaining === 0) return { kind: 'error', message: 'Hồ sơ đã đủ số ảnh và video cho phép.' };
  try {
    const files = await selectFiles(capture, !capture && remaining > 1);
    if (files.length === 0) return { kind: 'cancelled' };
    const { accepted, rejected } = filterByLimits(files.map(toPicked), counts);
    return rejected.length === 0 ? { kind: 'picked', items: accepted } : { kind: 'partial', items: accepted, rejected };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'Không mở được bộ chọn tệp.' };
  }
}

export function pickFromLibrary(counts: AttachmentCounts): Promise<PickOutcome> {
  return choose(counts, false);
}

export function captureAttachment(counts: AttachmentCounts): Promise<PickOutcome> {
  return choose(counts, true);
}

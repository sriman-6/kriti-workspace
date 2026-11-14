import { ForbiddenError } from '@/lib/errors';
import { MAX_FILE_BYTES } from '@/lib/workspace';

export const WORK_FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
};

export function describeWorkFile(filename: string, size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES)
    throw new ForbiddenError('Each file must be between 1 byte and 5 MB.');
  const name = filename.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 180);
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (!Object.hasOwn(WORK_FILE_TYPES, extension))
    throw new ForbiddenError('Use PDF, Word, Excel, PowerPoint, text, CSV, PNG or JPEG files.');
  return { name, size, contentType: WORK_FILE_TYPES[extension]! };
}

export function validateWorkFileContent(file: { name: string; size: number }, content: Uint8Array) {
  const metadata = describeWorkFile(file.name, file.size);
  const extension = metadata.name.split('.').pop()!.toLowerCase();
  const signature = [...content.subarray(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const valid = content.length === file.size && (
    extension === 'pdf' ? signature.startsWith('255044462d') :
    ['docx', 'xlsx', 'pptx'].includes(extension) ? signature.startsWith('504b0304') :
    ['doc', 'xls'].includes(extension) ? signature === 'd0cf11e0a1b11ae1' :
    extension === 'png' ? signature === '89504e470d0a1a0a' :
    ['jpg', 'jpeg'].includes(extension) ? signature.startsWith('ffd8ff') :
    !content.includes(0)
  );
  if (!valid) throw new ForbiddenError(`The contents of ${metadata.name} do not match its file type.`);
  return metadata;
}

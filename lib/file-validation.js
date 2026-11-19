const path = require('path');
const { Image } = require('imagescript');
const { PDFDocument } = require('pdf-lib');

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2048;
const MAX_IMAGE_PIXELS = MAX_IMAGE_SIDE * MAX_IMAGE_SIDE;
const MAX_PDF_PAGES = 50;

const FORMATS = {
  jpg: { extension: 'jpg', mimeType: 'image/jpeg', kind: 'image' },
  png: { extension: 'png', mimeType: 'image/png', kind: 'image' },
  webp: { extension: 'webp', mimeType: 'image/webp', kind: 'image' },
  pdf: { extension: 'pdf', mimeType: 'application/pdf', kind: 'document' }
};

const EXTENSION_ALIASES = { jpeg: 'jpg' };

class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.status = 422;
  }
}

function cleanFilename(value) {
  if (typeof value !== 'string') return null;

  const lastSegment = value.normalize('NFKC').split(/[\\/]/).pop() || '';
  const withoutControls = lastSegment.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim();
  if (!withoutControls || withoutControls === '.' || withoutControls === '..') return null;

  const ext = path.posix.extname(withoutControls).toLowerCase();
  const stem = path.posix.basename(withoutControls, path.posix.extname(withoutControls));
  const safeStem = stem
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 120) || 'file';
  const safeExt = ext.replace(/[^.a-z0-9]/g, '').slice(0, 10);

  return `${safeStem}${safeExt}`;
}

function prepareUploadName(value) {
  const cleaned = cleanFilename(value);
  if (!cleaned) throw new ValidationError('invalid_filename', 'A valid filename is required.');

  const rawExtension = path.posix.extname(cleaned).slice(1).toLowerCase();
  const formatKey = EXTENSION_ALIASES[rawExtension] || rawExtension;
  const format = FORMATS[formatKey];
  if (!format) {
    throw new ValidationError('unsupported_extension', 'Only JPG, PNG, WebP, and PDF files are allowed.');
  }

  const stem = path.posix.basename(cleaned, path.posix.extname(cleaned));
  return {
    filename: `${stem}.${format.extension}`,
    formatKey,
    format
  };
}

function isJpeg(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPng(buffer) {
  return (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  );
}

function isWebp(buffer) {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function isPdf(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function detectType(buffer) {
  if (isJpeg(buffer)) return 'jpg';
  if (isPng(buffer)) return 'png';
  if (isWebp(buffer)) return 'webp';
  if (isPdf(buffer)) return 'pdf';
  return null;
}

async function normalizeImage(buffer, formatKey, format) {
  let image;
  try {
    image = await Image.decode(buffer, {
      maxPixels: MAX_IMAGE_PIXELS,
      applyOrientation: true,
      applyColorProfile: true,
      gainMap: false,
      threads: 1
    });
  } catch (err) {
    throw new ValidationError('image_parse_failed', 'The image could not be decoded.');
  }

  if (!image.width || !image.height || image.width > MAX_IMAGE_SIDE || image.height > MAX_IMAGE_SIDE) {
    throw new ValidationError('image_dimensions', `Images must be at most ${MAX_IMAGE_SIDE} by ${MAX_IMAGE_SIDE} pixels.`);
  }

  let output;
  try {
    if (formatKey === 'jpg') {
      output = Buffer.from(await image.encodeJPEG({ quality: 85 }));
    } else if (formatKey === 'png') {
      output = Buffer.from(await image.encodePNG());
    } else {
      output = Buffer.from(await image.encodeWebP({ quality: 85 }));
    }
  } catch (err) {
    throw new ValidationError('image_encode_failed', 'The image could not be normalized.');
  }

  if (!output.length || output.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError('file_too_large', 'The normalized image is too large.');
  }

  if (detectType(output) !== formatKey) {
    throw new ValidationError('signature_mismatch', 'The image format changed unexpectedly.');
  }

  return {
    extension: format.extension,
    mimeType: format.mimeType,
    buffer: output
  };
}

async function normalizePdf(buffer, format) {
  let source;
  try {
    source = await PDFDocument.load(buffer, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false
    });
  } catch (err) {
    throw new ValidationError('pdf_parse_failed', 'The PDF could not be parsed.');
  }

  const pageCount = source.getPageCount();
  if (pageCount < 1 || pageCount > MAX_PDF_PAGES) {
    throw new ValidationError('pdf_page_limit', `PDFs must contain between 1 and ${MAX_PDF_PAGES} pages.`);
  }

  let output;
  try {
    const clean = await PDFDocument.create();
    const pages = await clean.copyPages(source, source.getPageIndices());
    pages.forEach((page) => clean.addPage(page));
    output = Buffer.from(await clean.save({ useObjectStreams: false }));
  } catch (err) {
    throw new ValidationError('pdf_rewrite_failed', 'The PDF could not be normalized.');
  }

  if (!output.length || output.length > MAX_UPLOAD_BYTES || !isPdf(output)) {
    throw new ValidationError('pdf_rewrite_failed', 'The normalized PDF is invalid or too large.');
  }

  return {
    extension: format.extension,
    mimeType: format.mimeType,
    buffer: output
  };
}

async function validateUpload(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ValidationError('empty_file', 'Choose a file to upload.');
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError('file_too_large', 'Files must be 2 MB or smaller.');
  }

  const prepared = prepareUploadName(filename);
  const actualType = detectType(buffer);

  if (!actualType) {
    throw new ValidationError('unknown_signature', 'The file type could not be verified.');
  }

  if (actualType !== prepared.formatKey) {
    throw new ValidationError('signature_mismatch', 'The file content does not match its extension.');
  }

  const normalized =
    prepared.format.kind === 'image'
      ? await normalizeImage(buffer, prepared.formatKey, prepared.format)
      : await normalizePdf(buffer, prepared.format);

  return {
    filename: prepared.filename,
    extension: normalized.extension,
    mimeType: normalized.mimeType,
    buffer: normalized.buffer,
    scanResult: 'structural_pass_no_av'
  };
}

module.exports = {
  MAX_UPLOAD_BYTES,
  MAX_IMAGE_SIDE,
  MAX_IMAGE_PIXELS,
  MAX_PDF_PAGES,
  ValidationError,
  cleanFilename,
  prepareUploadName,
  detectType,
  validateUpload
};

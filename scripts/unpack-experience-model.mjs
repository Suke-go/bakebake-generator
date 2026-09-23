// Reconstruct the pinned offline E5 model during a Git-based Vercel build.
// Copy this file to the Next.js project's scripts/ directory. No download or
// inference API is used. The original ONNX file must remain untracked.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const MODEL_RELATIVE = 'data/experience-search-model-cache/Xenova/multilingual-e5-small/761b726dd34fb83930e26aab4e9ac3899aa1fa78/onnx/model_quantized.onnx';
const ARCHIVE_RELATIVE = 'build-assets/model_quantized.onnx.gz';
const RAW_SHA256 = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
const ARCHIVE_SHA256 = 'd0aebf7b956e2d6617cdee679e7163dc251f8ad7f9cfc6fbaceb837a874217fd';
const RAW_BYTES = 118_308_185;
const ARCHIVE_BYTES = 78_350_966;

async function sha256File(file) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

async function sha256IfPresent(file) {
  try {
    return await sha256File(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function checkArchive(archivePath, expectedArchiveSha256, expectedArchiveBytes) {
  const found = await sha256File(archivePath);
  if (found.sha256 !== expectedArchiveSha256 || found.bytes !== expectedArchiveBytes) {
    throw new Error(`Compressed E5 model failed integrity check: ${found.sha256} (${found.bytes} bytes)`);
  }
  return found;
}

export async function verifyArchive({ archivePath, expectedArchiveSha256, expectedArchiveBytes,
  expectedRawSha256, expectedRawBytes }) {
  await checkArchive(archivePath, expectedArchiveSha256, expectedArchiveBytes);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(archivePath).pipe(createGunzip())) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  const rawSha256 = hash.digest('hex');
  if (rawSha256 !== expectedRawSha256 || bytes !== expectedRawBytes) {
    throw new Error(`Decompressed E5 model failed integrity check: ${rawSha256} (${bytes} bytes)`);
  }
  return { rawSha256, rawBytes: bytes };
}

export async function ensureModel({ archivePath, targetPath, expectedArchiveSha256,
  expectedArchiveBytes, expectedRawSha256, expectedRawBytes }) {
  await checkArchive(archivePath, expectedArchiveSha256, expectedArchiveBytes);
  const existing = await sha256IfPresent(targetPath);
  if (existing?.sha256 === expectedRawSha256 && existing.bytes === expectedRawBytes) {
    return { action: 'verified-existing', rawSha256: existing.sha256, rawBytes: existing.bytes };
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  const hash = createHash('sha256');
  let bytes = 0;
  const measure = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  try {
    await pipeline(createReadStream(archivePath), createGunzip(), measure,
      createWriteStream(temporaryPath, { flags: 'wx' }));
    const rawSha256 = hash.digest('hex');
    if (rawSha256 !== expectedRawSha256 || bytes !== expectedRawBytes) {
      throw new Error(`Decompressed E5 model failed integrity check: ${rawSha256} (${bytes} bytes)`);
    }
    // Replace an invalid generated file only after the new file is verified.
    await rm(targetPath, { force: true });
    await rename(temporaryPath, targetPath);
    return { action: existing ? 'replaced-mismatched' : 'reconstructed', rawSha256, rawBytes: bytes };
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const targetPath = path.resolve(root, MODEL_RELATIVE);
  let archivePath = path.resolve(root, ARCHIVE_RELATIVE);
  let verifyOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--verify-only') verifyOnly = true;
    else if (args[i] === '--archive' && args[i + 1]) archivePath = path.resolve(args[++i]);
    else throw new Error('Usage: node unpack-experience-model.mjs [--verify-only] [--archive path]');
  }
  const options = { archivePath, targetPath, expectedArchiveSha256: ARCHIVE_SHA256,
    expectedArchiveBytes: ARCHIVE_BYTES, expectedRawSha256: RAW_SHA256, expectedRawBytes: RAW_BYTES };
  const result = verifyOnly ? await verifyArchive(options) : await ensureModel(options);
  console.log(JSON.stringify(result));
}

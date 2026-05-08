import {
  S3Client, GetObjectCommand, PutObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand,
  CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const accountId = process.env.R2_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET

let _client: S3Client | null = null
function getClient(): S3Client {
  if (_client) return _client
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
  }
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return _client
}

export function isR2Configured(): boolean {
  return !!(accountId && accessKeyId && secretAccessKey && bucket)
}

export function r2Bucket(): string {
  if (!bucket) throw new Error('R2_BUCKET not configured')
  return bucket
}

/**
 * Build a presigned URL the browser can PUT a file to directly.
 * Single-part upload. Works for files up to 5 GB; for >5 GB we'd need multipart.
 */
export async function presignUpload(key: string, contentType: string, expiresInSeconds = 60 * 60): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(getClient(), cmd, { expiresIn: expiresInSeconds })
}

/**
 * Build a presigned URL to GET / view a stored object.
 * Default 1 hour expiry — enough for the page session, short enough to mitigate
 * leaked URL replay.
 */
export async function presignGet(key: string, expiresInSeconds = 60 * 60): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: r2Bucket(), Key: key })
  return getSignedUrl(getClient(), cmd, { expiresIn: expiresInSeconds })
}

// ── Multipart upload (for files > ~50 MB to avoid Cloudflare proxy timeout) ──

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const cmd = new CreateMultipartUploadCommand({
    Bucket: r2Bucket(),
    Key: key,
    ContentType: contentType,
  })
  const res = await getClient().send(cmd)
  if (!res.UploadId) throw new Error('R2 did not return UploadId')
  return res.UploadId
}

export async function presignUploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  const cmd = new UploadPartCommand({
    Bucket: r2Bucket(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  })
  return getSignedUrl(getClient(), cmd, { expiresIn: expiresInSeconds })
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: r2Bucket(),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts
        .sort((a, b) => a.partNumber - b.partNumber)
        .map(p => ({ ETag: p.etag, PartNumber: p.partNumber })),
    },
  })
  await getClient().send(cmd)
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  const cmd = new AbortMultipartUploadCommand({
    Bucket: r2Bucket(),
    Key: key,
    UploadId: uploadId,
  })
  await getClient().send(cmd).catch(() => {})
}

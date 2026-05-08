import { v2 as cloudinary } from 'cloudinary'

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
}

export function isCloudinaryConfigured(): boolean {
  return !!(cloudName && apiKey && apiSecret)
}

/**
 * Upload media to Cloudinary from a buffer. Returns public_id + resource_type.
 * resource_type='video' covers videos AND audio in Cloudinary's API.
 */
export async function uploadBufferToCloudinary(
  buffer: Buffer,
  contentType: string,
  folder = 'sms'
): Promise<{ publicId: string; resourceType: 'image' | 'video' | 'raw'; secureUrl: string }> {
  const resourceType: 'image' | 'video' | 'raw' = contentType.startsWith('image')
    ? 'image'
    : contentType.startsWith('video') || contentType.startsWith('audio')
      ? 'video'
      : 'raw'

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder },
      (err, result) => {
        if (err || !result) return reject(err || new Error('No result from Cloudinary'))
        resolve({
          publicId: result.public_id,
          resourceType,
          secureUrl: result.secure_url,
        })
      }
    )
    stream.end(buffer)
  })
}

/**
 * Build a delivery URL for a stored Cloudinary asset. f_auto picks the best
 * format the browser supports (mp4/webm/avif/etc), q_auto picks quality.
 * For images we also auto-trim solid-color borders (helps strip black letterbox
 * bars that MMS carriers add to images).
 */
export function cloudinaryDeliveryUrl(publicId: string, resourceType: string): string {
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME not configured')
  if (resourceType === 'raw') {
    return `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}`
  }
  // For images: trim borders + auto format/quality
  // For videos: auto format/quality (Cloudinary doesn't reliably auto-trim video borders)
  const transform = resourceType === 'image' ? 'e_trim,f_auto,q_auto/' : 'f_auto,q_auto/'
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${transform}${publicId}`
}

export { cloudinary }

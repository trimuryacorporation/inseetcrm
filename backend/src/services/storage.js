import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { fail } from "../utils/security.js";
function storage() {
  for (const k of [
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ])
    if (!env[k])
      throw fail(503, "Private document storage has not been configured");
  return new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}
export const putFile = (key, file) =>
  storage().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ServerSideEncryption: "AES256",
    }),
  );
export const removeFile = (key) =>
  storage().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
export const downloadUrl = (doc) =>
  getSignedUrl(
    storage(),
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: doc.key,
      ResponseContentDisposition:
        'attachment; filename="' +
        doc.name.replace(/[^a-zA-Z0-9._ -]/g, "_") +
        '"',
    }),
    { expiresIn: 60 },
  );

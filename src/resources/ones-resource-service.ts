import type { DocumentResource } from "../documents/model.js";
import { AppError } from "../errors.js";
import type {
  DownloadedResourceByIdResult,
  DownloadedResourceResult,
} from "../work-items/model.js";

export const DEFAULT_IMAGE_OPERATION = "imageMogr2/auto-orient";

export type ResourceRequestOptions = {
  absolute: boolean;
  acceptedStatuses?: readonly number[];
  includeAuth?: boolean;
};

export type ResourceRequest = (
  pathOrUrl: string,
  init: RequestInit,
  options: ResourceRequestOptions,
) => Promise<Response>;

type ResolvedAttachment = {
  resource_id: string;
  url: string;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
};

type DownloadOptions = {
  expectedImage: boolean;
};

export class OnesResourceService {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string,
    private readonly request: ResourceRequest,
  ) {
    this.baseUrl = new URL(baseUrl);
  }

  async refreshDocumentResources(
    resources: DocumentResource[],
    teamUuid: string | null,
  ): Promise<DocumentResource[]> {
    const resolutions = new Map<string, Promise<ResolvedAttachment>>();

    return Promise.all(
      resources.map(async (resource) => {
        if (resource.type !== "image" || !resource.resource_id) {
          return resource;
        }

        try {
          if (!teamUuid) {
            throw new AppError(
              "CONFIG_ERROR",
              "ONES team UUID is unavailable in the current session",
            );
          }
          let resolution = resolutions.get(resource.resource_id);
          if (!resolution) {
            resolution = this.resolveAttachment(
              resource.resource_id,
              teamUuid,
              DEFAULT_IMAGE_OPERATION,
            );
            resolutions.set(resource.resource_id, resolution);
          }
          const resolved = await resolution;
          return {
            ...resource,
            original_url: resource.original_url ?? resource.src,
            src: resolved.url,
            filename: resolved.filename ?? resource.filename,
            mime_type: resolved.mime_type ?? resource.mime_type,
            size_bytes: resolved.size_bytes ?? resource.size_bytes,
            width: resolved.width ?? resource.width,
            height: resolved.height ?? resource.height,
            error: null,
          };
        } catch (error) {
          return {
            ...resource,
            original_url: resource.original_url ?? resource.src,
            error: resourceErrorMessage(error),
          };
        }
      }),
    );
  }

  async downloadById(
    resourceId: string,
    teamUuid: string,
    operation = DEFAULT_IMAGE_OPERATION,
  ): Promise<DownloadedResourceByIdResult> {
    const resolved = await this.resolveAttachment(resourceId, teamUuid, operation);
    const downloaded = await this.downloadUrl(resolved.url, { expectedImage: true });

    return {
      resource_id: resourceId,
      filename: resolved.filename ?? downloaded.filename,
      mime_type: downloaded.mime_type ?? resolved.mime_type ?? "application/octet-stream",
      size_bytes: downloaded.size_bytes,
      width: downloaded.width ?? resolved.width,
      height: downloaded.height ?? resolved.height,
      content_base64: downloaded.content_base64,
    };
  }

  async downloadUrl(
    url: string,
    options: DownloadOptions,
  ): Promise<
    DownloadedResourceResult & { width: number | null; height: number | null }
  > {
    const includeAuth = new URL(url).host === this.baseUrl.host;
    const response = await this.request(
      url,
      { method: "GET" },
      { absolute: true, includeAuth },
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = normalizeMimeType(response.headers.get("content-type"));
    if (isLoginResponse(bytes, contentType)) {
      throw expiredImageError();
    }
    const filename = extractFilename(response, url);
    const expectedImage =
      options.expectedImage ||
      isImageUrl(url) ||
      (filename ? isImageFilename(filename) : false) ||
      contentType?.startsWith("image/") === true;
    const image = expectedImage ? validateImageDownload(bytes, contentType) : null;

    return {
      url,
      filename,
      mime_type: image?.mimeType ?? contentType,
      size_bytes: bytes.byteLength,
      content_base64: Buffer.from(bytes).toString("base64"),
      width: image?.width ?? null,
      height: image?.height ?? null,
    };
  }

  private async resolveAttachment(
    resourceId: string,
    teamUuid: string,
    operation: string,
  ): Promise<ResolvedAttachment> {
    const query = new URLSearchParams({ op: operation || DEFAULT_IMAGE_OPERATION });
    const path = `/project/api/project/team/${encodeURIComponent(teamUuid)}/res/attachment/${encodeURIComponent(resourceId)}?${query.toString()}`;
    const requestUrl = new URL(path, this.baseUrl).toString();
    const response = await this.request(
      path,
      { method: "GET", redirect: "manual" },
      {
        absolute: false,
        acceptedStatuses: [301, 302, 303, 307, 308],
        includeAuth: true,
      },
    );

    const location = response.headers.get("location");
    if (location) {
      return emptyResolvedAttachment(resourceId, resolveHttpUrl(location, requestUrl));
    }

    const contentType = normalizeMimeType(response.headers.get("content-type"));
    let data: unknown = null;
    let bodyUrl: string | null = null;
    if (contentType === "application/json" || contentType?.endsWith("+json")) {
      data = await response.json();
      bodyUrl = findUrlInJson(data);
    } else {
      const text = (await response.text()).trim();
      if (isUrlLike(text)) {
        bodyUrl = text;
      } else if (text.startsWith("{") || text.startsWith("[")) {
        try {
          data = JSON.parse(text) as unknown;
          bodyUrl = findUrlInJson(data);
        } catch {
          data = null;
        }
      }
    }

    const followedUrl = response.url && response.url !== requestUrl
      ? response.url
      : null;
    const url = bodyUrl ?? followedUrl;
    if (!url) {
      throw new AppError(
        "UPSTREAM_ERROR",
        `ONES attachment lookup did not return a URL for resource ${resourceId}`,
      );
    }

    const metadata = readAttachmentMetadata(data);
    return {
      resource_id: resourceId,
      url: resolveHttpUrl(url, requestUrl),
      filename: metadata.filename,
      mime_type: metadata.mime_type,
      size_bytes: metadata.size_bytes,
      width: metadata.width,
      height: metadata.height,
    };
  }
}

function emptyResolvedAttachment(resourceId: string, url: string): ResolvedAttachment {
  return {
    resource_id: resourceId,
    url,
    filename: filenameFromUrl(url),
    mime_type: null,
    size_bytes: null,
    width: null,
    height: null,
  };
}

function readAttachmentMetadata(
  data: unknown,
): Omit<ResolvedAttachment, "resource_id" | "url"> {
  const record = findRecordContainingUrl(data) ?? asRecord(data) ?? {};
  return {
    filename: readString(record, ["filename", "file_name", "fileName", "name"]),
    mime_type: readString(record, [
      "mime_type",
      "mimeType",
      "content_type",
      "contentType",
    ]),
    size_bytes: readNumber(record, [
      "size_bytes",
      "sizeBytes",
      "file_size",
      "fileSize",
      "size",
    ]),
    width: readNumber(record, ["width", "image_width", "imageWidth"]),
    height: readNumber(record, ["height", "image_height", "imageHeight"]),
  };
}

function findUrlInJson(value: unknown, depth = 0): string | null {
  if (typeof value === "string") {
    return isUrlLike(value.trim()) ? value.trim() : null;
  }
  if (!value || typeof value !== "object" || depth > 5) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findUrlInJson(item, depth + 1);
      if (url) {
        return url;
      }
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of [
    "url",
    "download_url",
    "downloadUrl",
    "signed_url",
    "signedUrl",
    "src",
  ]) {
    const candidate = record[key];
    if (typeof candidate === "string" && isUrlLike(candidate.trim())) {
      return candidate.trim();
    }
  }
  for (const item of Object.values(record)) {
    const url = findUrlInJson(item, depth + 1);
    if (url) {
      return url;
    }
  }
  return null;
}

function findRecordContainingUrl(
  value: unknown,
  depth = 0,
): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record || depth > 5) {
    return null;
  }
  const urlKeys = [
    "url",
    "download_url",
    "downloadUrl",
    "signed_url",
    "signedUrl",
    "src",
  ];
  if (
    urlKeys.some(
      (key) =>
        typeof record[key] === "string" &&
        isUrlLike((record[key] as string).trim()),
    )
  ) {
    return record;
  }
  for (const item of Object.values(record)) {
    const nested = findRecordContainingUrl(item, depth + 1);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : NaN;
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function validateImageDownload(
  bytes: Uint8Array,
  contentType: string | null,
): { mimeType: string; width: number | null; height: number | null } {
  const image = detectImage(bytes);
  if (!contentType?.startsWith("image/") || !image) {
    throw expiredImageError();
  }
  if (normalizeImageMime(contentType) !== image.mimeType) {
    throw expiredImageError();
  }
  return image;
}

function detectImage(
  bytes: Uint8Array,
): { mimeType: string; width: number | null; height: number | null } | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      mimeType: "image/png",
      width: readUint32Be(bytes, 16),
      height: readUint32Be(bytes, 20),
    };
  }

  if (bytes.length >= 10 && ascii(bytes, 0, 6).match(/^GIF8[79]a$/)) {
    return {
      mimeType: "image/gif",
      width: readUint16Le(bytes, 6),
      height: readUint16Le(bytes, 8),
    };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    const dimensions = readJpegDimensions(bytes);
    return { mimeType: "image/jpeg", ...dimensions };
  }

  if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return { mimeType: "image/webp", ...readWebpDimensions(bytes) };
  }

  return null;
}

function readJpegDimensions(
  bytes: Uint8Array,
): { width: number | null; height: number | null } {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (
      [
        0xc0,
        0xc1,
        0xc2,
        0xc3,
        0xc5,
        0xc6,
        0xc7,
        0xc9,
        0xca,
        0xcb,
        0xcd,
        0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
      };
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    offset += length > 1 ? length + 2 : 2;
  }
  return { width: null, height: null };
}

function readWebpDimensions(
  bytes: Uint8Array,
): { width: number | null; height: number | null } {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + readUint24Le(bytes, 24),
      height: 1 + readUint24Le(bytes, 27),
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      width: 1 + ((((bytes[22] ?? 0) & 0x3f) << 8) | (bytes[21] ?? 0)),
      height:
        1 +
        ((((bytes[24] ?? 0) & 0x0f) << 10) |
          ((bytes[23] ?? 0) << 2) |
          (((bytes[22] ?? 0) & 0xc0) >> 6)),
    };
  }
  if (
    chunk === "VP8 " &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: readUint16Le(bytes, 26) & 0x3fff,
      height: readUint16Le(bytes, 28) & 0x3fff,
    };
  }
  return { width: null, height: null };
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) << 24) >>> 0) +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0);
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function normalizeMimeType(value: string | null): string | null {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

function normalizeImageMime(value: string): string {
  return value === "image/jpg" ? "image/jpeg" : value;
}

function isImageUrl(url: string): boolean {
  return isImageFilename(new URL(url).pathname);
}

function isImageFilename(value: string): boolean {
  return /\.(?:png|jpe?g|gif|webp)$/i.test(value);
}

function isLoginResponse(bytes: Uint8Array, contentType: string | null): boolean {
  if (
    contentType !== "text/html" &&
    contentType !== "application/json" &&
    !contentType?.endsWith("+json")
  ) {
    return false;
  }

  const text = new TextDecoder().decode(bytes.slice(0, 16_384));
  if (contentType === "text/html") {
    return /<title[^>]*>[^<]*(?:login|登录)/i.test(text) ||
      /<input[^>]+type=["']?password/i.test(text) ||
      /\/identity\/(?:login|authorize)/i.test(text);
  }

  return /"(?:login_url|loginUrl|login)"\s*:/i.test(text) ||
    /login required|authentication required|not logged in|请先登录|未登录/i.test(text);
}

function expiredImageError(): AppError {
  return new AppError(
    "RESOURCE_DOWNLOAD_FAILED",
    "ONES image download did not return a decodable image. The signed URL may have expired; use download_ones_resource_by_id with resource_id to refresh it.",
  );
}

function extractFilename(response: Response, url: string): string | null {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
  const encoded = match?.[1] ?? match?.[2] ?? null;
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return filenameFromUrl(url);
}

function filenameFromUrl(url: string): string | null {
  const segment = new URL(url).pathname.split("/").filter(Boolean).at(-1);
  if (!segment) {
    return null;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function resolveHttpUrl(value: string, baseUrl: string): string {
  const resolved = new URL(value, baseUrl);
  if (!/^https?:$/.test(resolved.protocol)) {
    throw new AppError("UPSTREAM_ERROR", "ONES attachment lookup returned an invalid URL");
  }
  return resolved.toString();
}

function isUrlLike(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function resourceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

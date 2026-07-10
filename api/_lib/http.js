const DEFAULT_BODY_LIMIT = 32 * 1024;

export class HttpError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
  }
}

export function setPrivateHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

export function requireMethod(request, response, method) {
  if (request.method === method) return;
  response.setHeader("Allow", method);
  throw new HttpError("METHOD_NOT_ALLOWED", 405);
}

export function getHeader(request, name) {
  const target = name.toLowerCase();
  const entry = Object.entries(request.headers ?? {}).find(
    ([key]) => key.toLowerCase() === target
  );
  const value = entry?.[1];
  return Array.isArray(value) ? value[0] : value;
}

export function getQueryParam(request, name) {
  const value = request.query?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function readJsonBody(request, maxBytes = DEFAULT_BODY_LIMIT) {
  const contentType = getHeader(request, "content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError("UNSUPPORTED_MEDIA_TYPE", 415);
  }

  const declaredLength = Number(getHeader(request, "content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError("REQUEST_TOO_LARGE", 413);
  }

  let body = request.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > maxBytes) {
      throw new HttpError("REQUEST_TOO_LARGE", 413);
    }
    try {
      body = JSON.parse(body);
    } catch {
      throw new HttpError("INVALID_JSON", 400);
    }
  } else if (Buffer.byteLength(JSON.stringify(body ?? {}), "utf8") > maxBytes) {
    throw new HttpError("REQUEST_TOO_LARGE", 413);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError("INVALID_JSON", 400);
  }
  return body;
}

export function getRemoteIp(request) {
  const forwarded = getHeader(request, "x-forwarded-for");
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return request.socket?.remoteAddress;
}

export function sendHttpError(response, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === "string" ? error.code : "INTERNAL_ERROR";
  return response.status(status).json({ error: { code } });
}

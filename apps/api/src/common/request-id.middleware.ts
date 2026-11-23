import { randomUUID } from 'node:crypto';

interface IdRequest {
  headers: Record<string, string | string[] | undefined>;
  id?: string;
}
interface IdResponse {
  setHeader(name: string, value: string): unknown;
}

// Only well-formed ids are echoed; anything else is replaced to avoid log/header injection.
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function requestIdMiddleware(req: IdRequest, res: IdResponse, next: () => void): void {
  const supplied = req.headers['x-request-id'];
  const id = typeof supplied === 'string' && SAFE_ID.test(supplied) ? supplied : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

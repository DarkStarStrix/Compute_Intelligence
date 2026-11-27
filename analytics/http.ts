/** Read bounded input before parsing; never log request bodies. */
export interface BoundedBody {
  headers: { get(name: string): string | null };
  body: {
    cancel(reason?: unknown): Promise<void>;
    getReader(): {
      read(): Promise<{ done?: boolean; value?: Uint8Array }>;
      cancel(reason?: unknown): Promise<void>;
      releaseLock(): void;
    };
  } | null;
}
export async function readBounded(request: BoundedBody, maxBytes: number) {
  if (Number(request.headers.get("Content-Length")) > maxBytes)
    throw new Error("size");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) throw new Error("body");
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

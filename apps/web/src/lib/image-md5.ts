import { createHash } from "crypto";

export function md5Buffer(buf: Buffer | Uint8Array): string {
  return createHash("md5").update(buf).digest("hex");
}

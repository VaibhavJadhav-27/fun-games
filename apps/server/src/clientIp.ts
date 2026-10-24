/**
 * The visitor's IP for rate limiting. Behind a hosting proxy (Render, Fly…) the socket
 * address is the proxy's, the same for everyone, so we read X-Forwarded-For instead.
 *
 * `trustedHops` is how many proxies we sit behind. Each proxy appends the address it saw,
 * so the client is the entry that many places from the end. Entries before it were
 * written by the client and can be faked; we never read them. 0 = no proxy: use the socket.
 */
export function clientIp(
  socketAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedHops: number,
): string {
  const fallback = socketAddress ?? 'unknown';
  if (trustedHops <= 0 || forwardedFor === undefined) return fallback;
  const chain = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - trustedHops] ?? chain[0] ?? fallback;
}

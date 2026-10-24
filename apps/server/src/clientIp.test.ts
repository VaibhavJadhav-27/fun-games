import { describe, expect, it } from 'vitest';
import { clientIp } from './clientIp';

describe('clientIp', () => {
  it('uses the socket address when no proxy is trusted', () => {
    expect(clientIp('10.0.0.1', '1.2.3.4', 0)).toBe('10.0.0.1');
    expect(clientIp(undefined, undefined, 0)).toBe('unknown');
  });

  it('takes the address the trusted proxy appended, ignoring what the client wrote', () => {
    expect(clientIp('10.0.0.1', '203.0.113.7', 1)).toBe('203.0.113.7');
    // A client faking the header: the proxy appends the real address last.
    expect(clientIp('10.0.0.1', '6.6.6.6, 203.0.113.7', 1)).toBe('203.0.113.7');
    // Two proxies (e.g. Cloudflare in front of Render).
    expect(clientIp('10.0.0.1', '6.6.6.6, 203.0.113.7, 172.16.0.9', 2)).toBe('203.0.113.7');
    expect(clientIp('10.0.0.1', ['203.0.113.7'], 1)).toBe('203.0.113.7');
  });

  it('falls back to the socket address without a header', () => {
    expect(clientIp('10.0.0.1', undefined, 1)).toBe('10.0.0.1');
    expect(clientIp('10.0.0.1', '', 1)).toBe('10.0.0.1');
  });
});

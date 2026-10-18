import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from './Button';

export function SharePanel({ code }: { code: string }) {
  const url = `${window.location.origin}/r/${code}`;
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const canShare = typeof navigator.share === 'function';

  useEffect(() => {
    if (!showQr || qr) return;
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#0b0b14', light: '#ffffff' } })
      .then((data) => {
        if (!cancelled) setQr(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showQr, qr, url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Join my party game', text: `Room ${code}`, url });
    } catch {
      // User cancelled the share sheet.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="truncate rounded-2xl bg-panel-2 px-4 py-3 text-sm text-muted select-all">{url}</p>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={copy}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        <Button variant="secondary" onClick={share} disabled={!canShare}>
          Share
        </Button>
        <Button variant="secondary" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
          QR
        </Button>
      </div>
      {showQr && (
        <div className="flex justify-center rounded-2xl bg-white p-3">
          {qr ? (
            <img src={qr} alt={`QR code for room ${code}`} width={240} height={240} />
          ) : (
            <div className="size-60" />
          )}
        </div>
      )}
    </div>
  );
}

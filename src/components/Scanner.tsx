import { useEffect, useRef, useState } from 'react';
import { isValidBarcode, lookupBarcode } from '../lib/off';
import type { Food } from '../lib/types';
import { Icon, Sheet } from './ui';

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (Native) return new Native({ formats: FORMATS });
  // Safari/iOS and desktop Firefox lack BarcodeDetector: use the ZXing-based ponyfill.
  const { BarcodeDetector } = await import('barcode-detector/ponyfill');
  return new BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector;
}

export default function Scanner({ onClose, onFound, onReadLabel }: { onClose: () => void; onFound: (f: Food) => void; onReadLabel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'scanning' | 'looking' | 'not-found' | 'no-camera' | 'offline' | 'error'>('starting');
  const [code, setCode] = useState('');

  const lookup = async (barcode: string) => {
    setCode(barcode);
    setState('looking');
    const r = await lookupBarcode(barcode);
    if (r.ok) {
      navigator.vibrate?.(40);
      onFound(r.food);
    } else setState(r.reason === 'offline' ? 'offline' : r.reason === 'not-found' ? 'not-found' : 'error');
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (stopped) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const detector = await makeDetector();
        setState('scanning');
        const tick = async () => {
          if (stopped) return;
          try {
            const found = (await detector.detect(v)).map((b) => b.rawValue).find(isValidBarcode);
            if (found) {
              stream?.getTracks().forEach((t) => t.stop());
              stopped = true;
              lookup(found);
              return;
            }
          } catch {
            /* frame not ready */
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        if (!stopped) setState('no-camera');
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const message = {
    starting: 'Starting camera…',
    scanning: 'Point at the barcode. Hold steady.',
    looking: `Looking up ${code}…`,
    'not-found': `${code} isn’t in Open Food Facts yet. Read the label with AI instead?`,
    'no-camera': 'Camera not available. Type the numbers under the barcode instead.',
    offline: 'You’re offline. Barcode lookups need the internet.',
    error: 'Lookup failed. Try again.',
  }[state];

  return (
    <Sheet onClose={onClose} label="Scan barcode">
      <div className="between">
        <h2 className="h2" style={{ fontSize: 26 }}>Scan barcode</h2>
        <button className="btn icon sm" style={{ width: 36 }} aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      {state !== 'no-camera' && <video ref={video} className="video" playsInline muted aria-label="Camera preview" />}
      <p className="small mut" role="status">{message}</p>
      {state === 'not-found' && <button className="btn primary block" onClick={onReadLabel}><Icon name="label" size={18} /> Read the label with AI</button>}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (isValidBarcode(code)) lookup(code.trim());
        }}
      >
        <label className="field grow">
          <span>Or type the barcode</span>
          <input className="input" inputMode="numeric" pattern="[0-9]*" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="9300000000000" />
        </label>
        <button className="btn" type="submit" style={{ alignSelf: 'flex-end', minHeight: 48 }} disabled={!isValidBarcode(code)}>Look up</button>
      </form>
      <p className="mono dim">Data: Open Food Facts · free, no account</p>
    </Sheet>
  );
}

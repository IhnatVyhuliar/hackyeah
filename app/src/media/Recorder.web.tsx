// Browser-only stand-in: expo-camera cannot record on web. MediaRecorder records the camera, or a generated
// test picture when the browser has no camera (automated click-through). MP4 only: server/ media accepts video/mp4.
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { LIMIT_S, type RecMode } from './brief';
import { RecOverlay } from './RecOverlay';

const MIME = ['video/mp4;codecs=avc1', 'video/mp4'];

function testPicture(canvas: HTMLCanvasElement, mode: RecMode): () => void {
  const g = canvas.getContext('2d')!;
  const t0 = Date.now();
  const iv = setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    g.fillStyle = '#14141A';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#9945FF';
    g.fillRect(40 + ((t * 120) % (canvas.width - 120)), canvas.height / 2 - 40, 80, 80);
    g.fillStyle = '#FFFFFF';
    g.font = '28px sans-serif';
    g.fillText(`Nagranie testowe · ${mode} · ${new Date().toLocaleTimeString('pl-PL')}`, 32, 56);
  }, 33);
  return () => clearInterval(iv);
}

export function Recorder({ mode, onDone, onCancel }: {
  mode: RecMode; onDone: (uri: string, qrPayload: string | null, secs: number) => void; onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const started = useRef<number | null>(null);
  const [source, setSource] = useState<'kamera' | 'obraz testowy' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stopDrawing: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        setSource('kamera');
      } catch {
        if (cancelled || !canvas.current) return;
        stopDrawing = testPicture(canvas.current, mode);
        stream.current = canvas.current.captureStream(30);
        setSource('obraz testowy');
      }
    })();
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => {
      cancelled = true;
      clearInterval(iv);
      stopDrawing?.();
      if (rec.current?.state === 'recording') rec.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  const start = () => {
    const mime = MIME.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
    if (!mime) return setError('Ta przeglądarka nie nagrywa MP4 – użyj Chrome albo telefonu.');
    if (!stream.current || started.current) return;
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream.current, { mimeType: mime });
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      const secs = Math.round((Date.now() - (started.current ?? Date.now())) / 1000);
      started.current = null;
      onDone(URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' })), null, secs);
    };
    r.start(1000);
    rec.current = r;
    started.current = Date.now();
    setNow(Date.now());
    setTimeout(() => { if (r.state === 'recording') r.stop(); }, LIMIT_S * 1000);
  };

  const el = started.current ? Math.floor((now - started.current) / 1000) : 0;
  return (
    <View style={{ flex: 1, backgroundColor: '#0E0E12' }}>
      <video ref={video} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: source === 'kamera' ? 'block' : 'none' }} />
      <canvas ref={canvas} width={1280} height={720} style={{ width: '100%', height: '100%', objectFit: 'contain', display: source === 'obraz testowy' ? 'block' : 'none' }} />
      <RecOverlay mode={mode} el={el} recording={!!started.current} qrSeen={false} source={source ?? '…'} error={error}
        onStart={start} onStop={() => rec.current?.stop()} onCancel={onCancel} />
    </View>
  );
}

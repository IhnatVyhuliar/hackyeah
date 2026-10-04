// In-app recording only (no gallery): 720p, max 120 s, sha256 later from the file. While recording the unboxing,
// the first UNBOX1… QR seen is kept; if none, the caller falls back to a scan right after (CLAUDE.md §6 spike).
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { LIMIT_S, QR_PREFIX, type RecMode } from './brief';
import { Permission } from './Permission';
import { RecOverlay } from './RecOverlay';

export function Recorder({ mode, onDone, onCancel }: {
  mode: RecMode; onDone: (uri: string, qrPayload: string | null, secs: number) => void; onCancel: () => void;
}) {
  const cam = useRef<CameraView>(null);
  const [perm, askPerm] = useCameraPermissions();
  const [mic, askMic] = useMicrophonePermissions();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const qr = useRef<string | null>(null);
  const [qrSeen, setQrSeen] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);

  if (!perm || !mic) return <View style={{ flex: 1, backgroundColor: '#0E0E12' }} />;
  if (!perm.granted || !mic.granted) return <Permission mic ask={async () => { await askPerm(); await askMic(); }} onCancel={onCancel} />;

  const el = started.current ? Math.floor((now - started.current) / 1000) : 0;
  const start = async () => {
    if (!cam.current || !ready || started.current) return;
    started.current = Date.now();
    setNow(Date.now());
    try {
      const v = await cam.current.recordAsync({ maxDuration: LIMIT_S });
      const secs = Math.round((Date.now() - (started.current ?? Date.now())) / 1000);
      if (v?.uri) onDone(v.uri, qr.current, secs);
      else setError('Nagranie się nie zapisało. Spróbuj jeszcze raz.');
    } catch {
      setError('Nagrywanie przerwane. Spróbuj jeszcze raz.');
    } finally {
      started.current = null;
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#0E0E12' }}>
      <CameraView ref={cam} style={{ flex: 1 }} facing="back" mode="video" videoQuality="720p" mute onCameraReady={() => setReady(true)}
        barcodeScannerSettings={mode === 'unboxing' ? { barcodeTypes: ['qr'] } : undefined}
        onBarcodeScanned={mode === 'unboxing' ? ({ data }) => {
          if (!qr.current && started.current && data?.startsWith(QR_PREFIX)) { qr.current = data; setQrSeen(true); }
        } : undefined} />
      <RecOverlay mode={mode} el={el} recording={!!started.current} qrSeen={qrSeen} error={error}
        onStart={start} onStop={() => cam.current?.stopRecording()} onCancel={onCancel} />
    </View>
  );
}

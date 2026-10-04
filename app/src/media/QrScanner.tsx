// Scans the one-time card (fallback right after the unboxing recording, and the seller's return card).
import React, { useRef } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Permission } from './Permission';

export function QrScanner({ prefix, onScan, onCancel }: { prefix: string; onScan: (payload: string) => void; onCancel: () => void }) {
  const [perm, ask] = useCameraPermissions();
  const done = useRef(false);
  if (!perm) return <View style={{ flex: 1, backgroundColor: '#0E0E12' }} />;
  if (!perm.granted) return <Permission ask={ask} onCancel={onCancel} />;
  return (
    <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={({ data }) => {
        if (done.current || !data?.startsWith(prefix)) return;
        done.current = true;
        onScan(data.trim());
      }} />
  );
}

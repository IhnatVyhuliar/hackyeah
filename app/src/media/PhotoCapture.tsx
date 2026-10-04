// Listing photos straight from the camera (no gallery), like the recordings.
import React, { useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Icon } from '../ui';
import { Permission } from './Permission';

export function PhotoCapture({ onPhoto, onCancel }: { onPhoto: (uri: string) => void; onCancel: () => void }) {
  const cam = useRef<CameraView>(null);
  const [perm, ask] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  if (!perm) return <View style={{ flex: 1, backgroundColor: '#0E0E12' }} />;
  if (!perm.granted) return <Permission ask={ask} onCancel={onCancel} />;
  const shoot = async () => {
    if (!cam.current || busy) return;
    setBusy(true);
    try {
      const p = await cam.current.takePictureAsync({ quality: 0.7 });
      if (p?.uri) onPhoto(p.uri);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#0E0E12' }}>
      <CameraView ref={cam} style={{ flex: 1 }} mode="picture" />
      <Pressable onPress={onCancel} style={{ position: 'absolute', top: 16, left: 16, width: 44, height: 44, borderRadius: 44, backgroundColor: 'rgba(5,5,7,0.72)', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={22} color="#FFFFFF" /></Pressable>
      <Pressable accessibilityLabel="Zrób zdjęcie" onPress={shoot} style={{ position: 'absolute', bottom: 32, alignSelf: 'center', width: 78, height: 78, borderRadius: 78, borderWidth: 4, borderColor: '#FFFFFF', opacity: busy ? 0.4 : 1 }} />
    </View>
  );
}

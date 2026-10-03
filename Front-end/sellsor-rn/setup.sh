#!/usr/bin/env bash
# Creates a fresh Expo project (current SDK) and drops the Sellsor screens into it.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
npx create-expo-app@latest sellsor-app --template blank-typescript --yes
cp -R "$HERE/App.tsx" "$HERE/app.json" "$HERE/src" sellsor-app/
cd sellsor-app
npx expo install expo-font expo-status-bar react-native-svg react-native-safe-area-context \
  @expo-google-fonts/space-grotesk @expo-google-fonts/jetbrains-mono lucide-react-native
echo "Gotowe. Uruchom: cd sellsor-app && npx expo start"

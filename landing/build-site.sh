#!/usr/bin/env bash
# Builds the static site served at vibecourses.co/sellsor into landing/dist/:
#   index.html + assets/   the landing (laid out for laptops)
#   app/                   web export of the app (app/, demo engine); phones are sent here
# The Expo project is generated in landing/.build/ (gitignored) on the first run and reused afterwards.
# BASE_URL is the path the site is served under (default /sellsor). APP_SRC is the app to build
# (default app/, working tree included); point it at e.g. `git archive HEAD app` to leave out local edits.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SRC="${APP_SRC:-$HERE/../app}"
BASE_URL="${BASE_URL:-/sellsor}"
WORK="$HERE/.build"
APP="$WORK/sellsor-app"
OUT="$HERE/dist"
# Same Expo SDK as app/ (e.g. "~57.0.26" -> 57); a different SDK recreates the project.
SDK="$(node -p 'require(process.argv[1]).dependencies.expo.match(/\d+/)[0]' "$APP_SRC/package.json")"

if [ ! -d "$APP/node_modules" ] || [ "$(cat "$WORK/sdk" 2>/dev/null)" != "$SDK" ]; then
  echo "==> Creating Expo SDK $SDK project in $APP"
  rm -rf "$WORK" && mkdir -p "$WORK"
  (cd "$WORK" && npx --yes create-expo-app@latest sellsor-app --template "blank-typescript@sdk-$SDK" --yes)
  (cd "$APP" && npx expo install expo-font expo-status-bar react-native-svg react-native-safe-area-context \
    @expo-google-fonts/space-grotesk @expo-google-fonts/jetbrains-mono lucide-react-native \
    buffer react-native-get-random-values react-dom react-native-web @expo/metro-runtime)
  echo "$SDK" > "$WORK/sdk"
fi

echo "==> Copying app sources"
rm -rf "$APP/src"
cp -R "$APP_SRC/index.ts" "$APP_SRC/polyfills.ts" "$APP_SRC/App.tsx" "$APP_SRC/src" "$APP/"
node -e '
  const fs = require("fs");
  const [src, dst, base] = process.argv.slice(1);
  const a = JSON.parse(fs.readFileSync(src, "utf8"));
  a.expo.experiments = { ...a.expo.experiments, baseUrl: base };
  a.expo.web = { ...a.expo.web, output: "single", bundler: "metro" };
  delete a.expo.plugins;  // config plugins only affect native builds, and not all of them are installed here
  fs.writeFileSync(dst, JSON.stringify(a, null, 2));
' "$APP_SRC/app.json" "$APP/app.json" "$BASE_URL/app"

echo "==> Exporting web build"
rm -rf "$WORK/web"
(cd "$APP" && npx expo export -p web --output-dir "$WORK/web" --clear)

# Polish UI. Wide screens keep the app at phone width instead of stretching it; on a computer it is an
# iPhone 16 Pro Max screen (440 x 956 pt) in a frame, shrunk to the window height when needed.
node -e '
  const fs = require("fs");
  const p = process.argv[1];
  let s = fs.readFileSync(p, "utf8");
  s = s.replace("<html lang=\"en\">", "<html lang=\"pl\">");
  s = s.replace("<title>", "<meta name=\"theme-color\" content=\"#0B0B0F\" />\n    <title>");
  s = s.replace("</style>", `  html, body { background: #050507; }
      #root { position: relative; max-width: 440px; margin: 0 auto; background: #0B0B0F; }
      @media (hover: hover) and (pointer: fine) and (min-width: 600px) {
        body { display: flex; overflow: auto; }
        #root {
          flex: none; margin: auto; max-width: none; height: auto; aspect-ratio: 440 / 956;
          width: clamp(320px, calc((100vh - 68px) * 440 / 956), 440px);
          border: 10px solid #1D1D24; border-radius: 52px; overflow: hidden;
        }
      }
    </style>`);
  fs.writeFileSync(p, s);
' "$WORK/web/index.html"

echo "==> Assembling $OUT"
rm -rf "$OUT" && mkdir -p "$OUT"
cp -R "$HERE/index.html" "$HERE/assets" "$OUT/"
cp -R "$WORK/web" "$OUT/app"
du -sh "$OUT"
echo "==> Done"

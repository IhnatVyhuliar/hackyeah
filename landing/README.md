# Landing + web demo

Live at **https://vibecourses.co/sellsor/**.

- `index.html` + `assets/` — the landing, unpacked from the Claude Design export (`Sellsor Landing.html`). It is laid out for laptops.
- Phones and small tablets (`pointer: coarse` and width ≤ 1000 px) are redirected to `app/`, a web export of `app/` (its demo engine with mocked transactions; the screens do not use `app/src/solana/` yet). `?landing` keeps the landing on a phone.

## Build

```
landing/build-site.sh            # → landing/dist/ (landing + app/), served under /sellsor
BASE_URL=/other landing/build-site.sh
```

The first run generates a separate Expo project in `landing/.build/` (gitignored, a few minutes) and installs the UI dependencies plus `react-native-web`; later runs reuse it. `app/` itself is not changed. Once the screens import `app/src/solana/` (`@unbox/shared`, `expo-secure-store`), this build needs those dependencies and a web fallback for the wallet.

## Deploy

The site lives in the vibecourses repo, which deploys `website/` on every push to `main`:

```
rsync -a --delete landing/dist/ ~/vibeCourses/website/public_html/sellsor/
cd ~/vibeCourses && git add website/public_html/sellsor && git commit -m "Sellsor: update" && git push
```

That deploy mirrors the repo with `--delete`, so files uploaded to the server by hand disappear on the next push.

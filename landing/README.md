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

Automatic: every push to `main` that touches `landing/`, `app/` or the workflow runs `.github/workflows/deploy-sellsor.yml`. It only starts the `Sellsor` workflow in `MaciejLazarczyk/vibecourses`, which builds this repo's `main` with `landing/build-site.sh` (no secrets in that job), accepts only static files (no `.php`, no dotfiles), commits them to `website/public_html/sellsor/` and starts that repo's FTP deploy. A full run takes about 5 minutes.

The trigger needs the `VIBECOURSES_DISPATCH_TOKEN` secret here: a fine-grained token for `MaciejLazarczyk/vibecourses` only, with **Actions: Read and write** and nothing else. Without it the workflow only prints a warning.

By hand, from a machine with push access to vibecourses:

```
rsync -a --delete landing/dist/ ~/vibeCourses/website/public_html/sellsor/
cd ~/vibeCourses && git add website/public_html/sellsor && git commit -m "Sellsor: update" && git push
```

The vibecourses deploy mirrors that repo with `--delete`, so files uploaded to the server by hand disappear on the next push.

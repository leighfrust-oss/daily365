# Daily365

Makes a daily vertical video: a progress bar that restarts at 0 and fills up to today's day
(out of 365), then today's song and movie. The progress bar has its own sound, recorded into the video.

One codebase, two ways to run it:

- **Windows app (Electron):** `npm install`, then `npm start`.
- **Android / any browser (installable web app):** the same `renderer/` folder, published with GitHub Pages.

## Windows

```powershell
npm install
npm start
```

## Android (web app)

1. Push this project to a public GitHub repo named `daily365` on the `main` branch.
2. In the repo: Settings, Pages, Build and deployment, Source: **GitHub Actions**.
3. Open the Actions tab and run "Deploy web app" (re-run it if the first run failed because Pages was not enabled yet).
4. On the phone, open `https://<your-username>.github.io/daily365/` in Chrome, then menu, **Install app**.

Try it on your PC first with `npm run web:serve` and open http://localhost:8080.

Picks are saved on each device separately. Move them with **Export JSON** on one and **Import JSON** on the other.

## Where things live

| File | Job |
| --- | --- |
| `main.js` | Electron window, saving data, save and open dialogs |
| `preload.js` | The only bridge from the Electron UI to the main process |
| `renderer/platform.js` | Everything that differs between Windows and the browser (storage, saving video, share, install) |
| `renderer/render.js` | Draws one video frame. `TL` at the top controls the timing |
| `renderer/audio.js` | Progress bar sound (ticks, rising tone, off) |
| `renderer/recorder.js` | Records the canvas and sound to MP4 or WebM |
| `renderer/app.js` | Create tab, Plan tab, playback |
| `renderer/sw.js`, `manifest.webmanifest`, `icon-*.png` | Make the web app installable and work offline |
| `.github/workflows/pages.yml` | Publishes `renderer/` as the web app on every push |
| `sample/picks-sample.json` | Format for Import JSON |

To add a feature that needs the operating system, add it to both branches of `renderer/platform.js`
(and to `preload.js` and `main.js` for Windows).

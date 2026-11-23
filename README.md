# Construction Sim

A top-down 2D landscaping and construction business sim that runs in the browser and is hosted on GitHub Pages.

The full game design lives in [`docs/DESIGN.md`](docs/DESIGN.md).

## Run it locally

It is plain HTML, CSS and JavaScript modules with no build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploying

Pushing to `main` runs `.github/workflows/pages.yml`, which publishes the site to GitHub Pages. In the repository settings, Pages must be set to deploy from **GitHub Actions**.

## Installing on a phone

Open the site, then use **Add to Home Screen** (iPhone: Share menu, Android: browser menu). It launches full screen and works offline after the first load.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/` | The page and styles |
| `js/config.js` | Tunable values (pace, truck speed) |
| `js/world/` | The town: map data and pathfinding |
| `js/game/` | Clock, truck and drawing |
| `sw.js`, `manifest.webmanifest` | Offline support and installability |
| `docs/DESIGN.md` | The design document |

## Status

Slice 1: title screen, installable shell, a small town with addresses, and a truck that drives to them.

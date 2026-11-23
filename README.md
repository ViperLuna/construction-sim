# Construction Sim

A top-down 2D landscaping and construction business sim that runs in the browser and is hosted on GitHub Pages.

The full game design lives in [`docs/DESIGN.md`](docs/DESIGN.md).

## Run it locally

It is plain HTML, CSS and JavaScript modules with no build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Tests

The game logic (money, scheduling, a full working day, truck driving) is covered by tests that need no browser:

```bash
node --test tests/*.test.mjs
```

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
| `js/game/` | Clock, money, scheduling and job running, truck, drawing |
| `js/data/` | Content as data (job types) |
| `tests/` | Logic tests |
| `sw.js`, `manifest.webmanifest` | Offline support and installability |
| `docs/DESIGN.md` | The design document |

## Status

Slice 3 (part 1): hiring. Slice 2: the first real job. Accept mowing jobs from a daily list, the truck drives out, stripes appear on the lawn as it's mowed, you get paid, and the crew clocks out at 5 PM. End Day skips to the next morning.

New: a Crew screen with a daily pool of applicants, wage offers, payroll at End Day, XP and stat points. Placeholder for now: the town map, one truck, and three simple job types. See `docs/DESIGN.md` for where it's going.

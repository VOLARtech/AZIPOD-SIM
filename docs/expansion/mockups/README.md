# Expansion mockups

Design targets for [`../PLAN.md`](../PLAN.md), drawn from code with the app's own palettes and fonts. They are not screenshots of the app; the values on screen are illustrative.

```bash
npm ci                                   # fonts come from node_modules/@fontsource
node docs/expansion/mockups/render.mjs   # all; or pass part of a name, e.g. `render.mjs 02 tug`
```

- `lib.mjs`: palettes, chart background, hull shapes, and the widget set (telegraph, gauge, rudder indicator, lever, azimuth combi-lever, VSP pad, tunnel thruster, plan-view layout glyphs, side profiles)
- `pages.mjs`: one function per screen
- `html/`: the generated pages, `*.png`: rendered at 1.5× (2160 × 1350)

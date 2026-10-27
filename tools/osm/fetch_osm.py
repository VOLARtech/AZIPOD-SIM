#!/usr/bin/env python3
"""Fetch OpenStreetMap features for the 3D harbour scenery (buildings, green areas, roads, cranes).
Runs in GitHub Actions. Data © OpenStreetMap contributors, ODbL 1.0.
usage: fetch_osm.py S W N E out.json"""
import json, sys, time, urllib.parse, urllib.request
S, W, N, E = sys.argv[1:5]; out = sys.argv[5]
bb = f'{S},{W},{N},{E}'
q = f"""[out:json][timeout:240];
(
  way["building"]({bb}); relation["building"]({bb}); way["building:part"]({bb});
  way["leisure"~"^(park|pitch|golf_course|garden|playground|stadium)$"]({bb});
  way["landuse"~"^(grass|recreation_ground|village_green|forest|meadow|cemetery)$"]({bb});
  way["natural"~"^(wood|scrub|grassland|beach|sand)$"]({bb});
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|tertiary|residential|unclassified|service)$"]({bb});
  node["man_made"="crane"]({bb}); way["man_made"="crane"]({bb});
  node["natural"="tree"]({bb});
);
out body geom qt;"""
for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']:
    try:
        req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': 'azipod-bridge-osm-fetch/1.0 (github.com/VOLARtech/AZIPOD-SIM)'})
        d = urllib.request.urlopen(req, timeout=300).read()
        js = json.loads(d)
        json.dump(js, open(out, 'w'), separators=(',', ':'))
        kinds = {}
        for el in js['elements']:
            t = el.get('tags', {})
            k = 'building' if ('building' in t or 'building:part' in t) else 'highway' if 'highway' in t else 'crane' if t.get('man_made') == 'crane' else 'tree' if t.get('natural') == 'tree' else 'green'
            kinds[k] = kinds.get(k, 0) + 1
        print(f'::notice::{url}: {len(js["elements"])} elements {kinds} {len(d)//1024} KB')
        break
    except Exception as ex:
        print(f'::warning::{url} failed: {ex}'); time.sleep(5)
else:
    sys.exit(1)

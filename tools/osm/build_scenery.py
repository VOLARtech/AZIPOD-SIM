#!/usr/bin/env python3
"""Build the 3D harbour scenery (land, buildings, green areas, roads and bridges, trees, cranes).

Land comes from the NOAA ENC (band 5 where it exists, band 4 around it), everything else from
OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0). Same local frame as build_chart.py.
usage: build_scenery.py <enc-dir> <osm.json> <out.bin>

format 'SCN1' (little endian, coordinates i16 × 0.25 m as [n, e]):
  land:   u16 nPoly, per poly: u8 nRings, per ring: u16 n, n×(i16 n, i16 e)
  bldg:   u32 nB, per building: u16 n, u16 h0, u16 h1 (×0.1 m), u8 style, u8 seed, n×(i16, i16)
  green:  u16 nG, per area: u8 kind, u8 nRings, per ring: u16 n, coords
  roads:  u16 nR, per road: u8 width (×0.5 m), u8 deck height (m, 0 = on land), u16 n, coords
  trees:  u16 nT, nT×(i16, i16, u8 height)
  cranes: u16 nC, nC×(i16, i16, i16 boom bearing ×0.01 rad, u8 outreach m)
"""
import glob, json, math, re, struct, sys
import numpy as np
from shapely.geometry import shape, box, Polygon, LineString, Point, MultiPolygon
from shapely.ops import unary_union, transform
from shapely.strtree import STRtree
import shapely

ENC, OSM, OUT = sys.argv[1:4]
ORIGIN = (25.775, -80.165)
BOX = (-80.215, 25.745, -80.110, 25.805)              # W S E N
a, f = 6378137.0, 1 / 298.257223563
e2 = f * (2 - f); phi = math.radians(ORIGIN[0])
KLAT = a * (1 - e2) / (1 - e2 * math.sin(phi) ** 2) ** 1.5 * math.pi / 180
KLON = a / math.sqrt(1 - e2 * math.sin(phi) ** 2) * math.cos(phi) * math.pi / 180
proj = lambda x, y, z=None: ((np.asarray(x) - ORIGIN[1]) * KLON, (np.asarray(y) - ORIGIN[0]) * KLAT)
P = lambda g: transform(proj, g)
reg_ll = box(*BOX); reg = P(reg_ll)

def enc(L, cells):
    out = []
    for fn in sorted(glob.glob(f'{ENC}/{cells}_{L}.geojson')):
        for ft in json.load(open(fn))['features']:
            g = shape(ft['geometry'])
            if not g.is_empty and g.intersects(reg_ll): out.append(P(g))
    return out
polys = lambda g: [] if g.is_empty else [g] if isinstance(g, Polygon) else [p for q in getattr(g, 'geoms', []) for p in polys(q)]

# ---------------------------------------------------------------- land: band 5 inside its coverage, band 4 elsewhere
L5 = unary_union([g for g in enc('LNDARE', 'US5*') if g.geom_type in ('Polygon', 'MultiPolygon')])
cov5 = unary_union([g for L in ('DEPARE', 'DRGARE', 'LNDARE') for g in enc(L, 'US5*') if g.geom_type in ('Polygon', 'MultiPolygon')]).buffer(1)
L4 = unary_union([g for g in enc('LNDARE', 'US4*') if g.geom_type in ('Polygon', 'MultiPolygon')])
land = unary_union([L5, L4.difference(cov5)]).intersection(reg).buffer(0).simplify(0.6)
land = unary_union([p for p in polys(land) if p.area > 50])
print('land km2', round(land.area / 1e6, 2))
landT = STRtree(polys(land)); landP = polys(land)
on_land = lambda pt, tol=0: any(landP[i].buffer(tol).contains(pt) if tol else landP[i].contains(pt) for i in landT.query(pt))

# ---------------------------------------------------------------- OSM
els = json.load(open(OSM))['elements']
def ring_of(geom): return [(p['lon'], p['lat']) for p in geom]
def num(v):
    if v is None: return None
    m = re.match(r'\s*([0-9]+(?:\.[0-9]+)?)\s*(m|ft|\')?', str(v))
    if not m: return None
    x = float(m.group(1)); return x * 0.3048 if m.group(2) in ('ft', "'") else x
DEFAULT_H = {'house': 7, 'detached': 7, 'residential': 12, 'apartments': 18, 'semidetached_house': 7, 'terrace': 8, 'garage': 3.5,
             'garages': 3.5, 'shed': 3, 'roof': 6, 'commercial': 10, 'retail': 7, 'industrial': 11, 'warehouse': 12, 'hotel': 30,
             'office': 20, 'school': 10, 'hospital': 25, 'parking': 12, 'train_station': 8, 'lifeguard_tower': 4, 'church': 14}
STYLE = {'house': 1, 'detached': 1, 'semidetached_house': 1, 'terrace': 1, 'residential': 2, 'apartments': 2, 'hotel': 2,
         'commercial': 3, 'retail': 3, 'office': 3, 'industrial': 4, 'warehouse': 4, 'parking': 5, 'roof': 5, 'garage': 5, 'garages': 5}
# style: 0 generic, 1 house, 2 residential tower, 3 commercial, 4 industrial/port shed, 5 parking/canopy, 6 glass tower

bld_raw, parts = [], []
greens, roads, trees, cranes = [], [], [], []
for el in els:
    t = el.get('tags', {})
    geom = el.get('geometry')
    if 'building' in t or 'building:part' in t:
        rings = []
        if el['type'] == 'way' and geom and len(geom) >= 4: rings = [ring_of(geom)]
        elif el['type'] == 'relation':
            rings = [ring_of(m['geometry']) for m in el.get('members', []) if m.get('role') == 'outer' and m.get('geometry') and len(m['geometry']) >= 4]
        for r in rings:
            try: g = P(Polygon(r)).buffer(0)
            except Exception: continue
            if g.is_empty or g.area < 12: continue
            kind = t.get('building') or t.get('building:part')
            h = num(t.get('height'))
            if h is None and t.get('building:levels'): h = float(num(t['building:levels'])) * 3.3 + 1
            if h is None: h = DEFAULT_H.get(kind, 8)
            h0 = num(t.get('min_height'))
            if h0 is None and t.get('building:min_level'): h0 = float(num(t['building:min_level'])) * 3.3
            if kind == 'roof' and h0 is None: h0 = max(0, h - 1)
            rec = (g, float(h0 or 0), float(min(h, 300)), kind)
            (parts if 'building:part' in t else bld_raw).append(rec)
    elif 'highway' in t and geom:
        W = {'motorway': 22, 'motorway_link': 9, 'trunk': 18, 'trunk_link': 8, 'primary': 14, 'primary_link': 7, 'secondary': 11,
             'tertiary': 9, 'residential': 7, 'unclassified': 7, 'service': 4.5}.get(t['highway'], 6)
        ln = P(LineString(ring_of(geom)))
        bridge = t.get('bridge') in ('yes', 'viaduct')
        roads.append((ln, W, bridge, t.get('layer'), t.get('name')))
    elif t.get('man_made') == 'crane' and el['type'] == 'node':
        cranes.append((P(Point(el['lon'], el['lat'])), num(t.get('crane:maxwidth')) or 50))
    elif t.get('natural') == 'tree' and el['type'] == 'node':
        trees.append(P(Point(el['lon'], el['lat'])))
    elif geom and len(geom) >= 4:
        kind = 2 if t.get('natural') in ('beach', 'sand') else 1 if t.get('natural') in ('wood', 'scrub') or t.get('landuse') == 'forest' else 3 if t.get('leisure') in ('pitch', 'stadium') else 0
        try: g = P(Polygon(ring_of(geom))).buffer(0)
        except Exception: continue
        greens.append((g, kind))
print('osm: buildings', len(bld_raw), 'parts', len(parts), 'roads', len(roads), 'greens', len(greens), 'trees', len(trees), 'cranes', len(cranes))

# buildings that have parts are drawn by their parts; everything must stand on land
partT = STRtree([p[0] for p in parts]) if parts else None
def keep(g):
    rp = g.representative_point()
    return reg.contains(rp) and on_land(rp, 6)
bld = []
for g, h0, h, kind in bld_raw:
    if partT is not None and len(partT.query(g, predicate='contains')) > 0: continue
    if keep(g): bld.append((g, h0, h, kind))
bld += [p for p in parts if keep(p[0])]
print('buildings kept', len(bld))

Q = 0.25
def qpt(x, y):
    qn, qe = int(round(y / Q)), int(round(x / Q)); assert abs(qn) < 32767 and abs(qe) < 32767; return qn, qe
def ring_bytes(coords):
    cs = list(coords)
    if len(cs) > 1 and cs[0] == cs[-1]: cs = cs[:-1]
    b = struct.pack('<H', len(cs))
    for x, y in cs: b += struct.pack('<hh', *qpt(x, y))
    return b

out = [b'SCN1']
lp = polys(land)
out.append(struct.pack('<H', len(lp)))
for p in lp:
    rings = [p.exterior] + [r for r in p.interiors if Polygon(r).area > 20]
    out.append(struct.pack('<B', len(rings)))
    for r in rings: out.append(ring_bytes(r.coords))

rng = np.random.default_rng(3)
out.append(struct.pack('<I', len(bld)))
for g, h0, h, kind in bld:
    g = g.simplify(0.5)
    if g.area < 250 and kind in ('house', 'detached', 'yes', 'garage', 'shed'): g = g.minimum_rotated_rectangle
    if g.geom_type != 'Polygon': g = max(polys(g), key=lambda p: p.area) if polys(g) else None
    if g is None: continue
    st = STYLE.get(kind, 0)
    if h >= 45: st = 6
    cs = list(g.exterior.coords)[:-1]
    if Polygon(cs).exterior.is_ccw is False: cs = cs[::-1]
    out.append(struct.pack('<HHHBB', len(cs), int(h0 * 10), int(max(h, h0 + 1) * 10), st, int(rng.integers(0, 256))))
    for x, y in cs: out.append(struct.pack('<hh', *qpt(x, y)))

gl = []
for g, kind in greens:
    for p in polys(g.intersection(land)):
        if p.area > 80: gl.append((p.simplify(0.8), kind))
out.append(struct.pack('<H', len(gl)))
for p, kind in gl:
    if p.geom_type != 'Polygon': continue
    rings = [p.exterior] + list(p.interiors)
    out.append(struct.pack('<BB', kind, len(rings)))
    for r in rings: out.append(ring_bytes(r.coords))

rl = []
for ln, w, bridge, layer, name in roads:
    if bridge:
        seg = ln.intersection(reg)
        deck = 14 if (name and ('Causeway' in name or 'Port Boulevard' in name)) else 9
        for s in ([seg] if seg.geom_type == 'LineString' else list(getattr(seg, 'geoms', []))):
            if s.geom_type == 'LineString' and s.length > 5: rl.append((s.simplify(0.5), w, deck))
    else:
        seg = ln.intersection(land)
        for s in ([seg] if seg.geom_type == 'LineString' else list(getattr(seg, 'geoms', []))):
            if s.geom_type == 'LineString' and s.length > 8: rl.append((s.simplify(1.0), w, 0))
out.append(struct.pack('<H', len(rl)))
for s, w, deck in rl:
    cs = list(s.coords)
    out.append(struct.pack('<BBH', int(w * 2), deck, len(cs)))
    for x, y in cs: out.append(struct.pack('<hh', *qpt(x, y)))

bT = STRtree([b[0] for b in bld])
tl = [t for t in trees if reg.contains(t) and on_land(t) and len(bT.query(t, predicate='intersects')) == 0]
out.append(struct.pack('<H', len(tl)))
for t in tl: out.append(struct.pack('<hhB', *qpt(t.x, t.y), int(rng.integers(6, 13))))

out.append(struct.pack('<H', len(cranes)))
for c, reach in cranes:
    # boom points out over the nearest water
    nearest = land.boundary.interpolate(land.boundary.project(c))
    dx, dy = nearest.x - c.x, nearest.y - c.y
    if land.contains(c): pass
    else: dx, dy = -dx, -dy
    brg = math.atan2(dx, dy)        # bearing (east, north)
    out.append(struct.pack('<hhhB', *qpt(c.x, c.y), int(round(brg * 100)), int(min(255, reach))))

blob = b''.join(out)
open(OUT, 'wb').write(blob)
print('buildings', len(bld), 'greens', len(gl), 'roads', len(rl), 'trees', len(tl), 'cranes', len(cranes), 'bytes', len(blob))

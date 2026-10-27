#!/usr/bin/env python3
"""Build the simulator's chart and depth model from NOAA ENC layers (output of fetch_noaa.py).

usage: build_chart.py <enc-dir> <out-prefix>      e.g. build_chart.py /tmp/enc/miami src/scenes/miami
writes <out-prefix>.physics.json  (depth grid, land tiles for contact, berth quay face)
       <out-prefix>.chart.json    (what the 2D chart draws: depth areas, contours, soundings, aids…)

Only band-5 (harbour, 1:12 000–1:22 000) cells are used. Coordinates are metres north/east of
ORIGIN on a local tangent plane. Depths are metres below chart datum (MLLW).
"""
import glob, json, math, sys
import numpy as np
import shapely
from shapely.geometry import shape, box, Polygon, MultiPolygon, LineString, Point, mapping
from shapely.ops import unary_union, transform
from scipy.interpolate import griddata

ENC, OUT = sys.argv[1], sys.argv[2]
# PortMiami: Main Channel (Cut-4) from Fisher Island to the Terminal V turning basin
REGION = (-80.197, 25.756, -80.118, 25.792)          # W S E N
ORIGIN = (25.775, -80.165)                           # lat, lon
BERTH = 'Berth H(V)'                                 # Terminal V (Virgin Voyages)
CELL = 10.0                                          # depth grid [m]

a, f = 6378137.0, 1 / 298.257223563
e2 = f * (2 - f); phi = math.radians(ORIGIN[0])
M = a * (1 - e2) / (1 - e2 * math.sin(phi) ** 2) ** 1.5
Nr = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
KLAT, KLON = M * math.pi / 180, Nr * math.cos(phi) * math.pi / 180
def proj(x, y, z=None):  # lon, lat → e, n
    return ((np.asarray(x) - ORIGIN[1]) * KLON, (np.asarray(y) - ORIGIN[0]) * KLAT)
P = lambda g: transform(proj, g)

reg_ll = box(*REGION)
reg = P(reg_ll)
x0, y0, x1, y1 = reg.bounds                          # e0, n0, e1, n1

def layer(L, cells='US5MIA*'):
    out = []
    for fn in sorted(glob.glob(f'{ENC}/{cells}_{L}.geojson')):
        for ft in json.load(open(fn))['features']:
            g = shape(ft['geometry'])
            if g.is_empty or not g.intersects(reg_ll): continue
            out.append((P(g), ft['properties']))
    return out

r1 = lambda v: round(float(v), 1)
def coords(g):  # [[n, e], …] rounded
    return [[r1(y), r1(x)] for x, y in g.coords]
def polys(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if hasattr(g, 'geoms'): return [p for q in g.geoms for p in polys(q)]
    return []
def lines(g):
    if g.is_empty: return []
    if isinstance(g, LineString): return [g]
    if hasattr(g, 'geoms'): return [p for q in g.geoms for p in lines(q)]
    return []

# ---------------------------------------------------------------- land (+ piers and wharves as solid)
land = unary_union([g for g, _ in layer('LNDARE') if g.geom_type in ('Polygon', 'MultiPolygon')])
slcons = layer('SLCONS')
solid = [g.buffer(1.0, cap_style=2) for g, p in slcons if p.get('CATSLC') in (1, 4, 6, 15, 16) and g.length > 15]
solid += [g for g, p in slcons if g.geom_type in ('Polygon', 'MultiPolygon')]
# mooring dolphins (CATMOR 1) are solid structures; pile/buoy moorings are not
dolph = [g if g.geom_type != 'Point' else g.buffer(3.0) for g, p in layer('MORFAC') if p.get('CATMOR') == 1]
solid += dolph
print('dolphins', len(dolph), [tuple(round(v) for v in d.centroid.coords[0]) for d in dolph])
land = unary_union([land] + solid).intersection(reg).buffer(0)
land = land.simplify(0.6, preserve_topology=True)
print('land area km2', round(land.area / 1e6, 2))

# collision tiles: 150 m squares keep each contact polygon small
tiles = []
T = 150
for tx in np.arange(x0, x1, T):
    for ty in np.arange(y0, y1, T):
        for p in polys(land.intersection(box(tx, ty, tx + T, ty + T))):
            if p.area < 4: continue
            ext = p.exterior.simplify(0.4)
            if len(ext.coords) < 4: continue
            tiles.append(coords(ext)[:-1])
print('land tiles', len(tiles))

# ---------------------------------------------------------------- depth model
depare = [(g, p) for g, p in layer('DEPARE')]
drgare = [(g, p) for g, p in layer('DRGARE')]
pts, vals = [], []
for g, p in layer('SOUNDG'):
    d = p.get('DEPTH')
    if d is None: continue
    pts.append((g.x, g.y)); vals.append(float(d))
nS = len(pts)
for g, p in layer('DEPCNT'):
    v = p.get('VALDCO')
    if v is None: continue
    for ln in lines(g):
        L = ln.length
        for s in np.arange(0, L, 12.0):
            q = ln.interpolate(s); pts.append((q.x, q.y)); vals.append(float(v))
# coastline at 0 m
for ln in lines(land.boundary):
    for s in np.arange(0, ln.length, 15.0):
        q = ln.interpolate(s); pts.append((q.x, q.y)); vals.append(0.0)
print('soundings', nS, 'interp points', len(pts))
pts = np.array(pts); vals = np.array(vals)

nx, ny = int(math.ceil((x1 - x0) / CELL)), int(math.ceil((y1 - y0) / CELL))
gx = x0 + (np.arange(nx) + 0.5) * CELL
gy = y0 + (np.arange(ny) + 0.5) * CELL
GX, GY = np.meshgrid(gx, gy)                          # [ny, nx]
Z = griddata(pts, vals, (GX, GY), method='linear')
Zn = griddata(pts, vals, (GX, GY), method='nearest')
Z = np.where(np.isnan(Z), Zn, Z)
# clamp to each charted depth area's range, and to maintained depth in dredged areas
for g, p in depare:
    d1, d2 = p.get('DRVAL1'), p.get('DRVAL2')
    if d1 is None: continue
    m = shapely.contains_xy(g, GX, GY)
    if not m.any(): continue
    lo = float(d1); hi = float(d2) if d2 is not None else 99.0
    Z[m] = np.clip(Z[m], lo, hi)
for g, p in drgare:
    d1 = p.get('DRVAL1')
    if d1 is None: continue
    m = shapely.contains_xy(g, GX, GY)
    Z[m] = np.maximum(Z[m], float(d1))
landm = shapely.contains_xy(land, GX, GY)
Z = np.clip(Z, 0, 25.4)
Q = np.round(Z * 10).astype(np.uint8)
Q[Q == 0] = 1
# under the land itself: carry the nearest water depth in, so a 10 m cell straddling a quay wall
# does not read as dry ground (the wall itself is handled by the contact model)
from scipy.ndimage import distance_transform_edt
_, (ii, jj) = distance_transform_edt(landm, return_indices=True)
Q = Q[ii, jj]
import base64
grid = {'e0': r1(x0), 'n0': r1(y0), 'cell': CELL, 'nx': nx, 'ny': ny, 'unit': 0.1,
        'data': base64.b64encode(Q.tobytes()).decode()}          # row-major, row 0 = south
print('grid', nx, 'x', ny)

# ---------------------------------------------------------------- berth: the charted wharf face (SLCONS, CATSLC 6) at the berth
bg = next(g for g, p in drgare if p.get('OBJNAM') == BERTH)
segs = []
for g, p in slcons:
    if p.get('CATSLC') != 6: continue
    for ln in lines(g):
        cs = list(ln.coords)
        for i in range(len(cs) - 1):
            sg = LineString([cs[i], cs[i + 1]])
            if sg.length > 60 and sg.distance(bg) < 5: segs.append(sg)
face = max(segs, key=lambda l: l.length)
(ax_, ay_), (bx_, by_) = face.coords
if by_ < ay_: (ax_, ay_), (bx_, by_) = (bx_, by_), (ax_, ay_)            # run the face northward
ux, uy = (bx_ - ax_) / face.length, (by_ - ay_) / face.length            # along the face (e, n), toward its north end
c = face.interpolate(0.5, normalized=True)
nxv, nyv = -uy, ux                                                     # normal toward the water
if land.contains(Point(c.x + nxv * 8, c.y + nyv * 8)): nxv, nyv = -nxv, -nyv
cx, cy = c.x, c.y
berth = {'name': 'Terminal V · ' + BERTH, 'n': r1(cy), 'e': r1(cx), 'len': r1(face.length),
         'along': [round(uy, 5), round(ux, 5)], 'normal': [round(nyv, 5), round(nxv, 5)], 'depth': float(next(p for g, p in drgare if p.get('OBJNAM') == BERTH)['DRVAL1'])}
# berth centre: as far along the face as keeps the ship (278 m, keel 20.6 m off the face) over ≥ 9 m
def zat(n, e):
    i = int((n - y0) / CELL); j = int((e - x0) / CELL)
    return Z[min(max(i, 0), ny - 1), min(max(j, 0), nx - 1)]
best = None
for sv in np.arange(-60, 120, 5.0):
    pc = (cx + ux * sv + nxv * 20.6, cy + uy * sv + nyv * 20.6)
    keel = [zat(pc[1] + uy * x, pc[0] + ux * x) for x in np.arange(-139, 140, 10)]
    if min(keel) >= 9.0 and (best is None or abs(sv) < abs(best)): best = sv
berth['centre'] = float(best)
print('berth', berth)

# berth fenders and bollards along the face, where the wall is backed by land
fend, boll = [], []
for sv in np.arange(-face.length / 2 + 5, face.length / 2 + 45, 20.0):
    px_, py_ = cx + ux * sv, cy + uy * sv
    if land.distance(Point(px_ - nxv * 2, py_ - nyv * 2)) < 4 and not land.contains(Point(px_ + nxv * 3, py_ + nyv * 3)):
        fend.append(round(float(sv), 1))
        boll.append([r1(py_ - nyv * 2.0), r1(px_ - nxv * 2.0)])
berth['fenders'] = fend; berth['bollards'] = boll
print('fenders at', fend)

cellsUsed = sorted({fn.split('/')[-1][:8] for fn in glob.glob(f'{ENC}/US5MIA*_DEPARE.geojson')})
man = json.load(open(f'{ENC}/manifest.json'))
editions = {c['cell']: {'edition': c.get('DSID_EDTN'), 'update': c.get('DSID_UPDN'), 'issued': c.get('DSID_ISDT'), 'scale': c.get('DSPM_CSCL')} for c in man['cells'] if c['cell'] in cellsUsed}
meta = {'source': 'NOAA Office of Coast Survey ENC (S-57)', 'cells': editions, 'datum': 'MLLW', 'origin': ORIGIN,
        'bounds': [r1(y0), r1(x0), r1(y1), r1(x1)], 'berth': berth}
json.dump(meta, open(OUT + '.meta.json', 'w'), indent=1)
physics = {'grid': grid, 'land': tiles}
json.dump(physics, open(OUT + '.physics.json', 'w'), separators=(',', ':'))

# ---------------------------------------------------------------- chart drawing layers
def ring(r, tol=0.8):
    return coords(LineString(r.coords).simplify(tol))
chart = {'depare': [], 'drgare': [], 'land': [], 'contours': [], 'soundings': [], 'slcons': [], 'aids': [], 'labels': [], 'bridges': []}
for g, p in depare:
    for q in polys(g.intersection(reg)):
        chart['depare'].append({'d1': p.get('DRVAL1'), 'd2': p.get('DRVAL2'), 'rings': [ring(q.exterior)] + [ring(h) for h in q.interiors]})
for g, p in drgare:
    for q in polys(g.intersection(reg)):
        chart['drgare'].append({'d': p.get('DRVAL1'), 'name': p.get('OBJNAM'), 'rings': [ring(q.exterior)]})
for q in polys(land):
    chart['land'].append([ring(q.exterior, 0.5)] + [ring(h, 0.5) for h in q.interiors])
for g, p in layer('DEPCNT'):
    for ln in lines(g.intersection(reg)):
        chart['contours'].append({'v': p.get('VALDCO'), 'pts': coords(ln.simplify(1.0))})
for g, p in layer('SOUNDG'):
    if reg.contains(g) and p.get('DEPTH') is not None:
        sd = [r1(g.y), r1(g.x), round(float(p['DEPTH']), 1)]
        if not any(abs(o[0] - sd[0]) < 2 and abs(o[1] - sd[1]) < 2 for o in chart['soundings'][-400:]): chart['soundings'].append(sd)
for g, p in slcons:
    for ln in lines(g.intersection(reg)):
        if ln.length > 3: chart['slcons'].append({'c': p.get('CATSLC'), 'pts': coords(ln.simplify(0.5))})
COL = {'1': 'white', '2': 'black', '3': 'red', '4': 'green', '6': 'yellow'}
for L in ('BOYLAT', 'BOYSPP', 'BOYSAW', 'BCNLAT', 'BCNSPP', 'LIGHTS', 'MORFAC'):
    for g, p in layer(L):
        if g.geom_type != 'Point' or not reg.contains(g): continue
        col = [COL.get(str(c), 'other') for c in (p.get('COLOUR') or [])]
        a = {'k': L, 'n': r1(g.y), 'e': r1(g.x), 'col': col}
        for k in ('OBJNAM', 'CATLAM', 'LITCHR', 'SIGPER', 'SIGGRP', 'BOYSHP', 'BCNSHP', 'VALNMR', 'HEIGHT'):
            if p.get(k) not in (None, ''): a[k.lower()] = p[k]
        if any(abs(o['n'] - a['n']) < 5 and abs(o['e'] - a['e']) < 5 and o['k'] == a['k'] for o in chart['aids']): continue   # same aid in two cells
        chart['aids'].append(a)
for L in ('BERTHS', 'FAIRWY'):
    for g, p in layer(L):
        if p.get('OBJNAM') and reg.intersects(g):
            q = g.representative_point() if g.geom_type != 'Point' else g
            if reg.contains(q) and not any(l['t'] == p['OBJNAM'] and abs(l['n'] - q.y) < 300 and abs(l['e'] - q.x) < 300 for l in chart['labels']):
                chart['labels'].append({'k': L, 'n': r1(q.y), 'e': r1(q.x), 't': p['OBJNAM']})
for g, p in layer('BRIDGE'):
    for q in polys(g.intersection(reg)):
        chart['bridges'].append({'rings': [ring(q.exterior)], 'verclr': p.get('VERCLR'), 'name': p.get('OBJNAM')})
json.dump(chart, open(OUT + '.chart.json', 'w'), separators=(',', ':'))
for k, v in chart.items(): print(k, len(v))

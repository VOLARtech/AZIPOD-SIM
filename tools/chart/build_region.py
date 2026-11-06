#!/usr/bin/env python3
"""Build an area for the simulator from fetched chart data (fetch_region.py).

usage: build_region.py <regions/area.json> <raw-dir> <out-dir>
writes <out-dir>/<id>.azp   physics pack (gzip): depth grids at several resolutions (cm, Int16), land/quay
                            contact tiles near the water (decimetres, Int32), as one binary file
       <out-dir>/<id>.azc   chart (gzip JSON): depth areas, contours, soundings, land, shoreline constructions,
                            aids to navigation with lights and topmarks, names, bridges
       <out-dir>/<id>.meta.json  bundled with the app: origin, bounds, datum, cell editions, berth faces, locks

Cells are merged by scale: where a larger-scale cell covers an area (M_COVR), smaller-scale cells' features
there are dropped. Coordinates are metres north/east of the region's origin on a transverse Mercator plane.
Depths are metres below the region's datum. Run with python -I: the raw directory is data, not code.
"""
import glob, gzip, json, math, os, re, struct, sys
import numpy as np
import shapely
from shapely.geometry import shape, box, Polygon, MultiPolygon, LineString, Point, mapping
from shapely.ops import unary_union, transform
from shapely.geometry.polygon import orient
from shapely.prepared import prep
from scipy.interpolate import griddata
from scipy.ndimage import distance_transform_edt
from pyproj import Transformer

REG = json.load(open(sys.argv[1])); RAW, OUTD = sys.argv[2], sys.argv[3]
os.makedirs(OUTD, exist_ok=True)
ID = REG['id']; S, W, N, E = REG['bbox']; LAT0, LON0 = REG['origin']
TM = f'+proj=tmerc +lat_0={LAT0} +lon_0={LON0} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs'
_ll = Transformer.from_crs('EPSG:4326', TM, always_xy=True)
_rd = Transformer.from_crs('EPSG:28992', TM, always_xy=True)
P = lambda g: transform(lambda x, y, z=None: _ll.transform(x, y), g)          # lon/lat → e, n
reg = P(box(W, S, E, N)); X0, Y0, X1, Y1 = reg.bounds
r1 = lambda v: round(float(v), 1)
def coords(g): return [[r1(y), r1(x)] for x, y in g.coords]
def polys(g):
    if g is None or g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if hasattr(g, 'geoms'): return [p for q in g.geoms for p in polys(q)]
    return []
def lines(g):
    if g is None or g.is_empty: return []
    if isinstance(g, LineString): return [g]
    if hasattr(g, 'geoms'): return [p for q in g.geoms for p in lines(q)]
    if isinstance(g, Polygon): return [LineString(g.exterior.coords)]
    return []
def first(v):
    if isinstance(v, list): v = v[0] if v else None
    try: return int(float(v)) if v is not None and str(v).strip() not in ('', 'nan') else None
    except ValueError: return None
def ints(v):
    if v is None: return []
    if not isinstance(v, list): v = re.split(r'[,\s]+', str(v))
    out = []
    for x in v:
        try: out.append(int(float(x)))
        except (ValueError, TypeError): pass
    return out

# ---------------------------------------------------------------- cells, by scale
man = json.load(open(f'{RAW}/manifest.json'))
def band(cell):
    if re.match(r'US\d', cell): return int(cell[2])
    return 6                                                  # inland ENC: harbour-scale and larger
scale = {c['cell']: (c.get('DSPM_CSCL') or 1e9) for c in man['cells']}
cells = sorted({c['cell'] for c in man['cells']}, key=lambda c: (-band(c), scale[c], c))      # largest scale first
def raw_layer(cell, L):
    fn = f'{RAW}/{cell}_{L}.geojson'
    if not os.path.exists(fn): return []
    return [(shape(f['geometry']), f['properties']) for f in json.load(open(fn))['features']]
cover = {}
for c in cells:
    mc = raw_layer(c, 'M_COVR')
    cv = [P(g) for g, p in mc if first(p.get('CATCOV')) in (1, None) and g.geom_type in ('Polygon', 'MultiPolygon')]
    # a cell whose coverage the box only grazes (clipped to a line) covers nothing here
    cover[c] = unary_union(cv).intersection(reg) if cv else (Polygon() if mc else reg)
taken = Polygon()                                             # what larger-scale cells already cover
own = {}
for c in cells:
    own[c] = cover[c].difference(taken).buffer(0)
    taken = unary_union([taken, cover[c]])
print('cells by scale:', [(c, band(c), round(own[c].area / 1e6, 1)) for c in cells])
_cache = {}
def layer(L, kinds=None):
    """A layer over all cells, each cell contributing only where it is the largest-scale cover."""
    key = (L, kinds)
    if key in _cache: return _cache[key]
    out = []
    for c in cells:
        if own[c].is_empty: continue
        oc = prep(own[c])
        for g, p in raw_layer(c, L):
            g = P(g)
            if g.is_empty: continue
            if g.geom_type == 'Point':
                if not oc.contains(g): continue
            elif not oc.contains(g):
                g = g.intersection(own[c])
                if g.is_empty: continue
            out.append((g, p))
    _cache[key] = out
    return out
def layers(*Ls): return [x for L in Ls for x in layer(L)]

# ---------------------------------------------------------------- land and structures
land = unary_union([g for g, _ in layers('LNDARE', 'lndare') if g.geom_type in ('Polygon', 'MultiPolygon')])
slcons = layers('SLCONS', 'slcons')
SOLID_SLC = (1, 2, 3, 4, 6, 7, 10, 12, 13, 15, 16, 18)        # breakwaters, groynes, moles, piers, wharves, walls…
solid = [g.buffer(1.0, cap_style=2) for g, p in slcons if first(p.get('CATSLC')) in SOLID_SLC and g.geom_type in ('LineString', 'MultiLineString') and g.length > 10]
solid += [g for g, p in slcons if g.geom_type in ('Polygon', 'MultiPolygon')]
solid += [g for g, p in layers('PONTON', 'HULKES', 'FLODOC', 'DRYDOC', 'ponton', 'hulkes') if g.geom_type in ('Polygon', 'MultiPolygon')]
dolph = [g if g.geom_type != 'Point' else g.buffer(3.5) for g, p in layers('MORFAC') if first(p.get('CATMOR')) == 1]
solid += dolph
# mooring piles stand in the water as small solid structures; charted bollards are the berths' own
solid += [g.buffer(0.8) for g, p in layers('MORFAC') if first(p.get('CATMOR')) == 5 and g.geom_type == 'Point']
charted_bollards = [(g.y, g.x) for g, p in layers('MORFAC') if first(p.get('CATMOR')) == 3 and g.geom_type == 'Point']
print('charted bollards', len(charted_bollards))
land = unary_union([land] + solid).intersection(reg).buffer(0).simplify(0.5, preserve_topology=True)
water = reg.difference(land)
print('land km2', round(land.area / 1e6, 1), 'dolphins', len(dolph))

# ---------------------------------------------------------------- depth model
def depth_points():
    pts, vals = [], []
    for g, p in layers('SOUNDG'):
        d = p.get('DEPTH')
        if d is None: continue
        for q in ([g] if g.geom_type == 'Point' else list(getattr(g, 'geoms', []))):
            pts.append((q.x, q.y)); vals.append(float(d))
    ns = len(pts)
    for g, p in layers('DEPCNT', 'depcnt'):
        v = p.get('VALDCO')
        if v is None: continue
        for ln in lines(g):
            for s in np.arange(0, ln.length, 15.0): q = ln.interpolate(s); pts.append((q.x, q.y)); vals.append(float(v))
    # the shore dries at 0 m; a wharf or pier face does not: the water keeps its depth up to the wall
    walls = unary_union([g for g, p in slcons if first(p.get('CATSLC')) in (4, 6, 10, 14, 15, 16, 18) and g.geom_type in ('LineString', 'MultiLineString', 'Polygon', 'MultiPolygon')] + dolph or [LineString()]).buffer(4.0)
    wp = prep(walls)
    for ln in lines(land.boundary):
        for s in np.arange(0, ln.length, 20.0):
            q = ln.interpolate(s)
            if not wp.contains(q): pts.append((q.x, q.y)); vals.append(0.0)
    print('soundings', ns, 'interpolation points', len(pts))
    return np.array(pts), np.array(vals)
depare = [(g, p) for g, p in layers('DEPARE', 'depare') if g.geom_type in ('Polygon', 'MultiPolygon')]
drgare = [(g, p) for g, p in layers('DRGARE', 'drgare') if g.geom_type in ('Polygon', 'MultiPolygon')]

def raster_layers():
    """Bathymetry rasters (Rijkswaterstaat), finest first: (points e, n, depth below datum) per raster tile."""
    out = []
    bat = sorted(man.get('bathymetry', []), key=lambda b: b['res'])
    lat_minus_nap = None
    lat_f = next((f for f in glob.glob(f'{RAW}/wcs_*noordzee_midden_LAT_*m.npz')), None)
    nap_f = next((f for f in glob.glob(f'{RAW}/wcs_*noordzee_midden_NAP_*m.npz')), None)
    if lat_f and nap_f:
        a, b = np.load(lat_f), np.load(nap_f)
        za = np.concatenate([a[k].ravel() for k in a.files if k.endswith('_z')]); zb = np.concatenate([b[k].ravel() for k in b.files if k.endswith('_z')])
        m = np.isfinite(za) & np.isfinite(zb) & (np.abs(za) < 1e4) & (np.abs(zb) < 1e4)
        if m.sum() > 100: lat_minus_nap = float(np.median(za[m] - zb[m]))
        print('bed height above LAT minus above NAP (NAP above LAT):', lat_minus_nap)
    for b in bat:
        fn = f"{RAW}/wcs_{b['coverage']}_{b['res']}m.npz"
        if not os.path.exists(fn) or 'noordzee_midden_LAT' in fn: continue
        z = np.load(fn)
        n_t = len({k.split('_')[0] for k in z.files})
        for i in range(n_t):
            a = z[f't{i}_z'].astype('float64'); x0, y1, res = float(z[f't{i}_x0']), float(z[f't{i}_y1']), float(z[f't{i}_res'])
            a[(a < -1e4) | (a > 1e4)] = np.nan
            if b['coverage'].endswith('_LAT'):
                if lat_minus_nap is None: continue
                a = a - lat_minus_nap                           # height above LAT → above NAP
            ny_, nx_ = a.shape
            xs = x0 + (np.arange(nx_) + 0.5) * res; ys = y1 - (np.arange(ny_) + 0.5) * res
            XX, YY = np.meshgrid(xs, ys); m = np.isfinite(a)
            if not m.any(): continue
            e, n = _rd.transform(XX[m], YY[m])
            out.append((res, np.column_stack([e, n]), -a[m]))   # depth below NAP = −bed height
    return out, lat_minus_nap

pts, vals = depth_points()
rasters, lat_minus_nap = raster_layers() if man.get('bathymetry') else ([], None)
grids = []
for gspec in sorted(REG['grids'], key=lambda g: -g['cell']):
    cell = float(gspec['cell']); gb = P(box(gspec['bbox'][1], gspec['bbox'][0], gspec['bbox'][3], gspec['bbox'][2])).intersection(reg)
    x0, y0, x1, y1 = gb.bounds
    nx, ny = int(math.ceil((x1 - x0) / cell)), int(math.ceil((y1 - y0) / cell))
    gx = x0 + (np.arange(nx) + 0.5) * cell; gy = y0 + (np.arange(ny) + 0.5) * cell
    GX, GY = np.meshgrid(gx, gy)
    Z = np.full(GX.shape, np.nan)
    # the chart's own depths: soundings and contours, interpolated, held to each depth area's range
    if len(pts):
        sel = (pts[:, 0] > x0 - 600) & (pts[:, 0] < x1 + 600) & (pts[:, 1] > y0 - 600) & (pts[:, 1] < y1 + 600)
        if sel.sum() > 3:
            Zc = griddata(pts[sel], vals[sel], (GX, GY), method='linear')
            Zn = griddata(pts[sel], vals[sel], (GX, GY), method='nearest')
            Z = np.where(np.isnan(Zc), Zn, Zc)
    for g, p in depare:
        d1, d2 = p.get('DRVAL1'), p.get('DRVAL2')
        if d1 is None: continue
        if not g.intersects(gb): continue
        m = shapely.contains_xy(g, GX, GY)
        if not m.any(): continue
        lo, hi = float(d1), float(d2) if d2 is not None else 999.0
        Z[m] = np.where(np.isnan(Z[m]), (lo + min(hi, lo + 10)) / 2, np.clip(Z[m], lo, hi))
    for g, p in drgare:
        d1 = p.get('DRVAL1')
        if d1 is None or not g.intersects(gb): continue
        m = shapely.contains_xy(g, GX, GY)
        Z[m] = np.maximum(np.nan_to_num(Z[m], nan=float(d1)), float(d1))
    # surveyed bathymetry where there is some (finest last, so it wins): mean of the samples in each cell
    for res, xy, d in sorted(rasters, key=lambda r: -r[0]):
        j = np.floor((xy[:, 0] - x0) / cell).astype(int); i = np.floor((xy[:, 1] - y0) / cell).astype(int)
        m = (i >= 0) & (i < ny) & (j >= 0) & (j < nx)
        if not m.any(): continue
        acc = np.zeros(nx * ny); cnt = np.zeros(nx * ny)
        np.add.at(acc, i[m] * nx + j[m], d[m]); np.add.at(cnt, i[m] * nx + j[m], 1)
        hit = cnt > 0
        Zf = Z.ravel(); Zf[hit] = acc[hit] / cnt[hit]; Z = Zf.reshape(ny, nx)
    # …but the chart's depth ranges bound it: a survey older than the chart's edition (a basin dredged since,
    # a construction pit filled) must not show less water than the chart guarantees, nor far more
    if rasters:
        held = 0
        for g, p in depare + drgare:
            d1, d2 = p.get('DRVAL1'), p.get('DRVAL2')
            if d1 is None or float(d1) <= 0 or not g.intersects(gb): continue
            m = shapely.contains_xy(g, GX, GY)
            if not m.any(): continue
            lo, hi = float(d1) - 0.3, (float(d2) + 1.0) if d2 is not None else 999.0
            held += int(((Z[m] < lo) | (Z[m] > hi)).sum())
            Z[m] = np.clip(Z[m], lo, hi)
        print('grid', cell, 'm: survey cells held to the chart\'s depth ranges:', held)
    landm = shapely.contains_xy(land, GX, GY)
    Z = np.where(np.isnan(Z), 0.0, Z)
    Z = np.clip(Z, -5, REG.get('cap', 40))
    # under the land: the nearest water depth carried in (a cell straddling a quay wall is not dry ground;
    # the wall is the contact model's)
    if landm.any() and (~landm).any():
        _, (ii, jj) = distance_transform_edt(landm, return_indices=True)
        Z = Z[ii, jj]
    Q = np.round(Z * 100).astype('<i2')
    grids.append({'e0': r1(x0), 'n0': r1(y0), 'cell': cell, 'nx': nx, 'ny': ny, 'data': Q})
    print('grid', cell, 'm:', nx, 'x', ny)

# ---------------------------------------------------------------- contact tiles: land near the water, in 150 m squares
tiles = []
near = water.buffer(250)
T = 150.0
for tx in np.arange(X0, X1, T):
    for ty in np.arange(Y0, Y1, T):
        b = box(tx, ty, tx + T, ty + T)
        if not b.intersects(near) or not b.intersects(land): continue
        for p in polys(land.intersection(b)):
            if p.area < 4: continue
            ext = p.exterior.simplify(0.4)
            if len(ext.coords) < 4: continue
            tiles.append([(y, x) for x, y in list(ext.coords)[:-1]])
print('contact tiles', len(tiles))

# ---------------------------------------------------------------- berth faces: wharf, pier and dolphin faces with water off them
def zat(n, e):
    for g in reversed(grids):                                 # finest first
        j = int((e - g['e0']) / g['cell']); i = int((n - g['n0']) / g['cell'])
        if 0 <= i < g['ny'] and 0 <= j < g['nx']: return g['data'][i, j] / 100
    return 0.0
FACE_SLC = (3, 4, 6, 10, 14, 15, 16, 18)                       # moles, piers, wharves, sea walls, fenders, lock walls
face_lines = unary_union([g for g, p in slcons if first(p.get('CATSLC')) in FACE_SLC and g.geom_type in ('LineString', 'MultiLineString')] or [LineString()])
face_lines = face_lines.buffer(3.0) if not face_lines.is_empty else Polygon()
named = [(g, re.sub(r'^Ligplaats\s+', '', p.get('OBJNAM'))) for g, p in layers('BERTHS', 'berths') if p.get('OBJNAM')]
piers = [(g, p.get('OBJNAM')) for g, p in slcons + layers('LNDARE') if p.get('OBJNAM')]
faces = []
import collections
rej = collections.Counter()
from shapely.strtree import STRtree
bol_pts = [Point(e, n) for n, e in charted_bollards]
bol_tree = STRtree(bol_pts) if bol_pts else STRtree([Point(1e9, 1e9)])
if not bol_pts: bol_pts = [Point(1e9, 1e9)]
_bt = STRtree([q for q, _ in named]) if named else None
def berth_idx_geoms(seg):
    if _bt is None: return []
    return [named[i][0] for i in _bt.query(seg.buffer(12))]
def merged(cs):
    """Runs of the simplified ring: consecutive edges that bend less than 6° and stay within 1.5 m of the chord
    are one face (a long wharf with a slight bend is one berth)."""
    out, i = [], 0
    while i < len(cs) - 1:
        j = i + 1
        while j < len(cs) - 1:
            a, b = np.array(cs[i]), np.array(cs[j + 1])
            ch = LineString([a, b]); L = ch.length
            if L < 1: break
            u0 = (np.array(cs[j]) - np.array(cs[j - 1])); u1 = (np.array(cs[j + 1]) - np.array(cs[j]))
            ang = math.degrees(math.acos(max(-1, min(1, float(u0 @ u1 / (np.linalg.norm(u0) * np.linalg.norm(u1) + 1e-9))))))
            if ang > 6 or max(ch.distance(Point(cs[k])) for k in range(i + 1, j + 1)) > 1.5: break
            j += 1
        out.append((cs[i], cs[j])); i = j
    return out
for poly in polys(land):
    for ring in [poly.exterior] + list(poly.interiors):
        r = LineString(ring.coords).simplify(1.0)          # within 1 m of the real edge: less than any fender stands off
        cs = list(r.coords)
        for a, b in merged(cs):
            seg = LineString([a, b]); L = seg.length
            if L < 30:
                rej['shorter than 30 m'] += sum(1 for i in bol_tree.query(seg.buffer(6)) if seg.distance(bol_pts[i]) < 6) if L > 2 else 0
                continue
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            nx_, ny_ = -uy, ux
            mid = seg.interpolate(0.5, normalized=True)
            # the land side is the one just behind the edge (a thin pier has water a few metres either side)
            behind = [sum(land.contains(Point(q.x - nx_ * 0.6, q.y - ny_ * 0.6)) for q in (seg.interpolate(t, normalized=True) for t in (0.25, 0.5, 0.75))),
                      sum(land.contains(Point(q.x + nx_ * 0.6, q.y + ny_ * 0.6)) for q in (seg.interpolate(t, normalized=True) for t in (0.25, 0.5, 0.75)))]
            if behind[1] > behind[0]: nx_, ny_ = -nx_, -ny_
            nbol = sum(1 for i in bol_tree.query(seg.buffer(6)) if seg.distance(bol_pts[i]) < 6)
            if max(behind) < 2 or land.contains(Point(mid.x + nx_ * 6, mid.y + ny_ * 6)): rej['no water off it'] += nbol; continue
            # along a charted wharf, pier or dolphin face (not a beach, a bank or a breakwater); or an edge the chart
            # draws as plain shore but gives bollards along (a quay is where ships make fast), or a charted berth
            on = sum(face_lines.contains(seg.interpolate(t, normalized=True)) for t in (0.1, 0.3, 0.5, 0.7, 0.9)) + (any(d.distance(seg) < 6 for d in dolph) * 5)
            if on < 4:
                nb = sum(1 for i in bol_tree.query(seg.buffer(6)) if seg.distance(bol_pts[i]) < 6 and 1 <= seg.project(bol_pts[i]) <= L - 1)
                berth_here = any(q.geom_type != 'Point' and q.distance(seg) < 12 for q in berth_idx_geoms(seg))
                if nb < max(2, L / 60) and not (berth_here and nb >= 1): rej['plain shore, too few bollards'] += nbol; continue
            ds = [zat(mid.y + ny_ * off + uy * s, mid.x + nx_ * off + ux * s) for off in (6, 15) for s in np.linspace(-L / 2 + 3, L / 2 - 3, 5)]
            # water enough off most of it (a shallow end or corner is trimmed later, not the whole quay dropped)
            if float(np.percentile(ds, 25)) < 3: rej['shallow'] += nbol; continue
            rej['kept'] += nbol
            pier = min(piers, key=lambda q: q[0].distance(seg), default=(None, None))
            place = pier[1] if pier[0] is not None and pier[0].distance(seg) < 60 else None
            # the charted berths along it: one berth each, from halfway to the one before to halfway to the next
            on_face = sorted([(seg.project(q.centroid), nm_) for q, nm_ in named if q.distance(seg) < (40 if q.geom_type == 'Point' else 12) and 0 <= seg.project(q.centroid) <= L], key=lambda x: x[0])
            cuts = [0.0] + [(on_face[k][0] + on_face[k + 1][0]) / 2 for k in range(len(on_face) - 1)] + [L]
            parts = [(cuts[k], cuts[k + 1], on_face[k][1] if on_face else None) for k in range(max(1, len(on_face)))]
            # pieces too short to be a berth go to their neighbour
            while len(parts) > 1 and min(p1 - p0 for p0, p1, _ in parts) < 30:
                k = min(range(len(parts)), key=lambda i: parts[i][1] - parts[i][0]); j = k - 1 if k > 0 else k + 1
                lo, hi = min(k, j), max(k, j)
                parts[lo:hi + 1] = [(parts[lo][0], parts[hi][1], parts[lo][2] or parts[hi][2])]
            if len(parts) > 1:
                # the whole wharf too, for a ship longer than any one of its numbered berths
                nms = [str(x) for _, _, x in parts if x]
                whole = f"Berths {nms[0]}–{nms[-1]}" if len(nms) > 1 else None
                faces.append({'a': [r1(a[1]), r1(a[0])], 'b': [r1(b[1]), r1(b[0])], 'nrm': [round(ny_, 5), round(nx_, 5)], 'depth': round(float(np.percentile(ds, 10)), 1), 'len': r1(L), 'name': whole, 'place': place, 'whole': True})
            for p0, p1, nm_ in parts:
                pa, pb = seg.interpolate(p0), seg.interpolate(p1)
                name = (nm_ if not re.match(r'^[0-9A-Z]{1,5}$', str(nm_)) else f'Berth {nm_}') if nm_ else None
                faces.append({'a': [r1(pa.y), r1(pa.x)], 'b': [r1(pb.y), r1(pb.x)], 'nrm': [round(ny_, 5), round(nx_, 5)], 'depth': round(float(np.percentile(ds, 10)), 1), 'len': r1(p1 - p0), 'name': name, 'place': place})
# names for the rest, one counter per place
cnt = {}
for f in sorted(faces, key=lambda f: (f['place'] or '~', f['a'][0], f['a'][1])):
    if not f['name']:
        k = f['place'] or 'Quay'; cnt[k] = cnt.get(k, 0) + 1
        f['name'] = f"{k} · face {cnt[k]}"
    elif f['place'] and f['place'] not in f['name']: f['name'] = f"{f['place']} · {f['name']}"
print('berth faces', len(faces), 'total m', round(sum(f['len'] for f in faces)), 'charted bollards by verdict on their edge:', dict(rej))

# ---------------------------------------------------------------- the chart
COL = {1: 'white', 2: 'black', 3: 'red', 4: 'green', 5: 'blue', 6: 'yellow', 7: 'grey', 8: 'brown', 9: 'amber', 10: 'violet', 11: 'orange', 12: 'magenta', 13: 'pink'}
def ring(r, tol=0.8): return coords(LineString(r.coords).simplify(tol))
chart = {'meta': {'datum': REG['datum'], 'iala': REG['iala'], 'source': ' + '.join(sorted({'NOAA ENC' if c['source'] == 'noaa' else 'Rijkswaterstaat IENC' for c in man['cells']})) + (' + RWS bathymetry' if rasters else '')},
         'fill': 'nonzero', 'depare': [], 'drgare': [], 'land': [], 'contours': [], 'soundings': [], 'slcons': [], 'aids': [], 'labels': [], 'bridges': []}
for g, p in depare:
    for q in polys(orient(g.buffer(0), 1.0) if isinstance(g, Polygon) else g):
        q = orient(q, 1.0)
        chart['depare'].append({'d1': p.get('DRVAL1'), 'd2': p.get('DRVAL2'), 'rings': [ring(q.exterior)] + [ring(h) for h in q.interiors]})
for g, p in drgare:
    for q in polys(g):
        q = orient(q, 1.0)
        chart['drgare'].append({'d': p.get('DRVAL1'), 'name': p.get('OBJNAM'), 'rings': [ring(q.exterior)] + [ring(h) for h in q.interiors]})
for q in polys(land):
    q = orient(q, 1.0)
    chart['land'].append([ring(q.exterior, 0.5)] + [ring(h, 0.5) for h in q.interiors])
for g, p in layers('DEPCNT', 'depcnt'):
    for ln in lines(g): chart['contours'].append({'v': p.get('VALDCO'), 'pts': coords(ln.simplify(1.0))})
if len(chart['contours']) < 20:
    # no contours charted (inland ENC): drawn from the surveyed depths, finest grid where it covers, in the water only
    import contourpy
    wp = prep(water.buffer(-2))
    for gi, g in enumerate(reversed(grids)):
        Zg = g['data'].astype(float) / 100
        xs = g['e0'] + (np.arange(g['nx']) + 0.5) * g['cell']; ys = g['n0'] + (np.arange(g['ny']) + 0.5) * g['cell']
        finer = [box(h['e0'], h['n0'], h['e0'] + h['nx'] * h['cell'], h['n0'] + h['ny'] * h['cell']) for h in list(reversed(grids))[:gi]]
        cg = contourpy.contour_generator(xs, ys, Zg)
        for v in (2, 5, 10, 15, 20, 25):
            for ln in cg.lines(v):
                if len(ln) < 4: continue
                L_ = LineString(ln).simplify(g['cell'] * 0.4)
                for part in lines(L_.difference(unary_union(finer)) if finer else L_):
                    keep = [q for q in part.coords]
                    if len(keep) >= 3 and wp.contains(Point(keep[len(keep) // 2])): chart['contours'].append({'v': v, 'pts': [[r1(y), r1(x)] for x, y in keep]})
    print('contours drawn from the depth grids', len(chart['contours']))
seen = set()
for g, p in layers('SOUNDG'):
    d = p.get('DEPTH')
    if d is None or g.geom_type != 'Point': continue
    k = (round(g.y / 3), round(g.x / 3))
    if k in seen: continue
    seen.add(k); chart['soundings'].append([r1(g.y), r1(g.x), round(float(d), 1)])
# surveyed depths where the chart has few: thinned spot depths from the bathymetry (every ~60 m)
if rasters:
    res, xy, d = min(rasters, key=lambda r: abs(r[0] - 10))
    k = np.floor(xy / 60).astype(int); _, first_i = np.unique(k[:, 0] * 100000 + k[:, 1], return_index=True)
    for i in first_i:
        if d[i] > 0.5: chart['soundings'].append([r1(xy[i, 1]), r1(xy[i, 0]), round(float(d[i]), 1)])
for g, p in slcons:
    for ln in lines(g):
        if ln.length > 3: chart['slcons'].append({'c': first(p.get('CATSLC')), 'pts': coords(ln.simplify(0.5))})
# aids: buoys and beacons with their topmarks, daymarks, lights (sectored ones as one light) and fog signals
marks = {}
def at(g): return (round(g.y), round(g.x))
def near_key(g, d=4):
    y, x = g.y, g.x
    best = None
    for k in marks:
        if abs(k[0] - y) <= d and abs(k[1] - x) <= d: best = k; break
    return best
AID_LAYERS = ('BOYLAT', 'BOYCAR', 'BOYISD', 'BOYSAW', 'BOYSPP', 'BOYINB', 'BCNLAT', 'BCNCAR', 'BCNISD', 'BCNSAW', 'BCNSPP', 'boywtw', 'bcnwtw', 'MORFAC')
for L in AID_LAYERS:
    for g, p in layer(L):
        if g.geom_type != 'Point': continue
        if L == 'MORFAC' and first(p.get('CATMOR')) != 1: continue
        k = L.upper().replace('WTW', 'LAT')
        k = {'BOYINB': 'BOYSPP'}.get(k, k)
        a = {'k': k, 'n': r1(g.y), 'e': r1(g.x), 'col': [COL.get(c, 'grey') for c in ints(p.get('COLOUR'))]}
        if first(p.get('COLPAT')): a['colpat'] = first(p.get('COLPAT'))
        shp = first(p.get('BOYSHP')) or first(p.get('BCNSHP'))
        if shp: a['shp'] = shp
        cat = first(p.get('CATLAM')) or first(p.get('CATCAM')) or first(p.get('CATSPM'))
        if cat: a['cat'] = cat
        if p.get('OBJNAM'): a['name'] = p['OBJNAM']
        if near_key(g, 2): continue                            # the same mark in two cells
        marks[at(g)] = a
for g, p in layers('TOPMAR', 'DAYMAR'):
    if g.geom_type != 'Point': continue
    k = near_key(g)
    if k and 'top' not in marks[k] and first(p.get('TOPSHP')):
        marks[k]['top'] = first(p.get('TOPSHP')); marks[k]['topCol'] = [COL.get(c, 'grey') for c in ints(p.get('COLOUR'))] or ['black']
for g, p in layers('LIGHTS', 'lights'):
    if g.geom_type != 'Point': continue
    lt = {'chr': first(p.get('LITCHR')) or 1, 'col': [COL.get(c, 'white') for c in ints(p.get('COLOUR'))] or ['white']}
    if p.get('SIGGRP'): lt['grp'] = p['SIGGRP']
    if p.get('SIGPER'): lt['per'] = float(p['SIGPER'])
    if p.get('HEIGHT'): lt['h'] = float(p['HEIGHT'])
    if p.get('VALNMR'): lt['range'] = float(p['VALNMR'])
    s1, s2 = p.get('SECTR1'), p.get('SECTR2')
    k = near_key(g)
    if k is None:
        marks[at(g)] = {'k': 'LIGHTS', 'n': r1(g.y), 'e': r1(g.x), 'col': lt['col'][:1]}
        if p.get('OBJNAM'): marks[at(g)]['name'] = p['OBJNAM']
        k = at(g)
    m = marks[k]
    if s1 is not None and s2 is not None:
        L0 = m.setdefault('light', {**lt, 'sectors': []})
        L0.setdefault('sectors', []).append({'from': float(s1), 'to': float(s2), 'col': lt['col'][0]})
    elif 'light' not in m: m['light'] = lt
for g, p in layers('FOGSIG'):
    k = near_key(g) if g.geom_type == 'Point' else None
    if k: marks[k]['fog'] = {1: 'explosive', 2: 'diaphone', 3: 'siren', 4: 'nautophone', 5: 'reed', 6: 'tyfon', 7: 'bell', 8: 'whistle', 9: 'gong', 10: 'horn'}.get(first(p.get('CATFOG')), 'horn')
for g, p in layers('LNDMRK'):
    k = near_key(g, 8) if g.geom_type == 'Point' else None
    if k and marks[k]['k'] == 'LIGHTS' and p.get('OBJNAM') and 'name' not in marks[k]: marks[k]['name'] = p['OBJNAM']
# Rijkswaterstaat buoys and beacons (PDOK): colours, shapes, topmarks and lights, partly as Dutch text
NL = {'rood': 'red', 'groen': 'green', 'geel': 'yellow', 'zwart': 'black', 'wit': 'white', 'grijs': 'grey', 'oranje': 'orange', 'blauw': 'blue'}
TOPNL = [('2 kegels, punten naar boven', 13), ('2 kegels, punten naar beneden', 14), ('2 kegels punten van elkaar af', 11), ('2 kegels, punten naar elkaar', 10),
         ('2 bollen', 4), ('kegel boven bol', 1), ('kegel, punt naar boven', 1), ('kegel, punt naar beneden', 2), ('bol', 3), ('cilinder', 5), ('liggend kruis', 7), ('kruis', 7)]
SHPNL = {'spits': 1, 'stomp': 2, 'bol': 3, 'pilaar': 4, 'spar': 5, 'ton': 6}
def nl_cols(t):
    if not t or t in ('Niet toegewezen', 'X'): return []
    return [NL[w] for w in re.split(r'[/\s]+', t.lower()) if w in NL]
bfn = f'{RAW}/pdok_buoys.geojson'
if os.path.exists(bfn):
    for ft in json.load(open(bfn))['features']:
        p, gj = ft['properties'], ft['geometry']
        if not gj or gj['type'] != 'Point': continue
        g = P(shape(gj))
        if not reg.contains(g) or near_key(g, 6): continue
        floating = 'drijvend' in p.get('_collection', '')
        cols = nl_cols(p.get('obj_kleur'))
        shp = first(p.get('obj_vorm_c')) or first(p.get('object_vorm_c')) or SHPNL.get(str(p.get('obj_vorm') or '').lower())
        top = next((v for k, v in TOPNL if k in str(p.get('tt_toptek') or p.get('v_toptek') or '').lower()), None)
        cs = set(cols)
        if cs <= {'black', 'yellow'} and len(cols) >= 2:
            k = 'CAR'; cat = {('black', 'yellow'): 1, ('black', 'yellow', 'black'): 2, ('yellow', 'black'): 3, ('yellow', 'black', 'yellow'): 4}.get(tuple(cols))
        elif cs == {'black', 'red'}: k, cat = 'ISD', None
        elif cs == {'red', 'white'} and 'vertic' in str(p.get('kleurpatr') or '').lower(): k, cat = 'SAW', None
        elif cs == {'yellow'}: k, cat = 'SPP', None
        elif cols and cols[0] in ('red', 'green'):
            k = 'LAT'
            first_col, iala_a = cols[0], REG['iala'] == 'A'
            two = 'green' in cs and 'red' in cs
            cat = (4 if (first_col == 'red') == iala_a else 3) if two else (1 if (first_col == 'red') == iala_a else 2)
        elif not floating and not cols: k, cat = None, None
        else: k, cat = 'SPP', None
        lit_chr = first(p.get('sign_kar_c'))
        lt = None
        if lit_chr:
            lt = {'chr': lit_chr, 'col': nl_cols(p.get('licht_klr')) or (['yellow'] if k == 'SPP' else [cols[0]] if k == 'LAT' and cols else ['white'])}
            if str(p.get('sign_groep') or '').startswith('('): lt['grp'] = p['sign_groep']
            try: lt['per'] = float(str(p.get('sign_perio')).replace(',', '.'))
            except ValueError: pass
        if k is None:
            if not lt: continue
            a = {'k': 'LIGHTS', 'n': r1(g.y), 'e': r1(g.x), 'col': lt['col'][:1]}
        else:
            a = {'k': ('BOY' if floating else 'BCN') + k, 'n': r1(g.y), 'e': r1(g.x), 'col': cols}
            if len(cols) > 1: a['colpat'] = 2 if 'vertic' in str(p.get('kleurpatr') or '').lower() else 1
            if shp: a['shp'] = shp
            if cat: a['cat'] = cat
            if top: a['top'] = top; a['topCol'] = nl_cols(p.get('tt_kleur')) or (['black'] if k == 'CAR' else cols[:1])
        if p.get('benaming'): a['name'] = p['benaming']
        if lt: a['light'] = lt
        marks[at(g)] = a
chart['aids'] = list(marks.values())
for L in ('BERTHS', 'FAIRWY', 'berths', 'HRBARE', 'hrbare', 'termnl', 'LOKBSN', 'lokbsn'):
    for g, p in layer(L):
        nm = p.get('OBJNAM')
        if not nm: continue
        q = g if g.geom_type == 'Point' else g.representative_point()
        if not reg.contains(q) or any(l['t'] == nm and abs(l['n'] - q.y) < 300 and abs(l['e'] - q.x) < 300 for l in chart['labels']): continue
        chart['labels'].append({'k': L.upper(), 'n': r1(q.y), 'e': r1(q.x), 't': ('Berth ' + nm) if L.upper() == 'BERTHS' and not nm.lower().startswith('berth') else nm})
for g, p in layers('BRIDGE', 'brgare'):
    for q in polys(g):
        chart['bridges'].append({'rings': [ring(q.exterior)], 'verclr': p.get('VERCLR'), 'name': p.get('OBJNAM')})
# locks: chambers and gates as charted (for the lock engine)
locks = {'basins': [], 'gates': []}
for g, p in layers('LOKBSN', 'lokbsn'):
    for q in polys(g): locks['basins'].append({'name': p.get('OBJNAM'), 'ring': ring(q.exterior, 0.3)})
for g, p in layers('GATCON', 'gatcon'):
    gl = lines(g) or [LineString(q.exterior.coords) for q in polys(g)]
    for ln in gl: locks['gates'].append({'name': p.get('OBJNAM'), 'cat': first(p.get('CATGAT')) or first(p.get('catgat')), 'pts': coords(ln.simplify(0.3))})
# level zones around the locks: the water that reaches the sea without passing a lock chamber or a gate is
# 'outer' (it has the tide), the rest 'inner' (the canal's level); one character per cell, run-length coded
zones = None
if REG.get('zones') and locks['basins']:
    from scipy.ndimage import label
    zs = REG['zones']; zc = float(zs['cell'])
    zb = P(box(zs['bbox'][1], zs['bbox'][0], zs['bbox'][3], zs['bbox'][2]))
    x0, y0, x1, y1 = zb.bounds
    nx, ny = int(math.ceil((x1 - x0) / zc)), int(math.ceil((y1 - y0) / zc))
    GX, GY = np.meshgrid(x0 + (np.arange(nx) + 0.5) * zc, y0 + (np.arange(ny) + 0.5) * zc)
    chambers = unary_union([q for g, p in layers('LOKBSN', 'lokbsn') for q in polys(g)])
    gates = unary_union([ln.buffer(zc) for g, p in layers('GATCON', 'gatcon') for ln in (lines(g) or [LineString(q.exterior.coords) for q in polys(g)])] or [Point(0, 0).buffer(0)])
    dry = shapely.contains_xy(land, GX, GY)
    inch = shapely.contains_xy(chambers.buffer(zc), GX, GY) | shapely.contains_xy(gates, GX, GY)
    lab, nlab = label(~dry & ~inch)
    sx, sy = _ll.transform(zs['sea'][1], zs['sea'][0])
    si, sj = int((sy - y0) / zc), int((sx - x0) / zc)
    sea = lab[si, sj]
    assert sea > 0, 'the sea point is not in open water'
    Zc = np.where(dry, '.', np.where(shapely.contains_xy(chambers, GX, GY), 'c', np.where(lab == sea, 'o', 'i')))
    if 'canal' in zs:
        cx, cy = _ll.transform(zs['canal'][1], zs['canal'][0])
        assert Zc[int((cy - y0) / zc), int((cx - x0) / zc)] == 'i', 'the canal point reaches the sea: a leak in the lock complex'
    flat = ''.join(Zc.ravel()); rle = []
    i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i]: j += 1
        rle.append(f'{j - i}{flat[i]}'); i = j
    zones = {'e0': r1(x0), 'n0': r1(y0), 'cell': zc, 'nx': nx, 'ny': ny, 'rle': ''.join(rle)}
    print('level zones', nx, 'x', ny, 'outer cells', int((Zc == 'o').sum()), 'inner', int((Zc == 'i').sum()), 'rle chars', len(zones['rle']))
for k, v in chart.items():
    if isinstance(v, list): print('chart', k, len(v))

# ---------------------------------------------------------------- write
hdr = {'v': 1, 'id': ID, 'origin': [LAT0, LON0], 'datum': REG['datum'], 'grids': [{k: g[k] for k in ('e0', 'n0', 'cell', 'nx', 'ny')} for g in grids], 'unit': 0.01, 'tiles': len(tiles), 'bollards': len(charted_bollards)}
hb = json.dumps(hdr, separators=(',', ':')).encode()
body = bytearray(b'AZP1') + struct.pack('<I', len(hb)) + hb
while len(body) % 4: body += b' '
for g in grids: body += g['data'].astype('<i2').tobytes(); body += b'\0\0' * (len(g['data'].ravel()) % 2)
# tiles: count of points (u32) then Int32 decimetres n, e
for t in tiles:
    body += struct.pack('<I', len(t)); body += np.round(np.array(t) * 10).astype('<i4').tobytes()
# charted bollards: Int32 decimetres n, e
if charted_bollards: body += np.round(np.array(charted_bollards) * 10).astype('<i4').tobytes()
open(f'{OUTD}/{ID}.azp', 'wb').write(gzip.compress(bytes(body), 9, mtime=0))
open(f'{OUTD}/{ID}.azc', 'wb').write(gzip.compress(json.dumps(chart, separators=(',', ':')).encode(), 9, mtime=0))
editions = {c['cell']: {'edition': c.get('DSID_EDTN'), 'update': c.get('DSID_UPDN'), 'issued': c.get('DSID_ISDT'), 'scale': c.get('DSPM_CSCL'), 'source': c['source']} for c in man['cells'] if not own[c['cell']].is_empty}
meta = {'id': ID, 'name': REG['name'], 'origin': [LAT0, LON0], 'datum': REG['datum'], 'iala': REG['iala'], 'landHeight': REG.get('landHeight', 2.5),
        'bounds': [r1(Y0), r1(X0), r1(Y1), r1(X1)], 'fetched': man.get('fetched'), 'cells': editions, 'latMinusNap': lat_minus_nap,
        'faces': faces, 'locks': locks, 'zones': zones, 'buoys': man.get('buoys')}
json.dump(meta, open(f'{OUTD}/{ID}.meta.json', 'w'), separators=(',', ':'))
for ext in ('azp', 'azc', 'meta.json'): print(ext, os.path.getsize(f'{OUTD}/{ID}.{ext}') // 1024, 'KB')

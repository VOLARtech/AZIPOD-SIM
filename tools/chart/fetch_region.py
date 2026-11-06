#!/usr/bin/env python3
"""Fetch official chart data for a region and extract the layers the simulator uses.

usage: fetch_region.py <regions/area.json> <outdir>

Sources (by the region's "sources"):
  noaa  NOAA Office of Coast Survey ENC cells (S-57) intersecting the box: U.S. Government work, public domain.
  rws   Rijkswaterstaat (CC0): inland ENC cells by name from the Vaarweginformatie downloads (picked by file
        name, as file ids change weekly); 1 m bathymetry mosaics through WCS, resampled to the region's
        resolution; buoys and beacons from the PDOK OGC API (already S-57 coded).

Writes one GeoJSON per cell and layer (lon/lat), bathymetry as .npz grids (EPSG:28992), and manifest.json with
cell editions. Needs pyogrio (its wheels carry GDAL with the S-57 driver), numpy; tifffile and pyproj for rws.
Run with python -I on a directory of its own: what comes down is data, never code.
"""
import io, json, os, re, sys, time, urllib.parse, urllib.request, zipfile
import xml.etree.ElementTree as ET

REG = json.load(open(sys.argv[1])); OUT = sys.argv[2]
ONLY = sys.argv[3].split(',') if len(sys.argv) > 3 else None          # e.g. 'wcs' to fetch just the bathymetry again
def want(k): return ONLY is None or k in ONLY
S, W, N, E = REG['bbox']
os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'shipshape-chart-fetch/2.0 (github.com/Theseasparky/AZIPOD-SIM)'}
def get(u, tries=4):
    for k in range(tries):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=300).read()
        except Exception as ex:
            if k == tries - 1: raise
            print('retry', u[:90], ex); time.sleep(2 ** (k + 1))

LAYERS = ['DEPARE', 'DRGARE', 'DEPCNT', 'SOUNDG', 'LNDARE', 'COALNE', 'SLCONS', 'PONTON', 'HULKES', 'BERTHS', 'FAIRWY', 'DOCARE',
          'OBSTRN', 'WRECKS', 'UWTROC', 'BOYLAT', 'BOYSPP', 'BOYSAW', 'BOYCAR', 'BOYISD', 'BOYINB', 'BCNLAT', 'BCNSPP', 'BCNCAR',
          'BCNISD', 'BCNSAW', 'LIGHTS', 'TOPMAR', 'FOGSIG', 'DAYMAR', 'MORFAC', 'PILPNT', 'BRIDGE', 'BUAARE', 'BUISGL', 'LNDMRK',
          'NAVLNE', 'RECTRC', 'TSSLPT', 'TSSBND', 'TSELNE', 'ACHARE', 'SBDARE', 'CAUSWY', 'LOKBSN', 'GATCON', 'M_COVR', 'DRYDOC',
          'FLODOC', 'CRANES', 'DMPGRD', 'SLOTOP', 'DAMCON', 'RIVERS', 'LAKARE', 'CANALS', 'PIPSOL', 'CBLSUB',
          # inland ENC (lower case in GDAL's S-57 tables)
          'wtwaxs', 'notmrk', 'bcnwtw', 'boywtw', 'lkbspt', 'berths', 'termnl', 'trnbsn', 'excnst', 'lokbsn', 'brgare', 'wtwgag', 'vehtrf', 'bunsta', 'refdmp', 'hrbare', 'hrbbsn', 'wtwprf', 'depare']
KEEP = ['OBJNAM', 'NOBJNM', 'DRVAL1', 'DRVAL2', 'VALDCO', 'DEPTH', 'VALSOU', 'CATSLC', 'CATLAM', 'CATCAM', 'CATSPM', 'COLOUR', 'COLPAT',
        'BOYSHP', 'BCNSHP', 'TOPSHP', 'LITCHR', 'SIGPER', 'SIGGRP', 'VALNMR', 'HEIGHT', 'CATLIT', 'EXCLIT', 'LITVIS', 'MLTYLT', 'SECTR1',
        'SECTR2', 'ORIENT', 'CATOBS', 'WATLEV', 'CONDTN', 'HORCLR', 'VERCLR', 'VERCCL', 'VERCOP', 'CATMOR', 'CATWRK', 'NATSUR', 'CATBRG',
        'CATLMK', 'FUNCTN', 'CATCOV', 'CATGAT', 'CATDOC', 'HORLEN', 'HORWID', 'VERLEN', 'STATUS', 'CATFOG', 'SIGGEN', 'CATPIL', 'CATCRN',
        'catgat', 'catbrt', 'catlmk', 'wtwdis', 'cathbr', 'catnmk', 'catwwm', 'catbnk', 'catlkb']

def extract(base, cell, info):
    """Every layer of an S-57 cell, clipped to the box, as GeoJSON."""
    import numpy as np, shapely, pyogrio
    from shapely.geometry import box, mapping
    pyogrio.set_gdal_config_options({'OGR_S57_OPTIONS': 'RETURN_PRIMITIVES=OFF,RETURN_LINKAGES=OFF,LNAM_REFS=ON,SPLIT_MULTIPOINT=ON,ADD_SOUNDG_DEPTH=ON,UPDATES=APPLY,LIST_AS_STRING=OFF'})
    clip = box(W, S, E, N)
    have = {l[0] for l in pyogrio.list_layers(base)}
    for L in LAYERS:
        if L not in have: continue
        try: meta, _, geom, fields = pyogrio.raw.read(base, layer=L)
        except Exception as ex: print('skip', cell, L, ex); continue
        names = list(meta['fields']); feats = []
        for k, wkb in enumerate(geom):
            if wkb is None: continue
            g = shapely.from_wkb(wkb)
            if g.is_empty or not g.intersects(clip): continue
            if not g.within(clip): g = g.intersection(clip)
            if g.is_empty: continue
            props = {}
            for name, col in zip(names, fields):
                if name not in KEEP: continue
                v = col[k]
                if v is None: continue
                if isinstance(v, np.ndarray): v = [x.item() if hasattr(x, 'item') else x for x in v.tolist()]
                elif hasattr(v, 'item'): v = v.item()
                if isinstance(v, float) and v != v: continue
                if v in ('', [], None): continue
                if isinstance(v, str) and name in ('COLOUR', 'COLPAT', 'CATLIT', 'LITVIS', 'STATUS', 'CATSLC', 'NATSUR', 'CATOBS', 'FUNCTN', 'CATSPM', 'CATLMK', 'CATBRG', 'CATGAT'):
                    v = [int(x) for x in re.split(r'[,\s]+', v.strip('()')) if x.strip().lstrip('-').isdigit()] or v
                props[name] = v
            if L == 'SOUNDG' and g.geom_type == 'Point' and g.has_z: props['DEPTH'] = round(g.z, 2)
            feats.append({'type': 'Feature', 'properties': props, 'geometry': mapping(shapely.force_2d(g))})
        if feats:
            json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(OUT, f'{cell}_{L}.geojson'), 'w'), separators=(',', ':'))
            info['layers'][L] = len(feats)
    try:
        meta, _, _, fields = pyogrio.raw.read(base, layer='DSID', read_geometry=False)
        for name, col in zip(meta['fields'], fields):
            if name in ('DSPM_CSCL', 'DSID_EDTN', 'DSID_UPDN', 'DSID_ISDT', 'DSPM_VDAT', 'DSPM_SDAT', 'DSPM_DUNI', 'DSID_INTU'):
                v = col[0]; info[name] = v.item() if hasattr(v, 'item') else v
    except Exception as ex: print('no DSID', cell, ex)

manifest = {'bbox': [S, W, N, E], 'region': REG['id'], 'fetched': time.strftime('%Y-%m-%d'), 'cells': [], 'bathymetry': [], 'buoys': None}
if ONLY and os.path.exists(os.path.join(OUT, 'manifest.json')):
    old = json.load(open(os.path.join(OUT, 'manifest.json')))
    for k in ('cells', 'bathymetry', 'buoys', 'emodnet'): manifest[k] = old.get(k, manifest.get(k))
    if 'wcs' in ONLY: manifest['bathymetry'] = []

# ---------------------------------------------------------------- NOAA ENC
if 'noaa' in REG['sources'] and want('noaa'):
    root = ET.fromstring(get('https://www.charts.noaa.gov/ENCs/ENCProdCat.xml'))
    tag = lambda el: el.tag.rsplit('}', 1)[-1].lower()
    cells = []
    for el in root.iter():
        if tag(el) != 'cell': continue
        name = None; lats = []; lons = []
        for c in el.iter():
            t = tag(c)
            if t == 'name' and name is None and c.text: name = c.text.strip()
            elif t == 'lat' and c.text: lats.append(float(c.text))
            elif t in ('long', 'lon') and c.text: lons.append(float(c.text))
        if name and lats and lons: cells.append((name, min(lats), min(lons), max(lats), max(lons)))
    want = REG['sources']['noaa'].get('cells')
    hit = [c[0] for c in cells if not (c[1] > N or c[3] < S or c[2] > E or c[4] < W) and int(c[0][2]) >= REG['sources']['noaa'].get('minBand', 3)]
    if want: hit = [c for c in hit if any(re.fullmatch(w, c) for w in want)]
    print('NOAA cells:', hit)
    for name in hit:
        z = zipfile.ZipFile(io.BytesIO(get(f'https://www.charts.noaa.gov/ENCs/{name}.zip')))
        d = os.path.join(OUT, '_enc', name); z.extractall(d)
        base = next((os.path.join(r, f) for r, _, fs in os.walk(d) for f in fs if f.endswith('.000')), None)
        if not base: print('no .000 in', name); continue
        info = {'cell': name, 'source': 'noaa', 'layers': {}}
        extract(base, name, info)
        manifest['cells'].append(info); print(name, info.get('DSPM_CSCL'), info['layers'])

# ---------------------------------------------------------------- Rijkswaterstaat
if 'rws' in REG['sources']:
    R = REG['sources']['rws']
    if R.get('ienc') and want('ienc'):
        lst = json.loads(get('https://www.vaarweginformatie.nl/frp/api/webcontent/downloads?pageId=infra/enc'))
        f = next(x for x in lst if x['name'].startswith(R['ienc']['file']))
        print('inland ENC:', f['name'], f['fileId'])
        url = f"https://www.vaarweginformatie.nl/fdd/main/wicket/resource/org.apache.wicket.Application/downloadfileResource?fileId={f['fileId']}"
        z = zipfile.ZipFile(io.BytesIO(get(url)))
        for name in R['ienc']['cells']:
            members = [m for m in z.namelist() if re.search(rf'{name}\.\d\d\d$', m)]
            if not members: print('cell not in the download:', name); continue
            d = os.path.join(OUT, '_enc', name); os.makedirs(d, exist_ok=True)
            for m in members: open(os.path.join(d, os.path.basename(m)), 'wb').write(z.read(m))
            base = os.path.join(d, f'{name}.000')
            info = {'cell': name, 'source': 'rws-ienc', 'file': f['name'], 'layers': {}}
            extract(base, name, info)
            manifest['cells'].append(info); print(name, info.get('DSPM_CSCL'), info['layers'])
    if R.get('wcs') and want('wcs'):
        import numpy as np, tifffile
        from pyproj import Transformer
        tr = Transformer.from_crs('EPSG:4326', 'EPSG:28992', always_xy=True)
        xs, ys = zip(*[tr.transform(lon, lat) for lon, lat in [(W, S), (E, S), (E, N), (W, N)]])
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        for req in R['wcs']:
            cov, res = req['coverage'], req['res']
            bs, bw, bn, be = req.get('bbox', REG['bbox'])
            xs, ys = zip(*[tr.transform(lon, lat) for lon, lat in [(bw, bs), (be, bs), (be, bn), (bw, bn)]])
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            # in tiles of at most 2000 × 2000 cells, resampled by the server (WCS 2.0 scaling extension)
            T = 2000 * res; tiles = []
            for tx in range(int(x0 // T), int(x1 // T) + 1):
                for ty in range(int(y0 // T), int(y1 // T) + 1):
                    bx0, by0 = max(x0, tx * T), max(y0, ty * T); bx1, by1 = min(x1, (tx + 1) * T), min(y1, (ty + 1) * T)
                    if bx1 - bx0 < res or by1 - by0 < res: continue
                    q = urllib.parse.urlencode([('service', 'WCS'), ('version', '2.0.1'), ('request', 'GetCoverage'), ('coverageId', cov),
                        ('format', 'image/tiff'), ('subset', f'X({bx0:.0f},{bx1:.0f})'), ('subset', f'Y({by0:.0f},{by1:.0f})'),
                        ('scalesize', f'http://www.opengis.net/def/axis/OGC/1/i({round((bx1 - bx0) / res)}),http://www.opengis.net/def/axis/OGC/1/j({round((by1 - by0) / res)})')])
                    try: b = get('https://geo.rijkswaterstaat.nl/services/ogc/gdr/bodemhoogte_1mtr/ows?' + q)
                    except Exception as ex: print('tile failed', cov, ex); continue
                    if not b.startswith(b'II') and not b.startswith(b'MM'): print('not a tiff', cov, b[:300]); continue
                    a = tifffile.imread(io.BytesIO(b)).astype('float32')
                    if a.ndim > 2: a = a[..., 0]
                    tiles.append({'x0': bx0, 'y1': by1, 'res': (bx1 - bx0) / a.shape[1], 'z': a})
                    print(cov, res, 'tile', a.shape, float(np.nanmin(a)), float(np.nanmax(a)))
            if not tiles: continue
            np.savez_compressed(os.path.join(OUT, f'wcs_{cov}_{res}m.npz'), **{f't{i}_{k}': v for i, t in enumerate(tiles) for k, v in t.items()})
            manifest['bathymetry'].append({'coverage': cov, 'tiles': len(tiles), 'res': res, 'crs': 'EPSG:28992'})
    if R.get('buoys') and want('buoys'):
        feats = []
        for coll in ('vaarweg_markeringen_drijvend_rd', 'vaarweg_markeringen_vast_rd'):
            url = f'https://api.pdok.nl/rws/vaarwegmarkeringen-nederland/ogc/v1/collections/{coll}/items?f=json&limit=1000&bbox={W},{S},{E},{N}'
            while url:
                j = json.loads(get(url))
                for ft in j.get('features', []): ft['properties']['_collection'] = coll; feats.append(ft)
                url = next((l['href'] for l in j.get('links', []) if l.get('rel') == 'next'), None)
        json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(OUT, 'pdok_buoys.geojson'), 'w'), separators=(',', ':'))
        manifest['buoys'] = {'source': 'PDOK Vaarwegmarkeringen Nederland (Rijkswaterstaat, CC0)', 'count': len(feats)}; print('buoys', len(feats))

# ---------------------------------------------------------------- EMODnet (the open sea where nobody else has surveyed)
# the EMODnet Bathymetry DTM, 1/16 arc-minute (≈ 115 m), depths below LAT, CC BY 4.0
if REG.get('emodnet') and want('emodnet'):
    import numpy as np, tifffile
    es, ew, en, ee = REG['emodnet'].get('bbox', REG['bbox'])
    b = get('https://ows.emodnet-bathymetry.eu/wcs?' + urllib.parse.urlencode([('SERVICE', 'WCS'), ('VERSION', '2.0.1'), ('REQUEST', 'GetCoverage'),
        ('coverageId', 'emodnet__mean'), ('format', 'image/tiff'), ('subset', f'Lat({es},{en})'), ('subset', f'Long({ew},{ee})')]))
    if b[:2] in (b'II', b'MM'):
        t = tifffile.TiffFile(io.BytesIO(b)); pg = t.pages[0]; tf = pg.tags['ModelTransformationTag'].value
        a = pg.asarray().astype('float32')
        np.savez_compressed(os.path.join(OUT, 'emodnet.npz'), z=a, lon0=tf[3], lat1=tf[7], dlon=tf[0], dlat=-tf[5])
        manifest['emodnet'] = {'shape': list(a.shape), 'lon0': tf[3], 'lat1': tf[7], 'cell': tf[0], 'datum': 'LAT', 'licence': 'CC BY 4.0'}
        print('EMODnet', a.shape, float(np.nanmin(a)), float(np.nanmax(a)))
    else: print('EMODnet: not a tiff', b[:200])
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print('done:', OUT)

#!/usr/bin/env python3
"""Fetch NOAA ENC cells covering a bounding box and extract the chart layers the simulator uses.

Runs in GitHub Actions (needs GDAL with the S-57 driver). Output: one GeoJSON per cell and layer,
clipped to the box, plus a manifest. NOAA ENCs are U.S. Government works (public domain);
this derived data is for simulation only, not navigation.
usage: fetch_noaa.py S W N E outdir
"""
import io, json, os, re, sys, urllib.request, zipfile
import xml.etree.ElementTree as ET

S, W, N, E = map(float, sys.argv[1:5]); OUT = sys.argv[5]
os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'azipod-bridge-chart-fetch/1.0 (github.com/VOLARtech/AZIPOD-SIM)'}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=180).read()

cat = get('https://www.charts.noaa.gov/ENCs/ENCProdCat.xml')
root = ET.fromstring(cat)
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
    if name and lats and lons:
        cells.append((name, min(lats), min(lons), max(lats), max(lons)))
print(f'catalog: {len(cells)} cells')
hit = [c for c in cells if not (c[1] > N or c[3] < S or c[2] > E or c[4] < W)]
print('intersecting:', [c[0] for c in hit])
if not cells:
    open(os.path.join(OUT, 'catalog-head.xml'), 'wb').write(cat[:20000])

from osgeo import ogr, gdal
gdal.UseExceptions()
gdal.SetConfigOption('OGR_S57_OPTIONS', 'RETURN_PRIMITIVES=OFF,RETURN_LINKAGES=OFF,LNAM_REFS=ON,SPLIT_MULTIPOINT=ON,ADD_SOUNDG_DEPTH=ON,UPDATES=APPLY')
LAYERS = ['DEPARE', 'DRGARE', 'DEPCNT', 'SOUNDG', 'LNDARE', 'COALNE', 'SLCONS', 'PONTON', 'HULKES', 'BERTHS', 'FAIRWY',
          'OBSTRN', 'WRECKS', 'UWTROC', 'BOYLAT', 'BOYSPP', 'BOYSAW', 'BOYCAR', 'BCNLAT', 'BCNSPP', 'LIGHTS', 'MORFAC',
          'PILPNT', 'BRIDGE', 'BUAARE', 'BUISGL', 'LNDMRK', 'NAVLNE', 'RECTRC', 'TSSLPT', 'ACHARE', 'SBDARE', 'CAUSWY']
KEEP = ['OBJNAM', 'DRVAL1', 'DRVAL2', 'VALDCO', 'DEPTH', 'VALSOU', 'CATSLC', 'CATLAM', 'CATCAM', 'COLOUR', 'COLPAT', 'BOYSHP',
        'BCNSHP', 'LITCHR', 'SIGPER', 'SIGGRP', 'VALNMR', 'HEIGHT', 'CATOBS', 'WATLEV', 'CONDTN', 'HORCLR', 'VERCLR', 'CATMOR',
        'CATWRK', 'ORIENT', 'NATSUR', 'CATBRG', 'SECTR1', 'SECTR2', 'CATLMK', 'FUNCTN']
clip = ogr.CreateGeometryFromWkt(f'POLYGON(({W} {S},{E} {S},{E} {N},{W} {N},{W} {S}))')
manifest = []
for name, *_ in hit:
    try:
        z = zipfile.ZipFile(io.BytesIO(get(f'https://www.charts.noaa.gov/ENCs/{name}.zip')))
    except Exception as ex:
        print('download failed', name, ex); continue
    d = os.path.join('/tmp/enc', name); z.extractall(d)
    base = next((os.path.join(r, f) for r, _, fs in os.walk(d) for f in fs if f.endswith('.000')), None)
    if not base: print('no .000 in', name); continue
    ds = ogr.Open(base)
    info = {'cell': name, 'layers': {}}
    for L in LAYERS:
        lyr = ds.GetLayerByName(L)
        if lyr is None: continue
        feats = []
        for f in lyr:
            g = f.GetGeometryRef()
            if g is None: continue
            g = g.Intersection(clip) if not g.Within(clip) else g
            if g is None or g.IsEmpty(): continue
            props = {}
            for k in KEEP:
                i = f.GetFieldIndex(k)
                if i >= 0 and f.IsFieldSet(i):
                    v = f.GetField(i)
                    if v not in (None, '', []): props[k] = v
            if L == 'SOUNDG':
                props['DEPTH'] = round(g.GetZ(), 2) if g.GetCoordinateDimension() == 3 else props.get('DEPTH')
            feats.append({'type': 'Feature', 'properties': props, 'geometry': json.loads(g.ExportToJson())})
        if feats:
            json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(OUT, f'{name}_{L}.geojson'), 'w'), separators=(',', ':'))
            info['layers'][L] = len(feats)
    # chart metadata: compilation scale, datum
    dsid = ds.GetLayerByName('DSID')
    if dsid:
        f = dsid.GetNextFeature()
        if f:
            for k in ('DSPM_CSCL', 'DSID_EDTN', 'DSID_UPDN', 'DSID_ISDT', 'DSPM_VDAT', 'DSPM_SDAT', 'DSPM_DUNI'):
                i = f.GetFieldIndex(k)
                if i >= 0: info[k] = f.GetField(i)
    manifest.append(info); print(json.dumps(info))
json.dump({'bbox': [S, W, N, E], 'source': 'NOAA Office of Coast Survey ENC (S-57), public domain', 'cells': manifest},
          open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)

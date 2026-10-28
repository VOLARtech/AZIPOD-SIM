#!/usr/bin/env python3
"""Download the ship models listed in models.json from Sketchfab (glTF zip) into a work folder;
models supplied with the repository ("file") are unpacked there instead.

usage: SKETCHFAB_TOKEN=... fetch_sketchfab.py WORKDIR [name ...]
Each model lands in WORKDIR/<name>/ (scene.gltf, scene.bin, textures/). Needs a Sketchfab API token
(Settings → Password & API). Models are CC Attribution: keep the credits in models.json.
"""
import io, json, os, subprocess, sys, urllib.request, zipfile

here = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(os.path.join(here, 'models.json')))['models']
work, names = sys.argv[1], sys.argv[2:] or list(M)
tok = os.environ.get('SKETCHFAB_TOKEN')
for name in names:
    dst = os.path.join(work, name)
    if os.path.exists(os.path.join(dst, 'scene.gltf')): print('have', name); continue
    if 'file' in M[name]:
        # supplied with the repository (tools/ship/sources): unpack the .glb to the same layout
        os.makedirs(dst, exist_ok=True)
        subprocess.run(['npx', '--yes', '@gltf-transform/cli@4.5.1', 'copy', os.path.join(here, M[name]['file']), os.path.join(dst, 'scene.gltf')], check=True)
        continue
    if not tok: sys.exit('set SKETCHFAB_TOKEN')
    req = urllib.request.Request(f"https://api.sketchfab.com/v3/models/{M[name]['uid']}/download", headers={'Authorization': 'Token ' + tok})
    links = json.load(urllib.request.urlopen(req, timeout=60))
    g = links.get('gltf')
    if not g: print('no gltf for', name, list(links)); continue
    print(f"{name}: {g['size'] / 1e6:.1f} MB")
    data = urllib.request.urlopen(g['url'], timeout=600).read()
    zipfile.ZipFile(io.BytesIO(data)).extractall(dst)

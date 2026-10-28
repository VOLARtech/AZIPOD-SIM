#!/usr/bin/env python3
"""Rebuild the app's ship models from the downloaded glTFs (see fetch_sketchfab.py).

usage: build_models.py WORKDIR [--registry] [name ...]
For each model in models.json: prepare_ship.py (fit to the first ship that uses it), optimise.sh
(simplify, WebP, meshopt → .glb), copy to src/view3d/models/<name>.glb, and write
src/view3d/models/models.json: which ships use it, the credit line, and where the bridge is.
--registry rewrites only models.json from the last conversion (no prepare/optimise).
"""
import json, os, shutil, subprocess, sys
import numpy as np

here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(os.path.dirname(here))
work, only = sys.argv[1], [a for a in sys.argv[2:] if a != '--registry']
registry_only = '--registry' in sys.argv
M = json.load(open(os.path.join(here, 'models.json')))['models']
dims = json.loads(subprocess.run(['npx', 'tsx', os.path.join(here, 'dims.ts')], capture_output=True, text=True, cwd=root, check=True).stdout)
dst = os.path.join(root, 'src', 'view3d', 'models'); os.makedirs(dst, exist_ok=True)
reg_path = os.path.join(dst, 'models.json')
reg = json.load(open(reg_path)) if os.path.exists(reg_path) else {}

def eye(meta, bridgeX):
    """Bridge front from the centreline height profile: the front of the tall block nearest the conning position.
    The eye goes just ahead of it: the models' windows are opaque, so from inside the wheelhouse you'd see only walls."""
    top = np.array(meta['top']); n = len(top); x = np.linspace(meta['stern'], meta['stem'], n + 1); xc = (x[:-1] + x[1:]) / 2
    sm = np.array([np.median(top[max(0, i - 1):i + 2]) for i in range(n)])          # masts and posts are thin: median them out
    hs = 0.6 * sm.max()
    tall = np.where(sm >= hs)[0]
    if not len(tall): return None
    i = tall[np.argmin(np.abs(xc[tall] - bridgeX))]
    while i + 1 < n and sm[i + 1] >= hs: i += 1                                         # walk forward to the front of the block
    front = x[i + 1]
    return {'x': round(float(front + 0.5), 2), 'h': round(float(sm[max(0, i - 2):i + 1].max() - 2.2), 2)}

for name, m in M.items():
    if only and name not in only: continue
    src = os.path.join(work, name)
    if not os.path.exists(os.path.join(src, 'scene.gltf')): print('missing download:', name); continue
    d = dims[m['ships'][0]]
    meta_p = os.path.join(src, 'meta.json')
    args = ['python3', os.path.join(here, 'prepare_ship.py'), src, '--stem', str(d['stem']), '--stern', str(d['stern']),
            '--beam', str(d['beam']), '--draught', str(d['draught']), '--meta', meta_p] + m.get('prepare', [])
    if not registry_only:
        print('==', name, '→', ', '.join(m['ships'])); subprocess.run(args, check=True)
        out = os.path.join(src, name + '.glb')
        subprocess.run([os.path.join(here, 'optimise.sh'), src, out, str(m.get('ratio', 0.35)), str(m.get('tex', 1024)), str(m.get('err', 0.001))], check=True, cwd=work)
        shutil.copy(out, os.path.join(dst, name + '.glb'))
    meta = json.load(open(meta_p))
    reg[name] = {'ships': m['ships'], 'credit': {'title': m['name'], 'author': m['author'], 'license': m['license'], 'url': m['url']},
                 'eye': m.get('eye') or eye(meta, d['bridgeX']), 'top': meta['ymax'],
                 'fit': {k: d[k] for k in ('stem', 'stern', 'beam', 'draught')}}
json.dump(reg, open(reg_path, 'w'), indent=1); open(reg_path, 'a').write('\n')
print('registry:', ', '.join(reg))

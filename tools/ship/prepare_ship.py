#!/usr/bin/env python3
"""Fit a glTF ship model (Sketchfab download) to one of the simulator's ships, keeping its textures.

Writes a cleaned glTF next to the source (ship.gltf + ship.bin, textures shared) in the 3D view's
ship frame: X = starboard, Y = up (0 = design waterline), Z = aft, metres, origin at the CG.
  - length from stern to stem exactly as the chart outline draws the hull (contact.buildHull)
  - beam nudged to the ship's (±20 %), keel at the design draught
  - the bow found from the waterline shape (fine stem, wide transom) unless --bow is given
  - propellers, rudders, pods and Z-drives under the stern left out: the app draws its own, moving
  - sea planes and ground left out; materials kept (base colour, emissive, transparency)
Then: optimise.sh simplifies, compresses textures to WebP and packs a .glb for the app.

usage: prepare_ship.py MODEL_DIR --stem X --stern X --beam B --draught T [--bow auto|fwd|aft]
                       [--keel-q 0.002] [--drop REGEX] [--meta OUT.json]
"""
import argparse, json, os, re, struct
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('--stem', type=float, required=True); ap.add_argument('--stern', type=float, required=True)
ap.add_argument('--beam', type=float, required=True); ap.add_argument('--draught', type=float, required=True)
ap.add_argument('--bow', default='auto', help='auto, or fwd/aft: whether the model\'s bow already points to its −length end')
ap.add_argument('--keel-q', type=float, default=0.002)
ap.add_argument('--drop', default='')
ap.add_argument('--keep-gear', action='store_true', help='keep the model\'s own propulsors')
ap.add_argument('--meta')
a = ap.parse_args()

AUTO_DROP = re.compile(r'(water|ocean|sea_?plane|^sea$|ground|floor|backdrop|shadow|wave|splash|foam)', re.I)
user_drop = re.compile(a.drop, re.I) if a.drop else None
g = json.load(open(os.path.join(a.dir, 'scene.gltf')))
bufs = [open(os.path.join(a.dir, b['uri']), 'rb').read() for b in g['buffers']]
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

def acc(i):
    A = g['accessors'][i]; n, k, dt = A['count'], NC[A['type']], np.dtype(CT[A['componentType']])
    bv = g['bufferViews'][A['bufferView']]; off = bv.get('byteOffset', 0) + A.get('byteOffset', 0)
    stride = bv.get('byteStride', 0) or k * dt.itemsize
    raw = np.frombuffer(bufs[bv['buffer']], np.uint8, count=stride * (n - 1) + k * dt.itemsize, offset=off)
    out = np.lib.stride_tricks.as_strided(raw, shape=(n, k * dt.itemsize), strides=(stride, 1)).copy().view(dt).reshape(n, k)
    if A.get('normalized'): out = out.astype(np.float32) / np.iinfo(dt).max
    return out

def mat4(n):
    if 'matrix' in n: return np.array(n['matrix'], np.float64).reshape(4, 4).T
    T = np.eye(4); x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    T[:3, :3] = R * np.array(n.get('scale', [1, 1, 1])); T[:3, 3] = n.get('translation', [0, 0, 0])
    return T

# flatten the scene: every triangle primitive in world space
prims = []
def visit(ni, M, names):
    n = g['nodes'][ni]; W = M @ mat4(n); nm = names + [n.get('name', '')]
    if 'mesh' in n:
        mesh = g['meshes'][n['mesh']]
        for p in mesh['primitives']:
            if p.get('mode', 4) != 4: continue
            mat = g['materials'][p['material']] if 'material' in p else {}
            short = ' '.join(nm[-2:] + [mesh.get('name', ''), mat.get('name', '')])
            if AUTO_DROP.search(short) or (user_drop and user_drop.search(' '.join(nm + [mesh.get('name', ''), mat.get('name', '')]))): continue
            P = acc(p['attributes']['POSITION'])[:, :3].astype(np.float64)
            P = (W @ np.c_[P, np.ones(len(P))].T).T[:, :3]
            Nn = acc(p['attributes']['NORMAL'])[:, :3].astype(np.float64) @ np.linalg.inv(W[:3, :3]) if 'NORMAL' in p['attributes'] else None
            I = acc(p['indices']).reshape(-1).astype(np.int64) if 'indices' in p else np.arange(len(P))
            if np.linalg.det(W[:3, :3]) < 0: I = I.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)   # mirrored node: keep the winding
            uv = {k: acc(v)[:, :2] for k, v in p['attributes'].items() if k.startswith('TEXCOORD_')}
            col = acc(p['attributes']['COLOR_0']) if 'COLOR_0' in p['attributes'] else None
            prims.append(dict(P=P, N=Nn, I=I.reshape(-1, 3), uv=uv, col=col, mat=p.get('material')))
    for c in n.get('children', []): visit(c, W, nm)
for r in g['scenes'][g.get('scene', 0)]['nodes']: visit(r, np.eye(4), [])
V = np.concatenate([p['P'] for p in prims])
print(f'{len(prims)} primitives, {sum(len(p["I"]) for p in prims)} triangles')

# ---- frame: length along Z, bow toward −Z, scale, beam, keel
R = np.eye(3)
ext = V.max(0) - V.min(0)
if ext[0] > ext[2]: R = np.array([[0, 0, -1], [0, 1, 0], [1, 0, 0]], float) @ R      # x → z (a rotation)
V1 = V @ R.T
lo, hi = np.quantile(V1[:, 1], [0.01, 0.99]); band = (V1[:, 1] > lo) & (V1[:, 1] < lo + 0.35 * (hi - lo))
z0, z1 = V1[:, 2].min(), V1[:, 2].max(); Lm = z1 - z0; xc = np.median(V1[band, 0])
def width(at):
    m = band & (np.abs(V1[:, 2] - at) < 0.06 * Lm)
    return np.quantile(np.abs(V1[m, 0] - xc), 0.95) if m.sum() > 10 else 0
fwd = width(z0 + 0.04 * Lm) < width(z1 - 0.04 * Lm) if a.bow == 'auto' else a.bow == 'fwd'
if not fwd: R = np.diag([-1, 1, -1.0]) @ R                                         # turn her round
V1 = V @ R.T
s = (a.stem - a.stern) / (V1[:, 2].max() - V1[:, 2].min())
V1 *= s
xc = np.median(V1[:, 0])
lo, hi = np.quantile(V1[:, 1], [0.01, 0.99]); low = V1[:, 1] < lo + 0.3 * (hi - lo)
Bm = 2 * np.quantile(np.abs(V1[low, 0] - xc), 0.995)
kb = float(np.clip(a.beam / Bm, 0.8, 1.25))
print(f'bow {"as modelled" if fwd else "turned round"}, scale {s:.5f}, beam {Bm:.1f} → {Bm * kb:.1f} m (×{kb:.3f})')
A = np.diag([kb, 1, 1]) @ (s * R)                     # linear part
t = np.array([-xc * kb, 0, 0])
def place(P): return P @ A.T + t
V2 = place(V)
t[2] += -a.stem - V2[:, 2].min()
V2 = place(V)

# keel from the wide pieces (the hull), propulsors left out: connected pieces per primitive
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
pieces = []   # (prim index, triangle mask of a piece)
lo_all = []
for k, p in enumerate(prims):
    P = place(p['P']); q = np.round(P / 0.003).astype(np.int64)
    _, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.reshape(-1)
    F = inv[p['I']]; nW = inv.max() + 1
    E = np.r_[F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]
    nc, lab = connected_components(coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(nW, nW)), directed=False)
    fl = lab[F[:, 0]]
    PW = np.zeros((nW, 3)); PW[inv] = P
    lo_c = np.full((nc, 3), np.inf); hi_c = np.full((nc, 3), -np.inf)
    np.minimum.at(lo_c, lab, PW); np.maximum.at(hi_c, lab, PW)
    p['_fl'], p['_lo'], p['_hi'] = fl, lo_c, hi_c
ys = []
for p in prims:
    wide = (p['_hi'][:, 0] - p['_lo'][:, 0]) > 0.45 * a.beam
    tri = wide[p['_fl']]
    if tri.any(): ys.append(place(p['P'])[np.unique(p['I'][tri])][:, 1])
ys = np.concatenate(ys) if ys else V2[:, 1]
keel = np.quantile(ys, a.keel_q)
t[1] -= keel + a.draught
L = a.stem - a.stern
dropped = 0
for p in prims:
    lo_c, hi_c = p['_lo'].copy(), p['_hi'].copy(); lo_c[:, 1] -= keel + a.draught; hi_c[:, 1] -= keel + a.draught
    wide = (hi_c[:, 0] - lo_c[:, 0]) > 0.45 * a.beam
    gear = (-lo_c[:, 2] < a.stern + 0.32 * L) & ((hi_c[:, 2] - lo_c[:, 2]) < 0.2 * L) & (hi_c[:, 1] < -0.15 * a.draught) & ~wide
    if a.keep_gear: gear[:] = False
    keep = ~gear[p['_fl']]; dropped += (~keep).sum(); p['I'] = p['I'][keep]
print(f'left out {dropped} triangles of propellers, rudders and pods under the stern')

# ---- write ship.gltf / ship.bin
out_bin = bytearray(); bviews, accs = [], []
def add(arr, target=None, comp=5126, typ='VEC3', mm=False):
    arr = np.ascontiguousarray(arr); off = len(out_bin); out_bin.extend(arr.tobytes())
    while len(out_bin) % 4: out_bin.append(0)
    bv = {'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes}
    if target: bv['target'] = target
    bviews.append(bv)
    A = {'bufferView': len(bviews) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if mm: A['min'] = arr.min(0).tolist(); A['max'] = arr.max(0).tolist()
    accs.append(A); return len(accs) - 1
nmat = np.linalg.inv(A).T
meshes = []; ymax = -1e9
for p in prims:
    if not len(p['I']): continue
    P = place(p['P']).astype(np.float32); ymax = max(ymax, float(P[:, 1].max()))
    # weld on position and texture coordinates, leave the normals out: many models are flat-shaded
    # with a vertex per triangle corner, which the simplifier cannot reduce; three.js shades
    # a mesh without normals flat, which suits hulls and superstructures
    m = g['materials'][p['mat']] if p['mat'] is not None and 'materials' in g else {}
    tc = {f"TEXCOORD_{t.get('texCoord', 0)}" for t in (m.get('pbrMetallicRoughness', {}).get('baseColorTexture'), m.get('emissiveTexture')) if t}
    p['uv'] = {k: v for k, v in p['uv'].items() if k in tc}            # untextured: the UVs only split vertices
    key = [np.round(P / 0.002)]
    for k in sorted(p['uv']): key.append(np.round(p['uv'][k] * 4096))
    if p['col'] is not None: key.append(np.round(p['col'] * 255))
    _, first, inv = np.unique(np.concatenate(key, 1).astype(np.int64), axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1); I = inv[p['I']]
    I = I[(I[:, 0] != I[:, 1]) & (I[:, 1] != I[:, 2]) & (I[:, 0] != I[:, 2])]
    if not len(I): continue
    attrs = {'POSITION': add(P[first], 34962, mm=True)}
    for k, uv in p['uv'].items(): attrs[k] = add(uv[first].astype(np.float32), 34962, typ='VEC2')
    if p['col'] is not None: attrs['COLOR_0'] = add(p['col'][first].astype(np.float32), 34962, typ='VEC4' if p['col'].shape[1] == 4 else 'VEC3')
    prim = {'attributes': attrs, 'indices': add(I.astype(np.uint32).reshape(-1), 34963, comp=5125, typ='SCALAR')}
    if p['mat'] is not None: prim['material'] = p['mat']
    meshes.append({'primitives': [prim]})
mats = []
for m in g.get('materials', []):
    pbr = m.get('pbrMetallicRoughness', {})
    nm = {'name': m.get('name', ''), 'pbrMetallicRoughness': {'baseColorFactor': pbr.get('baseColorFactor', [1, 1, 1, 1]), 'metallicFactor': 0.0, 'roughnessFactor': 0.62}}
    if 'baseColorTexture' in pbr: nm['pbrMetallicRoughness']['baseColorTexture'] = {'index': pbr['baseColorTexture']['index'], 'texCoord': pbr['baseColorTexture'].get('texCoord', 0)}
    for k in ('emissiveTexture', 'emissiveFactor', 'alphaMode', 'alphaCutoff', 'doubleSided'):
        if k in m: nm[k] = m[k]
    mats.append(nm)
used = {nm['pbrMetallicRoughness'].get('baseColorTexture', {}).get('index') for nm in mats} | {nm.get('emissiveTexture', {}).get('index') for nm in mats}
src = os.path.abspath(a.dir)
images = [dict(im) for im in g.get('images', [])]
for im in images:
    if 'bufferView' in im: raise SystemExit('embedded images: not handled (download the glTF zip)')
out = {'asset': {'version': '2.0', 'generator': 'azipod-sim prepare_ship.py'},
       'scene': 0, 'scenes': [{'nodes': list(range(len(meshes)))}],
       'nodes': [{'mesh': i} for i in range(len(meshes))], 'meshes': meshes, 'materials': mats,
       'textures': g.get('textures', []), 'images': images, 'samplers': g.get('samplers', []),
       'accessors': accs, 'bufferViews': bviews, 'buffers': [{'uri': 'ship.bin', 'byteLength': len(out_bin)}]}
if not out['textures']: del out['textures'], out['images'], out['samplers']
open(os.path.join(a.dir, 'ship.bin'), 'wb').write(out_bin)
json.dump(out, open(os.path.join(a.dir, 'ship.gltf'), 'w'))
print(f'wrote {a.dir}/ship.gltf ({len(out_bin) / 1e6:.1f} MB geometry, {len(images)} images), top {ymax:.1f} m above WL')

if a.meta:
    # centreline height profile: where the superstructure is (bridge camera placement)
    allP = np.concatenate([place(p['P'])[np.unique(p['I'])] for p in prims if len(p['I'])])
    x = -allP[:, 2]; y = allP[:, 1]; cl = np.abs(allP[:, 0]) < 0.3 * a.beam
    bins = np.linspace(a.stern, a.stem, 81); top = []
    for i in range(80):
        m = cl & (x >= bins[i]) & (x < bins[i + 1]); top.append(round(float(np.quantile(y[m], 0.97)), 2) if m.sum() > 5 else 0.0)
    json.dump({'stem': a.stem, 'stern': a.stern, 'top': top, 'ymax': round(ymax, 2)}, open(a.meta, 'w'))

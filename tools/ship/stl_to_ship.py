#!/usr/bin/env python3
"""Turn a ship STL into the simulator's compact 3D model (.bin) with a painted livery.

STL carries no colour, so each triangle gets a paint class from where it sits and which way it
faces (antifouling below the waterline, boot top, white hull and superstructure, balcony bands,
dark glass, funnel, decks, lifeboats). Output frame = the ship group's local frame in the 3D view:
X = starboard, Y = up (0 at the design waterline), Z = aft, metres, origin at the CG.

usage: stl_to_ship.py model.stl out.bin --loa 292.5 --draught 7.8 --bow-x 155.8 [--bow -x]
format: 'SHP2', u32 nClasses, then per class: u8 class, u32 nVerts, u32 nIdx,
        i16 xyz[nVerts] (×0.005 m), pad4, i8 normal xyz[nVerts] (×1/127), pad4,
        u16|u32 idx[nIdx] (u32 when nVerts > 65535), pad4. Normals are creased at ~38°.
"""
import argparse, struct
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('stl'); ap.add_argument('out')
ap.add_argument('--loa', type=float, required=True)
ap.add_argument('--draught', type=float, required=True)
ap.add_argument('--bow-x', type=float, required=True, help='body x of the stem relative to the CG [m]')
ap.add_argument('--drop', action='append', default=[], help='x0,x1,z0,z1 (metres, before LOA scaling, x from model origin): remove the triangles inside, e.g. the model\'s own pods')
ap.add_argument('--model-units', type=float, default=0.3, help='metres of full-size ship per STL unit (1:300 mm → 0.3)')
args = ap.parse_args()

d = open(args.stl, 'rb').read()
n = struct.unpack('<I', d[80:84])[0]
V = np.frombuffer(d[84:84 + 50 * n], dtype=np.dtype([('n', '<3f4'), ('v', '<9f4'), ('a', '<u2')]))['v'].reshape(-1, 3, 3).astype(np.float64)
V *= args.model_units
for box in args.drop:
    x0, x1, z0, z1 = map(float, box.split(','))
    cc = V.mean(1)
    keep = ~((cc[:, 0] > x0) & (cc[:, 0] < x1) & (cc[:, 2] > z0) & (cc[:, 2] < z1))
    print('dropped', (~keep).sum(), 'triangles in', box)
    V = V[keep]
# model: bow toward −x, z up from the keel
s = args.loa / (V[..., 0].max() - V[..., 0].min())
V *= s
mx0 = V[..., 0].min()
c = V.mean(1)
N = np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0]); N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
z = c[:, 2]; x = c[:, 0] - mx0; ay = np.abs(c[:, 1]); L = args.loa  # x: metres aft of the stem
T = args.draught
nz, ny, nx = N[:, 2], N[:, 1], N[:, 0]
vert = np.abs(nz) < 0.3

# hull half-breadth along the length (outer plating), for "is this the ship's side?"
bins = np.linspace(0, L, 120); hb = np.zeros(len(bins))
for i in range(len(bins)):
    m = (np.abs(x - bins[i]) < L / 120) & (z < 20 * s)
    hb[i] = ay[m].max() if m.any() else 0
halfB = np.interp(x, bins, hb)
side = vert & (np.abs(ny) > 0.75) & (ay > halfB - 0.6)

# Paint that follows height (antifouling, boot top, sheer stripe, balcony bands, dark glass) is
# applied per pixel in the shader: hull triangles are far too large to colour per face.
# Here only the parts that are separate small objects get their own class.
BODY, FUNNEL, TEAK, BOATS = range(4)
cls = np.full(len(V), BODY, np.uint8)
up = nz > 0.85
cls[up & (((x < 40) & (z < 27 * s)) | ((z > 40 * s) & (z < 46 * s) & (ay < 12)))] = TEAK
boat = (x > 88) & (x < 248) & (z > 20.5 * s) & (z < 25.8 * s) & (ay > 11.5 * s) & ~(np.abs(nz) > 0.97) & ~(side & (ay > 15.3 * s)) & ~(vert & (np.abs(ny) > 0.97) & (ay < 12.7 * s))
cls[boat] = BOATS
cls[(x > 175) & (x < 215) & (z > 43.5 * s)] = FUNNEL
for k, nme in enumerate(['body', 'funnel', 'teak', 'boats']):
    print(f'{nme:12s} {(cls == k).sum():6d}')

# to the view's local frame: X = starboard (+model y), Y = up from the waterline, Z = −body x
bx = args.bow_x - (V[..., 0] - mx0)           # body x (forward +)
P = np.stack([V[..., 1], V[..., 2] - T, -bx], -1)  # (n, 3, 3)
Q = np.round(P / 0.005).astype(np.int32)
assert np.abs(Q).max() < 32767

def crease_normals(tri, cos_lim=np.cos(np.radians(38))):
    """Smooth normals that stay sharp across edges steeper than ~38° (hard chines, deck edges)."""
    Pq = np.round(tri / 0.005).astype(np.int64).reshape(-1, 3)
    uniq, vid = np.unique(Pq, axis=0, return_inverse=True); vid = vid.reshape(-1, 3)
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); area = np.linalg.norm(fn, axis=1) + 1e-12
    fu = fn / area[:, None]
    corner_v = vid.reshape(-1); corner_f = np.repeat(np.arange(len(tri)), 3)
    order = np.argsort(corner_v, kind='stable'); cv, cf = corner_v[order], corner_f[order]
    starts = np.flatnonzero(np.r_[True, cv[1:] != cv[:-1]]); ends = np.r_[starts[1:], len(cv)]
    out = np.zeros((len(corner_v), 3))
    for a0, b0 in zip(starts, ends):
        fs = cf[a0:b0]; nf = fu[fs]
        w = (nf @ nf.T > cos_lim) * area[fs][None, :]
        nrm = w @ nf
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
        out[order[a0:b0]] = nrm
    return out.reshape(-1, 3, 3)

out = [b'SHP2', struct.pack('<I', len(np.unique(cls)))]
tot = 0
P_m = P.copy()
for k in np.unique(cls):
    tri = P_m[cls == k]
    nrm = crease_normals(tri)
    q = np.round(tri.reshape(-1, 3) / 0.005).astype(np.int32)
    nq = np.round(nrm.reshape(-1, 3) * 127).astype(np.int32)
    key = np.concatenate([q, nq], 1)
    uniq, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.reshape(-1)
    big = len(uniq) > 65535
    pos = uniq[:, :3].astype('<i2').tobytes(); nb = uniq[:, 3:].astype('i1').tobytes()
    blk = struct.pack('<BII', int(k), len(uniq), len(inv)) + pos
    blk += b'\0' * ((-len(pos)) % 4) + nb + b'\0' * ((-len(nb)) % 4)
    ib = inv.astype('<u4' if big else '<u2').tobytes()
    blk += ib + b'\0' * ((-len(ib)) % 4)
    out.append(blk); tot += len(uniq)
open(args.out, 'wb').write(b''.join(out))
print('scale', round(s, 4), 'verts', tot, 'bytes', sum(len(b) for b in out))

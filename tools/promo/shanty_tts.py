#!/usr/bin/env python3
"""Speak the shanty lyrics with Kokoro-82M (Apache-2.0) and keep per-phoneme durations, so the
lines can be re-timed and re-pitched onto the melody afterwards. Runs in GitHub Actions.
usage: shanty_tts.py shanty.json outdir"""
import json, sys, os
import numpy as np, soundfile as sf
from kokoro import KPipeline

cfg = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
pipe = KPipeline(lang_code='a')
vocab = pipe.model.vocab
jobs = [(cfg['lead'], k) for k in cfg['solo']] + [(v, k) for v in cfg['crew'] for k in cfg['tutti']]
for v, key in jobs:
    text = cfg['lines'][key]
    audio, segs, off = [], [], 0.0
    for r in pipe(text, voice=v, speed=cfg['speed']):
        a = np.asarray(r.audio, dtype=np.float32)
        pd = r.pred_dur.tolist() if getattr(r, 'pred_dur', None) is not None else None
        toks = [{'text': t.text, 'ph': t.phonemes, 'ws': t.whitespace,
                 's': (t.start_ts + off) if t.start_ts is not None else None,
                 'e': (t.end_ts + off) if t.end_ts is not None else None} for t in (r.tokens or [])]
        segs.append({'offset': off, 'len': len(a) / 24000, 'phonemes': r.phonemes,
                     'ids': [c for c in r.phonemes if c in vocab], 'pred_dur': pd, 'tokens': toks})
        audio.append(a); off += len(a) / 24000
    sf.write(f'{out}/{v}_{key}.wav', np.concatenate(audio), 24000)
    json.dump({'voice': v, 'key': key, 'text': text, 'segs': segs}, open(f'{out}/{v}_{key}.json', 'w'))
    print(f'::notice::{v} {key} {off:.2f}s')

#!/usr/bin/env python3
"""Synthesize the promo voice-over with Kokoro-82M (Apache-2.0). Runs in GitHub Actions.
usage: tts.py vo.json outdir"""
import json, sys, os
import numpy as np, soundfile as sf
from kokoro import KPipeline
cfg = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
pipe = KPipeline(lang_code='a')
for v in cfg['voices']:
    for i, line in enumerate(cfg['lines']):
        audio = np.concatenate([np.asarray(a) for _, _, a in pipe(line, voice=v, speed=1.0)])
        sf.write(f'{out}/{v}_{i:02d}.wav', audio, 24000)
        print(f'::notice::{v} {i} {len(audio)/24000:.2f}s')

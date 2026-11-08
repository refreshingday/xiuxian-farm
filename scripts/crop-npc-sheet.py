"""Crop a 5x5 NPC sheet into 25 transparent portraits (rules from assets/npc/PROMPT.md).

    python scripts/crop-npc-sheet.py assets/npc/sheets/b1.png b1 [outdir]

Names come from assets/npc/plan.json (batch id). Output: <outdir>/<key>.png (default assets/npc/portraits).
"""
import json, os, sys
import numpy as np
from PIL import Image
from collections import deque


def label(mask):
    """8-connected component labels (small cells, plain BFS is fast enough)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    sizes = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n = len(sizes) + 1
        lab[y0, x0] = n
        q, s = deque([(y0, x0)]), 0
        while q:
            y, x = q.popleft()
            s += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n
                        q.append((yy, xx))
        sizes.append(s)
    return lab, np.array(sizes)

src, bid = sys.argv[1], sys.argv[2]
outdir = sys.argv[3] if len(sys.argv) > 3 else 'assets/npc/portraits'
plan = json.load(open('assets/npc/plan.json', encoding='utf8'))
cells = next(b for b in plan['batches'] if b['id'] == bid)['cells']

im = np.array(Image.open(src).convert('RGBA'))
a = im[:, :, 3].copy()
# 4. alpha < 25 is haze: clear it
haze = a < 25
im[haze] = 0
a[haze] = 0
# the model tops out at alpha 253 inside the figure: make the body fully opaque
im[:, :, 3][a >= 240] = 255
H, W = a.shape
occ = a > 0


def cuts(profile, n, length):
    """Split [0,length) into n parts: near each expected boundary pick the least occupied line."""
    out = [0]
    step = length / n
    win = int(step * 0.3)
    for k in range(1, n):
        e = int(k * step)
        lo, hi = max(0, e - win), min(length, e + win)
        seg = profile[lo:hi]
        m = seg.min()
        idx = np.where(seg == m)[0]
        # middle of the run of minima closest to the expected spot
        best = idx[np.argmin(np.abs(idx + lo - e))]
        out.append(int(best + lo))
    out.append(length)
    return out


# 1. rows from horizontal occupancy
rows = cuts(occ.sum(1), 5, H)
os.makedirs(outdir, exist_ok=True)
report = []
for r in range(5):
    y0, y1 = rows[r], rows[r + 1]
    band = occ[y0:y1]
    # 2. columns per row
    cols = cuts(band.sum(0), 5, W)
    for c in range(5):
        x0, x1 = cols[c], cols[c + 1]
        cell = im[y0:y1, x0:x1].copy()
        ca = cell[:, :, 3] > 0
        # 3. keep only the component(s) connected to the main character
        lab, sizes = label(ca)
        if len(sizes) == 0:
            report.append(f'{r},{c}: EMPTY')
            continue
        main = int(np.argmax(sizes)) + 1
        keep = lab == main
        # also keep large secondary parts (props split off by a thin gap)
        for i, s in enumerate(sizes, 1):
            if i != main and s > sizes.max() * 0.05:
                part = lab == i
                pxs = np.where(part.any(0))[0]
                # a fragment sitting on the side cut line belongs to the neighbour
                if pxs.min() == 0 or pxs.max() == part.shape[1] - 1:
                    continue
                keep |= part
        cell[~keep] = 0
        ys, xs = np.where(keep)
        pad = 8
        ty0, ty1 = max(0, ys.min() - pad), min(cell.shape[0], ys.max() + 1 + pad)
        tx0, tx1 = max(0, xs.min() - pad), min(cell.shape[1], xs.max() + 1 + pad)
        out = cell[ty0:ty1, tx0:tx1]
        # touching the cut line means the neighbour bled in or this one was clipped
        edge = []
        if xs.min() == 0 and c > 0: edge.append('L')
        if xs.max() == cell.shape[1] - 1 and c < 4: edge.append('R')
        if ys.min() == 0 and r > 0: edge.append('T')
        if ys.max() == cell.shape[0] - 1 and r < 4: edge.append('B')
        key = cells[r * 5 + c][0]
        Image.fromarray(out).save(os.path.join(outdir, key + '.png'))
        report.append(f'{key} {out.shape[1]}x{out.shape[0]}' + (f' TOUCHES {"".join(edge)}' if edge else ''))
print('rows', rows)
print('\n'.join(report))

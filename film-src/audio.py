# Build the v2 soundtrack: original beat (one hissy bar swapped) + new SFX synced to the new cut.
import sys, numpy as np, subprocess
SR = 44100
src, out = sys.argv[1], sys.argv[2]
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vn', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
a = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()
N = len(a)
S = lambda t: int(round(t * SR))

# 2.5–3.5 carried the old spray hiss (now the "three leaves" gag) -> reuse the clean bar 0.5–1.5
a[S(2.5):S(3.5)] = a[S(0.5):S(1.5)]
a *= 0.85

rng = np.random.default_rng(7)
def band(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))
def env(n, att, dec, curve=3.0):
    t = np.arange(n) / SR
    return np.clip(t / att, 0, 1) * np.exp(-np.maximum(t - att, 0) / dec * curve)
def put(t, x, g):
    i = S(t); j = min(N, i + len(x))
    if i < N: a[i:j] += (x[:j - i] * g)[:, None] * np.array([1.0, 1.0])[None, :]
def norm(x): return x / (np.abs(x).max() + 1e-9)

def spray(dur=0.32):
    n = S(dur); x = band(rng.standard_normal(n), 3500, 14000); return norm(x) * env(n, 0.01, dur, 2.5)
def crunch():
    n = S(0.22); x = np.zeros(n)
    for k in range(7):
        i = S(rng.uniform(0, 0.15)); m = S(rng.uniform(0.008, 0.025))
        g = band(rng.standard_normal(m), 900, 6000) * np.hanning(m) * rng.uniform(0.5, 1)
        x[i:i + m] += g[:max(0, min(m, n - i))]
    return norm(x)
def whoosh(dur=0.5, up=True):
    n = S(dur); x = rng.standard_normal(n); out = np.zeros(n); seg = S(0.02)
    for i in range(0, n, seg):
        p = i / n; c = (300 + 6000 * p) if up else (6000 - 5600 * p)
        out[i:i + seg] = band(x[i:i + seg] if len(x[i:i + seg]) > 16 else np.zeros(seg), c * 0.5, c * 1.6)[:len(out[i:i + seg])]
    shape = np.sin(np.linspace(0, np.pi, n)) ** (0.6 if up else 1.5)
    if up: shape = np.linspace(0, 1, n) ** 2
    return norm(out) * shape
def thud():
    n = S(0.18); t = np.arange(n) / SR
    return np.sin(2 * np.pi * (90 * t - 120 * t * t)) * np.exp(-t * 28) + 0.25 * band(rng.standard_normal(n), 200, 2000) * np.exp(-t * 60)
def shing():
    n = S(0.4); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * t) for f in (3200, 4870, 6230)) + band(rng.standard_normal(n), 5000, 12000)
    return norm(x) * env(n, 0.004, 0.4, 4)

# ticket slams
for t in (0.5, 0.75, 1.0, 1.25, 1.5): put(t + 0.06, thud(), 0.35)
# leaves landing in the bowl: little plips
for t in (2.17, 2.67, 3.17):
    n = S(0.12); tt = np.arange(n) / SR; put(t, np.sin(2 * np.pi * (900 - 2500 * tt) * tt) * np.exp(-tt * 40), 0.25)
put(3.28, whoosh(0.22, True), 0.18)
put(3.5, spray(0.4), 0.30)
put(3.86, whoosh(0.14, True), 0.25)
put(4.0, spray(0.55), 0.32); put(4.0, whoosh(0.6, False), 0.28)
put(4.5, whoosh(0.4, False), 0.18)
put(5.17, crunch(), 0.55)
for i in range(4): put(5.5 + i * 0.25, whoosh(0.12, False), 0.22); put(5.53 + i * 0.25, spray(0.18), 0.16)
put(7.06, shing(), 0.22)
for i in range(4): put(9.0 + i * 0.25, spray(0.22), 0.28)
put(10.02, crunch(), 0.5); put(10.27, crunch(), 0.35)
for i in range(8): put(10.5 + i * 0.25, spray(0.15) if i % 2 == 0 else crunch(), 0.18)
put(12.0, whoosh(0.5, True), 0.3)
put(13.2, whoosh(0.32, False), 0.3)
put(13.6, spray(0.5), 0.2)
put(14.5, spray(0.6), 0.25)

peak = np.abs(a).max()
if peak > 0.98: a *= 0.98 / peak
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s16le', out], input=a.astype(np.float32).tobytes(), check=True)
print('ok', peak)

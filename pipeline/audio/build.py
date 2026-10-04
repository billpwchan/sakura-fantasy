# Builds public/assets/audio from the recordings listed in SOURCES. Every source is CC0, public domain or CC BY;
# CREDITS.md names each one. Downloads land in pipeline/audio/src (ignored).
#   python3 -m venv .venv && .venv/bin/pip install numpy scipy soundfile && .venv/bin/python build.py
# Needs ffmpeg with libmp3lame. MP3 because every browser's decodeAudioData reads it, Safari included.
import json, os, subprocess, sys, urllib.parse, urllib.request
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, sosfiltfilt

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'audio')
SR = 44100
UA = {'User-Agent': 'SakuraFantasy/1.0 (https://github.com/billpwchan/sakura-fantasy)'}

VCSL = 'https://raw.githubusercontent.com/sgossner/VCSL/master/Chordophones/Zithers/Dan%20Tranh/Normal/'
FS = 'https://cdn.freesound.org/previews/'
WM = 'https://upload.wikimedia.org/wikipedia/commons/'
# key: (download url, page, author, licence)
SOURCES = {
  'sho': (FS + '792/792664_13973196-hq.mp3', 'https://freesound.org/s/792664/', 'Vrymaa', 'CC0'),
  'shakuhachi': (WM + '2/22/Shakuhachi-flute-440Hz.ogg', 'https://commons.wikimedia.org/wiki/File:Shakuhachi-flute-440Hz.ogg', 'a Freesound user (account since deleted)', 'CC0'),
  'bonsho_zojoji': (FS + '843/843521_275155-hq.mp3', 'https://freesound.org/s/843521/', 'Echograin', 'CC BY 4.0'),
  'bonsho_raigoin': (FS + '462/462757_36188-hq.mp3', 'https://freesound.org/s/462757/', 'LG', 'CC BY 4.0'),
  'keisu': (FS + '367/367128_2545289-hq.mp3', 'https://freesound.org/s/367128/', 'milivolt', 'CC BY 4.0'),
  'suzu': (FS + '739/739753_13973196-hq.mp3', 'https://freesound.org/s/739753/', 'Vrymaa', 'CC0'),
  'mokugyo': (FS + '607/607215_541139-hq.mp3', 'https://freesound.org/s/607215/', 'jonopodmore', 'CC0'),
  'furin_a': (FS + '501/501168_4648939-hq.mp3', 'https://freesound.org/s/501168/', 'ayustat2001', 'CC0'),
  'furin_b': (FS + '212/212818_1979597-hq.mp3', 'https://freesound.org/s/212818/', 'Taira Komori', 'CC BY 4.0'),
  'uguisu_a': (FS + '524/524526_4365231-hq.mp3', 'https://freesound.org/s/524526/', 'warukunai', 'CC0'),
  'uguisu_b': (WM + '1/12/SND_4458a.ogg', 'https://commons.wikimedia.org/wiki/File:SND_4458a.ogg', 'Fg2', 'Public domain'),
  'suzumushi': (WM + '7/7d/Suzumushi_06z3286.ogg', 'https://commons.wikimedia.org/wiki/File:Suzumushi_06z3286.ogg', 'Cory', 'CC BY 2.1 JP'),
  'suikinkutsu': (WM + '2/2a/Suikinkutsu-LS100112.ogg', 'https://commons.wikimedia.org/wiki/File:Suikinkutsu-LS100112.ogg', 'Fg2', 'Public domain'),
  'shishiodoshi': (WM + 'b/b6/Shishiodoshi-LS100103.ogg', 'https://commons.wikimedia.org/wiki/File:Shishiodoshi-LS100103.ogg', 'Fg2', 'Public domain'),
  'cicadas': (FS + '79/79086_384438-hq.mp3', 'https://freesound.org/s/79086/', 'markystar', 'CC0'),
  'insects': (FS + '365/365257_179538-hq.mp3', 'https://freesound.org/s/365257/', 'RutgerMuller', 'CC0'),
  'bamboo': (FS + '843/843520_1680683-hq.mp3', 'https://freesound.org/s/843520/', 'tomasloos', 'CC0'),
  'gagaku': (FS + '680/680565_12855464-hq.mp3', 'https://freesound.org/s/680565/', 'gaijinbuzz', 'CC0'),
  'chant': (FS + '686/686627_13137374-hq.mp3', 'https://freesound.org/s/686627/', 'calebjay', 'CC BY 4.0'),
  'festival': (FS + '352/352605_313780-hq.mp3', 'https://freesound.org/s/352605/', 'macdaddyno1', 'CC0'),
  'frogs': (FS + '396/396491_313780-hq.mp3', 'https://freesound.org/s/396491/', 'macdaddyno1', 'CC0'),
}
# Dan Tranh (VCSL, CC0): the files are named an octave below the pitch they sound
KOTO_NAMES = ['B1', 'C#2', 'D#2', 'F#2', 'G#2', 'B2', 'C#3', 'D#3', 'F#3', 'G#3', 'B3', 'C#4', 'D#4', 'F#4', 'G#4', 'B4']
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r, open(path + '.part', 'wb') as f:
        f.write(r.read())
    os.replace(path + '.part', path)
    return path


def load(path, mono=True):
    # decode anything through ffmpeg to float32 at SR
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1' if mono else '2', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return x if mono else x.reshape(-1, 2)


def source(key, mono=True):
    url = SOURCES[key][0]
    return load(fetch(url, os.path.join(SRC, key + os.path.splitext(urllib.parse.urlparse(url).path)[1])), mono)


def band(x, hp=None, lp=None, order=4):
    if hp: x = sosfiltfilt(butter(order, hp, 'highpass', fs=SR, output='sos'), x, axis=0)
    if lp: x = sosfiltfilt(butter(order, lp, 'lowpass', fs=SR, output='sos'), x, axis=0)
    return x


def biquad(kind, f0, gain_db, q):
    # RBJ cookbook peaking / high shelf, as an sos row
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; c, s = np.cos(w), np.sin(w); al = s / (2 * q)
    if kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    else:
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    return np.array(b + a) / a[0]


def seg(x, a, b):
    return x[int(a * SR): int(b * SR)]


def fade(x, fin=0.005, fout=0.3):
    x = x.copy(); n = len(x)
    i, o = min(n, int(fin * SR)), min(n, int(fout * SR))
    if i: x[:i] *= np.linspace(0, 1, i)[:, None] if x.ndim > 1 else np.linspace(0, 1, i)
    if o: x[-o:] *= (np.cos(np.linspace(0, np.pi / 2, o)) ** 2)[:, None] if x.ndim > 1 else np.cos(np.linspace(0, np.pi / 2, o)) ** 2
    return x


def peak_to(x, db):
    return x * (10 ** (db / 20) / (np.abs(x).max() + 1e-12))


def rms_to(x, db):
    return x * (10 ** (db / 20) / (np.sqrt(np.mean(x ** 2)) + 1e-12))


def write(name, x, quality=3):
    os.makedirs(OUT, exist_ok=True)
    x = np.clip(x, -0.999, 0.999).astype(np.float32)
    ch = 1 if x.ndim == 1 else 2
    path = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-',
                    '-c:a', 'libmp3lame', '-q:a', str(quality), path], input=x.tobytes(), check=True)
    return name + '.mp3'


def f0(x, guess):
    # harmonic-sum pitch near the expected note, from the settled part of the pluck
    y = x[int(0.12 * SR): int(0.9 * SR)]
    N = 1 << 16
    s = np.abs(np.fft.rfft(y * np.hanning(len(y)), N)); fq = np.fft.rfftfreq(N, 1 / SR)
    best, bf = -1, guess
    for c in np.linspace(-80, 80, 321):
        f = guess * 2 ** (c / 1200)
        v = sum(s[int(round(f * h * N / SR))] / h ** 0.5 for h in range(1, 6))
        if v > best: best, bf = v, f
    return bf


def koto():
    # Dan Tranh plucks reshaped toward the koto: the koto's long-term spectrum (measured from two CC0 koto
    # recordings) has ~6 dB more 1-2.5 kHz and 10-14 dB less above 4 kHz than the steel-strung Dan Tranh, and
    # its silk/tetron strings die sooner.
    eq = np.array([biquad('peak', 1600, 5.5, 0.6), biquad('shelf', 4200, -11, 0.7)])
    notes = []
    for n in KOTO_NAMES:
        midi = 12 * (int(n[-1]) + 2) + NOTE[n[:-1]]  # one octave above the file name
        if midi < 50: continue
        for layer in ['mf', 'f']:
            fn = f'{n}_{layer}_1.wav'
            x = load(fetch(VCSL + urllib.parse.quote(fn), os.path.join(SRC, 'dantranh', fn)))
            on = int(np.argmax(np.abs(x) > np.abs(x).max() * 0.05))
            x = x[max(0, on - int(0.004 * SR)):]
            x = sosfilt(eq, x)
            t = np.arange(len(x)) / SR
            tau = np.interp(midi, [50, 84], [2.4, 1.0])
            x *= np.where(t < 0.25, 1, np.exp(-(t - 0.25) / tau))
            dur = np.interp(midi, [50, 84], [4.2, 2.2])
            x = fade(x[: int(dur * SR)], 0.002, 0.6)
            notes.append({'midi': round(12 * np.log2(f0(x, 440 * 2 ** ((midi - 69) / 12)) / 440) + 69, 2), 'layer': layer, 'x': x})
    # one gain for every file, so mf stays softer than f and the registers keep their balance
    g = 10 ** (-3 / 20) / max(np.abs(n['x']).max() for n in notes)
    out = []
    for n in notes:
        name = f"koto_{int(round(n['midi']))}_{n['layer']}"
        out.append({'file': write(name, n['x'] * g, 4), 'midi': n['midi'], 'layer': n['layer']})
    return out


def sho():
    x = band(source('sho'), hp=650, lp=9000)
    chords = []
    # three aitake from the recording; gagaku tunes A to 430 Hz, so every pitch sits ~35 cents flat of A440
    for a, b, pcs in [(3, 17, [4, 9, 11]), (33, 43, [2, 4, 7, 9]), (51, 66, [11, 2, 4, 6, 7, 9])]:
        y = fade(rms_to(seg(x, a, b), -20), 1.2, 2.0)
        chords.append({'file': write(f'sho_{len(chords)}', y, 4), 'pcs': pcs, 'cents': -35})
    return chords


def shakuhachi():
    x = band(source('shakuhachi'), hp=180)
    x = fade(peak_to(x, -3), 0.001, 0.5)
    return {'file': write('shakuhachi_a4', x, 3), 'midi': 69}


def one(key, a, b, *, hp=None, lp=None, mono=True, level=-3, how='peak', fin=0.003, fout=0.3, q=4, name=None):
    x = band(source(key, mono), hp, lp)
    y = seg(x, a, b)
    y = peak_to(y, level) if how == 'peak' else rms_to(y, level)
    return write(name or key, fade(y, fin, fout), q)


def main():
    m = {}
    m['koto'] = koto()
    m['sho'] = sho()
    m['shakuhachi'] = shakuhachi()
    # bells ring out in full; the engine decides how far away they are
    m['bonsho'] = [one('bonsho_zojoji', 0.3, 31.5, hp=45, fout=3, name='bonsho_0'), one('bonsho_raigoin', 0.4, 37.5, hp=60, fout=3, name='bonsho_1')]
    m['keisu'] = one('keisu', 0.0, 12.5, hp=120, fout=2)
    m['suzu'] = [one('suzu', 7.3, 8.9, hp=1500, name='suzu_0'), one('suzu', 20.2, 22.0, hp=1500, name='suzu_1'), one('suzu', 27.2, 29.6, hp=1500, name='suzu_2')]
    m['mokugyo'] = one('mokugyo', 0.0, 1.8, hp=150, fout=0.4)
    m['furin'] = [one('furin_a', 0.0, 4.2, hp=1200, fout=1.2, name='furin_0'), one('furin_b', 0.0, 1.9, hp=1200, fout=0.6, name='furin_1')]
    m['uguisu'] = [one('uguisu_a', 1.3, 3.0, hp=1000, name='uguisu_0'), one('uguisu_a', 11.8, 13.6, hp=1000, name='uguisu_1'),
                   one('uguisu_a', 28.8, 30.6, hp=1000, name='uguisu_2'), one('uguisu_b', 50.3, 51.9, hp=900, name='uguisu_3')]
    m['shishiodoshi'] = one('shishiodoshi', 9.4, 12.8, hp=150, fout=1.0)
    m['suikinkutsu'] = one('suikinkutsu', 1.0, 27.5, hp=500, how='rms', level=-26, fin=1.5, fout=1.5)
    # beds: mono (the engine plays two offset copies, one each side, for width) and crossfaded by the engine,
    # so their ends never need to meet
    m['cicadas'] = one('cicadas', 24, 60, hp=900, how='rms', level=-20, fin=2, fout=2, q=6)
    m['insects'] = one('insects', 40, 80, hp=1800, how='rms', level=-24, fin=2, fout=2, q=6)
    m['suzumushi'] = one('suzumushi', 0.5, 15.5, hp=2500, how='rms', level=-22, fin=1, fout=1, q=6)
    m['bamboo'] = one('bamboo', 10, 50, hp=120, how='rms', level=-24, fin=2, fout=2, q=6)
    m['gagaku'] = one('gagaku', 0.5, 33.0, hp=180, how='rms', level=-20, fin=2, fout=3, q=6)
    m['chant'] = one('chant', 0.5, 52.0, hp=90, how='rms', level=-22, fin=2, fout=3, q=6)
    m['festival'] = one('festival', 0.5, 34.0, hp=120, how='rms', level=-20, fin=2, fout=2, q=6)
    m['frogs'] = one('frogs', 0.0, 4.2, hp=250, how='rms', level=-24, fin=0.2, fout=0.6)
    json.dump(m, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'{len(os.listdir(OUT))} files, {size / 1e6:.2f} MB')


if __name__ == '__main__':
    main()

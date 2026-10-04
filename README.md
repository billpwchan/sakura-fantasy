<div align="center">

<a href="https://sakura.billpwchan.art/"><img src="docs/media/hero.webp" width="100%" alt="A reed-roofed boat drifts under cherry trees at dawn, its lantern lit, the low sun on the water"></a>

<h1>桜幻想 &nbsp;<sub><i>Sakura Fantasy</i></sub></h1>

<p><b>A boat journey through a Japanese river valley, in four seasons and at any hour,<br>rendered live in the browser.</b></p>

<p>
<a href="https://sakura.billpwchan.art/"><b>Take&nbsp;the&nbsp;journey</b></a> &nbsp;·&nbsp;
<a href="docs/ARCHITECTURE.md">How&nbsp;it&nbsp;works</a> &nbsp;·&nbsp;
<a href="docs/SOUND.md">The&nbsp;score</a> &nbsp;·&nbsp;
<a href="README.zh-CN.md">中文</a> &nbsp;·&nbsp;
<a href="README.ja.md">日本語</a>
</p>

<p>
<a href="https://sakura.billpwchan.art/"><img alt="Live demo" src="https://img.shields.io/badge/live-demo-c0392b?style=flat-square"></a>
<a href="https://threejs.org/"><img alt="three.js r186" src="https://img.shields.io/badge/three.js-r186-1f2937?style=flat-square"></a>
<img alt="WebGL 2" src="https://img.shields.io/badge/WebGL-2-1f2937?style=flat-square">
<img alt="No engine, no framework" src="https://img.shields.io/badge/engine-none-1f2937?style=flat-square">
<a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/code-MIT-e8a0b4?style=flat-square"></a>
</p>

</div>

<br>

You sit in a *tomabune*, a reed-roofed river boat, while a boatman sculls you down a river. You pass through:
- morning mist on the shallows;
- an avenue of cherry trees;
- a vermilion drum bridge;
- a village beneath a five-storey pagoda;
- a bamboo gorge;
- a tunnel of a thousand torii;
- a lake where a torii stands in the water.

Then the season turns and the journey begins again.

Every tree, flower and blade of grass is drawn from photogrammetry scans of real Japanese plants. The light follows
the sun through the day, and the weather changes. The music is composed as you travel, for koto, shakuhachi and shō,
among field recordings from temples and gardens in Kyoto and beyond.

It is about 10,000 lines of plain JavaScript on three.js, with no engine and no framework.

<br>

<p align="center"><img src="docs/media/seasons.jpg" width="100%" alt="The same stretch of river in spring, summer, autumn and winter"></p>
<p align="center"><sub>The same trees across the year: blossom, then summer green, then autumn colour turning leaf by leaf, then snow on
the boughs.</sub></p>

## The journey

<table>
<tr>
<td width="50%"><img src="docs/media/journey-1-asagiri.jpg" alt="Shallows of Morning Mist"><br><b>朝霧の瀬</b> &nbsp;Shallows of Morning Mist<br><sub>Reeds, stones and heavy dawn mist.</sub></td>
<td width="50%"><img src="docs/media/journey-2-avenue.jpg" alt="The Cherry Avenue"><br><b>桜並木</b> &nbsp;The Cherry Avenue<br><sub>Banks lined with sakura, and rafts of fallen petals.</sub></td>
</tr>
<tr>
<td><img src="docs/media/journey-3-bridge.jpg" alt="The Vermilion Drum Bridge"><br><b>朱の太鼓橋</b> &nbsp;The Vermilion Drum Bridge<br><sub>The boat passes under the arch.</sub></td>
<td><img src="docs/media/journey-4-village.jpg" alt="Village of the Five-Storey Pagoda"><br><b>五重塔の里</b> &nbsp;Village of the Five-Storey Pagoda<br><sub>A pagoda, a hall and a belfry. The bell tolls as you arrive.</sub></td>
</tr>
<tr>
<td><img src="docs/media/journey-5-gorge.jpg" alt="The Bamboo Gorge"><br><b>竹林峡</b> &nbsp;The Bamboo Gorge<br><sub>Cliffs, walls of bamboo and a waterfall.</sub></td>
<td><img src="docs/media/journey-6-torii.jpg" alt="A Thousand Gates"><br><b>千本鳥居</b> &nbsp;A Thousand Gates<br><sub>A straight channel under forty-one vermilion gates.</sub></td>
</tr>
<tr>
<td><img src="docs/media/journey-7-lake.jpg" alt="Lake of the Sacred Tree"><br><b>御神木の湖</b> &nbsp;Lake of the Sacred Tree<br><sub>An island's giant sakura and a torii standing in the water.</sub></td>
<td><img src="docs/media/journey-8-hanabi.jpg" alt="Fireworks over the lake"><br><b>花火</b> &nbsp;Summer fireworks<br><sub>On summer nights. Each boom arrives at the speed of sound.</sub></td>
</tr>
</table>

Each place opens with a classical haiku chosen for it and for the season.

## What's inside

**Real plants.** Leaves, blossom and grasses are rendered in Blender into photo atlases (colour, AO and normal), from
CC0 scans of Japanese species:
- sakura, momiji and konara;
- black pine and sugi;
- bamboo, azalea, susuki and reeds.

Trees are grown in code and instanced. They have three detail tiers by distance from the river, and up close they
swap to full detail.

**Light, air and weather.**
- A sun and sky for any hour, with height fog and god rays.
- Five weathers: clear, mist, rain, storm and snow.
- Snow that settles on boughs, roofs and banks.

**Water.** The river reflects the banks and the sky. The boat leaves a Kelvin wake and a bow wave, foam gathers along
the shore and petals rest on the surface.

**The boat and its crew.**
- The boat is built plank by plank in Blender.
- The boatman and the passenger are MPFB bodies, dressed in clothes made for them: a hanten and sugegasa; a
  furisode, brocade obi and a red wagasa.
- He sculls with two-bone IK, his hands on the *ro* through every stroke.

**Night.** Lit windows, foxfire wisps and lanterns floating on the lake. Sky lanterns rise from the island.

**Sound.**

| Layer | What you hear |
|---|---|
| Score | A live score in the Japanese modes (hirajōshi, yō, kumoijōshi). The koto plays phrases, a *danmono* before the bridge and *Sakura Sakura* under the cherries in spring. The shakuhachi plays long breaths, and the shō holds chords at the shrine. |
| Recordings | Temple bells from Ōhara and Zōjō-ji, a suikinkutsu and shishi-odoshi from Kyoto gardens, cicadas, bell crickets, the uguisu. |

Every recording is placed by place, season and hour. [The score →](docs/SOUND.md)

**Smooth.** The valley is generated in a pool of workers. A frame-time governor keeps the render scale where frames
hold their budget. The quick tier draws the first frame, and full-detail assets stream in behind it.

## Controls

| | |
|---|---|
| <kbd>W</kbd> <kbd>S</kbd> / <kbd>↑</kbd> <kbd>↓</kbd> | faster, slower |
| <kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd> | steer within the channel |
| drag · wheel | look around · zoom |
| <kbd>C</kbd> | camera: follow → seat → cinematic |
| <kbd>Space</kbd> | stop and drift / row on |
| <kbd>M</kbd> | sound on and off |
| <kbd>P</kbd> | photo mode (orbit camera, PNG export) |
| <kbd>H</kbd> | hide the interface |

The kanji dock sets the season, hour, weather, camera and sound, and the scroll of the journey jumps to any place.

## Run it

```sh
git clone https://github.com/billpwchan/sakura-fantasy.git
cd sakura-fantasy
npm install
npm run dev          # http://127.0.0.1:5190
```

`npm run build` writes a static site to `dist/` that any web server can host. The assets are in the repository, so
nothing else needs downloading.

Any scene can be opened straight from the URL, skipping the opening:

| Parameter | Meaning | Example |
|---|---|---|
| `z` | position along the river, from `40` (start) to about `-2300` (the lake) | `z=-1640` |
| `s` | season: `0` spring, `1` summer, `2` autumn, `3` winter | `s=2` |
| `h` | hour, `0`–`24` | `h=17.5` |
| `w` | weather: `clear` `mist` `rain` `storm` `snow` | `w=mist` |
| `mode` | camera: `follow` `seat` `cinema` | `mode=seat` |
| `cam`, `look` | a fixed camera position and target, `x,y,z` | `cam=4,3,-690&look=0,6,-720` |
| `tier` | `hi` streams the full-detail assets, `lo` keeps the quick tier | `tier=lo` |
| `intro` | play the opening anyway | `intro` |

For example, [autumn dusk at the bridge](https://sakura.billpwchan.art/?z=-660&s=2&h=17.2) or
[a winter night in the village](https://sakura.billpwchan.art/?z=-860&s=3&h=21).

## How it's made

<p align="center"><img src="docs/media/pipeline.jpg" width="100%" alt="Scanned blossom and maple leaves baked into atlases, and the same leaves in the scene"></p>

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The renderer and passes, the frame, the governor, world generation, vegetation and level of detail, the boat and people, night, the journey and camera, loading tiers. |
| [docs/SOUND.md](docs/SOUND.md) | The score: modes, koto gestures, ma and jo-ha-kyū, how each instrument was made from free recordings, and how the mix was measured. |
| [pipeline/](pipeline) | The offline tools that made the assets: Blender scripts for the plant atlases, people, boat and props, and the audio build. |

### Performance

On an Apple M4 Max at 1920×1080 @2×, the full tier runs at **60 fps** with a p95 frame time of 18.4 ms. The governor
holds the render scale at 1.0 for most of the river and 0.85–0.95 in the cherry avenue, the heaviest stretch. Phones
and tablets get the quick tier.

## Project layout

```
src/
├── main.js        boot, frame loop, input
├── core/          render passes, post chain, shared uniforms, loaders
├── env/           time of day, season and weather
├── world/         layout, terrain, water, trees, grass, buildings, props, boat, people, sky
├── fx/            petals, leaves, snow, rain, fireflies, wisps, lanterns, fireworks
├── journey/       the voyage, the camera director, the haiku
├── audio/         score, soundscape, sound bank
└── ui/            loader, title, chapter cards, dock, About, photo mode
public/assets/     textures and atlases, models, KTX2 transcoder, audio
pipeline/          offline asset tools (Blender, Node, Python)
scripts/           texture fetch, perf and capture harnesses
deploy/            Docker + Caddy deployment
```

## More scenes

The same author's other real-time scenes, each open source and running in the browser.

<table><tr>
<td width="33%" valign="top"><a href="https://github.com/billpwchan/halcyon"><img src="https://raw.githubusercontent.com/billpwchan/halcyon/main/docs/media/social-preview.jpg" alt="Halcyon"></a><br><b><a href="https://github.com/billpwchan/halcyon">Halcyon</a></b><br><sub>A tropical atoll through one day: FFT ocean, reef, bioluminescent night · <a href="https://halcyon.billpwchan.art/">live</a></sub></td>
<td width="33%" valign="top"><a href="https://github.com/billpwchan/utsuroi"><img src="https://raw.githubusercontent.com/billpwchan/utsuroi/main/docs/media/social-preview.jpg" alt="移ろい Utsuroi"></a><br><b><a href="https://github.com/billpwchan/utsuroi">移ろい Utsuroi</a></b><br><sub>A Kyoto house and garden, walked from first light to last · <a href="https://utsuroi.billpwchan.art/">live</a></sub></td>
<td width="33%" valign="top"><a href="https://github.com/billpwchan/neon-zenith"><img src="https://raw.githubusercontent.com/billpwchan/neon-zenith/main/docs/media/social-preview.jpg" alt="霓虹天頂 Neon Zenith"></a><br><b><a href="https://github.com/billpwchan/neon-zenith">霓虹天頂 Neon Zenith</a></b><br><sub>A rain-soaked cyberpunk Hong Kong you can fly through (WebGPU) · <a href="https://zenith.billpwchan.art/">live</a></sub></td>
</tr></table>

## Credits

The plants, textures, people and most recordings are CC0 or public domain. Two statues and six recordings are
CC BY. Every source and its author is listed in [CREDITS.md](CREDITS.md).

The project was inspired by Meng To's *Sakura River Valley*. None of its code or assets are used.

## Licence

The code is under the [MIT licence](LICENSE). The assets keep their own licences, listed in [CREDITS.md](CREDITS.md).

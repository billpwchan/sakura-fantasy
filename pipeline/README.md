# Asset pipeline

Every plant, the boat, the two figures and the high-detail props in `public/assets` were made by the scripts in this
folder. Their outputs are committed, so **you do not need any of this to run or modify the app**. These scripts are
here so the assets can be understood, reproduced and changed.

They were run from a scratch workspace with exactly this layout. Folders that hold downloads and intermediate files
are git-ignored, so expect to fetch sources and adjust a path or two.

```
pipeline/
├── fetch_scan.sh      download a Sketchfab scan into skfb/<uid>      (needs your own SKFB_KEY)
├── veg/               plant atlases: Blender renders of CC0 scans, composed into public/assets/tex
├── figs/              the boatman and the passenger (MPFB bodies, garments built in code), the wagasa
├── boat/              the tomabune, built plank by plank
├── node/              glTF and texture processing: props, KTX2 tiers, packing (npm install here)
├── audio/             the score's instruments and the field recordings, cut and mastered into public/assets/audio
│
├── skfb/   phm/       downloaded scans / Poly Haven models          (ignored)
└── tools/ktxroot/     KTX-Software install, for toktx               (ignored)
```

## Requirements

- **Blender 5.2** (5.2.1 LTS was used), run headless.
- **Node 20+**; run `npm install` in `pipeline/node`.
- **[KTX-Software](https://github.com/KhronosGroup/KTX-Software)** 4.x, with `bin/` in `pipeline/tools/ktxroot/` (KTX2 encoding).
- **[MPFB 2](https://static.makehumancommunity.org/mpfb.html)** for the figures. It was installed into an isolated Blender user
  profile; point `BLENDER_USER_RESOURCES` at it.
- A Sketchfab account and API token. Every scan used is CC0, but Sketchfab requires a login to download.

## 1 · Plant atlases (`veg/`)

Each species is rendered from photogrammetry scans by [ffish.asia / floraZia](https://sketchfab.com/ffishAsia-and-floraZia)
(all **CC0**). `atlaslib.py` makes orthographic colour, ambient-occlusion and camera-space normal passes per cell. The
`build_*.py` scripts arrange real twigs, leaves and flowers into sprays: whorls split by mesh connectivity, leaves
cut free from their branch, twigs entering each cell at a printed base point so the runtime can attach them. The
`compose*.cjs` scripts then assemble the cells into the atlases in `public/assets/tex`, fixing edges, alpha holes and
colour grades.

```sh
./fetch_scan.sh e3317fd3fd514017abd3819f4fdf4bbd      # once per scan below
BLENDER=/path/to/blender veg/run.sh                     # or: veg/run.sh maple
```

| Atlas | Scans |
|---|---|
| `sakura_blossom`, `sakura_leaf` | [Yoshino cherry blossom](https://sketchfab.com/3d-models/updated-sakura-cherry-blossom-cc0-e3317fd3fd514017abd3819f4fdf4bbd); leaves from [Japanese zelkova](https://sketchfab.com/3d-models/cc0-japanese-zelkova-zelkova-serrata-024e8b42dd2a4657aec9d4c872337ab1) |
| `maple_atlas` | [Japanese maple](https://sketchfab.com/3d-models/cc0-japanese-maple-acer-palmatum-889aca0c32e64d84b03c1630246b4d7b) |
| `broad_atlas` | [Konara oak](https://sketchfab.com/3d-models/cc0-konara-oak-quercus-serrata-afa028430ce34862a91dff24b1797745) |
| `conifer_atlas` | [Japanese black pine](https://sketchfab.com/3d-models/cc0-japanese-black-pine-p-thunbergii-c834dd713c384e60b1b943b82cd8d8a7), [Japanese cedar](https://sketchfab.com/3d-models/cc0-japanese-cedar-cryptomeria-japonica-930e1a9369a04c9a85281b4085e44507) |
| `azalea_atlas` | [Oomurasaki azalea](https://sketchfab.com/3d-models/cc0-oomurasaki-azalea-r-x-pulchrum-f6fc34c6f0454eab9b6d332dec80593e), [Hirado azalea](https://sketchfab.com/3d-models/cc0-hirado-azalea-r-x-pulchrum-4b71e4fd4250439f85c1aebe01eb945f) |
| `bamboo_atlas` | [Golden bamboo](https://sketchfab.com/3d-models/cc0-golden-bamboo-phyllostachys-aurea-42f5747a9e1a474ba9922342ab86dc6f) |
| `tall_flora` | [Common reed](https://sketchfab.com/3d-models/cc0-common-reed-phragmites-australis-91f546fb238149ff9e99a8594a3a2b58), [Chinese silver grass](https://sketchfab.com/3d-models/cc0-chinese-silver-grass-m-sinensis-99f88f1b9a6b4313bc2380addee29791) |
| `ground_flora`, `turf` | [Dandelion](https://sketchfab.com/3d-models/cc0-dandelion-taraxacum-sp-1cbd818a50c4404fb971fee0bcb45679), [Japanese buttercup](https://sketchfab.com/3d-models/cc0-japanese-buttercup-r-japonicus-2d54c54618da4b1c8c0240119299f1c6), [Manchurian violet](https://sketchfab.com/3d-models/cc0-manchurian-violet-viola-mandshurica-2de6ba287e7242cfacf8bdadd5344012), [White clover](https://sketchfab.com/3d-models/cc0-white-clover-trifolium-repens-98158fb9250c4a85a55925e69a220363), [Red spider lily](https://sketchfab.com/3d-models/cc0-red-spider-lily-lycoris-radiata-9a0bac3fb3b8475caf15b9697572178c); Poly Haven grass models (`grass_medium_01`, `grass_medium_02`, `grass_bermuda_01`) in `phm/` |

## 2 · Figures (`figs/`)

The boatman (*sendō*) and the passenger start as MPFB bodies posed in their bind pose. Their clothes are built in code
over the posed body:
- the boatman: momohiki, hanten with a lettered collar band, kaku-obi, nejiri hachimaki, sugegasa, tabi and waraji;
- the passenger: a cloth-simulated furisode with obi and knot, hair and kanzashi.

Everything is then skinned to the game-engine rig. At runtime the boatman's arms follow the oar with two-bone IK.

```sh
export BLENDER_USER_RESOURCES=/path/to/isolated/profile   # where MPFB is installed
blender -b --python figs/man.py -- man.glb                 # posed body -> man.blend
blender -b man.blend --python figs/man_dress.py -- man_full.glb
blender -b --python figs/pas.py -- pas.glb                 # then pas_dress.py and pas_dress2.py, as their headers say
blender -b --python figs/wagasa.py -- wagasa.glb
figs/pack.sh                                               # KTX2 + meshopt -> public/assets/models/figures
```

## 3 · Boat (`boat/`)

`build.py` builds the tomabune plank by plank in the boat's own three.js frame: hull, fittings, *toma* canopy, cargo,
*ro* (the sculling oar) and the bow lantern. It bakes ambient occlusion and exports a GLB. It also prints the
waterline half-widths that the water shader uses to cut the hull out of the river surface.

Textures go in `boat/tex`:
- from Poly Haven: `rough_wood`, `rust_coarse_01`, `rough_linen`;
- from ambientCG: `Wicker013`, `Rope001`, `ThatchedRoof002A`, `Paper006`;
- a few colour maps regraded from those.

All of these sources are CC0. `node/boat_ktx.sh` then packs a quick tier (shown on the first frame) and a full tier
(streamed in after it).

## 4 · Props (`node/`)

- **Quick tier.** `dl.py` downloads Poly Haven models from saved API listings
  (`curl https://api.polyhaven.com/files/<id> > <id>.json`). `proc.mjs` then simplifies them into the quick-tier GLBs.
- **Sketchfab scans.** `proc_skfb.mjs` does the same for the two CC BY scans: the komainu and the jizō.
- **Full tier.** `hi.sh` builds it, keeping full geometry with KTX2 textures (UASTC colour and normals, ETC1S data
  maps). The app loads this tier only on desktop-class pointers.

## 5 · Surface textures

Ground, rock, bark, plaster and roof textures come from Poly Haven via `scripts/fetch-assets.mjs` in the repository
root (`npm run fetch-textures`).

## 6 · Audio (`audio/`)

`build.py` downloads every recording listed in its `SOURCES` table (Freesound, Wikimedia Commons and the VCSL
sample library), then cuts, filters, loudness-matches and encodes them into `public/assets/audio`, with an
`index.json` the engine reads. Each source is CC0, public domain or CC BY, and is credited in
[CREDITS.md](../CREDITS.md). Needs Python 3 with numpy, scipy and soundfile, and ffmpeg with libmp3lame.

```sh
cd pipeline/audio
python3 -m venv .venv && .venv/bin/pip install numpy scipy soundfile
.venv/bin/python build.py
```

How the instruments were made from these recordings, and how the mix was measured, is in
[docs/SOUND.md](../docs/SOUND.md).

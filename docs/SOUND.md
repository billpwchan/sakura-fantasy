# Sound

The valley should sound like a real place in Japan, not like a film's idea of "Asia". That ruled out a pentatonic synth
pad, a looped track and a taiko hit for drama. Everything you hear is one of three things:
- a real instrument, played by rules taken from Japanese music;
- a field recording made in Japan, at the place and season where you would hear it;
- the river, wind and rain, synthesised so that they follow the weather.

Nothing is a loop of finished music. The score is composed live, so no two journeys sound the same.

## The instruments

| | Source | What was done to it |
|---|---|---|
| **Koto** | VCSL Đàn tranh, mf and f layers, 14 pitches (CC0) | The Đàn tranh is the koto's Vietnamese cousin: silk-and-steel strings over movable bridges, plucked with picks. Its body is brighter and rings longer, so each sample was matched to the long-term spectrum of real koto recordings (+5.5 dB at 1.6 kHz, −11 dB shelf above 4.2 kHz) and given a faster decay. Pitches were measured, not trusted: the VCSL names are an octave low. |
| **Shakuhachi** | One sustained A4 (CC0) | Each note is that tone, repitched and shaped as honkyoku is played: a *meri* attack that rises into pitch, a swell, *yuri* vibrato that arrives late, a falling release. *Muraiki* (the rush of breath) is filtered noise layered on top. |
| **Shō** | A real shō playing its *aitake* chords (CC0) | Three chords were cut where the recording holds them, their pitch classes measured, and they are transposed to fit the mode. Gagaku tunes A to 430 Hz, so the chords are about 40 cents flat; the engine corrects for it. |

Only the shakuhachi is a single note bent into many, because no free recording of one plays clean separate notes.
On a long tone this is inaudible, and the breath and bends carry the character.

## The score

### Modes

The koto is tuned to a mode before a piece, as a koto player would. Each mode is the standard 13-string tuning, with
string 1 on D:

| Mode | Character | Used for |
|---|---|---|
| **Hirajōshi** | the classic koto sound, melancholy and open | spring; and the default |
| **Yō** (ritsu-like) | brighter, folk and shrine | summer; asagiri in spring and summer; the torii except in winter |
| **Kumoijōshi** | darker, with two half-steps | autumn and winter; the lake at night |

### Phrases

The koto plays phrases built from the gestures a koto player learns first:

| Gesture | What it is |
|---|---|
| *Ten-ton-shan* | Two notes and a chord. |
| *Kororin* | Three strings, falling. |
| *Sararin* | A glissando. |
| *Nagashi* | A sweep with a sting at the end. |
| *Awase* | Octaves. |
| Lines | Lines walk the scale with *oshide* (pressing behind the bridge to raise a note) and *ato-oshi* (bending a note after it sounds). |

Two places have their own pieces:
- **Under the cherries in spring**, the koto quotes *Sakura Sakura* once per visit.
- **Approaching the bridge**, it plays a short *danmono*: fourteen bars that accelerate from 62 to 96 bpm and pull back
  at the end. Pieces like *Rokudan* are built on this jo-ha-kyū shape.

The shakuhachi speaks in single long breaths, never in the koto's runs. In autumn a second flute answers from far
away (the *Shika no Tōne* idea: two deer calling across a valley).

### Ma

The silence between phrases is part of the music. A rest follows each phrase, and the koto and shakuhachi take turns
rather than talking over each other.

### Jo-ha-kyū

Each place follows the arc of jo-ha-kyū, by how far through it the boat is: quiet on arrival, fullest through the
middle, thinning before the next place.

### By place

| Place | Koto | Shakuhachi | Shō | Recorded around it |
|---|---|---|---|---|
| Asagiri (morning mist) | rare | leads | holds | frogs in summer |
| Sakura avenue | leads, *Sakura Sakura* in spring | answers | — | uguisu in spring, cicadas in summer |
| Bridge | danmono | rare | — | cicadas in summer |
| Village | sparse | sparse | — | temple bell, sutra at dawn and dusk, suikinkutsu, shishi-odoshi, fūrin in summer |
| Gorge | rare | leads | — | the bamboo grove, culms knocking in the wind |
| Torii | the repeating cell of the gates | rare | leads | gagaku from the shrine, suzu |
| Lake | opens with a sweep | answers | holds, softly | a summer festival, rice-field frogs, fireworks |

### Season, hour and weather

- **Spring**: the uguisu.
- **Summer**: cicadas by day, higurashi at dawn and dusk, frogs at night.
- **Autumn**: bell crickets and insects at night.
- **Winter**: snow muffles the river. On winter nights the village bell keeps tolling, for *joya no kane*.
- **Rain** thins the insects and the koto, and gives the shakuhachi more room.

## The mix

- **Buses**: koto, shakuhachi, far shakuhachi, shō, ambience and effects.
- **Reverb**: one convolver whose impulse response is generated as an open valley. It has early reflections off the
  banks, a tail whose highs die first, and decorrelated ears.
- **Bell**: the music ducks under it.
- **Limiter**: one on the output, with its makeup gain taken back out so that it only catches peaks.

Recorded beds are mono. Each plays as two copies, half a loop apart and panned left and right, crossfaded, so no loop
point is ever heard.

## Measured

Every place was recorded from the running app, at each season and hour where it changes, through a
`MediaStreamDestination`, and checked for:
- loudness: about −20 to −23 LUFS integrated, peaks under −2 dBFS;
- balance, from separate stems for music and ambience;
- pitch, by onset detection: koto notes land in the place's mode, apart from the bends between them.

## Files

| File | What it is |
|---|---|
| `public/assets/audio/` | 56 files, 4.1 MB, MP3. Instruments load first; beds load the first time a place needs them and are freed after 90 s unheard. |
| `pipeline/audio/build.py` | Fetches every source, measures and processes it, and writes the files and `index.json`. |
| `src/audio/score.js` | The score. |
| `src/audio/sound.js` | The mix, the beds and the one-shots. |
| `src/audio/bank.js` | Loading and freeing. |

Sources and licences are in [CREDITS.md](../CREDITS.md#sound).

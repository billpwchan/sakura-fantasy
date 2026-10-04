<div align="center">

<a href="https://sakura.52-198-144-26.sslip.io/"><img src="docs/media/hero.webp" width="100%" alt="黎明时分，一艘苫船在樱花树下漂行，船头灯笼已点亮，低斜的阳光洒在水面"></a>

<h1>桜幻想 &nbsp;<sub><i>Sakura Fantasy</i></sub></h1>

<p><b>乘一叶小舟穿过日本的河谷。四季、晨昏，随时可选，<br>在浏览器里实时渲染。</b></p>

<p>
<a href="https://sakura.52-198-144-26.sslip.io/"><b>开始旅程</b></a> &nbsp;·&nbsp;
<a href="docs/ARCHITECTURE.md">实现原理</a> &nbsp;·&nbsp;
<a href="docs/SOUND.md">配乐</a> &nbsp;·&nbsp;
<a href="README.md">English</a> &nbsp;·&nbsp;
<a href="README.ja.md">日本語</a>
</p>

<p>
<a href="https://sakura.52-198-144-26.sslip.io/"><img alt="在线体验" src="https://img.shields.io/badge/live-demo-c0392b?style=flat-square"></a>
<a href="https://threejs.org/"><img alt="three.js r186" src="https://img.shields.io/badge/three.js-r186-1f2937?style=flat-square"></a>
<img alt="WebGL 2" src="https://img.shields.io/badge/WebGL-2-1f2937?style=flat-square">
<img alt="不用引擎，不用框架" src="https://img.shields.io/badge/engine-none-1f2937?style=flat-square">
<a href="LICENSE"><img alt="MIT 许可" src="https://img.shields.io/badge/code-MIT-e8a0b4?style=flat-square"></a>
</p>

</div>

<br>

你坐在一艘苫船（*tomabune*，盖着芦苇篷的河船）里，船夫摇橹，载你顺河而下。沿途依次经过：

- 晨雾笼罩的浅滩
- 樱花夹岸的长堤
- 朱红的太鼓桥
- 五重塔下的村落
- 竹林峡谷
- 千本鸟居的隧道
- 一座湖，湖中立着一座鸟居

然后季节更替，旅程重新开始。

每一棵树、每一朵花、每一片草叶，都取自日本真实植物的摄影测量扫描。光线随太阳在一天中推移，天气也会变化。配乐由筝、尺八与笙实时谱写，背景是在京都等地的寺院与庭园录下的环境声。

全部代码约一万行原生 JavaScript，基于 three.js，没有引擎，也没有框架。

<br>

<p align="center"><img src="docs/media/seasons.jpg" width="100%" alt="同一段河流的春、夏、秋、冬"></p>
<p align="center"><sub>同一批树木走过一年：春天开花，夏天转绿，秋天叶片一片片变色，冬天枝头积雪。</sub></p>

## 旅程

<table>
<tr>
<td width="50%"><img src="docs/media/journey-1-asagiri.jpg" alt="朝雾之濑"><br><b>朝霧の瀬</b> &nbsp;朝雾之濑<br><sub>芦苇、卵石与浓重的晨雾。</sub></td>
<td width="50%"><img src="docs/media/journey-2-avenue.jpg" alt="樱并木"><br><b>桜並木</b> &nbsp;樱并木<br><sub>两岸樱树成行，水面漂着花筏。</sub></td>
</tr>
<tr>
<td><img src="docs/media/journey-3-bridge.jpg" alt="朱之太鼓桥"><br><b>朱の太鼓橋</b> &nbsp;朱之太鼓桥<br><sub>小舟从拱桥下穿过。</sub></td>
<td><img src="docs/media/journey-4-village.jpg" alt="五重塔之里"><br><b>五重塔の里</b> &nbsp;五重塔之里<br><sub>五重塔、本堂与钟楼，船到时钟声响起。</sub></td>
</tr>
<tr>
<td><img src="docs/media/journey-5-gorge.jpg" alt="竹林峡"><br><b>竹林峡</b> &nbsp;竹林峡<br><sub>峭壁、竹墙与瀑布。</sub></td>
<td><img src="docs/media/journey-6-torii.jpg" alt="千本鸟居"><br><b>千本鳥居</b> &nbsp;千本鸟居<br><sub>一条笔直的水道，头顶是四十一座朱红鸟居。</sub></td>
</tr>
<tr>
<td><img src="docs/media/journey-7-lake.jpg" alt="御神木之湖"><br><b>御神木の湖</b> &nbsp;御神木之湖<br><sub>岛上的巨大樱树，水中立着鸟居。</sub></td>
<td><img src="docs/media/journey-8-hanabi.jpg" alt="湖上烟火"><br><b>花火</b> &nbsp;夏夜烟火<br><sub>只在夏夜出现。每一声炸响都按声速传来。</sub></td>
</tr>
</table>

每到一处，都会展开一张章节卡，上面是一首为此地、此季挑选的古典俳句。

## 里面有什么

**真实的植物。** 叶片、花朵和草都取自日本物种的 CC0 扫描：

- 樱、红叶（槭）、枹栎
- 黑松、杉
- 竹、杜鹃、芒草、芦苇

这些扫描在 Blender 中渲染成照片图集，包括颜色、AO 和法线三张贴图。树木本身由代码生成并实例化，按离河道的远近分三档细节，镜头靠近时切换到完整细节。

**光、空气与天气。**

- 任意时刻的太阳与天空，带高度雾和体积光
- 五种天气：晴、雾、雨、风暴、雪
- 雪会积在枝头、屋顶和岸边

**水。** 河面倒映着两岸与天空，船后拖出开尔文尾迹和船首波，岸边聚着泡沫，水面漂着花瓣。

**船与船上的人。**

- 船在 Blender 中逐板搭建。
- 船夫与乘客的身体来自 MPFB，衣物专门制作：船夫穿半缠、戴菅笠；乘客穿振袖、系织锦腰带、撑一把红色和伞。
- 船夫用双骨骼 IK 摇橹，每一橹双手都握在橹（*ro*）上。

**夜晚。** 窗内亮起灯火，狐火游动，湖上漂着灯笼，岛上升起天灯。

**声音。** 声音分两层，每一段录音都按地点、季节和时辰放置：

| 层 | 内容 |
|---|---|
| 配乐 | 按日本调式（平调子、阳音阶、云井调子）实时谱写。筝奏出乐句：过桥前是一段段物（*danmono*），春天的樱花下引用《樱花樱花》。尺八吹出悠长的气息，笙在神社一带持续和音。 |
| 实地录音 | 大原来迎院与增上寺的梵钟，京都庭园的水琴窟与鹿威，蝉、铃虫、黄莺。 |

[配乐详解 →](docs/SOUND.md)

**流畅。** 河谷在 worker 线程池中生成。帧时间调速器会调整渲染分辨率，让每帧都控制在预算内。首帧用快速档资源画出，高精度资源随后在后台流式加载。

## 操作

| | |
|---|---|
| <kbd>W</kbd> <kbd>S</kbd> / <kbd>↑</kbd> <kbd>↓</kbd> | 加速、减速 |
| <kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd> | 在河道内转向 |
| 拖拽 · 滚轮 | 环顾 · 缩放 |
| <kbd>C</kbd> | 切换镜头：跟随 → 座位 → 电影 |
| <kbd>Space</kbd> | 停船漂流 / 继续划行 |
| <kbd>M</kbd> | 开关声音 |
| <kbd>P</kbd> | 拍照模式（环绕镜头，导出 PNG） |
| <kbd>H</kbd> | 隐藏界面 |

汉字栏用来设置季节、时辰、天气、镜头和声音；旅程卷轴可以跳到任意地点。

## 本地运行

```sh
git clone https://github.com/billpwchan/sakura-fantasy.git
cd sakura-fantasy
npm install
npm run dev          # http://127.0.0.1:5190
```

`npm run build` 会把静态站点输出到 `dist/`，任何 Web 服务器都能托管。资源都在仓库里，不需要另外下载。

在 URL 里带上参数，可以跳过开场，直接打开任一场景：

| 参数 | 含义 | 示例 |
|---|---|---|
| `z` | 沿河位置，从 `40`（起点）到约 `-2300`（湖） | `z=-1640` |
| `s` | 季节：`0` 春，`1` 夏，`2` 秋，`3` 冬 | `s=2` |
| `h` | 时刻，`0`–`24` | `h=17.5` |
| `w` | 天气：`clear` `mist` `rain` `storm` `snow` | `w=mist` |
| `mode` | 镜头：`follow` `seat` `cinema` | `mode=seat` |
| `cam`、`look` | 固定的镜头位置与注视点，`x,y,z` | `cam=4,3,-690&look=0,6,-720` |
| `tier` | `hi` 加载高精度资源，`lo` 只用快速档 | `tier=lo` |
| `intro` | 照样播放开场 | `intro` |

例如：[秋日黄昏的太鼓桥](https://sakura.52-198-144-26.sslip.io/?z=-660&s=2&h=17.2)，[冬夜的村落](https://sakura.52-198-144-26.sslip.io/?z=-860&s=3&h=21)。

## 制作方式

<p align="center"><img src="docs/media/pipeline.jpg" width="100%" alt="扫描得到的樱花与红叶烘焙成图集，以及它们在场景中的样子"></p>

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 渲染器与各个 pass、一帧的流程、调速器、世界生成、植被与 LOD、船与人物、夜晚、旅程与镜头、加载分档 |
| [docs/SOUND.md](docs/SOUND.md) | 配乐：调式、筝的手法、间与序破急、每件乐器如何用免费录音做成、混音如何测量 |
| [pipeline/](pipeline) | 制作资源的离线工具：植物图集、人物、船与道具的 Blender 脚本，以及音频构建 |

### 性能

在 Apple M4 Max 上以 1920×1080 @2× 运行完整档：

- 帧率稳定在 **60 fps**
- p95 帧时间 18.4 ms
- 调速器在大部分河段保持渲染比例 1.0；最吃性能的樱花长堤保持在 0.85 到 0.95

手机和平板使用快速档。

## 目录结构

```
src/
├── main.js        启动、帧循环、输入
├── core/          渲染 pass、后期链、共享 uniform、加载器
├── env/           时刻、季节与天气
├── world/         布局、地形、水、树、草、建筑、道具、船、人物、天空
├── fx/            花瓣、落叶、雪、雨、萤火虫、狐火、灯笼、烟火
├── journey/       航程、镜头导演、俳句
├── audio/         配乐、环境声、音频库
└── ui/            加载、标题、章节卡、汉字栏、关于、拍照模式
public/assets/     贴图与图集、模型、KTX2 转码器、音频
pipeline/          离线资源工具（Blender、Node、Python）
scripts/           贴图下载、性能与截图脚本
deploy/            Docker + Caddy 部署
```

## 致谢

植物、贴图、人物和大部分录音都是 CC0 或公有领域，有两尊石像和六段录音是 CC BY。每个来源及其作者见 [CREDITS.md](CREDITS.md)。

本项目受 Meng To 的 *Sakura River Valley* 启发，没有使用其任何代码或资源。

## 许可

代码采用 [MIT 许可](LICENSE)。各项资源保留各自的许可，见 [CREDITS.md](CREDITS.md)。

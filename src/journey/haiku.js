// One classic haiku for each place in each season (all public domain); English renderings are our own.
// Season order: spring, summer, autumn, winter.
export const POETS = {
  basho: { jp: '芭蕉', seal: '芭', en: 'Bashō' },
  buson: { jp: '蕪村', seal: '蕪', en: 'Buson' },
  issa: { jp: '一茶', seal: '茶', en: 'Issa' },
  shiki: { jp: '子規', seal: '規', en: 'Shiki' },
  boncho: { jp: '凡兆', seal: '兆', en: 'Bonchō' },
  ryokan: { jp: '良寛', seal: '寛', en: 'Ryōkan' },
  chiyo: { jp: '千代女', seal: '千', en: 'Chiyo-ni' },
};

export const HAIKU = {
  asagiri: [
    { jp: ['春なれや', '名もなき山の', '薄霞'], en: ['Spring, it seems —', 'on a hill without a name', 'a thin veil of haze'], by: 'basho' },
    { jp: ['朝顔に', '釣瓶とられて', 'もらひ水'], en: ['The morning glory', 'has taken my well bucket —', 'I ask for water'], by: 'chiyo' },
    { jp: ['霧しぐれ', '富士をみぬ日ぞ', '面白き'], en: ['Misty drizzle —', 'a day that hides Mount Fuji', 'has its own delight'], by: 'basho' },
    { jp: ['ながながと', '川一筋や', '雪の原'], en: ['Long, so long —', 'a single line of river', 'across the snowfield'], by: 'boncho' },
  ],
  sakura: [
    { jp: ['さまざまの', '事おもひ出す', '桜かな'], en: ['So many things', 'they call back to mind —', 'cherry blossoms'], by: 'basho' },
    { jp: ['夏草や', '兵どもが', '夢の跡'], en: ['Summer grasses —', 'all that is left', 'of warriors’ dreams'], by: 'basho' },
    { jp: ['山は暮れて', '野は黄昏の', '薄かな'], en: ['The hills have darkened;', 'the fields still hold the dusk', 'in silver grass'], by: 'buson' },
    { jp: ['いくたびも', '雪の深さを', '尋ねけり'], en: ['Again and again', 'I ask how deep', 'the snow has grown'], by: 'shiki' },
  ],
  bridge: [
    { jp: ['散る桜', '残る桜も', '散る桜'], en: ['Falling blossoms —', 'the blossoms that remain', 'are falling blossoms too'], by: 'ryokan' },
    { jp: ['五月雨を', 'あつめて早し', '最上川'], en: ['Gathering the rains', 'of early summer, how swift', 'the river runs'], by: 'basho' },
    { jp: ['この道や', '行く人なしに', '秋の暮'], en: ['Along this road', 'no one else is going —', 'autumn dusk'], by: 'basho' },
    { jp: ['いざさらば', '雪見にころぶ', '所まで'], en: ['Well then, let us go', 'snow-viewing, until', 'we tumble down'], by: 'basho' },
  ],
  village: [
    { jp: ['花の雲', '鐘は上野か', '浅草か'], en: ['A cloud of blossoms —', 'is that bell from Ueno,', 'or Asakusa?'], by: 'basho' },
    { jp: ['さみだれや', '大河を前に', '家二軒'], en: ['Summer rains —', 'facing the swollen river,', 'two houses'], by: 'buson' },
    { jp: ['柿くへば', '鐘が鳴るなり', '法隆寺'], en: ['I bite a persimmon —', 'and a bell is ringing', 'at Hōryū-ji'], by: 'shiki' },
    { jp: ['これがまあ', 'つひの栖か', '雪五尺'], en: ['So this, then,', 'is my last home —', 'five feet of snow'], by: 'issa' },
  ],
  gorge: [
    { jp: ['山路来て', '何やらゆかし', 'すみれ草'], en: ['Down the mountain path,', 'something tender here —', 'a wild violet'], by: 'basho' },
    { jp: ['閑さや', '岩にしみ入る', '蝉の声'], en: ['Such stillness —', 'the cicada’s cry', 'sinks into the rock'], by: 'basho' },
    { jp: ['枯朶に', '烏のとまりけり', '秋の暮'], en: ['On a withered branch', 'a crow has settled —', 'autumn evening'], by: 'basho' },
    { jp: ['初しぐれ', '猿も小蓑を', 'ほしげなり'], en: ['First winter rain —', 'even the monkey seems to want', 'a little straw coat'], by: 'basho' },
  ],
  torii: [
    { jp: ['菜の花や', '月は東に', '日は西に'], en: ['Rape blossoms —', 'the moon in the east,', 'the sun in the west'], by: 'buson' },
    { jp: ['大蛍', 'ゆらりゆらりと', '通りけり'], en: ['A great firefly', 'drifting, drifting', 'passes by'], by: 'issa' },
    { jp: ['物いへば', '唇寒し', '秋の風'], en: ['When I speak', 'my lips grow cold —', 'the autumn wind'], by: 'basho' },
    { jp: ['冬の日や', '馬上に氷る', '影法師'], en: ['Winter sun —', 'frozen on horseback,', 'my own shadow'], by: 'basho' },
  ],
  lake: [
    { jp: ['古池や', '蛙飛びこむ', '水の音'], en: ['The old pond —', 'a frog leaps in,', 'the sound of water'], by: 'basho' },
    { jp: ['おもしろうて', 'やがてかなしき', '鵜舟かな'], en: ['Delightful, and then', 'so sad —', 'the cormorant boats'], by: 'basho' },
    { jp: ['名月や', '池をめぐりて', '夜もすがら'], en: ['The harvest moon —', 'I circle the pond', 'all night long'], by: 'basho' },
    { jp: ['旅に病んで', '夢は枯野を', 'かけ廻る'], en: ['Ill on a journey —', 'my dreams go wandering', 'over withered fields'], by: 'basho' },
  ],
};

export const SEASON_CARDS = [
  { jp: '春', kana: 'はる', en: 'The Spring Scroll' },
  { jp: '夏', kana: 'なつ', en: 'The Summer Scroll' },
  { jp: '秋', kana: 'あき', en: 'The Autumn Scroll' },
  { jp: '冬', kana: 'ふゆ', en: 'The Winter Scroll' },
];

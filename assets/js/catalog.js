// EchoHub catalog — every episode is a "station" on the dial.
// Frequencies are grouped by band so the tuner reads like a real FM strip.

export const BANDS = [
  {
    id: 'technology',
    name: 'Technology',
    short: 'Tech',
    range: [88, 92.5],
    hue: 'var(--band-tech)',
    blurb: 'AI, networks, devices and the invisible systems that run modern life.'
  },
  {
    id: 'science',
    name: 'Science',
    short: 'Sci',
    range: [92.5, 97.5],
    hue: 'var(--band-sci)',
    blurb: 'Space, the body, the brain, and how we know what we know.'
  },
  {
    id: 'geography',
    name: 'Geography',
    short: 'Geo',
    range: [97.5, 102.5],
    hue: 'var(--band-geo)',
    blurb: 'Landforms, climate and the places that shape how people live.'
  },
  {
    id: 'history',
    name: 'History',
    short: 'Hist',
    range: [102.5, 107.5],
    hue: 'var(--band-hist)',
    blurb: 'Empires, turning points and the stories the present inherits.'
  }
];

const ep = (o) => ({
  ...o,
  audio: `podcasts/${o.file}.mp3`,
  cover: `assets/img/covers/${o.file}.webp`
});

export const EPISODES = [
  ep({
    slug: 'what-is-ai-really',
    file: 'what_is_ai_really',
    title: 'What Is AI Really?',
    band: 'technology',
    freq: 88.7,
    seconds: 369,
    tags: ['ai', 'machine learning', 'future', 'explained'],
    description: 'Strip away the hype and artificial intelligence is a set of very specific ideas. A grounded introduction to what AI is, what it is not, and where you already use it every day.'
  }),
  ep({
    slug: 'how-the-internet-moves-data',
    file: 'how_the_internet_moves_data',
    title: 'How the Internet Moves Data',
    band: 'technology',
    freq: 90.1,
    seconds: 275,
    tags: ['internet', 'networks', 'packets', 'computers'],
    description: 'Follow a single message as it gets chopped into packets, routed across the planet and stitched back together in a fraction of a second.'
  }),
  ep({
    slug: 'smartphones-of-the-future',
    file: 'smartphones_of_the_future',
    title: 'Smartphones of the Future',
    band: 'technology',
    freq: 91.5,
    seconds: 348,
    tags: ['smartphones', 'gadgets', 'design', 'future'],
    description: 'Foldables, on-device AI, new batteries and whatever comes after the slab of glass. A look at where personal devices are heading next.'
  }),
  ep({
    slug: 'black-holes-explained',
    file: 'black_holes_explained',
    title: 'Black Holes Explained',
    band: 'science',
    freq: 93.3,
    seconds: 352,
    tags: ['space', 'gravity', 'black holes', 'universe'],
    description: 'Places where gravity wins completely. How black holes form, what happens at the event horizon, and how we photographed one anyway.'
  }),
  ep({
    slug: 'why-we-dream',
    file: 'why_we_dream',
    title: 'Why We Dream',
    band: 'science',
    freq: 94.9,
    seconds: 334,
    tags: ['sleep', 'brain', 'dreams', 'memory'],
    description: 'Every night your brain runs a strange private film festival. What happens during REM sleep and the leading theories on why we dream at all.'
  }),
  ep({
    slug: 'how-vaccines-protect-us',
    file: 'how_vaccines_protect_us',
    title: 'How Vaccines Protect Us',
    band: 'science',
    freq: 96.3,
    seconds: 279,
    tags: ['health', 'immune system', 'biology', 'medicine'],
    description: 'A clear walk-through of how vaccines train the immune system to recognise a threat before it ever shows up.'
  }),
  ep({
    slug: 'why-deserts-exist',
    file: 'why_deserts_exist',
    title: 'Why Deserts Exist',
    band: 'geography',
    freq: 98.5,
    seconds: 318,
    tags: ['deserts', 'climate', 'rain shadow', 'earth'],
    description: 'Sinking air, cold ocean currents and mountain rain shadows: the planet-scale forces that decide where the dry places are.'
  }),
  ep({
    slug: 'understanding-earthquakes',
    file: 'understanding_earthquakes',
    title: 'Understanding Earthquakes',
    band: 'geography',
    freq: 99.9,
    seconds: 132,
    tags: ['earthquakes', 'tectonic plates', 'earth', 'hazards'],
    description: 'Why the ground suddenly shakes, what tectonic plates have to do with it, and how scientists measure the energy released.'
  }),
  ep({
    slug: 'bhakra-nangal-dam',
    file: 'bhakra_nangal_dam',
    title: 'Bhakra Nangal Dam',
    band: 'geography',
    freq: 101.3,
    seconds: 177,
    tags: ['india', 'dams', 'infrastructure', 'water'],
    description: 'One of the tallest gravity dams in the world. How Bhakra Nangal reshaped water, power and farming across northern India.'
  }),
  ep({
    slug: 'rise-of-ancient-rome',
    file: 'the_rise_of_ancient_rome',
    title: 'The Rise of Ancient Rome',
    band: 'history',
    freq: 103.1,
    seconds: 190,
    tags: ['rome', 'ancient world', 'empire', 'civilisation'],
    description: 'How a small settlement on the Tiber grew into an empire that stretched across three continents.'
  }),
  ep({
    slug: 'causes-of-world-war-i',
    file: 'causes_of_world_war_i',
    title: 'Causes of World War I',
    band: 'history',
    freq: 104.7,
    seconds: 175,
    tags: ['world war i', 'alliances', 'europe', '20th century'],
    description: 'Militarism, alliances, imperial rivalry and nationalism — and the single assassination that set them all in motion.'
  }),
  ep({
    slug: 'stories-behind-the-taj-mahal',
    file: 'stories_behind_the_taj_mahal',
    title: 'Stories Behind the Taj Mahal',
    band: 'history',
    freq: 106.1,
    seconds: 137,
    tags: ['india', 'taj mahal', 'architecture', 'mughal'],
    description: 'A monument to love, power and craftsmanship. The history and the legends behind India’s most famous building.'
  })
];

// The station ID that closes out the dial.
export const STATION_ID = {
  slug: 'about-echohub',
  file: 'about_us',
  title: 'Meet the Makers',
  band: 'station',
  freq: 107.9,
  seconds: 304,
  tags: ['echohub', 'team', 'behind the scenes'],
  description: 'The people behind EchoHub talk about how the project came together: the research, the scripts, the design and the build.',
  audio: 'about_us/about_us.mp3',
  cover: 'assets/img/covers/about_us.webp'
};

export const TEAM = [
  { name: 'Nikhil', role: 'Web Developer', bio: 'Built the EchoHub app: design, interaction, the player and the studio.' },
  { name: 'Bhumika', role: 'Presentation Designer', bio: 'Shaped the visual story and the brand that the project was presented with.' },
  { name: 'Maleeha', role: 'Podcast Creator', bio: 'Researched and recorded the episodes, turning big topics into short, clear audio.' },
  { name: 'Ria', role: 'Project Manager', bio: 'Coordinated the team and kept every piece moving toward one finished product.' },
  { name: 'Jasmine', role: 'Script Writer', bio: 'Wrote and refined the scripts for clarity, accuracy and flow.' }
];

export const ALL_STATIONS = [...EPISODES, STATION_ID];

export const bandById = (id) => BANDS.find((b) => b.id === id);
export const findEpisode = (slug) => ALL_STATIONS.find((e) => e.slug === slug);

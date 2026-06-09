/* ============ ORBIT — title metadata (cast, crew, overviews, episodes) ============
   Real credits for the marquee titles so detail pages read true. Titles without
   an entry still render a full page (backdrop, poster, metadata, more-from). */
window.OrbitMeta = (function () {
  // key by title only — years are unique enough across this library
  const C = {
    'Inception': { director: 'Christopher Nolan', studio: 'Warner Bros.', cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page', 'Tom Hardy', 'Ken Watanabe', 'Marion Cotillard'], overview: 'A thief who steals corporate secrets through dream-sharing technology is given the inverse task: plant an idea into a target’s subconscious.' },
    'Interstellar': { director: 'Christopher Nolan', studio: 'Paramount', cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain', 'Michael Caine', 'Matt Damon'], overview: 'With Earth dying, a team of explorers travels through a wormhole near Saturn in search of a new home for humanity.' },
    'The Dark Knight': { director: 'Christopher Nolan', studio: 'Warner Bros.', cast: ['Christian Bale', 'Heath Ledger', 'Aaron Eckhart', 'Gary Oldman', 'Michael Caine', 'Maggie Gyllenhaal'], overview: 'Batman raises the stakes in his war on crime — until a criminal mastermind known as the Joker plunges Gotham into anarchy.' },
    'The Prestige': { director: 'Christopher Nolan', studio: 'Warner Bros.', cast: ['Hugh Jackman', 'Christian Bale', 'Michael Caine', 'Scarlett Johansson', 'David Bowie'], overview: 'Two rival magicians in Victorian London engage in a bitter, escalating battle to create the ultimate illusion.' },
    'Dunkirk': { director: 'Christopher Nolan', studio: 'Warner Bros.', cast: ['Fionn Whitehead', 'Tom Hardy', 'Mark Rylance', 'Cillian Murphy', 'Kenneth Branagh'], overview: 'Allied soldiers are surrounded on the beaches of Dunkirk and fight for survival as the enemy closes in.' },
    'Oppenheimer': { director: 'Christopher Nolan', studio: 'Universal', cast: ['Cillian Murphy', 'Emily Blunt', 'Robert Downey Jr.', 'Matt Damon', 'Florence Pugh'], overview: 'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.' },
    'Dune': { director: 'Denis Villeneuve', studio: 'Warner Bros.', cast: ['Timothée Chalamet', 'Rebecca Ferguson', 'Oscar Isaac', 'Zendaya', 'Josh Brolin', 'Jason Momoa'], overview: 'Paul Atreides arrives on the desert planet Arrakis, the only source of the universe’s most valuable substance, and is drawn into a war for its control.' },
    'Dune: Part Two': { director: 'Denis Villeneuve', studio: 'Warner Bros.', cast: ['Timothée Chalamet', 'Zendaya', 'Rebecca Ferguson', 'Javier Bardem', 'Austin Butler', 'Florence Pugh'], overview: 'Paul Atreides unites with the Fremen to wage war against House Harkonnen and avenge his family.' },
    'Arrival': { director: 'Denis Villeneuve', studio: 'Paramount', cast: ['Amy Adams', 'Jeremy Renner', 'Forest Whitaker', 'Michael Stuhlbarg'], overview: 'A linguist is recruited to communicate with extraterrestrial visitors and races to understand their language before tensions escalate to war.' },
    'Blade Runner 2049': { director: 'Denis Villeneuve', studio: 'Warner Bros.', cast: ['Ryan Gosling', 'Harrison Ford', 'Ana de Armas', 'Jared Leto', 'Robin Wright'], overview: 'A young blade runner uncovers a long-buried secret that could plunge what’s left of society into chaos, and seeks out a former blade runner missing for decades.' },
    'Sicario': { director: 'Denis Villeneuve', studio: 'Lionsgate', cast: ['Emily Blunt', 'Benicio del Toro', 'Josh Brolin', 'Daniel Kaluuya'], overview: 'An idealistic FBI agent is enlisted by a task force to bring down the leader of a Mexican drug cartel.' },
    'Prisoners': { director: 'Denis Villeneuve', studio: 'Warner Bros.', cast: ['Hugh Jackman', 'Jake Gyllenhaal', 'Viola Davis', 'Melissa Leo', 'Paul Dano'], overview: 'When his daughter and her friend go missing, a father takes matters into his own hands as the police pursue multiple leads.' },
    'The Matrix': { director: 'The Wachowskis', studio: 'Warner Bros.', cast: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss', 'Hugo Weaving'], overview: 'A hacker learns that his reality is a simulation and joins a rebellion to free humanity from machines.' },
    'Everything Everywhere All at Once': { director: 'Daniels', studio: 'A24', cast: ['Michelle Yeoh', 'Ke Huy Quan', 'Stephanie Hsu', 'Jamie Lee Curtis'], overview: 'An exhausted laundromat owner discovers she must connect with versions of herself across the multiverse to stop a great evil.' },
    'Hereditary': { director: 'Ari Aster', studio: 'A24', cast: ['Toni Collette', 'Alex Wolff', 'Milly Shapiro', 'Gabriel Byrne'], overview: 'After the family matriarch passes away, a grieving family is haunted by tragic and disturbing occurrences.' },
    'The Lighthouse': { director: 'Robert Eggers', studio: 'A24', cast: ['Robert Pattinson', 'Willem Dafoe'], overview: 'Two lighthouse keepers descend into madness while stranded on a remote New England island in the 1890s.' },
    'Midsommar': { director: 'Ari Aster', studio: 'A24', cast: ['Florence Pugh', 'Jack Reynor', 'Will Poulter'], overview: 'A grieving woman and her boyfriend travel to a Swedish festival that takes a sinister turn.' },
    'Moonlight': { director: 'Barry Jenkins', studio: 'A24', cast: ['Trevante Rhodes', 'Mahershala Ali', 'Naomie Harris', 'Janelle Monáe'], overview: 'A young Black man grapples with identity and sexuality across three chapters of his life in Miami.' },
    'Casino Royale': { director: 'Martin Campbell', studio: 'MGM', cast: ['Daniel Craig', 'Eva Green', 'Mads Mikkelsen', 'Judi Dench'], overview: 'On his first mission as 007, James Bond must defeat a banker to terrorists in a high-stakes poker game.' },
    'Skyfall': { director: 'Sam Mendes', studio: 'MGM', cast: ['Daniel Craig', 'Javier Bardem', 'Judi Dench', 'Ralph Fiennes', 'Naomie Harris'], overview: 'Bond’s loyalty to M is tested as her past comes back to haunt her and MI6 comes under attack.' },
    'No Time to Die': { director: 'Cary Joji Fukunaga', studio: 'MGM', cast: ['Daniel Craig', 'Rami Malek', 'Léa Seydoux', 'Lashana Lynch', 'Ana de Armas'], overview: 'Bond is pulled out of retirement when an old friend asks for help, leading to a confrontation with a new and dangerous adversary.' },
    'Drive': { director: 'Nicolas Winding Refn', studio: 'FilmDistrict', cast: ['Ryan Gosling', 'Carey Mulligan', 'Bryan Cranston', 'Albert Brooks', 'Oscar Isaac'], overview: 'A Hollywood stunt driver who moonlights as a getaway driver is drawn into a deadly heist to protect his neighbour.' },
    'Heat': { director: 'Michael Mann', studio: 'Warner Bros.', cast: ['Al Pacino', 'Robert De Niro', 'Val Kilmer', 'Jon Voight'], overview: 'A master thief and a relentless detective find themselves on a collision course in Los Angeles.' },
    'Gladiator': { director: 'Ridley Scott', studio: 'DreamWorks', cast: ['Russell Crowe', 'Joaquin Phoenix', 'Connie Nielsen', 'Oliver Reed'], overview: 'A betrayed Roman general rises through the gladiatorial arena to avenge the murder of his family and emperor.' },
    'Mad Max: Fury Road': { director: 'George Miller', studio: 'Warner Bros.', cast: ['Tom Hardy', 'Charlize Theron', 'Nicholas Hoult', 'Hugh Keays-Byrne'], overview: 'In a post-apocalyptic wasteland, Max joins Furiosa as she flees a tyrant across the desert in an armoured war rig.' },
    // TV
    'Breaking Bad': { creator: 'Vince Gilligan', studio: 'AMC', cast: ['Bryan Cranston', 'Aaron Paul', 'Anna Gunn', 'Dean Norris', 'Bob Odenkirk'], overview: 'A high-school chemistry teacher diagnosed with cancer turns to manufacturing methamphetamine to secure his family’s future.' },
    'The Wire': { creator: 'David Simon', studio: 'HBO', cast: ['Dominic West', 'Idris Elba', 'Michael K. Williams', 'Wendell Pierce'], overview: 'The Baltimore drug scene is seen through the eyes of both law enforcement and the dealers they pursue.' },
    'The Sopranos': { creator: 'David Chase', studio: 'HBO', cast: ['James Gandolfini', 'Edie Falco', 'Lorraine Bracco', 'Michael Imperioli'], overview: 'New Jersey mob boss Tony Soprano juggles the demands of his crime family and his real family — in therapy.' },
    'Mad Men': { creator: 'Matthew Weiner', studio: 'AMC', cast: ['Jon Hamm', 'Elisabeth Moss', 'Christina Hendricks', 'January Jones'], overview: 'The lives and ambitions of the men and women of a 1960s Madison Avenue advertising agency.' },
    'Chernobyl': { creator: 'Craig Mazin', studio: 'HBO', cast: ['Jared Harris', 'Stellan Skarsgård', 'Emily Watson'], overview: 'A dramatization of the 1986 nuclear disaster and the sacrifices made to contain it.' },
    'Severance': { creator: 'Dan Erickson', studio: 'Apple TV+', cast: ['Adam Scott', 'Britt Lower', 'Patricia Arquette', 'John Turturro', 'Christopher Walken'], overview: 'Employees at Lumon Industries undergo a procedure that surgically divides their work and personal memories.' },
    'The Expanse': { creator: 'Mark Fergus', studio: 'Prime Video', cast: ['Steven Strait', 'Dominique Tipper', 'Wes Chatham', 'Shohreh Aghdashloo'], overview: 'A detective, a ship’s officer and a politician uncover a conspiracy that threatens an uneasy peace across the solar system.' },
    'Succession': { creator: 'Jesse Armstrong', studio: 'HBO', cast: ['Brian Cox', 'Jeremy Strong', 'Sarah Snook', 'Kieran Culkin', 'Matthew Macfadyen'], overview: 'The Roy family controls a media empire — and tears itself apart deciding who will inherit it.' },
    'The Last of Us': { creator: 'Craig Mazin', studio: 'HBO', cast: ['Pedro Pascal', 'Bella Ramsey', 'Anna Torv', 'Gabriel Luna'], overview: 'Twenty years after a fungal outbreak, a hardened survivor escorts a teenage girl across a ravaged America.' },
    'Game of Thrones': { creator: 'Benioff & Weiss', studio: 'HBO', cast: ['Emilia Clarke', 'Kit Harington', 'Peter Dinklage', 'Lena Headey', 'Sophie Turner'], overview: 'Noble families vie for control of the Iron Throne as an ancient enemy returns to the realm of Westeros.' },
    'Avatar: The Last Airbender': { creator: 'DiMartino & Konietzko', studio: 'Nickelodeon', cast: ['Zach Tyler Eisen', 'Mae Whitman', 'Jack DeSena', 'Dante Basco'], overview: 'A young Avatar must master all four elements to stop the Fire Nation and restore balance to the world.' },
    'Bluey': { creator: 'Joe Brumm', studio: 'ABC / Disney+', cast: ['David McCormack', 'Melanie Zanetti'], overview: 'A lovable, inexhaustible Blue Heeler puppy turns everyday family life into imaginative play.' },
    // Kids movies
    'Toy Story': { director: 'John Lasseter', studio: 'Pixar', cast: ['Tom Hanks', 'Tim Allen', 'Don Rickles', 'Wallace Shawn'], overview: 'A cowboy doll is threatened when a flashy space ranger supplants him as a boy’s favourite toy.' },
    'WALL·E': { director: 'Andrew Stanton', studio: 'Pixar', cast: ['Ben Burtt', 'Elissa Knight', 'Jeff Garlin', 'Sigourney Weaver'], overview: 'A waste-collecting robot left alone on Earth embarks on a journey across the galaxy that decides humanity’s fate.' },
    'Up': { director: 'Pete Docter', studio: 'Pixar', cast: ['Ed Asner', 'Christopher Plummer', 'Jordan Nagai'], overview: 'A widowed balloon salesman ties thousands of balloons to his house and sails to South America — with a stowaway aboard.' },
    'Inside Out': { director: 'Pete Docter', studio: 'Pixar', cast: ['Amy Poehler', 'Phyllis Smith', 'Bill Hader', 'Mindy Kaling'], overview: 'The emotions inside a young girl’s mind struggle to guide her through a difficult move to a new city.' },
    'Coco': { director: 'Lee Unkrich', studio: 'Pixar', cast: ['Anthony Gonzalez', 'Gael García Bernal', 'Benjamin Bratt'], overview: 'A boy who dreams of music is transported to the Land of the Dead, where he seeks the truth about his family.' },
    'Spirited Away': { director: 'Hayao Miyazaki', studio: 'Studio Ghibli', cast: ['Rumi Hiiragi', 'Miyu Irino', 'Mari Natsuki'], overview: 'A young girl wanders into a world of spirits and must work to free her parents and find her way home.' },
    'My Neighbor Totoro': { director: 'Hayao Miyazaki', studio: 'Studio Ghibli', cast: ['Noriko Hidaka', 'Chika Sakamoto', 'Hitoshi Takagi'], overview: 'Two sisters move to the countryside and befriend the gentle forest spirits who live nearby.' },
    'Spider-Man: Into the Spider-Verse': { director: 'Persichetti, Ramsey & Rothman', studio: 'Sony', cast: ['Shameik Moore', 'Jake Johnson', 'Hailee Steinfeld', 'Mahershala Ali'], overview: 'Teen Miles Morales becomes Spider-Man and joins other Spider-People from across the multiverse.' },
    // Comedy
    'Shaun of the Dead': { director: 'Edgar Wright', studio: 'Universal', cast: ['Simon Pegg', 'Nick Frost', 'Kate Ashfield', 'Lucy Davis'], overview: 'A man’s uneventful life is upended by a zombie apocalypse — and a chance to win back his girlfriend.' },
    'Hot Fuzz': { director: 'Edgar Wright', studio: 'Universal', cast: ['Simon Pegg', 'Nick Frost', 'Timothy Dalton', 'Jim Broadbent'], overview: 'A top London cop is reassigned to a sleepy village where a string of grisly “accidents” hides a dark secret.' },
    'The Big Lebowski': { director: 'The Coen Brothers', studio: 'Gramercy', cast: ['Jeff Bridges', 'John Goodman', 'Julianne Moore', 'Steve Buscemi'], overview: 'The Dude is mistaken for a millionaire of the same name and drawn into a kidnapping caper.' },
    'Groundhog Day': { director: 'Harold Ramis', studio: 'Columbia', cast: ['Bill Murray', 'Andie MacDowell', 'Chris Elliott'], overview: 'A cynical weatherman is trapped reliving the same day over and over in a small Pennsylvania town.' },
    'The Office': { creator: 'Greg Daniels', studio: 'NBC', cast: ['Steve Carell', 'Rainn Wilson', 'John Krasinski', 'Jenna Fischer'], overview: 'A mockumentary on the everyday absurdities of office life at a paper company in Scranton, PA.' },
    'Parks and Recreation': { creator: 'Daniels & Schur', studio: 'NBC', cast: ['Amy Poehler', 'Nick Offerman', 'Aubrey Plaza', 'Chris Pratt'], overview: 'An optimistic mid-level bureaucrat tries to make her Indiana town a little bit better, one project at a time.' },
    // Docs
    'Planet Earth II': { creator: 'BBC', studio: 'BBC', cast: ['David Attenborough'], overview: 'A breathtaking journey through the planet’s wildest habitats, from islands to cities.' },
    'Free Solo': { director: 'Chai Vasarhelyi & Jimmy Chin', studio: 'National Geographic', cast: ['Alex Honnold'], overview: 'Climber Alex Honnold attempts to scale Yosemite’s 3,000-foot El Capitan without ropes.' },
    'My Octopus Teacher': { director: 'Pippa Ehrlich & James Reed', studio: 'Netflix', cast: ['Craig Foster'], overview: 'A filmmaker forges an unusual friendship with an octopus in a South African kelp forest.' },
  };

  function get(node) {
    const base = C[node.title] || null;
    return base;
  }

  function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }

  // real per-season episode counts for the marquee shows (else falls back to epsPerSeason)
  const EPCOUNTS = {
    'Breaking Bad': [7, 13, 13, 13, 16],
    'The Wire': [13, 12, 12, 13, 10],
    'The Sopranos': [13, 13, 13, 13, 13, 21],
    'Mad Men': [13, 13, 13, 13, 13, 13, 14],
    'Chernobyl': [5],
    'True Detective': [8, 8, 8, 6],
    'Severance': [9, 10],
    'The Expanse': [10, 13, 13, 10, 10, 6],
    'Foundation': [10, 10],
    'Dark': [10, 8, 8],
    'Westworld': [10, 10, 8, 8],
    'Succession': [10, 10, 9, 10],
    'The Last of Us': [9, 7],
    'Game of Thrones': [10, 10, 10, 10, 10, 10, 7, 6],
    'Avatar: The Last Airbender': [20, 20, 21],
    'Gravity Falls': [20, 20],
    'Steven Universe': [52, 26, 26, 26, 32],
    'Bluey': [52, 52, 52],
    'The Office': [6, 22, 25, 19, 28, 26, 24, 24, 23],
    'Parks and Recreation': [6, 24, 16, 22, 22, 21, 13],
    'Arrested Development': [22, 18, 13, 15, 18],
    'Planet Earth II': [6],
    'Our Planet': [8],
    'Making a Murderer': [10, 10],
    'The Jinx': [6],
    'Tiger King': [7],
  };
  function seasonCount(show, season) {
    const arr = EPCOUNTS[show.title];
    if (arr && arr[season - 1]) return arr[season - 1];
    return show.epsPerSeason || 10;
  }

  // real per-episode metadata (title + synopsis) for flagship shows, season 1.
  // shows/seasons without an entry fall back to “Episode N”.
  const EPISODES = {
    'Breaking Bad': { 1: [
      ['Pilot', 'A struggling chemistry teacher diagnosed with terminal cancer teams with a former student to secure his family’s future.'],
      ['Cat’s in the Bag…', 'Walt and Jesse scramble to dispose of the evidence from their first cook.'],
      ['…And the Bag’s in the River', 'Walt agonizes over the fate of a surviving rival held in Jesse’s basement.'],
      ['Cancer Man', 'Walt finally tells his family about his diagnosis as Jesse reconnects with his.'],
      ['Gray Matter', 'Walt refuses charity from wealthy old friends and weighs whether to take treatment.'],
      ['Crazy Handful of Nothin’', 'With chemo underway, Walt adopts the Heisenberg persona to muscle into distribution.'],
      ['A No-Rough-Stuff-Type Deal', 'Walt and Jesse commit to scaling up, forcing a violent confrontation.'],
    ] },
    'Chernobyl': { 1: [
      ['1:23:45', 'The reactor explodes and officials downplay the catastrophe as first responders are exposed.'],
      ['Please Remain Calm', 'A physicist races to warn the Kremlin of the true scale as the fire still burns.'],
      ['Open Wide, O Earth', 'The human cost mounts in Moscow hospitals as a brutal cleanup is planned.'],
      ['The Happiness of All Mankind', 'Soldiers and miners are conscripted for the most dangerous containment work.'],
      ['Vichnaya Pamyat', 'The trial lays bare the lies and design flaws behind the disaster.'],
    ] },
    'Game of Thrones': { 1: [
      ['Winter Is Coming', 'Ned Stark is asked to serve as Hand of the King as old threats stir beyond the Wall.'],
      ['The Kingsroad', 'The Stark children scatter as the royal party travels south.'],
      ['Lord Snow', 'Jon adjusts to the Night’s Watch while Ned uncovers secrets in King’s Landing.'],
      ['Cripples, Bastards, and Broken Things', 'Ned investigates his predecessor’s death; Tyrion stops at Winterfell.'],
      ['The Wolf and the Lion', 'Tensions between Stark and Lannister erupt into open conflict.'],
      ['A Golden Crown', 'Viserys demands his crown as Ned renders judgment.'],
      ['You Win or You Die', 'Power shifts violently after a hunting trip changes everything.'],
      ['The Pointy End', 'The realm fractures into war as the Starks fight for survival.'],
      ['Baelor', 'A fateful decision in King’s Landing stuns the Seven Kingdoms.'],
      ['Fire and Blood', 'The aftermath sets armies marching and a new power is born in the east.'],
    ] },
    'The Last of Us': { 1: [
      ['When You’re Lost in the Darkness', 'Twenty years after an outbreak, a smuggler is tasked with escorting a teenage girl.'],
      ['Infected', 'Joel, Tess and Ellie cross a ruined city teeming with the infected.'],
      ['Long, Long Time', 'A survivalist’s unlikely love story unfolds over decades.'],
      ['Please Hold to My Hand', 'Joel and Ellie reach Kansas City and run into a vengeful faction.'],
      ['Endure and Survive', 'A rebellion boils over as Henry and Sam try to escape.'],
      ['Kin', 'Joel and Ellie search for his brother in a thriving settlement.'],
      ['Left Behind', 'A flashback reveals the night that changed Ellie’s life.'],
      ['When We Are in Need', 'Ellie falls into the hands of a dangerous preacher.'],
      ['Look for the Light', 'Joel makes an irreversible choice at the Firefly hospital.'],
    ] },
    'Severance': { 1: [
      ['Good News About Hell', 'Mark is promoted at Lumon, where “severance” splits work and personal memories.'],
      ['Half Loop', 'A departing colleague’s absence unsettles the team.'],
      ['In Perpetuity', 'The department tours Lumon’s eerie heritage and rules.'],
      ['The You You Are', 'Helly’s defiance escalates as Mark digs into a strange handbook.'],
      ['The Grim Barbarity of Optics and Design', 'A rival department reveals how little the innies know.'],
      ['Hide and Seek', 'Cracks widen between the innies’ and outies’ worlds.'],
      ['Defiant Jazz', 'The team rebels in small ways as suspicions mount.'],
      ['What’s for Dinner?', 'A risky plan to reach the outside world takes shape.'],
      ['The We We Are', 'The innies experience their outies’ lives for the first time.'],
    ] },
  };
  function episodeInfo(show, season, n) {
    const s = EPISODES[show.title] && EPISODES[show.title][season];
    if (s && s[n - 1]) return { title: s[n - 1][0], synopsis: s[n - 1][1] };
    return { title: `Episode ${n}`, synopsis: '' };
  }

  // deterministic media/file info (Plex-style version details)
  function mediaInfo(node) {
    const h = hash(node.title + (node.year || ''));
    const newish = (node.year || 2000) >= 2016;
    const res = newish ? (h % 3 === 0 ? '4K Dolby Vision' : h % 3 === 1 ? '4K HDR' : '1080p') : (h % 4 === 0 ? '4K' : '1080p');
    const is4k = res.startsWith('4K');
    const codec = is4k ? 'HEVC' : (h % 2 ? 'HEVC' : 'H.264');
    const audioPool = is4k ? ['Dolby Atmos', 'DTS-HD MA 7.1', 'TrueHD Atmos'] : ['DTS-HD MA 5.1', 'Dolby Digital 5.1', 'AAC 2.0'];
    const audio = audioPool[h % audioPool.length];
    const container = h % 3 === 0 ? 'MKV' : 'MP4';
    const mins = node.type === 'show' ? 50 : (node.runtime || 110);
    const gbPerHour = is4k ? 8.5 : 3.1;
    const size = ((mins / 60) * gbPerHour).toFixed(1) + ' GB';
    const bitrate = (is4k ? (h % 28 + 55) : (h % 12 + 8)) + ' Mbps';
    const hdr = res.includes('Dolby') ? 'Dolby Vision' : (res.includes('HDR') ? 'HDR10' : null);
    return { res, is4k, codec, audio, container, size, bitrate, hdr, perEp: node.type === 'show' };
  }

  // deterministic episode list per season — real titles/synopses where known, else “Episode N”
  function episodes(show, season) {
    const count = seasonCount(show, season);
    const baseRun = show.genre === 'Animation' || show.genre === 'Comedy' || show.genre === 'Family' ? 24 : (show.genre === 'Documentary' ? 50 : 52);
    const out = [];
    for (let i = 1; i <= count; i++) {
      const v = ((show.title.length + season * 7 + i * 13) % 9) - 4;
      const info = episodeInfo(show, season, i);
      out.push({ n: i, season, title: info.title, synopsis: info.synopsis, runtime: Math.max(18, baseRun + v) });
    }
    return out;
  }

  return { get, episodes, seasonCount, mediaInfo, hash, episodeInfo };
})();

export const Meta = window.OrbitMeta;
export default Meta;

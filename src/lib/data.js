/* ORBIT — library data, modeled on a real Plex setup.
   Top level = your LIBRARIES (Movies, TV Shows, Kids Movies, Kids TV,
   Comedy, Documentaries). Each library holds nestable collections + titles.
   node = { id, type:'library'|'collection'|'movie'|'show', title, year, genre, ... } */
(function () {
  let _n = 0;
  const uid = (p) => p + '_' + (++_n);
  const m = (title, year, genre, runtime, rating) => ({ id: uid('m'), type: 'movie', title, year, genre, runtime, rating: rating || null });
  const s = (title, year, genre, seasons, eps, rating) => ({ id: uid('s'), type: 'show', title, year, genre, seasons, epsPerSeason: eps || 10, rating: rating || null });
  const c = (title, blurb, children) => ({ id: uid('c'), type: 'collection', title, blurb: blurb || '', children: children || [] });
  const lib = (title, key, blurb, children) => ({ id: uid('lib'), type: 'library', title, libKey: key, blurb: blurb || '', children: children || [] });

  const ROOT = c('Your Server', 'Every library on your server.', [

    /* ===================== MOVIES ===================== */
    lib('Movies', 'movies', 'Features for grown-ups — the main film library.', [
      c('Christopher Nolan', 'Time, memory and spectacle bent into impossible shapes.', [
        m('Inception', 2010, 'Sci-Fi', 148, 'PG-13'),
        m('Interstellar', 2014, 'Sci-Fi', 169, 'PG-13'),
        m('The Dark Knight', 2008, 'Action', 152, 'PG-13'),
        m('The Prestige', 2006, 'Mystery', 130, 'PG-13'),
        m('Dunkirk', 2017, 'War', 106, 'PG-13'),
        m('Oppenheimer', 2023, 'Drama', 180, 'R'),
      ]),
      c('Denis Villeneuve', 'Monumental scale, slow tension and silence used like a weapon.', [
        c('Dune', 'The desert saga — power, prophecy and spice.', [
          m('Dune', 2021, 'Sci-Fi', 155, 'PG-13'),
          m('Dune: Part Two', 2024, 'Sci-Fi', 166, 'PG-13'),
        ]),
        m('Arrival', 2016, 'Sci-Fi', 116, 'PG-13'),
        m('Blade Runner 2049', 2017, 'Sci-Fi', 164, 'R'),
        m('Sicario', 2015, 'Thriller', 121, 'R'),
        m('Prisoners', 2013, 'Thriller', 153, 'R'),
      ]),
      c('Cyberpunk Futures', 'Neon rain, synthetic souls and cities that never sleep.', [
        m('The Matrix', 1999, 'Sci-Fi', 136, 'R'),
        m('Ghost in the Shell', 1995, 'Animation', 83, 'R'),
        c('TRON', 'Into the grid — the original digital frontier and its return.', [
          m('TRON', 1982, 'Sci-Fi', 96, 'PG'),
          m('TRON: Legacy', 2010, 'Sci-Fi', 125, 'PG'),
        ]),
      ]),
      c('A24', 'Strange, beautiful and unafraid — the modern arthouse shelf.', [
        m('Everything Everywhere All at Once', 2022, 'Sci-Fi', 139, 'R'),
        m('Hereditary', 2018, 'Horror', 127, 'R'),
        m('The Lighthouse', 2019, 'Drama', 109, 'R'),
        m('Midsommar', 2019, 'Horror', 148, 'R'),
        m('Moonlight', 2016, 'Drama', 111, 'R'),
      ]),
      c('007: James Bond', 'Shaken, not stirred — six decades of espionage.', [
        m('Casino Royale', 2006, 'Action', 144, 'PG-13'),
        m('Skyfall', 2012, 'Action', 143, 'PG-13'),
        m('No Time to Die', 2021, 'Action', 163, 'PG-13'),
        m('GoldenEye', 1995, 'Action', 130, 'PG-13'),
      ]),
      m('Drive', 2011, 'Thriller', 100, 'R'),
      m('Heat', 1995, 'Crime', 170, 'R'),
      m('Gladiator', 2000, 'Action', 155, 'R'),
      m('Mad Max: Fury Road', 2015, 'Action', 120, 'R'),
    ]),

    /* ===================== TV SHOWS ===================== */
    lib('TV Shows', 'tv', 'Series for grown-ups.', [
      c('Prestige Drama', 'The shows that made television cinema.', [
        s('Breaking Bad', 2008, 'Drama', 5, 13, 'TV-MA'),
        s('The Wire', 2002, 'Crime', 5, 12, 'TV-MA'),
        s('The Sopranos', 1999, 'Crime', 6, 13, 'TV-MA'),
        s('Mad Men', 2007, 'Drama', 7, 13, 'TV-14'),
        s('Chernobyl', 2019, 'Drama', 1, 5, 'TV-MA'),
        s('True Detective', 2014, 'Crime', 4, 8, 'TV-MA'),
      ]),
      c('Science Fiction', 'Worlds, machines and the edges of the possible.', [
        s('The Expanse', 2015, 'Sci-Fi', 6, 10, 'TV-14'),
        s('Severance', 2022, 'Mystery', 2, 9, 'TV-MA'),
        s('Foundation', 2021, 'Sci-Fi', 2, 10, 'TV-14'),
        s('Dark', 2017, 'Mystery', 3, 8, 'TV-MA'),
        s('Westworld', 2016, 'Sci-Fi', 4, 8, 'TV-MA'),
      ]),
      s('Succession', 2018, 'Drama', 4, 10, 'TV-MA'),
      s('The Last of Us', 2023, 'Drama', 2, 9, 'TV-MA'),
      s('Game of Thrones', 2011, 'Fantasy', 8, 10, 'TV-MA'),
    ]),

    /* ===================== KIDS MOVIES ===================== */
    lib('Kids Movies', 'kids', 'Animated and family features for the little ones.', [
      c('Pixar', 'Heart, wit and worlds you wish were real.', [
        m('Toy Story', 1995, 'Animation', 81, 'G'),
        m('Finding Nemo', 2003, 'Animation', 100, 'G'),
        m('WALL·E', 2008, 'Animation', 98, 'G'),
        m('Up', 2009, 'Animation', 96, 'PG'),
        m('Inside Out', 2015, 'Animation', 95, 'PG'),
        m('Coco', 2017, 'Animation', 105, 'PG'),
      ]),
      c('Studio Ghibli', 'Hand-painted magic and skies you want to live in.', [
        m('My Neighbor Totoro', 1988, 'Animation', 86, 'G'),
        m('Spirited Away', 2001, 'Animation', 125, 'PG'),
        m('Princess Mononoke', 1997, 'Animation', 134, 'PG-13'),
        m('Howl’s Moving Castle', 2004, 'Animation', 119, 'PG'),
        m('Castle in the Sky', 1986, 'Animation', 125, 'PG'),
      ]),
      c('DreamWorks', 'Big laughs and bigger adventures.', [
        m('Shrek', 2001, 'Animation', 90, 'PG'),
        m('How to Train Your Dragon', 2010, 'Animation', 98, 'PG'),
        m('Kung Fu Panda', 2008, 'Animation', 92, 'PG'),
      ]),
      m('The Lego Movie', 2014, 'Animation', 100, 'PG'),
      m('Paddington 2', 2017, 'Family', 103, 'PG'),
      m('Spider-Man: Into the Spider-Verse', 2018, 'Animation', 117, 'PG'),
    ]),

    /* ===================== KIDS TV ===================== */
    lib('Kids TV', 'kidstv', 'Animated and family series, safe for kids.', [
      c('Animated Adventures', 'The cartoons worth staying in for.', [
        s('Avatar: The Last Airbender', 2005, 'Animation', 3, 20, 'TV-Y7'),
        s('Gravity Falls', 2012, 'Animation', 2, 20, 'TV-Y7'),
        s('Adventure Time', 2010, 'Animation', 10, 26, 'TV-PG'),
        s('Steven Universe', 2013, 'Animation', 5, 26, 'TV-PG'),
      ]),
      c('Preschool', 'Gentle, bright and just-right for the smallest viewers.', [
        s('Bluey', 2018, 'Family', 3, 52, 'TV-Y'),
        s('Paw Patrol', 2013, 'Family', 10, 26, 'TV-Y'),
      ]),
      s('SpongeBob SquarePants', 1999, 'Animation', 14, 26, 'TV-Y7'),
      s('Pokémon', 1997, 'Animation', 25, 40, 'TV-Y7'),
    ]),

    /* ===================== COMEDY ===================== */
    lib('Comedy', 'comedy', 'When you just want to laugh.', [
      c('Edgar Wright — Cornetto', 'Blood, ice cream and impeccable timing.', [
        m('Shaun of the Dead', 2004, 'Comedy', 99, 'R'),
        m('Hot Fuzz', 2007, 'Comedy', 121, 'R'),
        m('The World’s End', 2013, 'Comedy', 109, 'R'),
      ]),
      c('Judd Apatow', 'Sweet, crude and oddly heartfelt.', [
        m('Superbad', 2007, 'Comedy', 113, 'R'),
        m('Knocked Up', 2007, 'Comedy', 129, 'R'),
        m('The 40-Year-Old Virgin', 2005, 'Comedy', 116, 'R'),
      ]),
      c('Comedy Classics', 'The ones you can quote by heart.', [
        m('Groundhog Day', 1993, 'Comedy', 101, 'PG'),
        m('The Big Lebowski', 1998, 'Comedy', 117, 'R'),
        m('Ferris Bueller’s Day Off', 1986, 'Comedy', 103, 'PG-13'),
        m('Airplane!', 1980, 'Comedy', 88, 'PG'),
      ]),
      s('The Office', 2005, 'Comedy', 9, 24, 'TV-14'),
      s('Parks and Recreation', 2009, 'Comedy', 7, 22, 'TV-14'),
      s('Arrested Development', 2003, 'Comedy', 5, 18, 'TV-14'),
    ]),

    /* ===================== DOCUMENTARIES ===================== */
    lib('Documentaries', 'docs', 'True stories, the natural world and everything real.', [
      c('Nature & Planet', 'The natural world at its most staggering.', [
        s('Planet Earth II', 2016, 'Documentary', 1, 6, 'TV-G'),
        s('Our Planet', 2019, 'Documentary', 1, 8, 'TV-G'),
        m('My Octopus Teacher', 2020, 'Documentary', 85, 'PG'),
      ]),
      c('True Crime', 'The cases that gripped the world.', [
        s('Making a Murderer', 2015, 'Documentary', 2, 10, 'TV-MA'),
        s('The Jinx', 2015, 'Documentary', 1, 6, 'TV-14'),
        s('Tiger King', 2020, 'Documentary', 1, 7, 'TV-MA'),
      ]),
      c('Music & Culture', 'Lives, songs and the stories behind them.', [
        m('Amy', 2015, 'Documentary', 128, 'R'),
        m('Searching for Sugar Man', 2012, 'Documentary', 86, 'PG-13'),
        m('20 Feet from Stardom', 2013, 'Documentary', 91, 'PG-13'),
      ]),
      m('Free Solo', 2018, 'Documentary', 100, 'PG-13'),
      m('Won’t You Be My Neighbor?', 2018, 'Documentary', 94, 'PG-13'),
      m('13th', 2016, 'Documentary', 100, 'TV-MA'),
    ]),
  ]);

  // unfiled titles you can pull in while curating
  const ARCHIVE = [
    m('Annihilation', 2018, 'Sci-Fi', 115, 'R'),
    m('Ex Machina', 2014, 'Sci-Fi', 108, 'R'),
    m('Tenet', 2020, 'Action', 150, 'PG-13'),
    s('Foundation', 2021, 'Sci-Fi', 2, 10, 'TV-14'),
    m('Edge of Tomorrow', 2014, 'Action', 113, 'PG-13'),
    m('Gravity', 2013, 'Drama', 91, 'PG-13'),
    s('Dark', 2017, 'Mystery', 3, 8, 'TV-MA'),
  ];

  window.ORBIT_DATA = { ROOT, ARCHIVE };
  return { ROOT, ARCHIVE };
})();

export const ORBIT_DATA = window.ORBIT_DATA;
export default ORBIT_DATA;

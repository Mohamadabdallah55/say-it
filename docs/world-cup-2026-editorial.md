# World Cup 2026 editorial pass

- Retained all 150 question IDs; replaced 64 repetitive fixture questions with varied topics, including historic moments, first appearances, records, coaches, venues, goalkeepers, penalties, official ball, mascots, awards and referees.
- Current tier distribution: 58 easy (200), 64 medium (400), 28 hard (600). Difficulty is editorial, not measured against real player performance.
- The generic match-results topic dropped from 69 questions to five; three questions ask for exact scores. Three local, explicitly labelled score graphics remain in use.
- Ten questions now have answer-photo references, including the official match ball, the opening stadium, the Curaçao goalkeeper and the Cabo Verde goal celebration. Remote availability, browser rendering and reuse permissions have not been fully verified. Existing relevant local portraits and flags were retained; not every new question has a suitable photo.
- Sources are recorded per question. Key sources include FIFA's match schedule, official final report, tournament standings, records, first scorers, player-of-the-match reports, goal votes and mascot announcements.
- Regression tests cover question count, tier distribution, unique prompts, limits on repetitive result questions, diversity of topics and the referenced local assets. These are technical/content-structure checks, not independent verification of every answer.

- Recalibrated recognizable stars and major tournament facts as easy; detailed recall without answer-revealing hints as medium; less familiar players, specific historic moments and technical statistics as hard. Revised or re-tiered 81 questions in the initial calibration, then refined borderline cases. Player performance has not been measured.

- User-confirmed calibration: the decisive final assist, Paraguay eliminating Germany and Spain's winning coach are all 200. Official ball and stadium names are 400. The bank now targets football fans familiar with major World Cup moments, not a casual non-football audience. Avoided padding ordinary questions with clues to make them artificially easy; reviewed the entire tier distribution against these examples.

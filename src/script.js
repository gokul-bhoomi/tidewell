// All the words in the game: villagers, their lines at each stage of the story, and the timed story
// beats. Rule: nothing before the 'arrival' phase hints that he is coming. The villagers only know
// about bandits; his name is first said when he is already in the sky (tests/intent.test.js checks).

// Dialogue stages: what villagers say when you talk to them.
//   stranger: before the first fight   hero1: after the east gate   hero2: after the market
//   festival: after Captain Gorr
export const NPCS = [
  {
    id: 'toma', name: 'ELDER TOMA', look: { body: 0x7a5c99, legs: 0x3b2f45, skin: 0xd9a77e, hair: 0xe8e4dc, hairStyle: 'bald', beard: true, staff: true },
    home: { x: -4, z: -8 }, route: [{ x: -4, z: -8 }, { x: 4, z: -8 }], speed: 0.8,
    lines: {
      stranger: ["Tidewell hasn't had a visitor drop in like that in... well, ever.", 'Have you met everyone yet? Go on, they are curious about you.'],
      hero1: ['Ho ho! The whole village is talking about you.'],
      hero2: ['Rest, child. You have done more than enough today.'],
      festival: ['Eat! Dance! Tonight Tidewell celebrates its hero!'],
    },
  },
  {
    id: 'bram', name: 'BRAM', look: { body: 0x56708a, legs: 0x2d3440, skin: 0xc68c64, hair: 0x3a2a1e, hairStyle: 'short', armor: true },
    home: { x: -27, z: 15.5 }, route: [{ x: -27, z: 15.5 }], speed: 0, fixed: true,
    lines: {
      stranger: ['Strike with J, guard with K. Simple. The hard part is doing it with someone swinging at you.'],
      hero1: ['Four of them at once? I trained you well. In one afternoon.'],
      hero2: ['I saw you put that brute in the dirt. Remind me never to spar you for real.'],
      festival: ['Captain of the guard? Bah. You can have the job.'],
    },
  },
  {
    id: 'mira', name: 'MIRA', look: { body: 0xe8e2d0, legs: 0x8a6f5a, skin: 0xe7b08a, hair: 0x2b1b14, hairStyle: 'bun', apron: 0x6ab47a },
    home: { x: 18, z: 3.8 }, route: [{ x: 15, z: 3.8 }, { x: 22, z: 3.8 }], speed: 1,
    lines: {
      stranger: ['I am Tidewell\'s healer. Try not to need me, alright?'],
      hero1: ['Not a scratch? You are making my job very boring.'],
      hero2: ['Come here, let me look at that.'],
      festival: ['My medicine is for wounds, not for too much cake. Remember that tonight.'],
    },
  },
  {
    id: 'sana', name: 'SANA', look: { body: 0xd9a03d, legs: 0x6b4a2f, skin: 0xf0c9a4, hair: 0xb5562a, hairStyle: 'ponytail', apron: 0xf4ead8 },
    home: { x: -18, z: -4 }, route: [{ x: -14, z: -3.8 }, { x: -24, z: -3.8 }], speed: 1.1,
    lines: {
      stranger: ['Fresh bread! Well, fresh this morning. You look hungry, sky person.'],
      hero1: ['Free bread for life! For LIFE, I said!'],
      hero2: ['I baked you a cake. It is shaped like you. It is not a good likeness.'],
      festival: ['Three hundred buns! The festival is eating them faster than I can bake!'],
    },
  },
  {
    id: 'kesh', name: 'KESH', look: { body: 0x3daa7a, legs: 0x2a3a2a, skin: 0x8d5a3c, hair: 0x111111, hairStyle: 'short', hat: 0xc84a3a },
    home: { x: -3, z: 25 }, route: [{ x: -3, z: 23 }, { x: -3, z: 37 }], speed: 1,
    lines: {
      stranger: ['Silks, spices, sea glass! Best prices on the whole coast. Only prices on the whole coast.'],
      hero1: ['Ten percent off everything for you. Fine, twenty.'],
      hero2: ['My stall is still standing because of you! Take anything. Not that. Anything else.'],
      festival: ['I have never sold so many lanterns in one day!'],
    },
  },
  {
    id: 'pip', name: 'PIP', look: { body: 0xe0703a, legs: 0x3a4a7a, skin: 0xe7b08a, hair: 0x5a3a20, hairStyle: 'spiky', kid: true },
    home: { x: 6, z: 6 }, route: [{ x: 6, z: 6 }, { x: 8, z: -4 }, { x: -6, z: -6 }, { x: -7, z: 5 }], speed: 2.6,
    lines: {
      stranger: ['You FELL out of the SKY! Can you fly? Can you teach me?'],
      hero1: ['When I grow up I want to be exactly like you!'],
      hero2: ['I told everyone you would win. Everyone!'],
      festival: ['Lio says he is stronger than you. I said that is impossible.'],
    },
  },
  {
    id: 'lio', name: 'LIO', look: { body: 0x3d7bd9, legs: 0x3a3028, skin: 0xc68c64, hair: 0x111111, hairStyle: 'short', kid: true },
    home: { x: -6, z: -6 }, route: [{ x: -7, z: 5 }, { x: 6, z: 6 }, { x: 8, z: -4 }, { x: -6, z: -6 }], speed: 2.6,
    lines: {
      stranger: ['Pip says you can fly. I bet you can\'t.'],
      hero1: ['Okay. That was pretty cool. A little bit.'],
      hero2: ['Teach me the kick! The spinny one!'],
      festival: ['I am stronger than you, by the way. Just so you know.'],
    },
  },
  {
    id: 'wen', name: 'OLD WEN', look: { body: 0x5f7a8a, legs: 0x3a3a3a, skin: 0xc68c64, hair: 0xdadada, hairStyle: 'bald', hat: 0xd8c27a, beard: true },
    home: { x: 4.5, z: -15 }, route: [{ x: 4.5, z: -15 }, { x: 4.5, z: -12.5 }], speed: 0.6,
    lines: {
      stranger: ['Forty years I have fished these waters. Never caught anything that fell from the sky.'],
      hero1: ['Hm. Not bad, youngster. Not bad at all.'],
      hero2: ['In my day we fought bandits with nets. You make it look easy.'],
      festival: ['Fen plays this same song every festival. I love it every time.'],
    },
  },
  {
    id: 'juno', name: 'JUNO', look: { body: 0x8a9a3a, legs: 0x5a4a30, skin: 0xd9a77e, hair: 0x7a4a20, hairStyle: 'short', hat: 0xe0c060 },
    home: { x: -30, z: 1.5 }, route: [{ x: -22, z: 1.5 }, { x: -40, z: 1.5 }], speed: 1,
    lines: {
      stranger: ['Pumpkins this big! Biggest harvest in years. Good omen, having you here.'],
      hero1: ['The bandits always go for my pumpkins. Not anymore!'],
      hero2: ['I named my biggest pumpkin after you. It is a compliment.'],
      festival: ['Pumpkin soup for everyone!'],
    },
  },
  {
    id: 'ama', name: 'AMA', look: { body: 0xc84a6a, legs: 0x4a2a3a, skin: 0x8d5a3c, hair: 0x2b1b14, hairStyle: 'long' },
    home: { x: 3, z: 30 }, route: [{ x: 3, z: 26 }, { x: 3, z: 38 }], speed: 1,
    lines: {
      stranger: ['I weave the sails for half the boats in the harbor. Want a cape? Heroes wear capes.'],
      hero1: ['You need a cape. I am making you a cape.'],
      hero2: ['Did you see him flip that big one?! Over his SHOULDER!'],
      festival: ['The cape is almost finished. It has your face on it.'],
    },
  },
  {
    id: 'gil', name: 'GIL', look: { body: 0x7a4fb5, legs: 0x2a2a3a, skin: 0xe7b08a, hair: 0xd8b25a, hairStyle: 'spiky', bandana: 0x3a6ab0 },
    home: { x: 30, z: 2 }, route: [{ x: 25, z: 2 }, { x: 40, z: 2 }], speed: 1.2,
    lines: {
      stranger: ['I keep watch on the east gate. Bandits from the hills, mostly. Nothing you need to worry about.'],
      hero1: ['You took them all down by yourself?! I just ring the bell!'],
      hero2: ['Gorr\'s crew is running out of people to send.'],
      festival: ['No bell tonight. Tonight we party!'],
    },
  },
  {
    id: 'nell', name: 'NELL', look: { body: 0x4a8a8a, legs: 0x3a3028, skin: 0xf0c9a4, hair: 0x6a3a20, hairStyle: 'long', apron: 0xe8dcc8 },
    home: { x: -6, z: 9 }, route: [{ x: -8, z: 8 }, { x: -3, z: 9.5 }], speed: 0.9,
    lines: {
      stranger: ['Pip! Lio! Stop pestering our guest! ...Sorry. They mean well.'],
      hero1: ['Thank you for keeping them safe.'],
      hero2: ['Thank you. Truly. Stay as long as you like.'],
      festival: ['Look at them dance! I have not seen Tidewell this happy in years.'],
    },
  },
  {
    id: 'fen', name: 'FEN', look: { body: 0xd8c27a, legs: 0x5a3a5a, skin: 0xc68c64, hair: 0x2a1a10, hairStyle: 'long', hat: 0x5a3a5a, lute: true },
    home: { x: 8, z: -6 }, route: [{ x: 8, z: -6 }, { x: 5, z: -8 }], speed: 0.7,
    lines: {
      stranger: ['A stranger from the sky! That is a song if I ever heard one.'],
      hero1: ['Verse two: the stranger saves the east gate! Ta-da!'],
      hero2: ['Verse three is getting very long.'],
      festival: ['This one is for you, hero!'],
    },
  },
  {
    id: 'dara', name: 'DARA', look: { body: 0x5a4a40, legs: 0x2a2420, skin: 0xa86e48, hair: 0x111111, hairStyle: 'short', apron: 0x3a2a20 },
    home: { x: 22, z: -3.8 }, route: [{ x: 16, z: -3.8 }, { x: 24, z: -3.8 }], speed: 0.9,
    lines: {
      stranger: ['Need a sword? No? You fight with your fists? Huh.'],
      hero1: ['Fists! Fists against clubs! Unbelievable.'],
      hero2: ['I could forge you gauntlets. You know, to make it fair for them.'],
      festival: ['To the hero! *clang*'],
    },
  },
];

const L = (who, text, dur = 2.6, npc = null) => ({ who, text, dur, npc });
const T = (t, ...beats) => ({ at: t, line: beats[0] });

// Timed beats per phase: { at, line, music }. line = { who, text, dur, npc } (npc: speech bubble above them)
export const SCRIPT = {
  intro: [
    { at: 0, music: 'village' },
    T(2.1, L('ELDER TOMA', 'W-whoa! You fell right out of the sky!', 2.6, 'toma')),
    T(4.9, L('PIP', 'That was SO COOL! Do it again!', 2.2, 'pip')),
    T(7.3, L('ELDER TOMA', 'Ahem. Welcome to Tidewell, traveler. You look like you can handle yourself.', 3.2, 'toma')),
    T(10.7, L('ELDER TOMA', 'Bram trains our guards in the yard, down the west road. Go show him!', 3.2, 'toma')),
  ],
  roam1: [T(0.5, L('BRAM', 'Go on, meet the village. They won\'t bite.', 2.6, 'bram'))],
  praise1: [
    T(0.6, L('GIL', 'You took them ALL down by yourself?!', 2.4, 'gil')),
    T(3.0, L('PIP', 'I wanna be just like you when I grow up!', 2.4, 'pip')),
    T(5.4, L('SANA', 'Free bread for life, hero!', 2.2, 'sana')),
  ],
  praise2: [
    T(0.6, L('KESH', 'My stall! You saved my stall!', 2.2, 'kesh')),
    T(2.8, L('AMA', 'Did you see that?! Over his SHOULDER!', 2.4, 'ama')),
    T(5.2, L('NELL', 'Thank you... thank you so much.', 2.2, 'nell')),
  ],
  festival: [
    { at: 0, music: 'festival' },
    T(0.8, L('VILLAGERS', 'HOORAY FOR OUR HERO!', 2.6)),
    T(3.6, L('FEN', 'This one is for you, hero!', 2.4, 'fen')),
  ],
  // He is never mentioned before this point.
  arrival: [
    { at: 0, music: 'silent' },
    T(3.4, L('PIP', 'Mama... who is that?', 2.2, 'pip')),
    T(4.9, L('ELDER TOMA', 'No... it can\'t be...', 1.6, 'toma')),
    { at: 6.4, music: 'dread', line: L('ELDER TOMA', "It's VEHL... VEHL THE UNMOVED!", 2.6, 'toma') },
  ],
  judgement: [T(1.1, L('VEHL', 'Kneel.', 2.2))],
  aftermath: [
    { at: 0, music: 'silent' },
    { at: 3, music: 'lament' },
    T(3.5, L('VEHL', 'A hero. Of this little village.', 3)),
    T(7.2, L('VEHL', 'You were never strong. They were simply weak.', 3.4)),
  ],
};

// One-off lines the story triggers itself.
export const LINES = {
  bramYard: L('BRAM', "So you're the sky-faller. Let's see you hit those dummies!", 2.8, 'bram'),
  bramCombo: L('BRAM', 'Good! Now keep swinging. Three in a row!', 2.6, 'bram'),
  bramGuard: L('BRAM', 'Nice kick! Now block me. Guard when I wind up!', 2.8, 'bram'),
  bramTap: L('BRAM', 'Too slow! Hold K when I raise my arm.', 2.2, 'bram'),
  bramDone: L('BRAM', "Hah! You'll do just fine around here.", 2.6, 'bram'),
  alarm1: L('GIL', 'BANDITS! Bandits at the east gate!', 2.8, 'gil'),
  tomaThanks: L('ELDER TOMA', "You saved us! Those were Captain Gorr's men, from the hills.", 3, 'toma'),
  tomaWarn: L('ELDER TOMA', "Gorr won't take this lying down. Rest while you can.", 2.8, 'toma'),
  alarm2: L('KESH', "HELP! They're raiding the market!", 2.6, 'kesh'),
  bruteIn: L('BANDIT', 'Make way for Big Hobb!', 2.2),
  miraHeal: L('MIRA', 'Hold still... There. Good as new.', 2.4, 'mira'),
  alarm3: L('GIL', "It's GORR! Captain Gorr is at the north gate!", 2.8, 'gil'),
  gorrHello: L('CAPTAIN GORR', "So you're the brat who's been embarrassing my crew!", 3),
  gorrHalf: L('CAPTAIN GORR', 'Boys! Get over here!', 2.2),
  gorrDown: L('CAPTAIN GORR', 'Impossible... RETREAT! RETREAT!', 2.6),
  tomaToast: L('ELDER TOMA', 'To our hero! May Tidewell never forget this day!', 3, 'toma'),
  cheers: L('VILLAGERS', 'CHEERS!!', 2),
  zero1: L('VEHL', '...', 1.4),
  zero3: L('VEHL', 'Is this what they call a hero?', 2.6),
  fallen: L('ELDER TOMA', 'Get up! Please, get up!', 2.2, 'toma'),
};

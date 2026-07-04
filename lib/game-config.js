/**
 * Zentrale Spiel-Konfiguration — einzige Quelle für Limits & Coin-Umrechnung.
 * Wird von server.js (Score-Validierung) genutzt.
 *
 * minSec:   Mindest-Spielzeit, sonst wird der Score verworfen (Anti-Cheat)
 * maxScore: harte Obergrenze pro Runde (Anti-Cheat)
 * coinDiv:  score / coinDiv = Coins (gedeckelt durch COINS_MAX_PER_SUBMIT)
 */

const GAME_LIMITS = {
  race:         { minSec: 25,  maxScore: 999999  },
  brick:        { minSec: 25,  maxScore: 999999  },
  deadzone:     { minSec: 15,  maxScore: 9999999 },
  tetris:       { minSec: 20,  maxScore: 9999999 },
  snake:        { minSec: 10,  maxScore: 100000  },
  skycop:       { minSec: 15,  maxScore: 9999999 },
  doodlejump:   { minSec: 15,  maxScore: 9999999 },
  '2048':       { minSec: 30,  maxScore: 5000000 },
  bookofra:     { minSec: 20,  maxScore: 99999999},
  towerdefense: { minSec: 45,  maxScore: 999999  },
  quiz:         { minSec: 30,  maxScore: 15000   },
  idle:         { minSec: 60,  maxScore: 1e15    },
  rpg:          { minSec: 60,  maxScore: 1e9     },
  tow:          { minSec: 20,  maxScore: 200000  },
  memory:       { minSec: 15,  maxScore: 200000  },
  reaction:     { minSec: 15,  maxScore: 30000   },
  // ── Themen-Minispiele (Werkstatt & Fahrschule) ──
  tirechange:   { minSec: 15,  maxScore: 100000  },
  obd:          { minSec: 20,  maxScore: 50000   },
  signs:        { minSec: 20,  maxScore: 30000   },
  parking:      { minSec: 20,  maxScore: 100000  },
  assembly:     { minSec: 15,  maxScore: 300000  },
};

// ── ACLS-Coins: Umrechnung pro Spiel (score / divisor = Coins) ──
const GAME_COIN_DIV = {
  race: 2000, brick: 1200, deadzone: 30000, tetris: 20000, snake: 50,
  skycop: 20000, doodlejump: 15000, '2048': 30000, bookofra: 500000,
  towerdefense: 800, quiz: 150, idle: 1e12, rpg: 5e6, tow: 60, memory: 150, reaction: 600,
  tirechange: 300, obd: 250, signs: 200, parking: 500, assembly: 700,
};

const COINS_MAX_PER_SUBMIT = 60;   // max Coins pro Spielrunde
const COINS_DAILY_GAME_CAP = 150;  // max Coins pro Spiel pro Tag

// Turnier-/Katalogliste (Key + Anzeigename) — Reihenfolge/Inhalt wie zuvor in server.js
const ALL_GAMES = [
  { key: 'race',        label: 'Autorennen' },
  { key: 'brick',       label: 'Brick Breaker' },
  { key: 'deadzone',    label: 'Dead Zone' },
  { key: 'snake',       label: 'Snake' },
  { key: 'tetris',      label: 'Tetris' },
  { key: 'skycop',      label: 'Sky Cop' },
  { key: 'doodlejump',  label: 'Doodle Jump' },
  { key: '2048',        label: '2048' },
  { key: 'bookofra',    label: 'Book of Ra' },
  { key: 'towerdefense',label: 'Tower Defense' },
  { key: 'quiz',        label: 'Quiz Survival' },
  { key: 'tow',         label: 'Abschlepp-Sim' },
  { key: 'memory',      label: 'Memory' },
  { key: 'blackjack',   label: 'Blackjack' },
  { key: 'idle',        label: 'Idle Werkstatt' },
  { key: 'rpg',         label: 'Dungeon RPG' },
  { key: 'reaction',    label: 'Reaktionstest' },
  { key: 'hangman',     label: 'Hangman' },
  // ── Themen-Minispiele (Werkstatt & Fahrschule) ──
  { key: 'tirechange',  label: 'Reifenwechsel' },
  { key: 'obd',         label: 'Fehlerdiagnose' },
  { key: 'signs',       label: 'Verkehrszeichen' },
  { key: 'parking',     label: 'Einpark-Challenge' },
  { key: 'assembly',    label: 'Fließband-Montage' },
];

module.exports = { GAME_LIMITS, GAME_COIN_DIV, COINS_MAX_PER_SUBMIT, COINS_DAILY_GAME_CAP, ALL_GAMES };

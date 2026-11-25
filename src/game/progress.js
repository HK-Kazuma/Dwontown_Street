// Ranks, badges and local save data (localStorage, wrapped in try/catch).

export const RANKS = [
  { min: 0, title: '見習いインターン', note: 'まずは電話番から。' },
  { min: 250000, title: 'ジュニアブローカー', note: 'フロアに名前が知られ始めた。' },
  { min: 800000, title: 'トップセールス', note: 'ベルを鳴らすのはいつもキミだ。' },
  { min: 1600000, title: '支店長', note: 'フロア全員がキミのコールを待っている。' },
  { min: 3000000, title: 'ダウンタウンの帝王', note: 'この街のティッカーはキミの心拍数。' },
];

export const rankFor = (score) => {
  let r = RANKS[0];
  for (const k of RANKS) if (score >= k.min) r = k;
  return r;
};

export const BADGES = [
  { id: 'million', icon: '💵', name: '初めてのミリオン', desc: '1プレイで $1,000,000 を稼ぐ', test: (s) => s.score >= 1000000 },
  { id: 'king', icon: '👑', name: 'ダウンタウンの帝王', desc: '1プレイで $3,000,000 を稼ぐ', test: (s) => s.score >= 3000000 },
  { id: 'combo25', icon: '🔥', name: '止まらない電話', desc: '25コンボを達成', test: (s) => s.maxCombo >= 25 },
  { id: 'fever2', icon: '🎉', name: 'フロアが揺れた', desc: '1プレイでパーティータイムを2回', test: (s) => s.feverCount >= 2 },
  { id: 'gold10', icon: '🥇', name: 'ゴールドラッシュ', desc: '金塊を10個キャッチ', test: (s) => s.gold >= 10 },
  { id: 'phones8', icon: '📞', name: 'クロージングの鬼', desc: '電話を8本成約', test: (s) => s.phones >= 8 },
  { id: 'clean', icon: '📒', name: 'クリーンな帳簿', desc: '一度も被弾せずに終業ベルまで', test: (s) => s.timeUp && s.hits === 0 },
  { id: 'bear', icon: '🐻', name: 'ベア相場の勝者', desc: 'ベア相場中に $400,000 稼ぐ', test: (s) => s.bearEarn >= 400000 },
];

const KEY = 'dts_save_v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { best: 0, plays: 0, badges: [], ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { best: 0, plays: 0, badges: [] };
}

export function saveResult(save, result) {
  const unlocked = BADGES.filter((b) => !save.badges.includes(b.id) && b.test(result)).map((b) => b.id);
  const next = {
    best: Math.max(save.best, result.score),
    plays: save.plays + 1,
    badges: [...save.badges, ...unlocked],
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return { next, unlocked, newBest: result.score > save.best };
}

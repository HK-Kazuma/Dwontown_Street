import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine, ROUND_TIME, fmt } from './game/engine.js';
import { initAudio, isMuted, setMuted, sfx, startMusic, stopMusic, setFeverMusic } from './game/audio.js';
import { BADGES, RANKS, loadSave, rankFor, saveResult } from './game/progress.js';

const HUD_PX = 86;

// ---------- canvas host ----------
function GameCanvas({ demo, topInsetPx = 0, onReady, onHud, onEnd, onEvent }) {
  const ref = useRef(null);
  const cbs = useRef({});
  cbs.current = { onReady, onHud, onEnd, onEvent };

  useEffect(() => {
    const canvas = ref.current;
    const eng = new Engine(canvas, {
      demo,
      topInsetPx,
      sfx: demo ? null : sfx,
      onHud: (h) => cbs.current.onHud?.(h),
      onEnd: (r) => cbs.current.onEnd?.(r),
      onEvent: (name, v) => cbs.current.onEvent?.(name, v),
    });
    eng.start();
    cbs.current.onReady?.(eng);
    const ro = new ResizeObserver(() => eng.resize());
    ro.observe(canvas.parentElement);
    return () => {
      ro.disconnect();
      eng.destroy();
    };
  }, [demo, topInsetPx]);

  return <canvas ref={ref} className="game-canvas" />;
}

// small canvas icon that reuses the engine's item renderer
function ItemIcon({ type }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = 48 * dpr;
    c.height = 48 * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Engine.prototype._drawItem.call({}, ctx, { type, x: 24, y: 26, rot: -0.15, age: 0.3 });
  }, [type]);
  return <canvas ref={ref} className="item-icon" />;
}

function MuteButton({ muted, onToggle }) {
  return (
    <button className="icon-btn" onClick={onToggle} aria-label={muted ? 'サウンドON' : 'サウンドOFF'}>
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

// ---------- modals ----------
function HowTo({ onClose }) {
  const rows = [
    ['cash', '札束', '$8,000〜。基本の稼ぎ'],
    ['bag', 'マネーバッグ', '$22,000〜'],
    ['gold', '金塊', '$55,000〜。キラッと輝く高額品'],
    ['phone', '鳴る電話', '$38,000〜。成約で “SOLD!”'],
    ['bull', 'ブルコイン', 'HYPEゲージが大きく上がる'],
    ['crash', '暴落チャート', '取ると信用 −1'],
    ['audit', '監査ファイル', '取ると信用 −1'],
  ];
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>遊び方</h2>
        <p className="lead">
          60秒の取引時間で、フロアに降ってくるお金を<b>キャッチ</b>して資産を最大化しよう。
          信用（♦）が3つなくなると即退場。
        </p>
        <div className="legend">
          {rows.map(([t, n, d]) => (
            <div className="legend-row" key={t}>
              <ItemIcon type={t} />
              <div>
                <b>{n}</b>
                <span>{d}</span>
              </div>
            </div>
          ))}
        </div>
        <ul className="rules">
          <li><b>相場</b>：BULLは獲得額×2、BEARは危険物が増えて速くなる。右上のチャートを見よう。</li>
          <li><b>コンボ</b>：連続キャッチ10回ごとにボーナス倍率UP（最大×3）。取り逃すとリセット。</li>
          <li><b>PARTY TIME</b>：HYPEゲージ満タンで発動。7秒間、危険物がすべて現金に変わり、獲得額×3、お金が吸い寄せられる。</li>
        </ul>
        <div className="controls">
          <div><span className="tag">スマホ</span>画面のどこでも左右にドラッグ／ボタンでPARTY</div>
          <div><span className="tag">PC</span>← → / A D・マウス移動　Space：PARTY　P/Esc：一時停止</div>
        </div>
        <button className="btn gold" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

function BadgeList({ owned, onClose }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>実績 {owned.length}/{BADGES.length}</h2>
        <div className="badges">
          {BADGES.map((b) => {
            const got = owned.includes(b.id);
            return (
              <div key={b.id} className={'badge' + (got ? ' got' : '')}>
                <div className="b-icon">{got ? b.icon : '🔒'}</div>
                <div>
                  <b>{b.name}</b>
                  <span>{b.desc}</span>
                </div>
              </div>
            );
          })}
        </div>
        <h3>称号ランク</h3>
        <div className="ranks">
          {RANKS.map((r) => (
            <div key={r.title}>
              <b>{r.title}</b>
              <span>{fmt(r.min)}〜</span>
            </div>
          ))}
        </div>
        <button className="btn gold" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

// ---------- screens ----------
function Title({ save, onStart, onHowTo, onBadges, muted, onMute }) {
  return (
    <div className="overlay title-screen">
      <div className="top-right">
        <MuteButton muted={muted} onToggle={onMute} />
      </div>
      <div className="title-block">
        <div className="kicker">TRADING FLOOR FEVER</div>
        <div className="logo">
          <span>DOWNTOWN</span>
          <span>STREET</span>
        </div>
        <div className="tagline">60秒で、ダウンタウンの帝王へ。</div>
      </div>
      <div className="title-stats">
        <div>
          <small>BEST</small>
          <b>{fmt(save.best)}</b>
        </div>
        <div>
          <small>実績</small>
          <b>
            {save.badges.length}/{BADGES.length}
          </b>
        </div>
        <div>
          <small>称号</small>
          <b>{rankFor(save.best).title}</b>
        </div>
      </div>
      <div className="menu">
        <button className="btn gold big pulse" onClick={onStart}>
          取引開始 ▶
        </button>
        <div className="row">
          <button className="btn ghost" onClick={onHowTo}>遊び方</button>
          <button className="btn ghost" onClick={onBadges}>実績</button>
        </div>
      </div>
      <div className="hint">スマホ：左右ドラッグ ／ PC：← → ・マウス ・ Space</div>
    </div>
  );
}

function Hud({ hud, onPause, muted, onMute }) {
  const timePct = (hud.timeLeft / ROUND_TIME) * 100;
  const fever = hud.fever > 0;
  return (
    <div className="hud" style={{ height: HUD_PX }}>
      <div className="hud-row">
        <div className="score">
          <small>NET WORTH</small>
          <b>{fmt(hud.score)}</b>
        </div>
        <div className="lives" aria-label={`信用 ${hud.lives}`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < hud.lives ? 'on' : ''}>♦</span>
          ))}
        </div>
        <MuteButton muted={muted} onToggle={onMute} />
        <button className="icon-btn" onClick={onPause} aria-label="一時停止">❚❚</button>
      </div>
      <div className="hud-row bars">
        <div className="bar time">
          <i style={{ width: timePct + '%' }} className={hud.timeLeft < 10 ? 'warn' : ''} />
          <em>{Math.ceil(hud.timeLeft)}s</em>
        </div>
        <div className={'bar hype' + (hud.hype >= 100 ? ' full' : '') + (fever ? ' fever' : '')}>
          <i style={{ width: (fever ? (hud.fever / 7) * 100 : hud.hype) + '%' }} />
          <em>{fever ? 'PARTY!' : 'HYPE'}</em>
        </div>
      </div>
    </div>
  );
}

function Result({ result, save, onRetry, onTitle }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 1400);
      setShown(result.score * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result.score]);
  const rank = rankFor(result.score);
  const newBadges = BADGES.filter((b) => result.unlocked.includes(b.id));
  return (
    <div className="overlay result-screen">
      <div className="kicker">{result.timeUp ? 'CLOSING BELL' : 'YOU’RE OUT'}</div>
      <div className="final">{fmt(shown)}</div>
      {result.newBest && <div className="newbest">★ NEW RECORD ★</div>}
      <div className="rank-box">
        <small>今日の称号</small>
        <b>{rank.title}</b>
        <span>{rank.note}</span>
      </div>
      <div className="stats">
        <div><small>最大コンボ</small><b>{result.maxCombo}</b></div>
        <div><small>PARTY</small><b>{result.feverCount}回</b></div>
        <div><small>金塊</small><b>{result.gold}</b></div>
        <div><small>成約</small><b>{result.phones}</b></div>
      </div>
      {newBadges.length > 0 && (
        <div className="unlocks">
          {newBadges.map((b, i) => (
            <div key={b.id} className="unlock" style={{ animationDelay: 0.3 + i * 0.25 + 's' }}>
              <span>{b.icon}</span>
              <div>
                <small>実績解除</small>
                <b>{b.name}</b>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="best-line">BEST {fmt(save.best)}</div>
      <div className="menu">
        <button className="btn gold big" onClick={onRetry}>もう一度取引する</button>
        <button className="btn ghost" onClick={onTitle}>タイトルへ</button>
      </div>
    </div>
  );
}

// ---------- app ----------
const EMPTY_HUD = { score: 0, lives: 3, combo: 0, hype: 0, fever: 0, timeLeft: ROUND_TIME, market: 'flat' };

export default function App() {
  const [screen, setScreen] = useState('title');
  const [save, setSave] = useState(loadSave);
  const [hud, setHud] = useState(EMPTY_HUD);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);
  const [runId, setRunId] = useState(0);
  const [modal, setModal] = useState(null);
  const [muted, setMutedState] = useState(isMuted);
  const engRef = useRef(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const toggleMute = () => {
    initAudio();
    setMuted(!muted);
    setMutedState(!muted);
  };

  const startGame = () => {
    initAudio();
    sfx.click();
    setHud(EMPTY_HUD);
    setPaused(false);
    setResult(null);
    setRunId((r) => r + 1);
    setScreen('play');
    startMusic();
  };

  const pause = useCallback((p) => {
    const eng = engRef.current;
    if (!eng || eng.over) return;
    eng.setPaused(p);
    setPaused(p);
    if (p) stopMusic();
    else {
      startMusic();
      setFeverMusic(eng.fever > 0);
    }
  }, []);

  const onEnd = useCallback((res) => {
    stopMusic();
    const { next, unlocked, newBest } = saveResult(saveRef.current, res);
    setSave(next);
    setResult({ ...res, unlocked, newBest });
    setScreen('result');
  }, []);

  const onEvent = useCallback(
    (name, v) => {
      if (name === 'fever') setFeverMusic(v);
      if (name === 'togglePause') pause(!engRef.current?.paused);
    },
    [pause],
  );

  // auto-pause when the tab/app goes to background
  useEffect(() => {
    const h = () => {
      if (document.hidden && screen === 'play') pause(true);
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [screen, pause]);

  const quit = () => {
    stopMusic();
    setPaused(false);
    setScreen('title');
  };

  const partyReady = hud.hype >= 100 && hud.fever <= 0 && !paused;

  return (
    <div className="app">
      {screen === 'play' ? (
        <>
          <GameCanvas
            key={'run' + runId}
            demo={false}
            topInsetPx={HUD_PX}
            onReady={(e) => {
              engRef.current = e;
              window.__dtsEngine = e; // debug hook (used by tests)
            }}
            onHud={setHud}
            onEnd={onEnd}
            onEvent={onEvent}
          />
          <Hud hud={hud} muted={muted} onMute={toggleMute} onPause={() => pause(true)} />
          {partyReady && (
            <button
              className="party-btn"
              onPointerDown={(e) => {
                e.stopPropagation();
                engRef.current?.triggerFever();
              }}
            >
              PARTY<br />TIME!
            </button>
          )}
          {paused && (
            <div className="overlay pause">
              <h2>一時停止中</h2>
              <p>市場は待ってくれない…</p>
              <button className="btn gold big" onClick={() => pause(false)}>再開する</button>
              <button className="btn ghost" onClick={startGame}>最初からやり直す</button>
              <button className="btn ghost" onClick={quit}>タイトルへ</button>
            </div>
          )}
        </>
      ) : (
        <>
          <GameCanvas key="demo" demo topInsetPx={0} />
          <div className="dim" />
          {screen === 'title' && (
            <Title
              save={save}
              muted={muted}
              onMute={toggleMute}
              onStart={startGame}
              onHowTo={() => setModal('howto')}
              onBadges={() => setModal('badges')}
            />
          )}
          {screen === 'result' && result && (
            <Result result={result} save={save} onRetry={startGame} onTitle={() => setScreen('title')} />
          )}
        </>
      )}
      {modal === 'howto' && <HowTo onClose={() => setModal(null)} />}
      {modal === 'badges' && <BadgeList owned={save.badges} onClose={() => setModal(null)} />}
    </div>
  );
}

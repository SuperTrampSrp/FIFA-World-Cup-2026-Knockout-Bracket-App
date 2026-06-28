"use client";
import { useState, useEffect, useRef } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── FLAGS ────────────────────────────────────────────────────────────────────
const FLAGS: Record<string, string> = {
  Argentina: "🇦🇷",
  Algeria: "🇩🇿",
  Austria: "🇦🇹",
  Belgium: "🇧🇪",
  BosniaHerzegovina: "🇧🇦",
  Brazil: "🇧🇷",
  CapeVerde: "🇨🇻",
  Colombia: "🇨🇴",
  Croatia: "🇭🇷",
  DRCongo: "🇨🇩",
  Egypt: "🇪🇬",
  England: "🏴",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Japan: "🇯🇵",
  Mexico: "🇲🇽",
  Morocco: "🇲🇦",
  Netherlands: "🇳🇱",
  Paraguay: "🇵🇾",
  Portugal: "🇵🇹",
  SaudiArabia: "🇸🇦",
  Senegal: "🇸🇳",
  Spain: "🇪🇸",
  Sweden: "🇸🇪",
  Switzerland: "🇨🇭",
  Tunisia: "🇹🇳",
  USA: "🇺🇸",
  Uruguay: "🇺🇾",
  Uzbekistan: "🇺🇿",
  Canada: "🇨🇦",
  Australia: "🇦🇺",
  SouthAfrica: "🇿🇦",
  Norway: "🇳🇴",
  Equador: "🇪🇨",
  Ghana: "🇬🇭 ",
  Bolivia: "🇧🇴",
  CostaRica: "🇨🇷",
  Ecuador: "🇪🇨",
  Iran: "🇮🇷",
  CaboVerde: "🇨🇻",
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CARD_W = 160;
const CARD_H = 72;
const TEAM_H = 36;
const COL_GAP = 48;
const VERT_GAP = 16;

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Slot = "home" | "away" | null;

type Match = {
  id: string;
  team1: string | null;
  team2: string | null;
  winner: string | null;
  nextMatchId: string | null;
  slot: Slot;
};

type Rounds = {
  r32: Match[];
  r16: Match[];
  qf: Match[];
  sf: Match[];
  final: Match[];
};

type HistoryEntry = { rounds: Rounds; champion: string | null };

type StoreState = {
  rounds: Rounds;
  champion: string | null;
  history: HistoryEntry[];
  _allMatches: () => Match[];
  _findMatch: (id: string) => Match | undefined;
  _roundKey: (id: string) => keyof Rounds;
  _updateMatch: (id: string, patch: Partial<Match>) => void;
  _clearDownstream: (matchId: string, slot: Slot) => void;
  selectWinner: (matchId: string, clicked: string) => void;
  undoLast: () => void;
  resetBracket: () => void;
};

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────
function makeR32(): Match[] {
  const data: [string, string][] = [
    ["Canada", "SouthAfrica"],
    ["Netherlands", "Morocco"],
    ["Germany", "Paraguay"],
    ["France", "Sweden"],
    ["Belgium", "Senegal"],
    ["USA", "BosniaHerzegovina"],
    ["Spain", "Austria"],
    ["Portugal", "Croatia"],
    ["Brazil", "Japan"],
    ["CostaRica", "Norway"],
    ["Mexico", "Equador"],
    ["England", "DRCongo"],
    ["Switzerland", "Algeria"],
    ["Colombia", "Ghana"],
    ["Australia", "Egypt"],
    ["Argentina", "CaboVerde"],
  ];
  return data.map(
    (teams, i): Match => ({
      id: `r32-${i + 1}`,
      team1: teams[0],
      team2: teams[1],
      winner: null,
      nextMatchId: `r16-${Math.floor(i / 2) + 1}`,
      slot: i % 2 === 0 ? "home" : "away",
    }),
  );
}

function makeEmpty(
  prefix: string,
  count: number,
  nextPrefix: string | null,
): Match[] {
  return Array.from(
    { length: count },
    (_, i): Match => ({
      id: `${prefix}-${i + 1}`,
      team1: null,
      team2: null,
      winner: null,
      nextMatchId: nextPrefix ? `${nextPrefix}-${Math.floor(i / 2) + 1}` : null,
      slot: i % 2 === 0 ? "home" : "away",
    }),
  );
}

const INIT: Rounds = {
  r32: makeR32(),
  r16: makeEmpty("r16", 8, "qf"),
  qf: makeEmpty("qf", 4, "sf"),
  sf: makeEmpty("sf", 2, "final"),
  final: [
    {
      id: "final-1",
      team1: null,
      team2: null,
      winner: null,
      nextMatchId: null,
      slot: null,
    },
  ],
};

// ─── LAYOUT ───────────────────────────────────────────────────────────────────
function computePositions(
  numMatches: number,
  prevPositions: number[] | null,
): number[] {
  if (!prevPositions) {
    const pos: number[] = [];
    for (let i = 0; i < numMatches; i++) {
      const pairIdx = Math.floor(i / 2);
      const posInPair = i % 2;
      pos.push(
        pairIdx * (CARD_H * 2 + VERT_GAP + 24) +
          posInPair * (CARD_H + VERT_GAP),
      );
    }
    return pos;
  }
  const pos: number[] = [];
  for (let i = 0; i < numMatches; i++) {
    const topCenter = prevPositions[i * 2] + CARD_H / 2;
    const botCenter = prevPositions[i * 2 + 1] + CARD_H / 2;
    pos.push((topCenter + botCenter) / 2 - CARD_H / 2);
  }
  return pos;
}

// ─── STORE ────────────────────────────────────────────────────────────────────
const useStore = create<StoreState>()(
  persist<StoreState>(
    (set, get) => ({
      rounds: INIT,
      champion: null,
      history: [],

      _allMatches: () => {
        const r = get().rounds;
        return [...r.r32, ...r.r16, ...r.qf, ...r.sf, ...r.final];
      },

      _findMatch: (id: string) =>
        get()
          ._allMatches()
          .find((m) => m.id === id),

      _roundKey: (id: string): keyof Rounds => {
        if (id.startsWith("r32")) return "r32";
        if (id.startsWith("r16")) return "r16";
        if (id.startsWith("qf")) return "qf";
        if (id.startsWith("sf")) return "sf";
        return "final";
      },

      _updateMatch: (id: string, patch: Partial<Match>) => {
        const key = get()._roundKey(id);
        set((s) => ({
          rounds: {
            ...s.rounds,
            [key]: s.rounds[key].map((m) =>
              m.id === id ? { ...m, ...patch } : m,
            ),
          },
        }));
      },

      selectWinner: (matchId: string, clicked: string) => {
        const s = get();
        const match = s._findMatch(matchId);
        if (!match || !match.team1 || !match.team2) return;

        const prev = match.winner;
        const next: string | null = prev === clicked ? null : clicked;

        set((st) => ({
          history: [
            ...st.history,
            {
              rounds: JSON.parse(JSON.stringify(st.rounds)) as Rounds,
              champion: st.champion,
            },
          ],
        }));

        get()._updateMatch(matchId, { winner: next });

        if (match.nextMatchId) {
          const patch: Partial<Match> =
            match.slot === "home" ? { team1: next } : { team2: next };
          get()._updateMatch(match.nextMatchId, patch);
          if (prev && prev !== next) {
            get()._clearDownstream(match.nextMatchId, match.slot);
          }
        } else {
          set({ champion: next });
        }
      },

      _clearDownstream: (matchId: string, slot: Slot) => {
        const match = get()._findMatch(matchId);
        if (!match) return;
        const affectedTeam = slot === "home" ? match.team1 : match.team2;
        if (match.winner && match.winner === affectedTeam) {
          get()._updateMatch(matchId, { winner: null });
          if (match.nextMatchId) {
            get()._clearDownstream(match.nextMatchId, match.slot);
          } else {
            set({ champion: null });
          }
        }
      },

      undoLast: () => {
        const { history } = get();
        if (!history.length) return;
        const prev = history[history.length - 1];
        set({
          rounds: prev.rounds,
          champion: prev.champion,
          history: history.slice(0, -1),
        });
      },

      resetBracket: () => set({ rounds: INIT, champion: null, history: [] }),
    }),
    { name: "fifa-2026-v2" },
  ),
);

// ─── CONFETTI ─────────────────────────────────────────────────────────────────
function Confetti({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const c = ref.current;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    c.width = window.innerWidth;
    c.height = window.innerHeight;

    type Piece = {
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      speed: number;
      drift: number;
      rot: number;
      rs: number;
    };

    const pieces: Piece[] = Array.from({ length: 200 }, () => ({
      x: Math.random() * c.width,
      y: -20,
      w: Math.random() * 10 + 5,
      h: Math.random() * 6 + 4,
      color: ["#FFD700", "#4A9EFF", "#fff", "#FF6B6B", "#00FF9D"][
        Math.floor(Math.random() * 5)
      ],
      speed: Math.random() * 4 + 2,
      drift: (Math.random() - 0.5) * 2,
      rot: Math.random() * 360,
      rs: (Math.random() - 0.5) * 8,
    }));

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pieces.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        p.y += p.speed;
        p.x += p.drift;
        p.rot += p.rs;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    const t = setTimeout(() => cancelAnimationFrame(raf), 6000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  );
}

// ─── TEAM ROW ─────────────────────────────────────────────────────────────────
type TeamRowProps = {
  name: string | null;
  isWinner: boolean;
  canPick: boolean;
  onClick: () => void;
};

function TeamRow({ name, isWinner, canPick, onClick }: TeamRowProps) {
  if (!name) {
    return (
      <div
        style={{
          height: TEAM_H,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          color: "#2A3A5A",
          fontSize: 11,
          fontStyle: "italic",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        TBD
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={!canPick}
      title={isWinner ? "Click to deselect" : "Click to select as winner"}
      style={{
        width: "100%",
        height: TEAM_H,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 10px",
        border: "none",
        cursor: canPick ? "pointer" : "default",
        background: isWinner ? "rgba(255,215,0,0.12)" : "transparent",
        borderLeft: `3px solid ${isWinner ? "#FFD700" : "transparent"}`,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (canPick)
          e.currentTarget.style.background = isWinner
            ? "rgba(255,215,0,0.18)"
            : "rgba(74,158,255,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isWinner
          ? "rgba(255,215,0,0.12)"
          : "transparent";
      }}
    >
      <span style={{ fontSize: 15 }}>{FLAGS[name] ?? "🏳️"}</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: isWinner ? 700 : 500,
          color: isWinner ? "#FFD700" : "#C8D8F0",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          textAlign: "left",
          letterSpacing: "0.02em",
        }}
      >
        {name}
      </span>
      {isWinner && <span style={{ fontSize: 9, color: "#FFD700" }}>★</span>}
    </button>
  );
}

// ─── MATCH CARD ───────────────────────────────────────────────────────────────
type MatchCardProps = {
  match: Match;
  onSelect: (id: string, team: string) => void;
  width?: number;
};

function MatchCard({ match, onSelect, width = CARD_W }: MatchCardProps) {
  const { team1, team2, winner, id } = match;
  const canPick = !!(team1 && team2);

  return (
    <div
      style={{
        width,
        background: "linear-gradient(135deg,#13203A 0%,#0E1828 100%)",
        border: `1px solid ${winner ? "rgba(255,215,0,0.25)" : canPick ? "rgba(74,158,255,0.2)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: winner
          ? "0 0 16px rgba(255,215,0,0.1)"
          : "0 2px 8px rgba(0,0,0,0.35)",
        transition: "border-color 0.3s, box-shadow 0.3s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "3px 10px",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: winner ? "#FFD700" : canPick ? "#4A9EFF" : "#2A3A5A",
          background: "rgba(0,0,0,0.2)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      ></div>
      <TeamRow
        name={team1}
        isWinner={winner === team1}
        canPick={canPick}
        onClick={() => team1 && onSelect(id, team1)}
      />
      <TeamRow
        name={team2}
        isWinner={winner === team2}
        canPick={canPick}
        onClick={() => team2 && onSelect(id, team2)}
      />
    </div>
  );
}

// ─── ROUND COLUMN ─────────────────────────────────────────────────────────────
type RoundColumnProps = {
  label: string;
  matches: Match[];
  positions: number[];
  nextPositions: number[] | null;
  onSelect: (id: string, team: string) => void;
  cardWidth?: number;
  showConnectors?: boolean;
};

function RoundColumn({
  label,
  matches,
  positions,
  nextPositions,
  onSelect,
  cardWidth = CARD_W,
  showConnectors = true,
}: RoundColumnProps) {
  const totalH =
    positions.length > 0 ? Math.max(...positions.map((p) => p + CARD_H)) : 0;
  const pairCount = Math.floor(matches.length / 2);

  return (
    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#3A5080",
          marginBottom: 12,
          paddingLeft: 2,
          height: 20,
        }}
      >
        {label}
      </div>

      <div
        style={{
          position: "relative",
          width: showConnectors ? cardWidth + COL_GAP : cardWidth,
          height: totalH,
        }}
      >
        {matches.map((m, i) => (
          <div
            key={m.id}
            style={{ position: "absolute", top: positions[i], left: 0 }}
          >
            <MatchCard match={m} onSelect={onSelect} width={cardWidth} />
          </div>
        ))}

        {showConnectors && nextPositions && (
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: cardWidth,
              overflow: "visible",
            }}
            width={COL_GAP}
            height={totalH}
          >
            {Array.from({ length: pairCount }, (_, pi) => {
              const t = positions[pi * 2] + CARD_H / 2;
              const b = positions[pi * 2 + 1] + CARD_H / 2;
              const mid = (t + b) / 2;
              const color = "rgba(74,158,255,0.25)";
              const xMid = COL_GAP / 2;
              return (
                <g key={pi}>
                  <line
                    x1={0}
                    y1={t}
                    x2={xMid}
                    y2={t}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <line
                    x1={xMid}
                    y1={t}
                    x2={xMid}
                    y2={b}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <line
                    x1={0}
                    y1={b}
                    x2={xMid}
                    y2={b}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <line
                    x1={xMid}
                    y1={mid}
                    x2={COL_GAP}
                    y2={mid}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function Progress({ rounds }: { rounds: Rounds }) {
  const all = [
    ...rounds.r32,
    ...rounds.r16,
    ...rounds.qf,
    ...rounds.sf,
    ...rounds.final,
  ];
  const done = all.filter((m) => m.winner).length;
  const pct = Math.round((done / all.length) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "#3A5080", whiteSpace: "nowrap" }}>
        {done}/{all.length}
      </span>
      <div
        style={{
          width: 80,
          height: 4,
          background: "rgba(255,255,255,0.07)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg,#4A9EFF,#FFD700)",
            transition: "width 0.3s",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "#FFD700", fontWeight: 600 }}>
        {pct}%
      </span>
    </div>
  );
}

// ─── CHAMPION CARD ────────────────────────────────────────────────────────────
function ChampionCard({ team }: { team: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "20px 16px",
        background: "linear-gradient(135deg,#1A2A00,#2A1A00)",
        border: "1px solid rgba(255,215,0,0.35)",
        borderRadius: 12,
        minWidth: 140,
        boxShadow: "0 0 40px rgba(255,215,0,0.15)",
      }}
    >
      <span style={{ fontSize: 24 }}>🏆</span>
      <span style={{ fontSize: 28 }}>{FLAGS[team] ?? "🏳️"}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#FFD700",
          letterSpacing: "0.06em",
          textAlign: "center",
          textTransform: "uppercase",
        }}
      >
        {team}
      </span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: "rgba(255,215,0,0.5)",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        World Champion 2026
      </span>
    </div>
  );
}

// ─── RESET MODAL ──────────────────────────────────────────────────────────────
function ResetModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#111C33",
          border: "1px solid rgba(255,80,80,0.3)",
          borderRadius: 12,
          padding: "28px 24px",
          maxWidth: 320,
          width: "100%",
        }}
      >
        <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️</div>
        <div
          style={{
            color: "#E8F4FF",
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Reset bracket?
        </div>
        <div
          style={{
            color: "#4A6A99",
            fontSize: 13,
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          All picks will be cleared. This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent",
              color: "#C8D8F0",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(90deg,#C0392B,#E74C3C)",
              color: "white",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { rounds, champion, selectWinner, undoLast, resetBracket, history } =
    useStore();
  const [showReset, setShowReset] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const prevChamp = useRef<string | null>(null);

  useEffect(() => {
    if (champion && !prevChamp.current) {
      setConfetti(true);
      setTimeout(() => setConfetti(false), 7000);
    }
    prevChamp.current = champion;
  }, [champion]);

  const pos32 = computePositions(16, null);
  const pos16 = computePositions(8, pos32);
  const posQF = computePositions(4, pos16);
  const posSF = computePositions(2, posQF);
  const posF = computePositions(1, posSF);
  const totalH = Math.max(...pos32.map((p) => p + CARD_H));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #070E1E; font-family: 'Outfit', sans-serif; -webkit-font-smoothing: antialiased; }
        button { font-family: 'Outfit', sans-serif; }
        ::-webkit-scrollbar { height: 5px; width: 5px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
        ::-webkit-scrollbar-thumb { background: rgba(74,158,255,0.25); border-radius: 4px; }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 30px rgba(255,215,0,0.12); }
          50%       { box-shadow: 0 0 50px rgba(255,215,0,0.22); }
        }
        .champ { animation: glow 2.5s ease-in-out infinite; }
      `}</style>

      <Confetti active={confetti} />
      {showReset && (
        <ResetModal
          onConfirm={() => {
            resetBracket();
            setShowReset(false);
          }}
          onCancel={() => setShowReset(false)}
        />
      )}

      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(160deg,#070E1E 0%,#040A14 100%)",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background: "rgba(5,10,20,0.97)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            padding: "0 16px",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: "linear-gradient(135deg,#1A3A8E,#4A9EFF)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              🏆
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#E8F4FF",
                  letterSpacing: "0.02em",
                  lineHeight: 1.2,
                }}
              >
                FIFA WC 2026™
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "#3A5080",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Knockout Bracket
              </div>
            </div>
          </div>

          <Progress rounds={rounds} />

          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={undoLast}
              disabled={!history.length}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "#C8D8F0",
                fontSize: 11,
                cursor: history.length ? "pointer" : "not-allowed",
                opacity: history.length ? 1 : 0.35,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              ↩ Undo
            </button>
            <button
              onClick={() => setShowReset(true)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(255,80,80,0.2)",
                background: "rgba(255,80,80,0.06)",
                color: "#FF6B6B",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* CHAMPION BANNER */}
        {champion && (
          <div
            style={{
              background:
                "linear-gradient(90deg,rgba(255,215,0,0.08),rgba(255,215,0,0.04),rgba(255,215,0,0.08))",
              borderBottom: "1px solid rgba(255,215,0,0.18)",
              padding: "9px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>{FLAGS[champion]}</span>
            <span style={{ fontSize: 13, color: "#FFD700", fontWeight: 600 }}>
              {champion} is the 2026 FIFA World Cup Champion! 🎉
            </span>
          </div>
        )}

        {/* HINT */}
        <div style={{ padding: "12px 16px 0", fontSize: 12, color: "#2A3A5A" }}>
          Scroll horizontally to see all rounds · Click a team to pick the
          winner · Click again to deselect
        </div>

        {/* BRACKET */}
        <div
          style={
            {
              overflowX: "auto",
              overflowY: "visible",
              padding: "20px 16px 40px",
              WebkitOverflowScrolling: "touch",
            } as React.CSSProperties
          }
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "flex-start",
              gap: 0,
              minWidth: "max-content",
            }}
          >
            <RoundColumn
              label="Round of 32"
              matches={rounds.r32}
              positions={pos32}
              nextPositions={pos16}
              onSelect={selectWinner}
              showConnectors
            />
            <RoundColumn
              label="Round of 16"
              matches={rounds.r16}
              positions={pos16}
              nextPositions={posQF}
              onSelect={selectWinner}
              showConnectors
            />
            <RoundColumn
              label="Quarter Finals"
              matches={rounds.qf}
              positions={posQF}
              nextPositions={posSF}
              onSelect={selectWinner}
              showConnectors
            />
            <RoundColumn
              label="Semi Finals"
              matches={rounds.sf}
              positions={posSF}
              nextPositions={posF}
              onSelect={selectWinner}
              showConnectors
            />
            <RoundColumn
              label="Final"
              matches={rounds.final}
              positions={posF}
              nextPositions={null}
              onSelect={selectWinner}
              showConnectors={false}
            />

            {/* CHAMPION SLOT */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                marginLeft: COL_GAP / 2,
              }}
            >
              <div style={{ height: 32 }} />
              <div
                style={{
                  height: totalH,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {champion ? (
                  <div className="champ">
                    <ChampionCard team={champion} />
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      padding: "20px 16px",
                      border: "1px dashed rgba(255,215,0,0.15)",
                      borderRadius: 12,
                      minWidth: 120,
                    }}
                  >
                    <span style={{ fontSize: 24, opacity: 0.2 }}>🏆</span>
                    <span
                      style={{
                        fontSize: 9,
                        color: "rgba(255,215,0,0.25)",
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        fontWeight: 700,
                      }}
                    >
                      Champion
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.04)",
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "rgba(58,80,128,0.7)",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span>FIFA World Cup 2026 · USA · Canada · Mexico</span>
          <span>
            Auto-saved · {history.length}{" "}
            {history.length === 1 ? "action" : "actions"} in history
          </span>
        </div>
      </div>
    </>
  );
}

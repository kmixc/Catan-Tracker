import { useState, useEffect, useCallback } from "react";
import "./index.css";


// ─── Utilities ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return new Date(+y, +m - 1, +day).toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
};

const deriveResult = (players) => {
  const valid = players.filter(p => p.name.trim() && p.points !== "");
  if (!valid.length) return null;
  const maxPts = Math.max(...valid.map(p => Number(p.points)));
  const winners = valid.filter(p => Number(p.points) === maxPts);
  if (winners.length > 1) return { type: "tie", winners: winners.map(p => p.name) };
  return { type: "win", winner: winners[0].name };
};

const buildLeaderboard = (games) => {
  const map = {};
  games.forEach(g => {
    g.players.forEach(p => {
      if (!p.name.trim()) return;
      if (!map[p.name]) map[p.name] = { name: p.name, wins: 0, games: 0, totalPts: 0, lastDate: "" };
      const e = map[p.name];
      e.games++;
      e.totalPts += Number(p.points);
      if (e.lastDate < g.date) e.lastDate = g.date;
      if (g.result.type === "win" && g.result.winner === p.name) e.wins++;
    });
  });
  return Object.values(map)
    .map(e => ({ ...e, winRate: e.games ? ((e.wins / e.games) * 100).toFixed(0) : 0, avgPts: e.games ? (e.totalPts / e.games).toFixed(1) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);
};

// ─── Storage ───────────────────────────────────────────────────────────────────
// Schema: { groups: [{id, name}], games: {groupId: [game]}, activeGroupId: string|null }
const STORAGE_KEY = "catan-v2";

const loadData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { }
  // Migrate from old single-group format
  try {
    const old = JSON.parse(localStorage.getItem("catan-games") || "[]");
    if (old.length) {
      const g = { id: uid(), name: "Main Group" };
      return { groups: [g], games: { [g.id]: old }, activeGroupId: g.id };
    }
  } catch { }
  return { groups: [], games: {}, activeGroupId: null };
};

// ─── Shared form row ───────────────────────────────────────────────────────────
function PlayerRow({ player, index, onChange, onRemove, canRemove, winStatus }) {
  return (
    <div className="form-row">
      <div className={`win-indicator${winStatus === "winner" ? " is-winner" : winStatus === "tie" ? " is-tie" : ""}`}>
        {winStatus === "winner" ? "♛" : winStatus === "tie" ? "✦" : ""}
      </div>
      <input type="text" placeholder={`Player ${index + 1}`} value={player.name}
        onChange={e => onChange(index, "name", e.target.value)} autoComplete="off" />
      <input type="number" placeholder="Pts" value={player.points} min={0}
        onChange={e => onChange(index, "points", e.target.value)} />
      <button className="btn btn-icon" onClick={() => onRemove(index)}
        disabled={!canRemove} style={{ opacity: canRemove ? 1 : .3 }}>×</button>
    </div>
  );
}

// Shared player rows block used in both GameForm and EditModal
function PlayerRows({ players, onChange, onRemove, onAdd, result }) {
  return (
    <>
      <div className="form-row-header">
        <span />
        <span className="row-label">Player name</span>
        <span className="row-label" style={{ textAlign: "center" }}>Points</span>
        <span />
      </div>
      {players.map((p, i) => {
        let winStatus = null;
        if (result && p.name.trim() && p.points !== "") {
          if (result.type === "win" && result.winner === p.name.trim()) winStatus = "winner";
          if (result.type === "tie" && result.winners?.includes(p.name.trim())) winStatus = "tie";
        }
        return (
          <PlayerRow key={p.id} player={p} index={i} onChange={onChange}
            onRemove={onRemove} canRemove={players.length > 2} winStatus={winStatus} />
        );
      })}
      <div className="add-player-row">
        <button className="btn btn-ghost" onClick={onAdd}>+ Add Player</button>
      </div>
    </>
  );
}

// ─── Game Form ─────────────────────────────────────────────────────────────────
function GameForm({ onSave, toast }) {
  const emptyPlayer = () => ({ id: uid(), name: "", points: "" });
  const [date, setDate] = useState(today());
  const [players, setPlayers] = useState([emptyPlayer(), emptyPlayer(), emptyPlayer()]);
  const [notes, setNotes] = useState("");

  const handleChange = (i, field, val) =>
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const addPlayer = () => setPlayers(prev => [...prev, emptyPlayer()]);
  const removePlayer = (i) => setPlayers(prev => prev.filter((_, idx) => idx !== i));
  const result = deriveResult(players);

  const handleSubmit = () => {
    const valid = players.filter(p => p.name.trim() && p.points !== "");
    if (valid.length < 2) { toast("Add at least 2 players with names and points."); return; }
    if (!date) { toast("Please pick a date."); return; }
    onSave({ id: uid(), date, players: valid.map(p => ({ name: p.name.trim(), points: Number(p.points) })), result, notes: notes.trim() });
    setPlayers([emptyPlayer(), emptyPlayer(), emptyPlayer()]);
    setNotes("");
    setDate(today());
    toast("Game saved ✓");
  };

  return (
    <div className="card">
      <div className="section-label">Record a game</div>
      <div className="date-row">
        <label>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <PlayerRows players={players} onChange={handleChange} onRemove={removePlayer} onAdd={addPlayer} result={result} />
      {result && (
        <div className={`result-preview ${result.type}`}>
          <div className={`result-dot ${result.type === "tie" ? "tie" : ""}`} />
          <span className="result-label">{result.type === "win" ? "Winner:" : "Tie:"}</span>
          <span className={`result-name ${result.type === "tie" ? "tie" : ""}`}>
            {result.type === "win" ? result.winner : result.winners.join(" & ")}
          </span>
        </div>
      )}
      <div className="notes-row">
        <div className="notes-label">Notes (optional)</div>
        <textarea placeholder="Controversial win? Longest road drama? Immortalize it here." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" onClick={handleSubmit}>Save Game</button>
      </div>
    </div>
  );
}

// ─── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ game, onSave, onClose }) {
  const emptyPlayer = () => ({ id: uid(), name: "", points: "" });
  const [date, setDate] = useState(game.date);
  const [players, setPlayers] = useState(game.players.map(p => ({ id: uid(), name: p.name, points: String(p.points) })));
  const [notes, setNotes] = useState(game.notes || "");

  const handleChange = (i, field, val) =>
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const addPlayer = () => setPlayers(prev => [...prev, emptyPlayer()]);
  const removePlayer = (i) => setPlayers(prev => prev.filter((_, idx) => idx !== i));
  const result = deriveResult(players);

  const handleSave = () => {
    const valid = players.filter(p => p.name.trim() && p.points !== "");
    if (valid.length < 2) return;
    onSave({ ...game, date, players: valid.map(p => ({ name: p.name.trim(), points: Number(p.points) })), result, notes: notes.trim() });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Edit Game</div>
        <div className="date-row">
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <PlayerRows players={players} onChange={handleChange} onRemove={removePlayer} onAdd={addPlayer} result={result} />
        {result && (
          <div className={`result-preview ${result.type}`}>
            <div className={`result-dot ${result.type === "tie" ? "tie" : ""}`} />
            <span className="result-label">{result.type === "win" ? "Winner:" : "Tie:"}</span>
            <span className={`result-name ${result.type === "tie" ? "tie" : ""}`}>
              {result.type === "win" ? result.winner : result.winners.join(" & ")}
            </span>
          </div>
        )}
        <div className="notes-row">
          <div className="notes-label">Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
function Leaderboard({ games }) {
  const data = buildLeaderboard(games);
  return (
    <div className="card">
      <div className="section-label">Leaderboard</div>
      {!data.length ? <div className="empty">No data yet — play some games.</div> : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Player</th><th>Wins</th><th>Win%</th>
              <th>Avg pts</th><th>Total pts</th><th>Games</th>
              <th className="lb-last">Last played</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr key={p.name}>
                <td>
                  <div className="lb-name-row">
                    <span className="lb-rank">#{i + 1}</span>
                    <span className="lb-name">{p.name}</span>
                    {i === 0 && <span className="lb-crown">♛</span>}
                  </div>
                </td>
                <td><span className="lb-wins">{p.wins}</span></td>
                <td><span className="lb-winrate">{p.winRate}%</span></td>
                <td><span className="lb-avg">{p.avgPts}</span></td>
                <td><span className="lb-avg">{p.totalPts}</span></td>
                <td><span className="lb-games">{p.games}</span></td>
                <td className="lb-last"><span>{fmtDate(p.lastDate)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Game Card ────────────────────────────────────────────────────────────────
function GameCard({ game, onDelete, onEdit }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isWin = game.result.type === "win";
  const maxPts = Math.max(...game.players.map(p => p.points));

  return (
    <div className={`game-card ${game.notes ? "has-note" : ""} ${!isWin ? "is-tie" : ""}`}>
      <div className="game-card-header" onClick={() => { setOpen(o => !o); setConfirmDelete(false); }}>
        <span className="game-date">{fmtDate(game.date)}</span>
        <span className="game-winner">
          {isWin
            ? <><span className="win-label">{game.result.winner}</span> won</>
            : <span className="tie-label">Tie — {game.result.winners?.join(" & ")}</span>}
        </span>
        <div className="game-meta">
          {game.notes && <span className="note-badge">note</span>}
          <span className={`chevron ${open ? "open" : ""}`}>▾</span>
        </div>
      </div>
      {open && (
        <div className="game-card-body">
          <div className="players-list">
            {[...game.players].sort((a, b) => b.points - a.points).map(p => {
              const winner = isWin && p.points === maxPts;
              const tied = !isWin && p.points === maxPts;
              return (
                <div key={p.name} className={`player-row ${winner ? "is-winner" : ""} ${tied ? "is-tie-winner" : ""}`}>
                  <span className="p-name">{p.name}</span>
                  <span className="p-pts"><strong>{p.points}</strong> pts</span>
                </div>
              );
            })}
          </div>
          {game.notes && <div className="game-note">"{game.notes}"</div>}
          <div className="game-card-actions">
            <button className="btn btn-ghost" style={{ fontSize: "11px", padding: "6px 12px" }} onClick={() => onEdit(game)}>Edit</button>
            {confirmDelete ? (
              <>
                <span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center" }}>Sure?</span>
                <button className="btn btn-danger" style={{ borderColor: "var(--red)" }} onClick={() => onDelete(game.id)}>Yes, delete</button>
                <button className="btn btn-ghost" style={{ fontSize: "11px", padding: "6px 12px" }} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────
function History({ games, onDelete, onEdit }) {
  const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <div className="section-label">Game History ({games.length})</div>
      {!sorted.length
        ? <div className="empty">No games recorded yet.</div>
        : sorted.map(g => <GameCard key={g.id} game={g} onDelete={onDelete} onEdit={onEdit} />)}
    </div>
  );
}

// ─── Manage Groups Modal ──────────────────────────────────────────────────────
function ManageGroupsModal({ groups, games, activeGroupId, onCreate, onRename, onDelete, onClose }) {
  const [newName, setNewName] = useState("");
  const [editNames, setEditNames] = useState(Object.fromEntries(groups.map(g => [g.id, g.name])));
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const handleRename = (id) => {
    const name = (editNames[id] || "").trim();
    if (name && name !== groups.find(g => g.id === id)?.name) onRename(id, name);
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Manage Groups</div>

        {groups.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: "12px", marginBottom: "16px" }}>
            No groups yet. Create one below.
          </div>
        )}

        <div className="groups-list">
          {groups.map(g => {
            const count = (games[g.id] || []).length;
            const isActive = g.id === activeGroupId;
            return (
              <div key={g.id} className={`group-item ${isActive ? "active-group" : ""}`}>
                <input
                  type="text"
                  value={editNames[g.id] ?? g.name}
                  onChange={e => setEditNames(prev => ({ ...prev, [g.id]: e.target.value }))}
                  onBlur={() => handleRename(g.id)}
                  onKeyDown={e => e.key === "Enter" && handleRename(g.id)}
                />
                <span className="group-badge">{count} game{count !== 1 ? "s" : ""}</span>
                {isActive && <span className="group-badge accent">active</span>}
                {confirmDeleteId === g.id ? (
                  <>
                    <button className="btn btn-danger" style={{ borderColor: "var(--red)", padding: "3px 8px" }}
                      onClick={() => { onDelete(g.id); setConfirmDeleteId(null); }}>Delete</button>
                    <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: "11px" }}
                      onClick={() => setConfirmDeleteId(null)}>×</button>
                  </>
                ) : (
                  <button className="btn btn-danger" onClick={() => setConfirmDeleteId(g.id)}>✕</button>
                )}
              </div>
            );
          })}
        </div>

        <div className="new-group-row">
          <input
            type="text"
            placeholder="New group name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
          />
          <button className="btn btn-primary" onClick={handleCreate} style={{ flexShrink: 0 }}>Create</button>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(loadData);
  const [editTarget, setEditTarget] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [showManage, setShowManage] = useState(false);

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  // Auto-clear toast
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(""), 2200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const { groups, games, activeGroupId } = data;
  const activeGames = activeGroupId ? (games[activeGroupId] || []) : [];

  // ── Group actions ──
  const createGroup = useCallback((name) => {
    const g = { id: uid(), name };
    setData(prev => ({
      groups: [...prev.groups, g],
      games: { ...prev.games, [g.id]: [] },
      activeGroupId: prev.activeGroupId ?? g.id,
    }));
    setToastMsg(`"${name}" created`);
  }, []);

  const renameGroup = useCallback((id, name) => {
    setData(prev => ({ ...prev, groups: prev.groups.map(g => g.id === id ? { ...g, name } : g) }));
  }, []);

  const deleteGroup = useCallback((id) => {
    setData(prev => {
      const newGroups = prev.groups.filter(g => g.id !== id);
      const newGames = { ...prev.games };
      delete newGames[id];
      const newActive = prev.activeGroupId === id ? (newGroups[0]?.id ?? null) : prev.activeGroupId;
      return { groups: newGroups, games: newGames, activeGroupId: newActive };
    });
    setToastMsg("Group deleted");
  }, []);

  const switchGroup = useCallback((id) => {
    setData(prev => ({ ...prev, activeGroupId: id }));
    setEditTarget(null);
  }, []);

  // ── Game actions ──
  const saveGame = useCallback((game) => {
    if (!activeGroupId) return;
    setData(prev => ({
      ...prev,
      games: { ...prev.games, [activeGroupId]: [game, ...(prev.games[activeGroupId] || [])] },
    }));
  }, [activeGroupId]);

  const deleteGame = useCallback((id) => {
    if (!activeGroupId) return;
    setData(prev => ({
      ...prev,
      games: { ...prev.games, [activeGroupId]: (prev.games[activeGroupId] || []).filter(g => g.id !== id) },
    }));
    setToastMsg("Game deleted.");
  }, [activeGroupId]);

  const saveEdit = useCallback((updated) => {
    if (!activeGroupId) return;
    setData(prev => ({
      ...prev,
      games: {
        ...prev.games,
        [activeGroupId]: (prev.games[activeGroupId] || []).map(g => g.id === updated.id ? updated : g),
      },
    }));
    setEditTarget(null);
    setToastMsg("Game updated ✓");
  }, [activeGroupId]);

  return (
    <>
      <div id="root">

        <div className="header">
          <div className="header-eyebrow">private group tracker</div>
          <h1>Catan Log</h1>
          <div className="header-sub">Record results. Crown champions. Settle scores.</div>
        </div>

        {/* Group tabs */}
        <div className="tabs-bar">
          {groups.map(g => (
            <button key={g.id} className={`tab ${g.id === activeGroupId ? "active" : ""}`} onClick={() => switchGroup(g.id)}>
              {g.name}
            </button>
          ))}
          <button className="tab-manage" onClick={() => setShowManage(true)}>
            {groups.length === 0 ? "+ New Group" : "⚙ Groups"}
          </button>
        </div>

        {/* Content */}
        {groups.length === 0 ? (
          <div className="splash">
            <div className="splash-title">No groups yet</div>
            <div className="splash-sub">Create a group to start tracking games.</div>
            <button className="btn btn-primary" onClick={() => setShowManage(true)}>+ Create your first group</button>
          </div>
        ) : activeGroupId ? (
          <>
            {/* key forces form reset when switching groups */}
            <GameForm key={activeGroupId} onSave={saveGame} toast={setToastMsg} />
            <Leaderboard games={activeGames} />
            <div className="divider" />
            <History games={activeGames} onDelete={deleteGame} onEdit={setEditTarget} />
          </>
        ) : null}

      </div>

      {showManage && (
        <ManageGroupsModal
          groups={groups}
          games={games}
          activeGroupId={activeGroupId}
          onCreate={createGroup}
          onRename={renameGroup}
          onDelete={deleteGroup}
          onClose={() => setShowManage(false)}
        />
      )}

      {editTarget && (
        <EditModal game={editTarget} onSave={saveEdit} onClose={() => setEditTarget(null)} />
      )}

      <div className={`toast ${toastMsg ? "show" : ""}`}>{toastMsg}</div>
    </>
  );
}

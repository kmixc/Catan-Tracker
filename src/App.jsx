import { useState, useEffect, useCallback } from "react";
import "./index.css";
import { db, auth, signInAnonymously } from "./firebase";
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from "firebase/firestore";


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
  games.filter(g => g.ranked !== false).forEach(g => {
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
    .sort((a, b) => b.wins - a.wins || b.totalPts - a.totalPts);
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
  const [location, setLocation] = useState("");
  const [ranked, setRanked] = useState(true);

  const handleChange = (i, field, val) =>
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const addPlayer = () => setPlayers(prev => [...prev, emptyPlayer()]);
  const removePlayer = (i) => setPlayers(prev => prev.filter((_, idx) => idx !== i));
  const result = deriveResult(players);

  const handleSubmit = () => {
    const valid = players.filter(p => p.name.trim() && p.points !== "");
    if (valid.length < 2) { toast("Add at least 2 players with names and points."); return; }
    if (!date) { toast("Please pick a date."); return; }
    onSave({ id: uid(), date, players: valid.map(p => ({ name: p.name.trim(), points: Number(p.points) })), result, notes: notes.trim(), location: location.trim(), ranked });
    setPlayers([emptyPlayer(), emptyPlayer(), emptyPlayer()]);
    setNotes("");
    setDate(today());
    setLocation("");
    setRanked(true);
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
        <div className="notes-label">Location (optional)</div>
        <input type="text" placeholder="e.g. Sarah's place" value={location} onChange={e => setLocation(e.target.value)} autoComplete="off" />
      </div>
      <div className="notes-row">
        <div className="notes-label">Notes (optional)</div>
        <textarea placeholder="Controversial win? Longest road drama? Immortalize it here." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <div className="form-actions">
        <button
          className={`btn ${ranked ? "btn-ranked" : "btn-unranked"}`}
          onClick={() => setRanked(r => !r)}
        >{ranked ? "Ranked" : "Unranked"}</button>
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
  const [location, setLocation] = useState(game.location || game.venue?.location || "");
  const [ranked, setRanked] = useState(game.ranked !== false);

  const handleChange = (i, field, val) =>
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const addPlayer = () => setPlayers(prev => [...prev, emptyPlayer()]);
  const removePlayer = (i) => setPlayers(prev => prev.filter((_, idx) => idx !== i));
  const result = deriveResult(players);

  const handleSave = () => {
    const valid = players.filter(p => p.name.trim() && p.points !== "");
    if (valid.length < 2) return;
    onSave({ ...game, date, players: valid.map(p => ({ name: p.name.trim(), points: Number(p.points) })), result, notes: notes.trim(), location: location.trim(), ranked });
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
          <div className="notes-label">Location</div>
          <input type="text" placeholder="e.g. Sarah's place" value={location} onChange={e => setLocation(e.target.value)} autoComplete="off" />
        </div>
        <div className="notes-row">
          <div className="notes-label">Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${ranked ? "btn-ranked" : "btn-unranked"}`}
            onClick={() => setRanked(r => !r)}
          >{ranked ? "Ranked" : "Unranked"}</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
const LB_COLUMNS = [
  { key: "wins", label: "Wins", numeric: true },
  { key: "winRate", label: "Win%", numeric: true },
  { key: "avgPts", label: "Avg pts", numeric: true },
  { key: "totalPts", label: "Total pts", numeric: true },
  { key: "games", label: "Games", numeric: true },
];

function Leaderboard({ games }) {
  const [lbTab, setLbTab] = useState("overall");
  const [sortKey, setSortKey] = useState("wins");
  const [sortDir, setSortDir] = useState("desc");

  const currentMonth = new Date().toISOString().slice(0, 7);
  const filteredGames = lbTab === "monthly"
    ? games.filter(g => g.date && g.date.startsWith(currentMonth))
    : games;

  const base = buildLeaderboard(filteredGames);
  const data = [...base].sort((a, b) => {
    const av = Number(a[sortKey]);
    const bv = Number(b[sortKey]);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const arrow = (key) => sortKey === key ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  const monthLabel = new Date().toLocaleDateString("en-CA", { month: "long", year: "numeric" });

  return (
    <div className="card">
      <div className="lb-header-row">
        <div className="section-label" style={{ marginBottom: 0, paddingBottom: 0, border: "none" }}>Leaderboard</div>
        <div className="lb-tabs">
          <button className={`lb-tab ${lbTab === "overall" ? "active" : ""}`} onClick={() => setLbTab("overall")}>Overall</button>
          <button className={`lb-tab ${lbTab === "monthly" ? "active" : ""}`} onClick={() => setLbTab("monthly")}>Monthly</button>
        </div>
      </div>
      {lbTab === "monthly" && <div className="lb-month-label">{monthLabel}</div>}
      {!data.length ? <div className="empty">{lbTab === "monthly" ? "No games this month yet." : "No data yet — play some games."}</div> : (
        <div className="lb-scroll"><table className="leaderboard-table">
          <thead>
            <tr>
              <th>Player</th>
              {LB_COLUMNS.map(col => (
                <th key={col.key}
                  className={`lb-sortable${sortKey === col.key ? " lb-sorted" : ""}`}
                  onClick={() => handleSort(col.key)}
                >{col.label}{arrow(col.key)}</th>
              ))}
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
        </table></div>
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
          {game.ranked === false
            ? <span className="unranked-badge">unranked</span>
            : <span className="ranked-badge">ranked</span>}
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
          {(game.location || game.venue?.location) && (
            <div className="game-venue">
              <span className="game-venue-icon">📍</span>
              <span className="game-venue-detail">{game.location || game.venue.location}</span>
            </div>
          )}
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

// ─── Next Game Banner ─────────────────────────────────────────────────────────
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
};

function NextGameBanner({ nextGame, onEdit }) {
  const hasInfo = nextGame && (nextGame.location || nextGame.date || nextGame.time);
  return (
    <div className="next-game-banner">
      <div className="next-game-banner-content">
        <div className="next-game-info">
          <span className="next-game-label">Next game</span>
          {hasInfo ? (
            <>
              {nextGame.location && <span className="next-game-detail next-game-location">{nextGame.location}</span>}
              {nextGame.date && <span className="next-game-detail next-game-date">{fmtDate(nextGame.date)}</span>}
              {nextGame.time && <span className="next-game-detail next-game-time">{fmtTime(nextGame.time)}</span>}
            </>
          ) : (
            <span className="next-game-empty">Not scheduled yet</span>
          )}
        </div>
      </div>
      <button className="btn next-game-edit-btn" onClick={onEdit}>Edit</button>
    </div>
  );
}

function NextGameEditModal({ nextGame, onSave, onClose }) {
  const [location, setLocation] = useState(nextGame?.location || "");
  const [date, setDate] = useState(nextGame?.date || "");

  // Parse existing time (HH:MM 24h) into hour/minute/ampm for the picker
  const parseTime = (t) => {
    if (!t) return { hour: "7", minute: "00", ampm: "PM" };
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = String(h % 12 || 12);
    const minute = String(m).padStart(2, "0");
    return { hour, minute, ampm };
  };
  const parsed = parseTime(nextGame?.time || "");
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [ampm, setAmpm] = useState(parsed.ampm);

  const buildTime = (h, min, ap) => {
    let hh = Number(h);
    if (ap === "PM" && hh !== 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:${min}`;
  };

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = ["00", "15", "30", "45"];

  const TimePicker = ({ h, setH, min, setMin, ap, setAp }) => (
    <div className="time-picker">
      <select value={h} onChange={e => setH(e.target.value)}>
        {hours.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <span className="time-colon">:</span>
      <select value={min} onChange={e => setMin(e.target.value)}>
        {minutes.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select value={ap} onChange={e => setAp(e.target.value)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Schedule Games</div>

        <div className="next-game-section-label">Next game</div>
        <div className="next-game-field">
          <label>Location</label>
          <input type="text" placeholder="e.g. Sarah's place" value={location}
            onChange={e => setLocation(e.target.value)} autoComplete="off" />
        </div>
        <div className="next-game-field">
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="next-game-field">
          <label>Time</label>
          <TimePicker h={hour} setH={setHour} min={minute} setMin={setMinute} ap={ampm} setAp={setAmpm} />
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(
            { location: location.trim(), date, time: buildTime(hour, minute, ampm) }
          )}>Save</button>
        </div>
      </div>
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
  const [groups, setGroups] = useState([]);
  const [games, setGames] = useState({});
  const [activeGroupId, setActiveGroupIdRaw] = useState(() => localStorage.getItem("catan-activeGroup") || null);
  const [editTarget, setEditTarget] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [showNextGameEdit, setShowNextGameEdit] = useState(false);
  const [authed, setAuthed] = useState(false);

  // Sign in anonymously once on mount — required by Firestore security rules
  useEffect(() => {
    signInAnonymously(auth).then(() => setAuthed(true)).catch(console.error);
  }, []);

  const setActiveGroupId = useCallback((id) => {
    setActiveGroupIdRaw(id);
    if (id) localStorage.setItem("catan-activeGroup", id);
    else localStorage.removeItem("catan-activeGroup");
  }, []);

  // Firestore real-time sync — starts immediately on mount
  useEffect(() => {
    const unsubGroups = onSnapshot(collection(db, "groups"), snap => {
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubGames = onSnapshot(collection(db, "games"), snap => {
      const map = {};
      snap.docs.forEach(d => {
        const g = { id: d.id, ...d.data() };
        if (!map[g.groupId]) map[g.groupId] = [];
        map[g.groupId].push(g);
      });
      setGames(map);
    });
    return () => { unsubGroups(); unsubGames(); };
  }, []);

  // If saved activeGroupId no longer exists in Firestore, switch to first available
  useEffect(() => {
    if (groups.length > 0 && activeGroupId && !groups.find(g => g.id === activeGroupId)) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups, activeGroupId, setActiveGroupId]);

  // Auto-clear toast
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(""), 2200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const activeGames = activeGroupId ? (games[activeGroupId] || []) : [];
  const activeGroup = groups.find(g => g.id === activeGroupId);
  const nextGame = activeGroup?.nextGame || null;

  // ── Group actions ──
  const createGroup = useCallback(async (name) => {
    const id = uid();
    await setDoc(doc(db, "groups", id), { name });
    setActiveGroupId(id);
    setToastMsg(`"${name}" created`);
  }, [setActiveGroupId]);

  const renameGroup = useCallback(async (id, name) => {
    await updateDoc(doc(db, "groups", id), { name });
  }, []);

  const deleteGroup = useCallback(async (id) => {
    await deleteDoc(doc(db, "groups", id));
    const groupGames = games[id] || [];
    await Promise.all(groupGames.map(g => deleteDoc(doc(db, "games", g.id))));
    setToastMsg("Group deleted");
  }, [games]);

  const switchGroup = useCallback((id) => {
    setActiveGroupId(id);
    setEditTarget(null);
  }, [setActiveGroupId]);

  // ── Next game ──
  const clearNextGame = useCallback(async (groupId) => {
    if (!groupId) return;
    await updateDoc(doc(db, "groups", groupId), { nextGame: null, nextNextGame: null });
  }, []);

  const saveNextGame = useCallback(async (nextGameData) => {
    if (!activeGroupId) return;
    await updateDoc(doc(db, "groups", activeGroupId), { nextGame: nextGameData });
    setShowNextGameEdit(false);
    setToastMsg("Schedule saved ✓");
  }, [activeGroupId]);

  // ── Game actions ──
  const saveGame = useCallback(async (game) => {
    if (!activeGroupId) return;
    const { id, ...gameData } = game;
    await setDoc(doc(db, "games", id), { ...gameData, groupId: activeGroupId });
    // Clear the next game banner now that the game has been recorded
    await clearNextGame(activeGroupId);
  }, [activeGroupId, clearNextGame]);

  const deleteGame = useCallback(async (id) => {
    await deleteDoc(doc(db, "games", id));
    setToastMsg("Game deleted.");
  }, []);

  const saveEdit = useCallback(async (updated) => {
    if (!activeGroupId) return;
    const { id, ...gameData } = updated;
    await setDoc(doc(db, "games", id), { ...gameData, groupId: activeGroupId });
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
        <div className={`tabs-bar${groups.length > 0 && !activeGroupId ? " tabs-bar--highlight" : ""}`}>
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
            <NextGameBanner nextGame={nextGame} onEdit={() => setShowNextGameEdit(true)} />
            {/* key forces form reset when switching groups */}
            <GameForm key={activeGroupId} onSave={saveGame} toast={setToastMsg} />
            <Leaderboard games={activeGames} />
            <div className="divider" />
            <History games={activeGames} onDelete={deleteGame} onEdit={setEditTarget} />
          </>
        ) : (
          <div className="no-group-selected">
            <div className="no-group-arrow">↑</div>
            <div className="no-group-title">Pick a group above</div>
            <div className="no-group-sub">Select a group tab to view its games and leaderboard.</div>
          </div>
        )}

      </div>

      {showNextGameEdit && (
        <NextGameEditModal nextGame={nextGame} onSave={saveNextGame} onClose={() => setShowNextGameEdit(false)} />
      )}

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

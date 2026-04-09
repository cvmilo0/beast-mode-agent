import { useState, useEffect, useRef } from "react";
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
  useConversationMode,
  useConversationClientTool,
} from "@elevenlabs/react";

// ─── Config ───────────────────────────────────────────────────────────────────
const AGENT_ID = import.meta.env.VITE_AGENT_ID || "";
const REST_SECONDS = 30;

// ─── Muscle Groups ────────────────────────────────────────────────────────────
const MUSCLES = {
  chest:     { label: "CHEST",     emoji: "🫁", color: "#e63232", exercises: ["Push-ups", "Bench Press", "Dips"],                  reps: 12 },
  back:      { label: "BACK",      emoji: "🔝", color: "#3b82f6", exercises: ["Pull-ups", "Bent-over Rows", "Lat Pulldown"],        reps: 10 },
  legs:      { label: "LEGS",      emoji: "🦵", color: "#22c55e", exercises: ["Squats", "Lunges", "Romanian Deadlift"],             reps: 15 },
  shoulders: { label: "SHOULDERS", emoji: "🏋️", color: "#f59e0b", exercises: ["Overhead Press", "Lateral Raises", "Face Pulls"],   reps: 12 },
  arms:      { label: "ARMS",      emoji: "💪", color: "#8b5cf6", exercises: ["Bicep Curls", "Tricep Dips", "Hammer Curls"],        reps: 12 },
  fullbody:  { label: "FULL BODY", emoji: "⚡", color: "#ef4444", exercises: ["Burpees", "Thrusters", "Mountain Climbers"],         reps: 10 },
  rest:      { label: "REST",      emoji: "😴", color: "#444444", exercises: [],                                                    reps: 0  },
};

const DAY_NAMES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const DAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

// ─── Schedule (localStorage) ──────────────────────────────────────────────────
const DEFAULT_SCHEDULE = { 0: "chest", 1: "back", 2: "legs", 3: "shoulders", 4: "arms", 5: "fullbody", 6: "rest" };

function loadSchedule() {
  try { return JSON.parse(localStorage.getItem("goggins_schedule")) || DEFAULT_SCHEDULE; }
  catch { return DEFAULT_SCHEDULE; }
}
function saveSchedule(s) { localStorage.setItem("goggins_schedule", JSON.stringify(s)); }

// ─── Weekly Tracker (localStorage) ───────────────────────────────────────────
function getWeekKey() {
  const d = new Date(); const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const y = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-W${Math.ceil(((d - y) / 86400000 + 1) / 7)}`;
}
function getTodayIndex() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
function loadWeekData() {
  try { const s = JSON.parse(localStorage.getItem("goggins_week") || "{}"); if (s.week === getWeekKey()) return s.trained; }
  catch {}
  return Array(7).fill(false);
}
function markTodayTrained() {
  const t = loadWeekData(); t[getTodayIndex()] = true;
  localStorage.setItem("goggins_week", JSON.stringify({ week: getWeekKey(), trained: t }));
}

// ─── Set History (localStorage) ──────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem("goggins_history") || "[]"); }
  catch { return []; }
}
function saveSetRecord(record) {
  const history = loadHistory();
  history.unshift(record); // newest first
  if (history.length > 200) history.splice(200);
  localStorage.setItem("goggins_history", JSON.stringify(history));
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  if (!AGENT_ID) return <MissingAgentId />;
  return (
    <ConversationProvider agentId={AGENT_ID} connectionType="websocket">
      <Coach />
    </ConversationProvider>
  );
}

// ─── Main Coach ───────────────────────────────────────────────────────────────
function Coach() {
  const { startSession, endSession } = useConversationControls();
  const { status, message: statusMessage } = useConversationStatus();
  const { isSpeaking } = useConversationMode();

  const todayIdx = getTodayIndex();
  const [schedule, setSchedule] = useState(loadSchedule);
  const [weekData, setWeekData] = useState(loadWeekData);
  const [screen, setScreen] = useState("idle"); // idle | schedule | active | rest | done | history
  const [setNumber, setSetNumber] = useState(1);
  const [restSeconds, setRestSeconds] = useState(REST_SECONDS);
  const [setSeconds, setSetSeconds] = useState(0);
  const [micError, setMicError] = useState(null);
  const [lastRating, setLastRating] = useState(null); // { rating, comment } from current set
  const setSecondsRef = useRef(0);
  const restTimerRef = useRef(null);
  const setTimerRef = useRef(null);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const isError = status === "error";

  const muscleKey = schedule[todayIdx] || "fullbody";
  const muscle = MUSCLES[muscleKey];
  const exercise = muscle.exercises[0] || "";

  // Register the rateSet client tool — Goggins calls this when set ends
  useConversationClientTool("rateSet", ({ rating, comment }) => {
    const record = {
      id: Date.now(),
      date: new Date().toLocaleDateString("en-CA"),
      muscleKey,
      exercise,
      rating: Math.min(5, Math.max(1, parseInt(rating) || 3)),
      comment: comment || "",
      duration: setSecondsRef.current,
      setNum: setNumber,
    };
    saveSetRecord(record);
    setLastRating({ rating: record.rating, comment: record.comment });
    // Auto-end session and go to rest after Goggins finishes speaking
    setTimeout(async () => {
      try { await endSession(); } catch {}
      setScreen("rest");
    }, 3000);
    return "Rating saved.";
  });

  useEffect(() => {
    if (screen === "active") {
      setSetSeconds(0);
      setSecondsRef.current = 0;
      setTimerRef.current = setInterval(() => {
        setSetSeconds((s) => { setSecondsRef.current = s + 1; return s + 1; });
      }, 1000);
    } else clearInterval(setTimerRef.current);
    return () => clearInterval(setTimerRef.current);
  }, [screen]);

  useEffect(() => {
    if (screen === "rest") {
      setRestSeconds(REST_SECONDS);
      restTimerRef.current = setInterval(() => {
        setRestSeconds((s) => { if (s <= 1) { clearInterval(restTimerRef.current); return 0; } return s - 1; });
      }, 1000);
    }
    return () => clearInterval(restTimerRef.current);
  }, [screen]);

  function handleSaveSchedule(newSchedule) {
    saveSchedule(newSchedule);
    setSchedule(newSchedule);
    setScreen("idle");
  }

  async function handleStartSet() {
    setMicError(null);
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setMicError("Microphone denied. Allow mic access and try again."); return; }
    try {
      await startSession({
        connectionType: "websocket",
        overrides: {
          agent: {
            firstMessage: muscleKey === "rest"
              ? "Rest day. But you still showed up. That's something. What do you need?"
              : `${muscle.label} DAY! ${setNumber > 1 ? `Set ${setNumber}.` : ""} We're doing ${exercise} today. ${muscle.reps} reps. Let's go — NOW.`,
          },
        },
        onConnect: () => console.log("Goggins connected"),
        onError: (msg) => { console.error(msg); setMicError(`Error: ${msg}`); },
      });
      setScreen("active");
    } catch (err) { setMicError(`Failed to connect: ${err.message}`); }
  }

  async function handleEndSet() { await endSession(); setScreen("rest"); }
  function handleNextSet() { setSetNumber((n) => n + 1); setScreen("idle"); }
  function handleFinishWorkout() {
    markTodayTrained(); setWeekData(loadWeekData());
    setSetNumber(1); setScreen("done");
  }
  function handleReset() { setSetNumber(1); setScreen("idle"); }

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={styles.logo}>GOGGINS</span>
          {(screen === "idle" || screen === "schedule" || screen === "history") && (<>
            <button style={styles.headerBtn} onClick={() => setScreen(screen === "schedule" ? "idle" : "schedule")} title="Weekly Plan">
              {screen === "schedule" ? "✕" : "📅"}
            </button>
            <button style={styles.headerBtn} onClick={() => setScreen(screen === "history" ? "idle" : "history")} title="History">
              {screen === "history" ? "✕" : "📊"}
            </button>
          </>)}
        </div>
        <WeeklyDots weekData={weekData} todayIndex={todayIdx} />
        <span style={styles.setLabel}>
          {screen === "schedule" ? "PLAN" : screen === "history" ? "STATS" : `SET ${setNumber}`}
        </span>
      </header>

      {screen === "idle" && (
        <IdleScreen
          muscle={muscle} muscleKey={muscleKey} exercise={exercise}
          setNumber={setNumber} isConnecting={isConnecting}
          error={micError || (isError ? statusMessage || "Connection error" : null)}
          onStart={handleStartSet} onOpenSchedule={() => setScreen("schedule")}
        />
      )}
      {screen === "schedule" && (
        <ScheduleScreen
          schedule={schedule} todayIndex={todayIdx}
          weekData={weekData} onSave={handleSaveSchedule}
        />
      )}
      {screen === "active" && (
        <ActiveScreen
          muscle={muscle} exercise={exercise}
          isConnected={isConnected} isSpeaking={isSpeaking}
          setSeconds={setSeconds} onEndSet={handleEndSet}
          lastRating={lastRating}
        />
      )}
      {screen === "rest" && (
        <RestScreen
          restSeconds={restSeconds} setNumber={setNumber}
          lastRating={lastRating}
          onNextSet={() => { setLastRating(null); handleNextSet(); }}
          onFinish={handleFinishWorkout}
        />
      )}
      {screen === "history" && (
        <HistoryScreen onClose={() => setScreen("idle")} />
      )}
      {screen === "done" && (
        <DoneScreen muscle={muscle} weekData={weekData} lastRating={lastRating} onReset={handleReset} onHistory={() => setScreen("history")} />
      )}
    </div>
  );
}

// ─── Weekly Dots (header) ─────────────────────────────────────────────────────
function WeeklyDots({ weekData, todayIndex }) {
  const count = weekData.filter(Boolean).length;
  return (
    <div style={styles.dotsWrap}>
      <div style={styles.dotsRow}>
        {DAY_SHORT.map((d, i) => (
          <div key={i} style={styles.dotCol}>
            <div style={{
              ...styles.dot,
              background: weekData[i] ? "var(--green)" : i === todayIndex ? "#333" : "#1a1a1a",
              border: `1px solid ${i === todayIndex ? "#666" : "transparent"}`,
              boxShadow: weekData[i] ? "0 0 6px rgba(34,197,94,0.5)" : "none",
            }} />
            <span style={{ ...styles.dotLabel, color: i === todayIndex ? "#fff" : "var(--gray)" }}>{d}</span>
          </div>
        ))}
      </div>
      <span style={styles.dotCount}>{count} / 7 this week</span>
    </div>
  );
}

// ─── Schedule Screen ──────────────────────────────────────────────────────────
function ScheduleScreen({ schedule, todayIndex, weekData, onSave }) {
  const [draft, setDraft] = useState({ ...schedule });
  const [expandedDay, setExpandedDay] = useState(todayIndex); // open today by default

  function assignMuscle(dayIdx, key) {
    setDraft((d) => ({ ...d, [dayIdx]: key }));
    // Auto-advance to next day for fast setup
    if (dayIdx < 6) setExpandedDay(dayIdx + 1);
  }

  return (
    <div style={styles.scheduleScreen} className="animate-in">
      <p style={styles.scheduleTitle}>WEEKLY PLAN</p>
      <p style={styles.scheduleSub}>Tap a day, then choose your muscle group</p>

      <div style={styles.dayList}>
        {DAY_NAMES.map((name, i) => {
          const mKey = draft[i] || "rest";
          const m = MUSCLES[mKey];
          const isToday = i === todayIndex;
          const isExpanded = expandedDay === i;
          const trained = weekData[i];

          return (
            <div key={i} style={{ ...styles.dayCard, borderColor: isExpanded ? m.color + "88" : isToday ? "#333" : "#1e1e1e" }}>
              {/* Day row — click to expand */}
              <button
                style={styles.dayRow}
                onClick={() => setExpandedDay(isExpanded ? null : i)}
              >
                <div style={styles.dayLeft}>
                  {trained
                    ? <span style={styles.trainedBadge}>✓</span>
                    : isToday
                      ? <span style={styles.todayBadge}>TODAY</span>
                      : <span style={styles.dayNum}>{i + 1}</span>
                  }
                  <span style={{ ...styles.dayName, color: isToday ? "#fff" : "var(--gray-light)" }}>{name}</span>
                </div>
                <div style={styles.dayRight}>
                  <span style={{ ...styles.muscleTag, background: m.color + "22", color: m.color, border: `1px solid ${m.color}44` }}>
                    {m.emoji} {m.label}
                  </span>
                  <span style={{ color: isExpanded ? m.color : "var(--gray)", fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Muscle picker — shown when expanded */}
              {isExpanded && (
                <div style={styles.musclePickerWrap}>
                  {Object.entries(MUSCLES).map(([key, mu]) => (
                    <button
                      key={key}
                      onClick={() => assignMuscle(i, key)}
                      style={{
                        ...styles.pickPill,
                        background: mKey === key ? mu.color : "#1a1a1a",
                        color: mKey === key ? "#fff" : "var(--gray-light)",
                        border: `1px solid ${mKey === key ? mu.color : "#2a2a2a"}`,
                        boxShadow: mKey === key ? `0 0 10px ${mu.color}44` : "none",
                      }}
                    >
                      {mu.emoji} {mu.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        style={{ ...styles.saveBtn, background: MUSCLES[draft[todayIndex] || "rest"].color }}
        onClick={() => onSave(draft)}
      >
        SAVE SCHEDULE
      </button>
    </div>
  );
}

// ─── Idle Screen ──────────────────────────────────────────────────────────────
function IdleScreen({ muscle, muscleKey, exercise, setNumber, isConnecting, error, onStart, onOpenSchedule }) {
  const isRest = muscleKey === "rest";

  return (
    <div style={styles.screen} className="animate-in">
      <div style={{ ...styles.exerciseCard, borderColor: muscle.color + "44" }}>
        <p style={styles.exerciseLabel}>TODAY'S WORKOUT</p>
        {isRest ? (
          <>
            <h1 style={{ ...styles.exerciseName, color: muscle.color, fontSize: 48 }}>REST DAY</h1>
            <p style={styles.exerciseSub}>Recovery is part of the grind</p>
          </>
        ) : (
          <>
            <h1 style={{ ...styles.exerciseName, color: muscle.color }}>{exercise.toUpperCase()}</h1>
            <p style={styles.exerciseSub}>{muscle.reps} reps · {muscle.label} · Stay Hard</p>
          </>
        )}
      </div>

      {error && <div style={styles.errorBox}>⚠️ {error}</div>}

      <button
        style={{
          ...styles.startBtn,
          background: isRest ? "#333" : muscle.color,
          boxShadow: isRest ? "none" : `0 4px 24px ${muscle.color}55`,
          opacity: isConnecting ? 0.6 : 1,
        }}
        onClick={onStart}
        disabled={isConnecting}
      >
        {isConnecting ? "CONNECTING..." : isRest ? "TALK TO GOGGINS" : `START SET ${setNumber}`}
      </button>

      <button style={styles.planLink} onClick={onOpenSchedule}>
        📅 Edit weekly plan
      </button>

      <p style={styles.hint}>
        {isRest ? "Rest day — or talk to Goggins anyway." : `Tap · do your reps · say "Done" to finish`}
      </p>
    </div>
  );
}

// ─── Active Screen ────────────────────────────────────────────────────────────
function ActiveScreen({ muscle, exercise, isConnected, isSpeaking, setSeconds, onEndSet, lastRating }) {
  const mins = String(Math.floor(setSeconds / 60)).padStart(2, "0");
  const secs = String(setSeconds % 60).padStart(2, "0");
  return (
    <div style={{ ...styles.screen, position: "relative", overflow: "hidden" }} className="animate-in">
      {exercise && (
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 4, color: muscle.color }}>
          {exercise.toUpperCase()} · {muscle.label}
        </p>
      )}
      <div style={styles.orbContainer}>
        {isSpeaking && <div style={{ ...styles.orbRing, borderColor: muscle.color }} />}
        <div style={{
          ...styles.orb,
          background: isSpeaking
            ? `radial-gradient(circle at 40% 40%, ${muscle.color}cc, ${muscle.color})`
            : "radial-gradient(circle at 40% 40%, #444, #222)",
          boxShadow: isSpeaking ? `0 0 60px 20px ${muscle.color}55` : "0 0 20px 4px rgba(255,255,255,0.05)",
          animation: isSpeaking ? "pulse-red 1.5s infinite" : "none",
        }} />
        {isSpeaking && (
          <div style={styles.waveContainer}>
            {[0.2, 0.5, 0.1, 0.7, 0.3, 0.9, 0.4, 0.6, 0.2, 0.8].map((delay, i) => (
              <div key={i} style={{ ...styles.waveBar, background: muscle.color, animationDelay: `${delay}s`, animationDuration: `${0.6 + delay * 0.4}s` }} />
            ))}
          </div>
        )}
      </div>
      <div style={styles.modeLabel}>
        {!isConnected
          ? <span style={{ color: "var(--gray-light)", animation: "blink 1s infinite" }}>CONNECTING...</span>
          : isSpeaking
            ? <span style={{ color: muscle.color, fontWeight: 700 }}>GOGGINS IS PUSHING YOU</span>
            : <span style={{ color: "var(--gray-light)" }}>HE'S LISTENING...</span>
        }
      </div>
      <div style={styles.setTimer}>{mins}:{secs}</div>
      <p style={styles.activeHint}>Say <strong style={{ color: "var(--white)" }}>"Done"</strong> to end the set</p>
      <button style={styles.stopBtn} onClick={onEndSet}>END SET</button>

      {/* Rating overlay — appears the moment Goggins calls rateSet */}
      {lastRating && (
        <div style={styles.ratingOverlay} className="animate-in">
          <p style={styles.ratingOverlayEyebrow}>GOGGINS RATED THIS SET</p>
          <Stars rating={lastRating.rating} size={52} />
          <p style={styles.ratingOverlayScore}>
            {lastRating.rating >= 5 ? "PERFECT" : lastRating.rating >= 4 ? "STRONG" : lastRating.rating === 3 ? "SOLID" : "WEAK"}
          </p>
          {lastRating.comment ? (
            <p style={styles.ratingOverlayComment}>"{lastRating.comment}"</p>
          ) : null}
          <p style={styles.ratingOverlayHint}>Heading to rest...</p>
        </div>
      )}
    </div>
  );
}

// ─── Stars ────────────────────────────────────────────────────────────────────
function Stars({ rating, size = 18 }) {
  return (
    <span style={{ fontSize: size, letterSpacing: 2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= rating ? "#f59e0b" : "#333" }}>★</span>
      ))}
    </span>
  );
}

// ─── Rest Screen ──────────────────────────────────────────────────────────────
function RestScreen({ restSeconds, setNumber, lastRating, onNextSet, onFinish }) {
  return (
    <div style={styles.screen} className="animate-in">
      <p style={styles.restLabel}>REST</p>
      <div style={styles.restTimer}>
        <svg viewBox="0 0 120 120" style={styles.restSvg}>
          <circle cx="60" cy="60" r="54" style={styles.restTrack} />
          <circle cx="60" cy="60" r="54" style={{ ...styles.restProgress, strokeDashoffset: 339.3 * (restSeconds / REST_SECONDS) }} />
        </svg>
        <span style={styles.restNumber}>{restSeconds}</span>
      </div>

      {lastRating && (
        <div style={styles.ratingCard}>
          <p style={styles.ratingLabel}>GOGGINS RATED THIS SET</p>
          <Stars rating={lastRating.rating} size={24} />
          <p style={styles.ratingComment}>"{lastRating.comment}"</p>
        </div>
      )}

      <p style={styles.restSub}>{restSeconds === 0 ? "Ready to go again?" : "Recover. Breathe. Focus."}</p>
      <div style={styles.restActions}>
        <button style={styles.nextBtn} onClick={onNextSet}>SET {setNumber + 1} →</button>
        <button style={styles.finishBtn} onClick={onFinish}>FINISH WORKOUT</button>
      </div>
    </div>
  );
}

// ─── History Screen ───────────────────────────────────────────────────────────
function HistoryScreen({ onClose }) {
  const history = loadHistory();
  const avgRating = history.length
    ? (history.reduce((s, r) => s + r.rating, 0) / history.length).toFixed(1)
    : "—";

  // Group by date
  const grouped = history.reduce((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});

  const ratingColor = (r) => r >= 4 ? "var(--green)" : r === 3 ? "#f59e0b" : "var(--red)";

  return (
    <div style={styles.historyScreen} className="animate-in">
      <div style={styles.historyHeader}>
        <p style={styles.scheduleTitle}>PERFORMANCE</p>
        <div style={styles.historyStats}>
          <div style={styles.hStat}>
            <span style={{ ...styles.hStatNum, color: "#f59e0b" }}>{avgRating}</span>
            <span style={styles.hStatLabel}>AVG RATING</span>
          </div>
          <div style={styles.hStatDiv} />
          <div style={styles.hStat}>
            <span style={{ ...styles.hStatNum, color: "var(--white)" }}>{history.length}</span>
            <span style={styles.hStatLabel}>TOTAL SETS</span>
          </div>
          <div style={styles.hStatDiv} />
          <div style={styles.hStat}>
            <span style={{ ...styles.hStatNum, color: "var(--green)" }}>
              {history.filter(r => r.rating >= 4).length}
            </span>
            <span style={styles.hStatLabel}>GREAT SETS</span>
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <p style={{ color: "var(--gray)", fontSize: 14, marginTop: 32 }}>No sets recorded yet. Start training!</p>
      ) : (
        <div style={styles.historyList}>
          {Object.entries(grouped).map(([date, sets]) => (
            <div key={date}>
              <p style={styles.historyDate}>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
              {sets.map((r) => (
                <div key={r.id} style={styles.historyRow}>
                  <div style={styles.historyLeft}>
                    <span style={{ ...styles.historyMuscle, color: MUSCLES[r.muscleKey]?.color || "var(--white)" }}>
                      {MUSCLES[r.muscleKey]?.emoji} {r.muscleKey?.toUpperCase()}
                    </span>
                    <span style={styles.historyExercise}>{r.exercise} · Set {r.setNum}</span>
                    {r.comment ? <span style={styles.historyQuote}>"{r.comment}"</span> : null}
                  </div>
                  <div style={styles.historyRight}>
                    <Stars rating={r.rating} size={14} />
                    <span style={{ ...styles.historyDuration, color: ratingColor(r.rating) }}>
                      {r.rating >= 4 ? "GREAT" : r.rating === 3 ? "SOLID" : "WEAK"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Done Screen ──────────────────────────────────────────────────────────────
function DoneScreen({ muscle, weekData, lastRating, onReset, onHistory }) {
  const trained = weekData.filter(Boolean).length;
  const history = loadHistory();
  const avgRating = history.length
    ? (history.reduce((s, r) => s + r.rating, 0) / history.length).toFixed(1)
    : null;

  return (
    <div style={{ ...styles.screen, gap: 20 }} className="animate-in">
      <p style={{ fontSize: 52 }}>💪</p>
      <h2 style={styles.doneTitle}>WORKOUT COMPLETE</h2>

      {lastRating && (
        <div style={styles.ratingCard}>
          <p style={styles.ratingLabel}>FINAL RATING</p>
          <Stars rating={lastRating.rating} size={26} />
          <p style={styles.ratingComment}>"{lastRating.comment}"</p>
        </div>
      )}

      <div style={styles.doneStats}>
        <div style={styles.doneStat}>
          <span style={{ ...styles.doneStatNum, color: muscle.color }}>{muscle.label}</span>
          <span style={styles.doneStatLabel}>TODAY</span>
        </div>
        <div style={styles.doneStatDivider} />
        <div style={styles.doneStat}>
          <span style={{ ...styles.doneStatNum, color: "var(--green)" }}>{trained}</span>
          <span style={styles.doneStatLabel}>THIS WEEK</span>
        </div>
        {avgRating && <>
          <div style={styles.doneStatDivider} />
          <div style={styles.doneStat}>
            <span style={{ ...styles.doneStatNum, color: "#f59e0b" }}>{avgRating}★</span>
            <span style={styles.doneStatLabel}>AVG RATING</span>
          </div>
        </>}
      </div>

      <button style={{ ...styles.startBtn, background: muscle.color }} onClick={onReset}>NEW WORKOUT</button>
      <button style={styles.planLink} onClick={onHistory}>📊 View performance history</button>
    </div>
  );
}

// ─── Missing Agent ID ─────────────────────────────────────────────────────────
function MissingAgentId() {
  return (
    <div style={{ ...styles.root, justifyContent: "center", alignItems: "center", padding: 32, textAlign: "center" }}>
      <h2 style={{ color: "var(--red)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, marginBottom: 16 }}>AGENT ID MISSING</h2>
      <pre style={styles.codeBlock}>VITE_AGENT_ID=your_elevenlabs_agent_id</pre>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" },

  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #1e1e1e" },
  logo: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 3, color: "var(--red)" },
  setLabel: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 2, color: "var(--gray-light)", minWidth: 48, textAlign: "right" },
  headerBtn: { background: "none", color: "var(--gray-light)", fontSize: 15, padding: "2px 6px", borderRadius: 6, border: "1px solid #2a2a2a", cursor: "pointer" },

  // Dots
  dotsWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  dotsRow: { display: "flex", gap: 5 },
  dotCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  dot: { width: 9, height: 9, borderRadius: "50%", transition: "all 0.3s" },
  dotLabel: { fontSize: 8, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 },
  dotCount: { fontSize: 9, color: "var(--gray)", letterSpacing: 1, fontFamily: "'Bebas Neue', sans-serif" },

  screen: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: "32px 20px" },

  exerciseCard: { textAlign: "center", background: "#111", border: "1px solid #222", borderRadius: 16, padding: "24px 40px", width: "100%", maxWidth: 380, transition: "border-color 0.3s" },
  exerciseLabel: { fontSize: 10, letterSpacing: 4, color: "var(--gray)", marginBottom: 8 },
  exerciseName: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 4, lineHeight: 1, marginBottom: 8, transition: "color 0.3s" },
  exerciseSub: { fontSize: 13, color: "var(--gray-light)", letterSpacing: 1 },

  errorBox: { background: "rgba(230,50,50,0.1)", border: "1px solid var(--red)", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#ff9999", maxWidth: 380, textAlign: "center" },
  startBtn: { color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 4, padding: "18px 56px", borderRadius: 12, width: "100%", maxWidth: 380, transition: "all 0.2s" },
  planLink: { background: "none", color: "var(--gray)", fontSize: 13, cursor: "pointer", letterSpacing: 0.5, padding: 4, border: "none" },
  hint: { fontSize: 12, color: "var(--gray)", textAlign: "center", lineHeight: 1.8 },

  // Schedule screen
  scheduleScreen: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "24px 16px", overflowY: "auto" },
  scheduleTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 5, color: "var(--white)" },
  scheduleSub: { fontSize: 12, color: "var(--gray-light)", letterSpacing: 0.5, marginTop: -8, textAlign: "center" },

  dayList: { display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 420 },
  dayCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s" },
  dayRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "none", cursor: "pointer", width: "100%", border: "none" },
  dayLeft: { display: "flex", alignItems: "center", gap: 12 },
  dayRight: { display: "flex", alignItems: "center", gap: 10 },
  dayNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: "var(--gray)", width: 18, textAlign: "center" },
  dayName: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 2 },
  todayBadge: { fontSize: 9, background: "var(--red)", color: "#fff", padding: "2px 5px", borderRadius: 4, letterSpacing: 1, fontFamily: "'Bebas Neue', sans-serif" },
  trainedBadge: { fontSize: 12, color: "var(--green)", width: 18, textAlign: "center" },
  muscleTag: { fontSize: 11, padding: "4px 10px", borderRadius: 20, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 },

  musclePickerWrap: { display: "flex", flexWrap: "wrap", gap: 7, padding: "0 14px 14px 14px" },
  pickPill: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: 1, padding: "6px 12px", borderRadius: 20, cursor: "pointer", transition: "all 0.15s" },

  saveBtn: { color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 4, padding: "16px", borderRadius: 12, width: "100%", maxWidth: 420, marginTop: 4 },

  // Active screen
  orbContainer: { position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" },
  orb: { width: 120, height: 120, borderRadius: "50%", transition: "background 0.3s, box-shadow 0.3s", zIndex: 1 },
  orbRing: { position: "absolute", width: 120, height: 120, borderRadius: "50%", border: "2px solid", animation: "pulse-ring 1.5s infinite", zIndex: 0 },
  waveContainer: { position: "absolute", bottom: -24, display: "flex", alignItems: "flex-end", gap: 3, height: 48 },
  waveBar: { width: 4, borderRadius: 4, minHeight: 8, animation: "wave 0.8s ease-in-out infinite alternate" },
  modeLabel: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 3, marginTop: 16, textAlign: "center" },
  setTimer: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, letterSpacing: 4, color: "var(--white)", lineHeight: 1 },
  activeHint: { fontSize: 14, color: "var(--gray)" },
  stopBtn: { background: "transparent", color: "var(--gray)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 3, padding: "10px 24px", borderRadius: 8, border: "1px solid #333", marginTop: 8 },

  // Rest screen
  restLabel: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 6, color: "var(--green)" },
  restTimer: { position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" },
  restSvg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" },
  restTrack: { fill: "none", stroke: "#1e1e1e", strokeWidth: 6 },
  restProgress: { fill: "none", stroke: "var(--green)", strokeWidth: 6, strokeDasharray: "339.3", transition: "stroke-dashoffset 1s linear", strokeLinecap: "round" },
  restNumber: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 64, color: "var(--white)", zIndex: 1 },
  restSub: { fontSize: 14, color: "var(--gray-light)", letterSpacing: 1 },
  restActions: { display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 380 },
  nextBtn: { background: "var(--green)", color: "#000", fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 4, padding: "16px", borderRadius: 12 },
  finishBtn: { background: "transparent", color: "var(--gray-light)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 3, padding: "12px", borderRadius: 8, border: "1px solid #333" },

  // Done screen
  doneTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 4, textAlign: "center" },
  doneSub: { fontSize: 14, color: "var(--gray-light)", textAlign: "center", fontStyle: "italic" },
  doneStats: { display: "flex", alignItems: "center", background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden", width: "100%", maxWidth: 340 },
  doneStat: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 12px", gap: 4 },
  doneStatNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, lineHeight: 1 },
  doneStatLabel: { fontSize: 9, letterSpacing: 2, color: "var(--gray)" },
  doneStatDivider: { width: 1, height: 48, background: "#222" },

  codeBlock: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "14px 20px", fontSize: 14, color: "var(--green)", fontFamily: "monospace" },

  // Rating overlay (full-screen, appears on ActiveScreen when set is rated)
  ratingOverlay: {
    position: "absolute", inset: 0,
    background: "rgba(0,0,0,0.92)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 16, padding: 32, zIndex: 10,
    backdropFilter: "blur(6px)",
  },
  ratingOverlayEyebrow: {
    fontSize: 10, letterSpacing: 5, color: "var(--gray)", fontFamily: "'Bebas Neue', sans-serif",
  },
  ratingOverlayScore: {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 6, color: "#f59e0b", lineHeight: 1,
  },
  ratingOverlayComment: {
    fontSize: 16, color: "var(--white)", fontStyle: "italic", textAlign: "center",
    lineHeight: 1.5, maxWidth: 300, marginTop: 4,
  },
  ratingOverlayHint: {
    fontSize: 11, color: "var(--gray)", letterSpacing: 2, marginTop: 8,
    fontFamily: "'Bebas Neue', sans-serif",
  },

  // Rating card
  ratingCard: {
    background: "#111", border: "1px solid #f59e0b33", borderRadius: 12,
    padding: "16px 24px", textAlign: "center", width: "100%", maxWidth: 380,
  },
  ratingLabel: { fontSize: 9, letterSpacing: 4, color: "var(--gray)", marginBottom: 8, fontFamily: "'Bebas Neue', sans-serif" },
  ratingComment: { fontSize: 13, color: "var(--gray-light)", fontStyle: "italic", marginTop: 8, lineHeight: 1.5 },

  // History screen
  historyScreen: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "20px 16px", overflowY: "auto" },
  historyHeader: { width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  historyStats: { display: "flex", alignItems: "center", background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden", width: "100%" },
  hStat: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 8px", gap: 3 },
  hStatNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2, lineHeight: 1 },
  hStatLabel: { fontSize: 8, letterSpacing: 2, color: "var(--gray)" },
  hStatDiv: { width: 1, height: 40, background: "#222" },

  historyList: { display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 420 },
  historyDate: { fontSize: 10, letterSpacing: 3, color: "var(--gray)", fontFamily: "'Bebas Neue', sans-serif", marginTop: 8, marginBottom: 4 },
  historyRow: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "12px 14px",
  },
  historyLeft: { display: "flex", flexDirection: "column", gap: 3, flex: 1 },
  historyMuscle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 2 },
  historyExercise: { fontSize: 12, color: "var(--gray-light)" },
  historyQuote: { fontSize: 11, color: "var(--gray)", fontStyle: "italic", marginTop: 2 },
  historyRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 60 },
  historyDuration: { fontSize: 9, letterSpacing: 1, fontFamily: "'Bebas Neue', sans-serif" },
};

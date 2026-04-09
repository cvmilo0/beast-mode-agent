import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
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
  chest:     { label: "CHEST",     emoji: "🫁", color: "#ef4444", exercises: ["Push-ups", "Bench Press", "Dips"],                  reps: 12 },
  back:      { label: "BACK",      emoji: "🔝", color: "#3b82f6", exercises: ["Pull-ups", "Bent-over Rows", "Lat Pulldown"],        reps: 10 },
  legs:      { label: "LEGS",      emoji: "🦵", color: "#22c55e", exercises: ["Squats", "Lunges", "Romanian Deadlift"],             reps: 15 },
  shoulders: { label: "SHOULDERS", emoji: "🏋️", color: "#f97316", exercises: ["Overhead Press", "Lateral Raises", "Face Pulls"],   reps: 12 },
  arms:      { label: "ARMS",      emoji: "💪", color: "#8b5cf6", exercises: ["Bicep Curls", "Tricep Dips", "Hammer Curls"],        reps: 12 },
  fullbody:  { label: "FULL BODY", emoji: "⚡", color: "#ef4444", exercises: ["Burpees", "Thrusters", "Mountain Climbers"],         reps: 10 },
  rest:      { label: "REST",      emoji: "😴", color: "#444444", exercises: [],                                                    reps: 0  },
};

const DAY_NAMES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const DAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

// ─── Schedule (localStorage) ──────────────────────────────────────────────────
const DEFAULT_SCHEDULE = { 0: "chest", 1: "back", 2: "legs", 3: "shoulders", 4: "arms", 5: "fullbody", 6: "rest" };
function loadSchedule() {
  try { return JSON.parse(localStorage.getItem("beast_schedule")) || DEFAULT_SCHEDULE; }
  catch { return DEFAULT_SCHEDULE; }
}
function saveSchedule(s) { localStorage.setItem("beast_schedule", JSON.stringify(s)); }

// ─── Weekly Tracker (localStorage) ───────────────────────────────────────────
function getWeekKey() {
  const d = new Date(); const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const y = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-W${Math.ceil(((d - y) / 86400000 + 1) / 7)}`;
}
function getTodayIndex() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
function loadWeekData() {
  try { const s = JSON.parse(localStorage.getItem("beast_week") || "{}"); if (s.week === getWeekKey()) return s.trained; }
  catch {}
  return Array(7).fill(false);
}
function markTodayTrained() {
  const t = loadWeekData(); t[getTodayIndex()] = true;
  localStorage.setItem("beast_week", JSON.stringify({ week: getWeekKey(), trained: t }));
}

// ─── Set History (localStorage) ──────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem("beast_history") || "[]"); }
  catch { return []; }
}
function saveSetRecord(record) {
  const history = loadHistory();
  history.unshift(record);
  if (history.length > 200) history.splice(200);
  localStorage.setItem("beast_history", JSON.stringify(history));
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function fireConfetti() {
  const fire = (angle, origin) => confetti({
    particleCount: 60, spread: 55, angle, origin,
    colors: ["#ef4444", "#f97316", "#facc15", "#22c55e", "#ffffff"],
    startVelocity: 45, gravity: 0.9, ticks: 200,
  });
  fire(60,  { x: 0,   y: 0.7 });
  fire(120, { x: 1,   y: 0.7 });
  fire(90,  { x: 0.5, y: 0.6 });
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
  const [schedule, setSchedule]   = useState(loadSchedule);
  const [weekData, setWeekData]   = useState(loadWeekData);
  const [screen, setScreen]       = useState("idle");
  const [setNumber, setSetNumber] = useState(1);
  const [restSeconds, setRestSeconds] = useState(REST_SECONDS);
  const [setSeconds, setSetSeconds]   = useState(0);
  const [micError, setMicError]   = useState(null);
  const [lastRating, setLastRating] = useState(null);
  const setSecondsRef  = useRef(0);
  const restTimerRef   = useRef(null);
  const setTimerRef    = useRef(null);

  const isConnected  = status === "connected";
  const isConnecting = status === "connecting";
  const isError      = status === "error";

  const muscleKey = schedule[todayIdx] || "fullbody";
  const muscle    = MUSCLES[muscleKey];
  const exercise  = muscle.exercises[0] || "";

  useConversationClientTool("rateSet", ({ rating, comment }) => {
    const record = {
      id: Date.now(),
      date: new Date().toLocaleDateString("en-CA"),
      muscleKey, exercise,
      rating: Math.min(5, Math.max(1, parseInt(rating) || 3)),
      comment: comment || "",
      duration: setSecondsRef.current,
      setNum: setNumber,
    };
    saveSetRecord(record);
    setLastRating({ rating: record.rating, comment: record.comment });
    setTimeout(async () => {
      try { await endSession(); } catch {}
      setScreen("rest");
    }, 3000);
    return "Rating saved.";
  });

  useEffect(() => {
    if (screen === "active") {
      setSetSeconds(0); setSecondsRef.current = 0;
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
    saveSchedule(newSchedule); setSchedule(newSchedule); setScreen("idle");
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
              : `${muscle.label} DAY! ${setNumber > 1 ? `Set ${setNumber}.` : ""} We're doing ${exercise}. ${muscle.reps} reps. Let's go — NOW.`,
          },
        },
        onConnect: () => console.log("Beast Buddy connected"),
        onError: (msg) => { console.error(msg); setMicError(`Error: ${msg}`); },
      });
      setScreen("active");
    } catch (err) { setMicError(`Failed to connect: ${err.message}`); }
  }
  async function handleEndSet() { await endSession(); setScreen("rest"); }
  function handleNextSet()       { setSetNumber((n) => n + 1); setScreen("idle"); }
  function handleFinishWorkout() {
    markTodayTrained(); setWeekData(loadWeekData());
    setSetNumber(1); fireConfetti(); setScreen("done");
  }
  function handleReset() { setSetNumber(1); setScreen("idle"); }

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={S.logo}>BEAST BUDDY</span>
          {(screen === "idle" || screen === "schedule" || screen === "history") && (<>
            <button style={S.headerBtn} onClick={() => setScreen(screen === "schedule" ? "idle" : "schedule")} title="Weekly Plan">
              {screen === "schedule" ? "✕" : "📅"}
            </button>
            <button style={S.headerBtn} onClick={() => setScreen(screen === "history" ? "idle" : "history")} title="History">
              {screen === "history" ? "✕" : "📊"}
            </button>
          </>)}
        </div>
        <WeeklyDots weekData={weekData} todayIndex={todayIdx} />
        <span style={S.setLabel}>
          {screen === "schedule" ? "PLAN" : screen === "history" ? "STATS" : `SET ${setNumber}`}
        </span>
      </header>

      {screen === "idle"     && <IdleScreen muscle={muscle} muscleKey={muscleKey} exercise={exercise} setNumber={setNumber} isConnecting={isConnecting} error={micError || (isError ? statusMessage || "Connection error" : null)} onStart={handleStartSet} onOpenSchedule={() => setScreen("schedule")} />}
      {screen === "schedule" && <ScheduleScreen schedule={schedule} todayIndex={todayIdx} weekData={weekData} onSave={handleSaveSchedule} />}
      {screen === "active"   && <ActiveScreen muscle={muscle} exercise={exercise} isConnected={isConnected} isSpeaking={isSpeaking} setSeconds={setSeconds} onEndSet={handleEndSet} lastRating={lastRating} />}
      {screen === "rest"     && <RestScreen restSeconds={restSeconds} setNumber={setNumber} lastRating={lastRating} onNextSet={() => { setLastRating(null); handleNextSet(); }} onFinish={handleFinishWorkout} muscle={muscle} />}
      {screen === "history"  && <HistoryScreen onClose={() => setScreen("idle")} />}
      {screen === "done"     && <DoneScreen muscle={muscle} weekData={weekData} lastRating={lastRating} onReset={handleReset} onHistory={() => setScreen("history")} />}
    </div>
  );
}

// ─── Weekly Dots ──────────────────────────────────────────────────────────────
function WeeklyDots({ weekData, todayIndex }) {
  const count = weekData.filter(Boolean).length;
  return (
    <div style={S.dotsWrap}>
      <div style={S.dotsRow}>
        {DAY_SHORT.map((d, i) => (
          <div key={i} style={S.dotCol}>
            <div style={{
              ...S.dot,
              background: weekData[i] ? "var(--green)" : i === todayIndex ? "#2a2a2a" : "#141414",
              border: `1px solid ${i === todayIndex ? "#444" : "transparent"}`,
              boxShadow: weekData[i] ? "0 0 8px rgba(34,197,94,0.7)" : "none",
            }} />
            <span style={{ ...S.dotLabel, color: i === todayIndex ? "#fff" : "var(--gray)" }}>{d}</span>
          </div>
        ))}
      </div>
      <span style={S.dotCount}>{count}/7 this week</span>
    </div>
  );
}

// ─── Schedule Screen ──────────────────────────────────────────────────────────
function ScheduleScreen({ schedule, todayIndex, weekData, onSave }) {
  const [draft, setDraft] = useState({ ...schedule });
  const [expandedDay, setExpandedDay] = useState(todayIndex);

  function assignMuscle(dayIdx, key) {
    setDraft((d) => ({ ...d, [dayIdx]: key }));
    if (dayIdx < 6) setExpandedDay(dayIdx + 1);
  }

  return (
    <div style={S.scheduleScreen} className="animate-in">
      <p style={S.pageTitle}>WEEKLY PLAN</p>
      <p style={S.pageSub}>Tap a day, then choose your muscle group</p>
      <div style={S.dayList}>
        {DAY_NAMES.map((name, i) => {
          const mKey = draft[i] || "rest";
          const m = MUSCLES[mKey];
          const isToday = i === todayIndex;
          const isExpanded = expandedDay === i;
          const trained = weekData[i];
          return (
            <div key={i} style={{ ...S.dayCard, borderColor: isExpanded ? m.color + "88" : isToday ? "#2a2a2a" : "#1a1a1a" }}>
              <button style={S.dayRow} onClick={() => setExpandedDay(isExpanded ? null : i)}>
                <div style={S.dayLeft}>
                  {trained
                    ? <span style={S.trainedBadge}>✓</span>
                    : isToday
                      ? <span style={S.todayBadge}>TODAY</span>
                      : <span style={S.dayNum}>{i + 1}</span>}
                  <span style={{ ...S.dayName, color: isToday ? "#fff" : "var(--gray-light)" }}>{name}</span>
                </div>
                <div style={S.dayRight}>
                  <span style={{ ...S.muscleTag, background: m.color + "22", color: m.color, border: `1px solid ${m.color}44` }}>
                    {m.emoji} {m.label}
                  </span>
                  <span style={{ color: isExpanded ? m.color : "var(--gray)", fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>
              {isExpanded && (
                <div style={S.musclePickerWrap}>
                  {Object.entries(MUSCLES).map(([key, mu]) => (
                    <button key={key} onClick={() => assignMuscle(i, key)} style={{
                      ...S.pickPill,
                      background: mKey === key ? mu.color : "#1a1a1a",
                      color: mKey === key ? "#fff" : "var(--gray-light)",
                      border: `1px solid ${mKey === key ? mu.color : "#252525"}`,
                      boxShadow: mKey === key ? `0 0 12px ${mu.color}55` : "none",
                    }}>
                      {mu.emoji} {mu.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button style={{ ...S.primaryBtn, background: MUSCLES[draft[todayIndex] || "rest"].color, boxShadow: `0 4px 24px ${MUSCLES[draft[todayIndex] || "rest"].color}55` }} onClick={() => onSave(draft)}>
        SAVE SCHEDULE
      </button>
    </div>
  );
}

// ─── Idle Screen ──────────────────────────────────────────────────────────────
function IdleScreen({ muscle, muscleKey, exercise, setNumber, isConnecting, error, onStart, onOpenSchedule }) {
  const isRest = muscleKey === "rest";
  return (
    <div style={S.screen} className="animate-in">
      {/* Big exercise card */}
      <div style={{ ...S.exerciseCard, borderColor: muscle.color + "55", boxShadow: `0 0 40px ${muscle.color}18` }}>
        <p style={S.exerciseLabel}>TODAY'S WORKOUT</p>
        {isRest ? (
          <>
            <h1 style={{ ...S.exerciseName, color: muscle.color, fontSize: 52 }}>REST DAY</h1>
            <p style={S.exerciseSub}>Recovery is part of the grind</p>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 36 }}>{muscle.emoji}</span>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 4, color: muscle.color }}>{muscle.label}</span>
            </div>
            <h1 style={{ ...S.exerciseName, color: "#fff" }}>{exercise.toUpperCase()}</h1>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 10 }}>
              <span style={{ ...S.statPill, background: muscle.color + "22", color: muscle.color, border: `1px solid ${muscle.color}44` }}>
                {muscle.reps} REPS
              </span>
              <span style={{ ...S.statPill, background: "#1a1a1a", color: "var(--gray-light)", border: "1px solid #252525" }}>
                SET {setNumber}
              </span>
            </div>
          </>
        )}
      </div>

      {error && <div style={S.errorBox}>⚠️ {error}</div>}

      <button
        style={{
          ...S.primaryBtn,
          background: isRest ? "#222" : `linear-gradient(135deg, ${muscle.color}, ${muscle.color}cc)`,
          boxShadow: isRest ? "none" : `0 6px 32px ${muscle.color}55`,
          opacity: isConnecting ? 0.55 : 1,
          fontSize: 28,
          letterSpacing: 5,
          padding: "20px 56px",
        }}
        onClick={onStart}
        disabled={isConnecting}
      >
        {isConnecting
          ? <span style={{ animation: "blink 1s infinite" }}>CONNECTING...</span>
          : isRest ? "TALK TO BEAST BUDDY" : `START SET ${setNumber}`}
      </button>

      <button style={S.ghostBtn} onClick={onOpenSchedule}>📅 Edit weekly plan</button>
      <p style={S.hint}>{isRest ? "Rest day — or talk to Beast Buddy anyway." : `Tap · do your reps · say "Done" to finish`}</p>
    </div>
  );
}

// ─── Active Screen ────────────────────────────────────────────────────────────
function ActiveScreen({ muscle, exercise, isConnected, isSpeaking, setSeconds, onEndSet, lastRating }) {
  const mins = String(Math.floor(setSeconds / 60)).padStart(2, "0");
  const secs = String(setSeconds % 60).padStart(2, "0");
  return (
    <div style={{ ...S.screen, position: "relative", overflow: "hidden" }} className="animate-in">
      {exercise && (
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: 5, color: muscle.color, opacity: 0.85 }}>
          {exercise.toUpperCase()} · {muscle.label}
        </p>
      )}

      {/* Orb / Beast image */}
      <div style={S.orbContainer}>
        {isSpeaking && <div style={{ ...S.orbRing, borderColor: muscle.color }} />}
        {isSpeaking && <div style={{ ...S.orbRing2, borderColor: muscle.color }} />}
        {isSpeaking ? (
          <img
            src="/beast.jpeg"
            alt="Beast Buddy"
            style={{
              ...S.orb,
              objectFit: "cover",
              objectPosition: "center top",
              boxShadow: `0 0 80px 24px ${muscle.color}55`,
              animation: "pulse-red 1.8s ease-in-out infinite",
              border: `3px solid ${muscle.color}`,
            }}
          />
        ) : (
          <div style={{
            ...S.orb,
            background: "radial-gradient(circle at 38% 35%, #2a2a2a, #111)",
            boxShadow: "0 0 20px 4px rgba(255,255,255,0.04)",
          }} />
        )}
        {isSpeaking && (
          <div style={S.waveContainer}>
            {[0.2, 0.5, 0.1, 0.7, 0.3, 0.9, 0.4, 0.6, 0.2, 0.8, 0.35, 0.65].map((delay, i) => (
              <div key={i} style={{ ...S.waveBar, background: muscle.color, animationDelay: `${delay}s`, animationDuration: `${0.5 + delay * 0.5}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* Status */}
      <div style={S.modeLabel}>
        {!isConnected
          ? <span style={{ color: "var(--gray-light)", animation: "blink 1s infinite" }}>CONNECTING...</span>
          : isSpeaking
            ? <span style={{ color: muscle.color, fontWeight: 800, textShadow: `0 0 20px ${muscle.color}88` }}>BEAST BUDDY IS PUSHING YOU</span>
            : <span style={{ color: "var(--gray-light)" }}>HE'S LISTENING...</span>}
      </div>

      {/* Timer */}
      <div style={S.setTimer}>{mins}:{secs}</div>
      <p style={S.activeHint}>Say <strong style={{ color: "var(--white)" }}>"Done"</strong> to end the set</p>
      <button style={S.stopBtn} onClick={onEndSet}>END SET</button>

      {/* Rating overlay */}
      {lastRating && (
        <div style={S.ratingOverlay} className="animate-in">
          <p style={S.ratingOverlayEyebrow}>BEAST BUDDY RATED THIS SET</p>
          <div className="rating-pop">
            <Stars rating={lastRating.rating} size={56} />
          </div>
          <p style={{
            ...S.ratingOverlayScore,
            color: lastRating.rating >= 5 ? "var(--gold)" : lastRating.rating >= 4 ? "var(--green)" : lastRating.rating === 3 ? "var(--orange)" : "var(--red)",
            textShadow: lastRating.rating >= 4 ? `0 0 30px ${lastRating.rating >= 5 ? "var(--gold-glow)" : "var(--green-glow)"}` : "none",
          }}>
            {lastRating.rating >= 5 ? "PERFECT" : lastRating.rating >= 4 ? "STRONG" : lastRating.rating === 3 ? "SOLID" : "WEAK"}
          </p>
          {lastRating.comment && <p style={S.ratingOverlayComment}>"{lastRating.comment}"</p>}
          <p style={S.ratingOverlayHint}>Heading to rest...</p>
        </div>
      )}
    </div>
  );
}

// ─── Stars ────────────────────────────────────────────────────────────────────
function Stars({ rating, size = 18 }) {
  return (
    <span style={{ fontSize: size, letterSpacing: size > 24 ? 4 : 1, display: "inline-block" }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{
          color: i <= rating ? "var(--gold)" : "#252525",
          textShadow: i <= rating && size > 24 ? "0 0 16px var(--gold-glow)" : "none",
          transition: "color 0.2s",
        }}>★</span>
      ))}
    </span>
  );
}

// ─── Rest Screen ──────────────────────────────────────────────────────────────
function RestScreen({ restSeconds, setNumber, lastRating, onNextSet, onFinish, muscle }) {
  const fraction = restSeconds / REST_SECONDS;
  const circumference = 2 * Math.PI * 58; // r=58
  const strokeDash = circumference * fraction;

  return (
    <div style={S.screen} className="animate-in">
      <p style={S.restLabel}>REST</p>

      {/* Big glowing circle timer */}
      <div style={S.restTimerWrap}>
        {/* Glow halo */}
        <div style={{
          position: "absolute", inset: -12,
          borderRadius: "50%",
          boxShadow: `0 0 60px 16px var(--green-glow)`,
          opacity: 0.5 + fraction * 0.5,
          animation: "glow-pulse 2s ease-in-out infinite",
        }} />
        <svg viewBox="0 0 140 140" style={S.restSvg}>
          {/* Track */}
          <circle cx="70" cy="70" r="58" fill="none" stroke="#1a1a1a" strokeWidth="6" />
          {/* Ticks */}
          {Array.from({ length: 30 }).map((_, i) => {
            const angle = (i / 30) * 360 - 90;
            const rad = angle * Math.PI / 180;
            const inner = 52, outer = 57;
            return (
              <line key={i}
                x1={70 + inner * Math.cos(rad)} y1={70 + inner * Math.sin(rad)}
                x2={70 + outer * Math.cos(rad)} y2={70 + outer * Math.sin(rad)}
                stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round"
              />
            );
          })}
          {/* Progress arc */}
          <circle cx="70" cy="70" r="58"
            fill="none"
            stroke="var(--green)"
            strokeWidth="5"
            strokeDasharray={`${strokeDash} ${circumference}`}
            strokeDashoffset="0"
            strokeLinecap="round"
            transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dasharray 1s linear", filter: "drop-shadow(0 0 8px var(--green))" }}
          />
        </svg>
        <div style={S.restTimerInner}>
          <span style={S.restNumber}>{restSeconds}</span>
          <span style={S.restUnit}>sec</span>
        </div>
      </div>

      {/* Rating card */}
      {lastRating && (
        <div style={S.ratingCard} className="slide-up">
          <p style={S.ratingLabel}>BEAST BUDDY RATED THIS SET</p>
          <Stars rating={lastRating.rating} size={22} />
          {lastRating.comment && <p style={S.ratingComment}>"{lastRating.comment}"</p>}
        </div>
      )}

      <p style={{ fontSize: 13, color: restSeconds === 0 ? "var(--white)" : "var(--gray-light)", letterSpacing: 1, fontFamily: "'Bebas Neue', sans-serif" }}>
        {restSeconds === 0 ? "READY TO GO AGAIN?" : "RECOVER. BREATHE. FOCUS."}
      </p>

      <div style={S.restActions}>
        <button
          style={{
            ...S.primaryBtn,
            background: restSeconds === 0 ? "var(--green)" : "#1a2e1a",
            color: restSeconds === 0 ? "#000" : "var(--green)",
            border: `1px solid var(--green)`,
            boxShadow: restSeconds === 0 ? "0 4px 32px var(--green-glow)" : "none",
            transition: "all 0.4s",
          }}
          onClick={onNextSet}
        >
          SET {setNumber + 1} →
        </button>
        <button style={S.ghostBtn} onClick={onFinish}>FINISH WORKOUT</button>
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
  const grouped = history.reduce((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});
  const ratingColor = (r) => r >= 4 ? "var(--green)" : r === 3 ? "var(--gold)" : "var(--red)";

  return (
    <div style={S.historyScreen} className="animate-in">
      <div style={S.historyHeader}>
        <p style={S.pageTitle}>PERFORMANCE</p>
        <div style={S.historyStats}>
          <div style={S.hStat}>
            <span style={{ ...S.hStatNum, color: "var(--gold)" }}>{avgRating}</span>
            <span style={S.hStatLabel}>AVG RATING</span>
          </div>
          <div style={S.hStatDiv} />
          <div style={S.hStat}>
            <span style={{ ...S.hStatNum, color: "var(--white)" }}>{history.length}</span>
            <span style={S.hStatLabel}>TOTAL SETS</span>
          </div>
          <div style={S.hStatDiv} />
          <div style={S.hStat}>
            <span style={{ ...S.hStatNum, color: "var(--green)" }}>{history.filter(r => r.rating >= 4).length}</span>
            <span style={S.hStatLabel}>GREAT SETS</span>
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <p style={{ color: "var(--gray)", fontSize: 14, marginTop: 32 }}>No sets recorded yet. Start training!</p>
      ) : (
        <div style={S.historyList}>
          {Object.entries(grouped).map(([date, sets]) => (
            <div key={date}>
              <p style={S.historyDate}>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
              {sets.map((r) => (
                <div key={r.id} style={{ ...S.historyRow, borderColor: r.rating >= 4 ? MUSCLES[r.muscleKey]?.color + "33" || "#1e1e1e" : "#1a1a1a" }}>
                  <div style={S.historyLeft}>
                    <span style={{ ...S.historyMuscle, color: MUSCLES[r.muscleKey]?.color || "var(--white)" }}>
                      {MUSCLES[r.muscleKey]?.emoji} {r.muscleKey?.toUpperCase()}
                    </span>
                    <span style={S.historyExercise}>{r.exercise} · Set {r.setNum}</span>
                    {r.comment && <span style={S.historyQuote}>"{r.comment}"</span>}
                  </div>
                  <div style={S.historyRight}>
                    <Stars rating={r.rating} size={13} />
                    <span style={{ ...S.historyBadge, color: ratingColor(r.rating), borderColor: ratingColor(r.rating) + "44", background: ratingColor(r.rating) + "11" }}>
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
    ? (history.reduce((s, r) => s + r.rating, 0) / history.length).toFixed(1) : null;

  return (
    <div style={{ ...S.screen, gap: 22 }} className="animate-in">
      <p style={{ fontSize: 56 }}>💪</p>
      <h2 style={S.doneTitle}>WORKOUT COMPLETE</h2>

      {lastRating && (
        <div style={{ ...S.ratingCard, borderColor: "#f59e0b55" }}>
          <p style={S.ratingLabel}>FINAL RATING</p>
          <Stars rating={lastRating.rating} size={26} />
          {lastRating.comment && <p style={S.ratingComment}>"{lastRating.comment}"</p>}
        </div>
      )}

      <div style={S.doneStats}>
        <div style={S.doneStat}>
          <span style={{ ...S.doneStatNum, color: muscle.color }}>{muscle.label}</span>
          <span style={S.doneStatLabel}>TODAY</span>
        </div>
        <div style={S.doneStatDivider} />
        <div style={S.doneStat}>
          <span style={{ ...S.doneStatNum, color: "var(--green)" }}>{trained}</span>
          <span style={S.doneStatLabel}>THIS WEEK</span>
        </div>
        {avgRating && <>
          <div style={S.doneStatDivider} />
          <div style={S.doneStat}>
            <span style={{ ...S.doneStatNum, color: "var(--gold)" }}>{avgRating}★</span>
            <span style={S.doneStatLabel}>AVG RATING</span>
          </div>
        </>}
      </div>

      <button style={{ ...S.primaryBtn, background: `linear-gradient(135deg, ${muscle.color}, ${muscle.color}aa)`, boxShadow: `0 6px 32px ${muscle.color}55` }} onClick={onReset}>
        NEW WORKOUT
      </button>
      <button style={S.ghostBtn} onClick={onHistory}>📊 View performance history</button>
    </div>
  );
}

// ─── Missing Agent ID ─────────────────────────────────────────────────────────
function MissingAgentId() {
  return (
    <div style={{ ...S.root, justifyContent: "center", alignItems: "center", padding: 32, textAlign: "center" }}>
      <h2 style={{ color: "var(--red)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, marginBottom: 16 }}>AGENT ID MISSING</h2>
      <pre style={S.codeBlock}>VITE_AGENT_ID=your_elevenlabs_agent_id</pre>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", position: "relative", zIndex: 1 },

  // Header
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #1e1e1e", background: "rgba(5,5,5,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 },
  logo: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 5, color: "var(--orange)", textShadow: "0 0 24px rgba(249,115,22,0.7)" },
  setLabel: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 3, color: "var(--gray-light)", minWidth: 52, textAlign: "right" },
  headerBtn: { background: "none", color: "var(--gray-light)", fontSize: 16, padding: "4px 9px", borderRadius: 6, border: "1px solid #222", cursor: "pointer" },

  // Dots
  dotsWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  dotsRow: { display: "flex", gap: 5 },
  dotCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  dot: { width: 8, height: 8, borderRadius: "50%", transition: "all 0.3s" },
  dotLabel: { fontSize: 7, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 },
  dotCount: { fontSize: 8, color: "var(--gray)", letterSpacing: 1, fontFamily: "'Bebas Neue', sans-serif" },

  // Screens
  screen: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "32px 20px" },
  pageTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, letterSpacing: 7, color: "var(--white)" },
  pageSub: { fontSize: 15, color: "var(--gray-light)", letterSpacing: 0.5, marginTop: -8, textAlign: "center" },

  // Exercise card
  exerciseCard: { textAlign: "center", background: "#0d0d0d", border: "1px solid #222", borderRadius: 20, padding: "32px 40px", width: "100%", maxWidth: 400, transition: "all 0.3s" },
  exerciseLabel: { fontSize: 11, letterSpacing: 6, color: "var(--orange)", marginBottom: 14, fontFamily: "'Bebas Neue', sans-serif" },
  exerciseName: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, letterSpacing: 3, lineHeight: 1, color: "var(--white)", transition: "color 0.3s" },
  statPill: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 2, padding: "7px 16px", borderRadius: 20 },

  // Buttons
  primaryBtn: { color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 5, padding: "22px 56px", borderRadius: 14, width: "100%", maxWidth: 400, transition: "all 0.2s", border: "none" },
  ghostBtn: { background: "none", color: "var(--gray-light)", fontSize: 16, cursor: "pointer", letterSpacing: 1, padding: "6px 4px", border: "none" },
  hint: { fontSize: 14, color: "var(--gray)", textAlign: "center", lineHeight: 1.8 },
  errorBox: { background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "#fdba74", maxWidth: 400, textAlign: "center" },

  // Active screen orb
  orbContainer: { position: "relative", width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center" },
  orb: { width: 130, height: 130, borderRadius: "50%", transition: "background 0.4s, box-shadow 0.4s", zIndex: 1 },
  orbRing: { position: "absolute", width: 130, height: 130, borderRadius: "50%", border: "2px solid", animation: "pulse-ring 1.8s ease-out infinite", zIndex: 0 },
  orbRing2: { position: "absolute", width: 130, height: 130, borderRadius: "50%", border: "1px solid", animation: "pulse-ring 1.8s ease-out infinite 0.6s", zIndex: 0 },
  waveContainer: { position: "absolute", bottom: -28, display: "flex", alignItems: "flex-end", gap: 3, height: 52 },
  waveBar: { width: 4, borderRadius: 4, minHeight: 6, animation: "wave 0.8s ease-in-out infinite alternate" },
  modeLabel: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 4, marginTop: 18, textAlign: "center" },
  setTimer: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 100, letterSpacing: 4, color: "var(--white)", lineHeight: 1 },
  activeHint: { fontSize: 17, color: "var(--gray)" },
  stopBtn: { background: "transparent", color: "var(--gray)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 3, padding: "12px 28px", borderRadius: 8, border: "1px solid #2a2a2a", marginTop: 4 },

  // Rating overlay (on ActiveScreen)
  ratingOverlay: { position: "absolute", inset: 0, background: "rgba(5,5,5,0.93)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 32, zIndex: 10, backdropFilter: "blur(8px)" },
  ratingOverlayEyebrow: { fontSize: 12, letterSpacing: 5, color: "var(--orange)", fontFamily: "'Bebas Neue', sans-serif" },
  ratingOverlayScore: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, letterSpacing: 7, lineHeight: 1 },
  ratingOverlayComment: { fontSize: 20, color: "var(--white)", fontStyle: "italic", textAlign: "center", lineHeight: 1.6, maxWidth: 320 },
  ratingOverlayHint: { fontSize: 13, color: "var(--gray)", letterSpacing: 3, fontFamily: "'Bebas Neue', sans-serif" },

  // Rest screen
  restLabel: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 8, color: "var(--orange)", textShadow: "0 0 20px var(--orange-glow)" },
  restTimerWrap: { position: "relative", width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center" },
  restSvg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  restTimerInner: { display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 },
  restNumber: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 96, color: "var(--white)", lineHeight: 1 },
  restUnit: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 4, color: "var(--orange)", marginTop: -4 },
  restActions: { display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 400 },

  // Rating card (rest + done screens)
  ratingCard: { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 14, padding: "18px 28px", textAlign: "center", width: "100%", maxWidth: 400 },
  ratingLabel: { fontSize: 11, letterSpacing: 4, color: "var(--orange)", marginBottom: 10, fontFamily: "'Bebas Neue', sans-serif" },
  ratingComment: { fontSize: 16, color: "var(--white)", fontStyle: "italic", marginTop: 8, lineHeight: 1.5 },

  // Done screen
  doneTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, letterSpacing: 5, textAlign: "center" },
  doneStats: { display: "flex", alignItems: "center", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 16, overflow: "hidden", width: "100%", maxWidth: 400 },
  doneStat: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 12px", gap: 5 },
  doneStatNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 2, lineHeight: 1 },
  doneStatLabel: { fontSize: 10, letterSpacing: 2, color: "var(--gray)" },
  doneStatDivider: { width: 1, height: 52, background: "#1e1e1e" },

  // Schedule
  scheduleScreen: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "24px 16px", overflowY: "auto" },
  dayList: { display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 420 },
  dayCard: { background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s" },
  dayRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "none", cursor: "pointer", width: "100%", border: "none" },
  dayLeft: { display: "flex", alignItems: "center", gap: 12 },
  dayRight: { display: "flex", alignItems: "center", gap: 10 },
  dayNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, color: "var(--gray)", width: 18, textAlign: "center" },
  dayName: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 2 },
  todayBadge: { fontSize: 8, background: "var(--red)", color: "#fff", padding: "2px 6px", borderRadius: 4, letterSpacing: 1, fontFamily: "'Bebas Neue', sans-serif" },
  trainedBadge: { fontSize: 12, color: "var(--green)", width: 18, textAlign: "center" },
  muscleTag: { fontSize: 10, padding: "4px 10px", borderRadius: 20, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 },
  musclePickerWrap: { display: "flex", flexWrap: "wrap", gap: 7, padding: "0 14px 14px 14px" },
  pickPill: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, letterSpacing: 1, padding: "6px 12px", borderRadius: 20, cursor: "pointer", transition: "all 0.15s" },

  // History
  historyScreen: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "20px 16px", overflowY: "auto" },
  historyHeader: { width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  historyStats: { display: "flex", alignItems: "center", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 14, overflow: "hidden", width: "100%" },
  hStat: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 8px", gap: 4 },
  hStatNum: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, letterSpacing: 2, lineHeight: 1 },
  hStatLabel: { fontSize: 9, letterSpacing: 2, color: "var(--gray)" },
  hStatDiv: { width: 1, height: 40, background: "#1a1a1a" },
  historyList: { display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 420 },
  historyDate: { fontSize: 9, letterSpacing: 3, color: "var(--gray)", fontFamily: "'Bebas Neue', sans-serif", marginTop: 8, marginBottom: 4 },
  historyRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#0d0d0d", border: "1px solid", borderRadius: 10, padding: "12px 14px", transition: "border-color 0.2s" },
  historyLeft: { display: "flex", flexDirection: "column", gap: 3, flex: 1 },
  historyMuscle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, letterSpacing: 2 },
  historyExercise: { fontSize: 11, color: "var(--gray-light)" },
  historyQuote: { fontSize: 10, color: "var(--gray)", fontStyle: "italic", marginTop: 2 },
  historyRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, minWidth: 64 },
  historyBadge: { fontSize: 8, letterSpacing: 1, fontFamily: "'Bebas Neue', sans-serif", padding: "2px 6px", borderRadius: 4, border: "1px solid" },

  codeBlock: { background: "#0d0d0d", border: "1px solid #252525", borderRadius: 8, padding: "14px 20px", fontSize: 14, color: "var(--green)", fontFamily: "monospace" },
};

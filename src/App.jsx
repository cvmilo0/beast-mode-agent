import { useState, useEffect, useRef } from "react";
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
  useConversationMode,
} from "@elevenlabs/react";

// ─── Config ──────────────────────────────────────────────────────────────────
const AGENT_ID = import.meta.env.VITE_AGENT_ID || "";
const REST_SECONDS = 30;

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  if (!AGENT_ID) {
    return <MissingAgentId />;
  }

  return (
    <ConversationProvider agentId={AGENT_ID} connectionType="websocket">
      <Coach />
    </ConversationProvider>
  );
}

// ─── Main Coach UI ────────────────────────────────────────────────────────────
function Coach() {
  const { startSession, endSession } = useConversationControls();
  const { status, message: statusMessage } = useConversationStatus();
  const { isSpeaking } = useConversationMode();

  const [screen, setScreen] = useState("idle"); // idle | active | rest | done
  const [setNumber, setSetNumber] = useState(1);
  const [restSeconds, setRestSeconds] = useState(REST_SECONDS);
  const [setSeconds, setSetSeconds] = useState(0);
  const [micError, setMicError] = useState(null);
  const restTimerRef = useRef(null);
  const setTimerRef = useRef(null);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const isError = status === "error";

  // Track elapsed time during active set
  useEffect(() => {
    if (screen === "active") {
      setSetSeconds(0);
      setTimerRef.current = setInterval(() => {
        setSetSeconds((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(setTimerRef.current);
    }
    return () => clearInterval(setTimerRef.current);
  }, [screen]);

  // Rest countdown
  useEffect(() => {
    if (screen === "rest") {
      setRestSeconds(REST_SECONDS);
      restTimerRef.current = setInterval(() => {
        setRestSeconds((s) => {
          if (s <= 1) {
            clearInterval(restTimerRef.current);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(restTimerRef.current);
  }, [screen]);

  async function handleStartSet() {
    setMicError(null);
    try {
      // Explicitly request mic permission first so we get a clear error if denied
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setMicError("Microphone access denied. Allow mic in your browser and try again.");
      return;
    }
    try {
      await startSession({
        connectionType: "websocket",
        onConnect: () => console.log("Goggins connected"),
        onError: (msg) => {
          console.error("Agent error:", msg);
          setMicError(`Agent error: ${msg}`);
        },
      });
      setScreen("active");
    } catch (err) {
      console.error("Failed to start session:", err);
      setMicError(`Failed to connect: ${err.message}`);
    }
  }

  async function handleEndSet() {
    await endSession();
    setScreen("rest");
  }

  function handleNextSet() {
    setSetNumber((n) => n + 1);
    setScreen("idle");
  }

  function handleFinishWorkout() {
    setSetNumber(1);
    setScreen("done");
  }

  function handleReset() {
    setSetNumber(1);
    setScreen("idle");
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <span style={styles.logo}>GOGGINS AI COACH</span>
        <span style={styles.setLabel}>SET {setNumber}</span>
      </header>

      {/* Screens */}
      {screen === "idle" && (
        <IdleScreen
          setNumber={setNumber}
          onStart={handleStartSet}
          isConnecting={isConnecting}
          error={micError || (isError ? statusMessage || "Connection error" : null)}
        />
      )}

      {screen === "active" && (
        <ActiveScreen
          isConnected={isConnected}
          isSpeaking={isSpeaking}
          setSeconds={setSeconds}
          onEndSet={handleEndSet}
        />
      )}

      {screen === "rest" && (
        <RestScreen
          restSeconds={restSeconds}
          setNumber={setNumber}
          onNextSet={handleNextSet}
          onFinish={handleFinishWorkout}
        />
      )}

      {screen === "done" && <DoneScreen onReset={handleReset} />}
    </div>
  );
}

// ─── Idle Screen ──────────────────────────────────────────────────────────────
function IdleScreen({ setNumber, onStart, isConnecting, error }) {
  return (
    <div style={styles.screen} className="animate-in">
      <div style={styles.exerciseCard}>
        <p style={styles.exerciseLabel}>EXERCISE</p>
        <h1 style={styles.exerciseName}>PUSH-UPS</h1>
        <p style={styles.exerciseSub}>12 reps · Stay Hard</p>
      </div>

      <div style={styles.quoteBox}>
        <p style={styles.quote}>
          "The most important conversations you'll ever have are the ones you
          have with yourself."
        </p>
        <p style={styles.quoteAuthor}>— David Goggins</p>
      </div>

      {error && (
        <div style={styles.errorBox}>
          ⚠️ {error}
        </div>
      )}

      <button
        style={{
          ...styles.startBtn,
          opacity: isConnecting ? 0.6 : 1,
        }}
        onClick={onStart}
        disabled={isConnecting}
      >
        {isConnecting ? "CONNECTING..." : `START SET ${setNumber}`}
      </button>

      <p style={styles.hint}>Tap the button, then start your reps.<br />Say <strong>"Done"</strong> when you finish the set.</p>
    </div>
  );
}

// ─── Active Screen ────────────────────────────────────────────────────────────
function ActiveScreen({ isConnected, isSpeaking, setSeconds, onEndSet }) {
  const mins = String(Math.floor(setSeconds / 60)).padStart(2, "0");
  const secs = String(setSeconds % 60).padStart(2, "0");

  return (
    <div style={styles.screen} className="animate-in">
      {/* Status orb */}
      <div style={styles.orbContainer}>
        {isSpeaking && <div style={styles.orbRing} />}
        <div
          style={{
            ...styles.orb,
            background: isSpeaking
              ? "radial-gradient(circle at 40% 40%, #ff6b6b, #e63232)"
              : "radial-gradient(circle at 40% 40%, #444, #222)",
            boxShadow: isSpeaking
              ? "0 0 60px 20px rgba(230,50,50,0.5)"
              : "0 0 20px 4px rgba(255,255,255,0.05)",
            animation: isSpeaking ? "pulse-red 1.5s infinite" : "none",
          }}
        />
        {/* Sound wave bars — only when speaking */}
        {isSpeaking && (
          <div style={styles.waveContainer}>
            {[0.2, 0.5, 0.1, 0.7, 0.3, 0.9, 0.4, 0.6, 0.2, 0.8].map(
              (delay, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.waveBar,
                    animationDelay: `${delay}s`,
                    animationDuration: `${0.6 + delay * 0.4}s`,
                  }}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* Mode label */}
      <div style={styles.modeLabel}>
        {!isConnected ? (
          <span style={{ color: "var(--gray-light)", animation: "blink 1s infinite" }}>
            CONNECTING...
          </span>
        ) : isSpeaking ? (
          <span style={{ color: "var(--red)", fontWeight: 700 }}>
            GOGGINS IS PUSHING YOU
          </span>
        ) : (
          <span style={{ color: "var(--gray-light)" }}>
            HE'S LISTENING...
          </span>
        )}
      </div>

      {/* Timer */}
      <div style={styles.setTimer}>
        {mins}:{secs}
      </div>

      {/* Hint */}
      <p style={styles.activeHint}>
        Say <strong style={{ color: "var(--white)" }}>"Done"</strong> to end the set
      </p>

      {/* Emergency stop */}
      <button style={styles.stopBtn} onClick={onEndSet}>
        END SET
      </button>
    </div>
  );
}

// ─── Rest Screen ──────────────────────────────────────────────────────────────
function RestScreen({ restSeconds, setNumber, onNextSet, onFinish }) {
  const isExpired = restSeconds === 0;

  return (
    <div style={styles.screen} className="animate-in">
      <p style={styles.restLabel}>REST</p>

      <div style={styles.restTimer}>
        <svg viewBox="0 0 120 120" style={styles.restSvg}>
          <circle cx="60" cy="60" r="54" style={styles.restTrack} />
          <circle
            cx="60"
            cy="60"
            r="54"
            style={{
              ...styles.restProgress,
              strokeDashoffset: 339.3 * (restSeconds / REST_SECONDS),
            }}
          />
        </svg>
        <span style={styles.restNumber}>{restSeconds}</span>
      </div>

      <p style={styles.restSub}>
        {isExpired ? "Ready to go again?" : "Recover. Breathe. Focus."}
      </p>

      <div style={styles.restActions}>
        <button style={styles.nextBtn} onClick={onNextSet}>
          SET {setNumber + 1} →
        </button>
        <button style={styles.finishBtn} onClick={onFinish}>
          FINISH WORKOUT
        </button>
      </div>
    </div>
  );
}

// ─── Done Screen ──────────────────────────────────────────────────────────────
function DoneScreen({ onReset }) {
  return (
    <div style={{ ...styles.screen, gap: 32 }} className="animate-in">
      <p style={{ fontSize: 64 }}>💪</p>
      <h2 style={styles.doneTitle}>WORKOUT COMPLETE</h2>
      <p style={styles.doneSub}>That's what separates the average from the great.</p>
      <p style={{ ...styles.quoteAuthor, fontSize: 14 }}>— Stay Hard</p>
      <button style={styles.startBtn} onClick={onReset}>
        NEW WORKOUT
      </button>
    </div>
  );
}

// ─── Missing Agent ID ─────────────────────────────────────────────────────────
function MissingAgentId() {
  return (
    <div style={{ ...styles.root, justifyContent: "center", alignItems: "center", padding: 32, textAlign: "center" }}>
      <h2 style={{ color: "var(--red)", fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, marginBottom: 16 }}>
        AGENT ID MISSING
      </h2>
      <p style={{ color: "var(--gray-light)", marginBottom: 24, lineHeight: 1.6 }}>
        Create a <code style={{ color: "var(--white)" }}>.env</code> file in the project root with:
      </p>
      <pre style={styles.codeBlock}>VITE_AGENT_ID=your_elevenlabs_agent_id</pre>
      <p style={{ color: "var(--gray-light)", marginTop: 24, fontSize: 13 }}>
        Then restart the dev server with <code style={{ color: "var(--white)" }}>npm run dev</code>
      </p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 28px",
    borderBottom: "1px solid #1e1e1e",
  },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 22,
    letterSpacing: 3,
    color: "var(--red)",
  },
  setLabel: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 18,
    letterSpacing: 2,
    color: "var(--gray-light)",
  },
  screen: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    padding: "40px 28px",
  },
  exerciseCard: {
    textAlign: "center",
    background: "#111",
    border: "1px solid #222",
    borderRadius: 16,
    padding: "28px 48px",
    width: "100%",
    maxWidth: 380,
  },
  exerciseLabel: {
    fontSize: 11,
    letterSpacing: 4,
    color: "var(--gray)",
    marginBottom: 8,
  },
  exerciseName: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 56,
    letterSpacing: 4,
    color: "var(--white)",
    lineHeight: 1,
    marginBottom: 8,
  },
  exerciseSub: {
    fontSize: 14,
    color: "var(--gray-light)",
    letterSpacing: 1,
  },
  quoteBox: {
    textAlign: "center",
    maxWidth: 320,
  },
  quote: {
    fontSize: 14,
    color: "var(--gray-light)",
    fontStyle: "italic",
    lineHeight: 1.6,
    marginBottom: 8,
  },
  quoteAuthor: {
    fontSize: 12,
    color: "var(--gray)",
    letterSpacing: 1,
  },
  startBtn: {
    background: "var(--red)",
    color: "var(--white)",
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 26,
    letterSpacing: 4,
    padding: "18px 56px",
    borderRadius: 12,
    width: "100%",
    maxWidth: 380,
    transition: "transform 0.1s, box-shadow 0.2s",
    boxShadow: "0 4px 24px rgba(230, 50, 50, 0.3)",
  },
  hint: {
    fontSize: 13,
    color: "var(--gray)",
    textAlign: "center",
    lineHeight: 1.8,
  },
  // Active screen
  orbContainer: {
    position: "relative",
    width: 160,
    height: 160,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  orb: {
    width: 120,
    height: 120,
    borderRadius: "50%",
    transition: "background 0.3s, box-shadow 0.3s",
    zIndex: 1,
  },
  orbRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: "50%",
    border: "2px solid var(--red)",
    animation: "pulse-ring 1.5s infinite",
    zIndex: 0,
  },
  waveContainer: {
    position: "absolute",
    bottom: -24,
    display: "flex",
    alignItems: "flex-end",
    gap: 3,
    height: 48,
  },
  waveBar: {
    width: 4,
    background: "var(--red)",
    borderRadius: 4,
    minHeight: 8,
    animation: "wave 0.8s ease-in-out infinite alternate",
  },
  modeLabel: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 22,
    letterSpacing: 3,
    marginTop: 16,
    textAlign: "center",
  },
  setTimer: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 72,
    letterSpacing: 4,
    color: "var(--white)",
    lineHeight: 1,
  },
  activeHint: {
    fontSize: 14,
    color: "var(--gray)",
    letterSpacing: 0.5,
  },
  stopBtn: {
    background: "transparent",
    color: "var(--gray)",
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 14,
    letterSpacing: 3,
    padding: "10px 24px",
    borderRadius: 8,
    border: "1px solid #333",
    marginTop: 8,
    transition: "color 0.2s, border-color 0.2s",
  },
  // Rest screen
  restLabel: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 14,
    letterSpacing: 6,
    color: "var(--green)",
  },
  restTimer: {
    position: "relative",
    width: 160,
    height: 160,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  restSvg: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    transform: "rotate(-90deg)",
  },
  restTrack: {
    fill: "none",
    stroke: "#1e1e1e",
    strokeWidth: 6,
  },
  restProgress: {
    fill: "none",
    stroke: "var(--green)",
    strokeWidth: 6,
    strokeDasharray: "339.3",
    transition: "stroke-dashoffset 1s linear",
    strokeLinecap: "round",
  },
  restNumber: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 64,
    color: "var(--white)",
    zIndex: 1,
  },
  restSub: {
    fontSize: 14,
    color: "var(--gray-light)",
    letterSpacing: 1,
  },
  restActions: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
    maxWidth: 380,
  },
  nextBtn: {
    background: "var(--green)",
    color: "#000",
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 24,
    letterSpacing: 4,
    padding: "16px",
    borderRadius: 12,
    boxShadow: "0 4px 20px rgba(34, 197, 94, 0.3)",
  },
  finishBtn: {
    background: "transparent",
    color: "var(--gray-light)",
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    letterSpacing: 3,
    padding: "12px",
    borderRadius: 8,
    border: "1px solid #333",
  },
  // Done screen
  doneTitle: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 48,
    letterSpacing: 4,
    textAlign: "center",
  },
  doneSub: {
    fontSize: 15,
    color: "var(--gray-light)",
    textAlign: "center",
    fontStyle: "italic",
  },
  errorBox: {
    background: "rgba(230, 50, 50, 0.1)",
    border: "1px solid var(--red)",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 13,
    color: "#ff9999",
    maxWidth: 380,
    textAlign: "center",
    lineHeight: 1.5,
  },
  // Error
  codeBlock: {
    background: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: 8,
    padding: "14px 20px",
    fontSize: 14,
    color: "var(--green)",
    fontFamily: "monospace",
  },
};

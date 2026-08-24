// The whole avatar: face state machine, chat loop, voice in, voice out.
// Plain ES module, no dependencies.

import { FRAMES } from "./frames.js";

const face = document.getElementById("face");
const status = document.getElementById("status");
const transcript = document.getElementById("transcript");
const form = document.getElementById("ask-row");
const input = document.getElementById("question");
const micBtn = document.getElementById("mic");

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- face

// Size the monospace grid so the whole page — face, transcript, input —
// fits the viewport without scrolling.
function fitFace() {
  const availableW = Math.min(face.parentElement.clientWidth, 700);
  const fromWidth = availableW / FRAMES.cols / 0.602; // 0.602 ≈ monospace advance/em
  const chrome = 300; // back link + status + transcript strip + input + disclaimer
  const fromHeight = Math.max(120, innerHeight - chrome) / FRAMES.rows;
  face.style.fontSize = `${Math.min(fromWidth, fromHeight)}px`;
}
fitFace();
addEventListener("resize", fitFace);

function show(frame) {
  face.textContent = frame.join("\n");
}

let state = "idle";
let stateTimer = null;
let dissolveTimer = null;
let liveTimer = null;
let convo = false;

const STATUS_TEXT = { idle: "", listening: "listening…", thinking: "…", speaking: "" };

function setState(next) {
  state = next;
  clearTimeout(stateTimer);
  clearInterval(dissolveTimer);
  clearInterval(liveTimer);
  liveTimer = null;
  status.textContent = STATUS_TEXT[next] ?? "";
  if (next === "idle" || next === "listening") {
    show(FRAMES.neutral);
    if (!reducedMotion) {
      if (convo) startLiveMotion();
      else scheduleBlink();
    }
  } else if (next === "thinking") {
    if (reducedMotion) show(FRAMES.neutral);
    else startDissolve();
  } else if (next === "speaking") {
    nextSpeakBlink = performance.now() + 1200 + Math.random() * 1500;
    show(FRAMES.mouth[0]);
  }
}

function idleish() {
  return state === "idle" || state === "listening";
}

// While voice conversation mode is armed, keep a subtle neutral-frame shimmer
// running so it is visually clear that the agent is still live and listening.
function startLiveMotion() {
  let alternate = false;
  liveTimer = setInterval(() => {
    if (!convo || !idleish()) return;
    alternate = !alternate;
    show(alternate ? FRAMES.neutral2 : FRAMES.neutral);
  }, 260);
}

// Idle life: mostly single blinks, sometimes a double blink, occasionally an
// unprompted smile — on randomized timers so nothing reads as a loop.
function scheduleBlink() {
  stateTimer = setTimeout(() => {
    if (!idleish()) return;
    const roll = Math.random();
    if (roll < 0.15) playSmile();
    else playBlink(roll < 0.35);
  }, 3000 + Math.random() * 4000);
}

function playSmile() {
  show(FRAMES.smile);
  stateTimer = setTimeout(() => {
    if (!idleish()) return;
    show(FRAMES.neutral);
    scheduleBlink();
  }, 1000 + Math.random() * 600);
}

function playBlink(double) {
  show(FRAMES.blink);
  stateTimer = setTimeout(() => {
    if (!idleish()) return;
    show(Math.random() < 0.2 ? FRAMES.neutral2 : FRAMES.neutral);
    if (!double) return scheduleBlink();
    stateTimer = setTimeout(() => {
      if (!idleish()) return;
      show(FRAMES.blink);
      stateTimer = setTimeout(() => {
        if (!idleish()) return;
        show(FRAMES.neutral);
        scheduleBlink();
      }, 130);
    }, 180);
  }, 130);
}

// Brief smile after finishing an answer — the little human beat.
function smileFlash() {
  if (reducedMotion) return;
  clearInterval(liveTimer);
  liveTimer = null;
  show(FRAMES.smile);
  setTimeout(() => {
    if (state !== "idle") return;
    show(FRAMES.neutral);
    if (convo) startLiveMotion();
  }, 900);
}

// Thinking: randomly demote ~5% of visible chars one step down the ramp.
function startDissolve() {
  const base = FRAMES.neutral.map((r) => r.split(""));
  dissolveTimer = setInterval(() => {
    const grid = base.map((row) => [...row]);
    for (let i = 0; i < FRAMES.cols * FRAMES.rows * 0.05; i++) {
      const y = (Math.random() * FRAMES.rows) | 0;
      const x = (Math.random() * FRAMES.cols) | 0;
      const idx = FRAMES.ramp.indexOf(grid[y][x]);
      if (idx > 0) grid[y][x] = FRAMES.ramp[idx - 1];
    }
    show(grid.map((r) => r.join("")));
  }, 90);
}

// Speaking with audio: classify a coarse viseme from live spectrum, not just
// loudness. Volume alone made every open look like the same circle growing.
let audioCtx = null;
let analyser = null;
let timeData = null;
let freqData = null;
let sourceEl = null;
// One shared element, unlocked on a user gesture — required for iOS/Safari
// after the async /api/ask round-trip (autoplay policy).
let sharedAudio = null;
let audioUnlocked = false;

// iPadOS 13+ reports as MacIntel with touch; include it with phones.
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
  } catch {
    /* ignore */
  }
  if (audioUnlocked) return;
  try {
    if (!sharedAudio) sharedAudio = new Audio();
    // Tiny silent wav — primes playback permission under the tap gesture.
    sharedAudio.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    const p = sharedAudio.play();
    if (p?.then) {
      p.then(() => {
        sharedAudio.pause();
        sharedAudio.currentTime = 0;
        audioUnlocked = true;
      }).catch(() => {});
    } else {
      audioUnlocked = true;
    }
  } catch {
    /* ignore */
  }
}

function attachAnalyser(audioEl) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (sourceEl !== audioEl) {
    const src = audioCtx.createMediaElementSource(audioEl);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    timeData = new Uint8Array(analyser.fftSize);
    freqData = new Uint8Array(analyser.frequencyBinCount);
    sourceEl = audioEl;
  }
  audioCtx.resume();
}

// Mouth indices (see scripts/mouth-shapes.mjs):
//   0 closed · 1 slight · 2 ee · 3 ah · 4 oh · 5 wide
// Nearby shapes share a hold so we don't chatter every 66ms.
const MOUTH_NEAR = {
  0: [0, 1],
  1: [0, 1, 2],
  2: [1, 2, 3],
  3: [2, 3, 5],
  4: [3, 4, 5],
  5: [3, 4, 5],
};
let curMouth = 0;
let lastMouthSwitch = 0;
let blinkUntil = 0;
let nextSpeakBlink = 0;

function classifyMouth() {
  analyser.getByteTimeDomainData(timeData);
  let sum = 0;
  for (const v of timeData) {
    const d = (v - 128) / 128;
    sum += d * d;
  }
  const rms = Math.sqrt(sum / timeData.length);
  if (rms < 0.018) return 0; // silence / stops
  if (rms < 0.032) return 1; // quiet consonants

  analyser.getByteFrequencyData(freqData);
  const binHz = audioCtx.sampleRate / analyser.fftSize;
  let low = 0;
  let mid = 0;
  let high = 0;
  let nLow = 0;
  let nMid = 0;
  let nHigh = 0;
  for (let i = 1; i < freqData.length; i++) {
    const hz = i * binHz;
    if (hz > 6000) break;
    const e = freqData[i] / 255;
    if (hz < 500) {
      low += e;
      nLow++;
    } else if (hz < 2200) {
      mid += e;
      nMid++;
    } else {
      high += e;
      nHigh++;
    }
  }
  low /= nLow || 1;
  mid /= nMid || 1;
  high /= nHigh || 1;
  const total = low + mid + high + 1e-6;
  const brightness = high / total; // fricatives / "ee" sit higher
  const roundness = low / total; // "oh"/"oo" weight the lows

  if (rms > 0.13) return 5; // stressed / loud open
  if (brightness > 0.34 && rms < 0.09) return 2; // ee / spread
  if (roundness > 0.42 && rms > 0.05) return 4; // oh / round
  if (rms > 0.08) return 3; // ah
  return brightness > 0.3 ? 2 : 1;
}

function pickMouth(target) {
  const max = FRAMES.mouth.length - 1;
  const t = Math.max(0, Math.min(max, target));
  const pool = (MOUTH_NEAR[t] || [t]).filter((i) => i <= max);
  // Prefer staying put if we're already in a nearby shape.
  if (pool.includes(curMouth) && Math.random() > 0.45) return curMouth;
  // Bias toward the classified target; occasionally a neighbor for life.
  if (Math.random() > 0.25) return t;
  return pool[(Math.random() * pool.length) | 0];
}

// No-TTS fallback: syllable-ish open/close with spread vs round variety.
function proceduralMouth(now) {
  const beat = ((now / 140) | 0) % 10;
  return [1, 3, 2, 0, 4, 3, 1, 5, 2, 0][beat];
}

// splice the closed eyes from the blink frame onto any other frame
function withBlink(frame) {
  if (!FRAMES.eyes) return frame;
  const rows = [...frame];
  for (const e of FRAMES.eyes)
    for (let y = e.y; y < e.y + e.h; y++) {
      if (rows[y] === undefined || FRAMES.blink[y] === undefined) continue;
      rows[y] = rows[y].slice(0, e.x) + FRAMES.blink[y].slice(e.x, e.x + e.w) + rows[y].slice(e.x + e.w);
    }
  return rows;
}

function mouthLoop() {
  if (state !== "speaking") return;
  const now = performance.now();
  const target = analyser ? classifyMouth() : proceduralMouth(now);
  // Visemes change faster than the old volume bands — ~12–14 Hz feels speechy.
  if (now - lastMouthSwitch > 55) {
    const next = pickMouth(target);
    if (next !== curMouth) {
      curMouth = next;
      lastMouthSwitch = now;
    }
  }
  let frame = FRAMES.mouth[curMouth];
  if (now >= nextSpeakBlink) {
    blinkUntil = now + 140;
    nextSpeakBlink = now + 2500 + Math.random() * 2500;
  }
  if (now < blinkUntil && !reducedMotion) frame = withBlink(frame);
  show(frame);
  // setTimeout over rAF: keeps animating in throttled/embedded tabs
  setTimeout(mouthLoop, 50);
}

// ---------------------------------------------------------------- chat

const history = []; // {role, content} pairs, capped below

function addLine(cls, text) {
  const p = document.createElement("p");
  p.className = cls;
  p.textContent = text;
  transcript.appendChild(p);
  transcript.scrollTop = transcript.scrollHeight;
  return p;
}

let busy = false;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q || busy) return;
  busy = true;
  let answered = false;
  input.value = "";
  unlockAudio();
  try { recognition?.stop(); } catch {} // pause the mic; convo mode re-arms after the reply
  addLine("you", `you: ${q}`);
  const answerEl = addLine("me", "");
  setState("thinking");

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, history: history.slice(-6) }),
    });

    if (res.status === 429) {
      answerEl.textContent = "I've talked a lot today — email me instead: saaz.m@icloud.com";
      setState("idle");
      return;
    }
    if (!res.ok) {
      answerEl.textContent =
        res.status === 503
          ? "My brain's offline right now. The real me: saaz.m@icloud.com"
          : "Something's broken on my end. The real me: saaz.m@icloud.com";
      setState("idle");
      return;
    }

    // Collect the streamed answer invisibly. It is revealed word-by-word
    // during voice playback so the transcript follows the conversation.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let done = null;
    while (true) {
      const { value, done: eof } = await reader.read();
      if (eof) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const evt of events) {
        const type = /^event: (.+)$/m.exec(evt)?.[1];
        const data = /^data: (.+)$/m.exec(evt)?.[1];
        if (!data) continue;
        const payload = JSON.parse(data);
        if (type === "delta") {
          full += payload.text;
        } else if (type === "done") {
          done = payload;
        }
      }
    }

    const answer = done?.text || full;
    if (!answer) {
      answerEl.textContent =
        done?.error === "busy"
          ? "Lots of questions right now — give it a second and ask that again."
          : "My brain's offline right now. The real me: saaz.m@icloud.com";
      return;
    }
    history.push({ role: "user", content: q });
    history.push({ role: "assistant", content: answer });

    await speak({ ...done, text: answer }, answerEl);
    answered = true;
  } catch {
    answerEl.textContent = "Something's broken on my end. The real me: saaz.m@icloud.com";
  } finally {
    setState("idle");
    if (answered) smileFlash();
    busy = false;
    if (convo) {
      // Prefer auto-rearm. iOS needs a longer settle after TTS (audio session);
      // listen() falls back to a tap only if start() fails or hangs.
      restartListen(isIOS ? 1200 : 500);
    }
  }
});

// ---------------------------------------------------------------- voice out

function speak(done, answerEl) {
  const text = done?.text ?? "";
  if (!text || !done.sig) {
    return speakWithoutAudio(text, answerEl);
  }
  const url = `/api/tts?text=${encodeURIComponent(text)}&sig=${done.sig}`;
  // iOS: Web Audio avoids HTMLAudioElement holding the audio session in a
  // state that breaks the next SpeechRecognition.start() (WebKit 317741).
  if (isIOS) return speakViaWebAudio(url, text, answerEl);
  return speakViaElement(url, text, answerEl);
}

function createSpeechReveal(answerEl, text) {
  const boundaries = [...text.matchAll(/\S+\s*/g)].map((m) => m.index + m[0].length);
  let frame = null;
  let shown = 0;

  const render = (end) => {
    if (!answerEl || end <= shown) return;
    shown = end;
    answerEl.textContent = text.slice(0, end).trimEnd();
    transcript.scrollTop = transcript.scrollHeight;
  };

  return {
    start(progress) {
      const tick = () => {
        const target = text.length * Math.max(0, Math.min(1, progress()));
        for (const end of boundaries) {
          if (end > target) break;
          render(end);
        }
        frame = requestAnimationFrame(tick);
      };
      tick();
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = null;
    },
    finish() {
      this.stop();
      render(text.length);
    },
  };
}

function speakViaElement(url, text, answerEl) {
  return new Promise((resolve) => {
    const audio = sharedAudio || new Audio();
    sharedAudio = audio;
    audio.src = url;
    const reveal = createSpeechReveal(answerEl, text);
    const estimatedDuration = Math.max(1, text.split(/\s+/).length * 0.32);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      reveal.finish();
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      resolve();
    };
    const fallback = () => {
      if (settled) return;
      settled = true;
      reveal.stop();
      speakWithoutAudio(text, answerEl).then(resolve);
    };
    audio.onerror = fallback;
    audio.onended = finish;
    audio.onplaying = () => {
      reveal.start(
        () =>
          audio.currentTime /
          (Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : estimatedDuration),
      );
      setState("speaking");
      mouthLoop();
    };
    try {
      attachAnalyser(audio);
    } catch {
      analyser = null; // analyser is decoration; keep playing without it
    }
    if (audioCtx) audioCtx.resume().catch(() => {});
    audio.play().catch(fallback);
  });
}

// Fetch + decode + BufferSource — keeps unlockAudio/sharedAudio for priming,
// but doesn't leave an HTMLMediaElement session stuck against the mic.
function speakViaWebAudio(url, text, answerEl) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fallback = () => {
      if (settled) return;
      settled = true;
      // Element path as last resort; may still fight recognition on older iOS.
      speakViaElement(url, text, answerEl).then(resolve);
    };

    (async () => {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await audioCtx.resume();
        const res = await fetch(url);
        if (!res.ok) throw new Error("tts");
        const raw = await res.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(raw.slice(0));
        // Reuse one analyser→destination link across turns (don't stack connects).
        if (!analyser || sourceEl) {
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.55;
          analyser.connect(audioCtx.destination);
          timeData = new Uint8Array(analyser.fftSize);
          freqData = new Uint8Array(analyser.frequencyBinCount);
        }
        sourceEl = null;
        const src = audioCtx.createBufferSource();
        src.buffer = decoded;
        src.connect(analyser);
        const reveal = createSpeechReveal(answerEl, text);
        src.onended = () => {
          try { src.disconnect(); } catch {}
          reveal.finish();
          finish();
        };
        setState("speaking");
        mouthLoop();
        const startedAt = audioCtx.currentTime;
        reveal.start(() => (audioCtx.currentTime - startedAt) / decoded.duration);
        src.start();
      } catch {
        fallback();
      }
    })();
  });
}

// TTS unavailable (no key configured, quota, network): animate the mouth for
// roughly reading duration so the face still performs.
function speakWithoutAudio(text, answerEl) {
  return new Promise((resolve) => {
    if (!text) return resolve();
    analyser = null;
    setState("speaking");
    mouthLoop();
    const duration = Math.min(8000, 250 + text.split(/\s+/).length * 320);
    const startedAt = performance.now();
    const reveal = createSpeechReveal(answerEl, text);
    reveal.start(() => (performance.now() - startedAt) / duration);
    setTimeout(() => {
      reveal.finish();
      resolve();
    }, duration);
  });
}

// ---------------------------------------------------------------- voice in

// Hands-free conversation mode: one click arms the mic, and after each
// spoken reply it re-arms automatically — talk, listen, talk, no clicking.
// No vendor "agents" involved; it's a client-side loop around Web Speech.
// On iOS, start() can fail or hang after an async gap / media playback
// (WebKit audio-session bugs). We still auto-restart; only ask for another
// tap if start() throws or recognition goes silent without events.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let silentRounds = 0;
let listenTimer = null;
let listenWatchdog = null;
let listenGeneration = 0;
let awaitingListenTap = false;
let micWarmed = false;

function submitQuestion() {
  if (typeof form.requestSubmit === "function") form.requestSubmit();
  else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

if (SR) {
  micBtn.hidden = false;
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("result", (e) => {
    noteRecognitionActivity();
    const text = [...e.results].map((r) => r[0].transcript).join("");
    input.value = text;
    if (e.results[e.results.length - 1].isFinal) {
      silentRounds = 0;
      submitQuestion();
    }
  });

  // The engine stops itself after a stretch of silence — if we're mid
  // conversation and not waiting on an answer, just start it again.
  recognition.addEventListener("end", () => {
    noteRecognitionActivity();
    if (!convo || busy || awaitingListenTap) return;
    restartListen(isIOS ? 450 : 400);
  });

  recognition.addEventListener("error", (e) => {
    noteRecognitionActivity();
    if (e.error === "no-speech") {
      // several quiet rounds in a row → stand down instead of looping forever
      if (++silentRounds >= 4) stopConvo("still here — hit the button when you want to talk");
    } else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      stopConvo("mic blocked — allow microphone, or type instead");
    } else if (e.error === "aborted") {
      // common when we stop()/abort() before asking — ignore
    } else if (isIOS) {
      // Unexpected error — don't spin forever; ask for a tap.
      armListenGesture();
    }
  });

  micBtn.addEventListener("click", () => {
    unlockAudio();
    warmMic();
    if (!convo) {
      startConvo();
      return;
    }
    // Second tap while armed: either resume listening (iOS fallback) or stop.
    if (awaitingListenTap || state !== "listening") {
      awaitingListenTap = false;
      status.textContent = "";
      listen();
      return;
    }
    stopConvo();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") stopConvo();
  });
} else if (micBtn) {
  // Show why speak is missing on browsers without Web Speech (some iOS versions).
  micBtn.hidden = false;
  micBtn.disabled = true;
  micBtn.textContent = "speak n/a";
  micBtn.title = "Voice input isn’t supported in this browser — type instead";
}

const micLabel = "speak";

function startConvo() {
  convo = true;
  silentRounds = 0;
  awaitingListenTap = false;
  micBtn.textContent = "stop";
  micBtn.setAttribute("aria-pressed", "true");
  warmApis(); // cold-start ask/tts while the user starts talking
  listen();
}

function stopConvo(note = "") {
  convo = false;
  awaitingListenTap = false;
  clearListenTimers();
  micBtn.textContent = micLabel;
  micBtn.setAttribute("aria-pressed", "false");
  try { recognition?.abort(); } catch {
    try { recognition?.stop(); } catch {}
  }
  if (idleish()) setState("idle");
  if (note) status.textContent = note;
}

function clearListenTimers() {
  clearTimeout(listenTimer);
  clearTimeout(listenWatchdog);
  listenTimer = null;
  listenWatchdog = null;
}

function noteRecognitionActivity() {
  clearTimeout(listenWatchdog);
  listenWatchdog = null;
}

// Prime getUserMedia once under the Speak gesture — improves first/next
// SpeechRecognition.start() reliability on iOS without re-prompt churn.
function warmMic() {
  if (micWarmed || !navigator.mediaDevices?.getUserMedia) return;
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      for (const t of stream.getTracks()) t.stop();
      micWarmed = true;
    })
    .catch(() => {
      /* permission denied — SpeechRecognition may still prompt on start() */
    });
}

function armListenGesture() {
  awaitingListenTap = true;
  clearListenTimers();
  if (state === "listening") setState("idle");
  status.textContent = "tap speak to continue";
  micBtn.textContent = "speak";
  micBtn.setAttribute("aria-pressed", "true");
}

function listen() {
  if (!convo || busy || !recognition) return;
  clearTimeout(listenWatchdog);
  listenWatchdog = null;
  const gen = ++listenGeneration;
  try {
    recognition.start();
    awaitingListenTap = false;
    micBtn.textContent = "stop";
    setState("listening");
    status.textContent = STATUS_TEXT.listening;
    if (isIOS) {
      // Hang detector: start() can succeed visually but never emit
      // result/error/end after media playback. Normal silence still gets
      // no-speech within a few seconds; 9s with zero events ⇒ stuck.
      listenWatchdog = setTimeout(() => {
        if (gen !== listenGeneration || !convo || busy) return;
        if (state !== "listening" || awaitingListenTap) return;
        try { recognition.abort(); } catch {
          try { recognition.stop(); } catch {}
        }
        armListenGesture();
      }, 9000);
    }
  } catch {
    // start() throws if already running — leave it. Otherwise iOS blocked us.
    if (isIOS && state !== "listening") armListenGesture();
  }
}

function restartListen(ms) {
  clearTimeout(listenTimer);
  listenTimer = setTimeout(listen, ms);
}

// ---------------------------------------------------------------- boot

// Fire-and-forget: wake serverless ask + tts before the first question so
// cold start overlaps with the user reading / typing / speaking.
function warmApis() {
  const opts = { method: "GET", cache: "no-store", keepalive: true };
  fetch("/api/ask", opts).catch(() => {});
  fetch("/api/tts", opts).catch(() => {});
}
warmApis();
// Re-warm if the tab was backgrounded long enough for free-tier spin-down.
addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") warmApis();
});

// ?state=idle|listening|thinking|speaking pins a state for screenshots/QA.
const forced = new URLSearchParams(location.search).get("state");
if (forced && forced in STATUS_TEXT) {
  setState(forced);
  if (forced === "speaking") mouthLoop();
} else {
  setState("idle");
}

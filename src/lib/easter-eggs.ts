const SQUIRREL = [
  "      ___           ___           ___           ___     ",
  "     /\\  \\         /\\  \\         /\\  \\         /\\  \\    ",
  "    /::\\  \\       /::\\  \\       /::\\  \\       /::\\  \\   ",
  "   /:/\\:\\  \\     /:/\\:\\  \\     /:/\\:\\  \\     /:/\\:\\  \\  ",
  "  /:/  \\:\\  \\   /:/  \\:\\  \\   /:/  \\:\\  \\   /:/  \\:\\  \\ ",
  " /:/__/_\\:\\__\\ /:/__/_\\:\\__\\ /:/__/_\\:\\__\\ /:/__/_\\:\\__\\",
  " \\:\\  /\\ \\/__/ \\:\\  /\\ \\/__/ \\:\\  /\\ \\/__/ \\:\\  /\\ \\/__/",
  "  \\:\\ \\:\\__\\    \\:\\ \\:\\__\\    \\:\\ \\:\\__\\    \\:\\ \\:\\__\\  ",
  "   \\:\\/:/  /     \\:\\/:/  /     \\:\\/:/  /     \\:\\/:/  /  ",
  "    \\::/  /       \\::/  /       \\::/  /       \\::/  /   ",
  "     \\/__/         \\/__/         \\/__/         \\/__/    ",
];

console.log(
  "%c🐿️ Detour Cloud%c — Taking the scenic route to great software.",
  "font-size:20px;font-weight:800;color:#a855f7;",
  "font-size:14px;color:rgba(255,255,255,0.6);",
);
console.log(
  "%cDeploy agents. Build. Ship.",
  "font-size:12px;color:rgba(255,255,255,0.4);",
);
console.log(SQUIRREL.join("\n"));
console.log(
  "%c🔍 Find a bug? Type %cdetour_bounty()%c  🎨 Designer? Type %cdetour_design()%c",
  "font-size:12px;color:rgba(255,255,255,0.4);",
  "font-size:12px;font-weight:700;color:#6366f1;",
  "font-size:12px;color:rgba(255,255,255,0.4);",
  "font-size:12px;font-weight:700;color:#3b82f6;",
  "font-size:12px;color:rgba(255,255,255,0.4);",
);

(window as unknown as Record<string, unknown>).detour_bounty = () => {
  window.open("https://github.com/Dtour-Stack/dtour-cloud/issues/new", "_blank");
};

(window as unknown as Record<string, unknown>).detour_design = () => {
  console.log(
    "%c🎨 Design tokens live in DESIGN.md at the repo root. Colors, radii, motion, glass recipes — all there.",
    "font-size:12px;color:rgba(255,255,255,0.6);",
  );
};

let squirrelClicks = 0;
let squirrelTimer: ReturnType<typeof setTimeout> | null = null;

export function trackSquirrelClick() {
  squirrelClicks++;
  if (squirrelClicks >= 5) {
    squirrelClicks = 0;
    triggerSquirrelParade();
    return;
  }
  if (squirrelTimer) clearTimeout(squirrelTimer);
  squirrelTimer = setTimeout(() => {
    squirrelClicks = 0;
  }, 2000);
}

function triggerSquirrelParade() {
  const img = document.createElement("img");
  img.src = "/brand/dtour/ninja-squirrel.png";
  img.alt = "";
  img.className = "squirrel-parade";
  img.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:48px;height:48px;z-index:9999;pointer-events:none;";

  const msg = document.createElement("div");
  msg.textContent = "🐿️ Taking the scenic route!";
  msg.className = "squirrel-parade";
  msg.style.cssText =
    "position:fixed;bottom:70px;right:20px;z-index:9999;pointer-events:none;font-size:13px;color:rgba(168,85,247,0.8);font-weight:600;background:rgba(0,0,0,0.8);padding:6px 14px;border-radius:999px;border:1px solid rgba(168,85,247,0.2);backdrop-filter:blur(8px);";

  document.body.appendChild(msg);
  document.body.appendChild(img);

  setTimeout(() => {
    img.remove();
    msg.remove();
  }, 2500);
}

let konamiBuffer: string[] = [];
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

export function trackKonamiCode(key: string) {
  konamiBuffer.push(key);
  if (konamiBuffer.length > KONAMI.length) {
    konamiBuffer.shift();
  }
  if (
    konamiBuffer.length === KONAMI.length &&
    konamiBuffer.every((k, i) => k === KONAMI[i])
  ) {
    konamiBuffer = [];
    triggerSquirrelParade();
    confettiBurst();
  }
}

export function confettiBurst(origin?: HTMLElement) {
  const rect = origin
    ? origin.getBoundingClientRect()
    : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
  const count = 30;
  const colors = ["#a855f7", "#6366f1", "#3b82f6", "#c084fc", "#818cf8", "#60a5fa"];

  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div");
    particle.className = "confetti-particle";
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 4 + Math.random() * 6;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 60 + Math.random() * 100;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    particle.style.cssText = `
      position:fixed;
      left:${rect.left + (origin ? rect.width / 2 : 0)}px;
      top:${rect.top + (origin ? rect.height / 2 : 0)}px;
      width:${size}px;
      height:${size}px;
      background:${color};
      border-radius:${Math.random() > 0.5 ? "50%" : "2px"};
      z-index:9999;
      pointer-events:none;
      --dx:${dx}px;
      --dy:${dy}px;
      animation:confetti-fall 1.2s cubic-bezier(0.25,0.46,0.45,0.94) both;
      animation-delay:${Math.random() * 0.15}s;
      transform:translate(var(--dx), var(--dy)) rotate(${Math.random() * 720}deg);
    `;

    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 2000);
  }
}

// ── "scenic route" keyboard chord ──

let scenicBuffer = "";

export function trackScenicChord(key: string) {
  if (key.length === 1) {
    scenicBuffer = (scenicBuffer + key.toLowerCase()).slice(-15);
    if (scenicBuffer.includes("scenicroute") || scenicBuffer.includes("scenic")) {
      scenicBuffer = "";
      triggerSquirrelParade();
      confettiBurst();
    }
  } else {
    scenicBuffer = "";
  }
}

// ── Sleepy squirrel check ──

export function isLateNight(): boolean {
  const h = new Date().getHours();
  return h >= 2 && h < 5;
}

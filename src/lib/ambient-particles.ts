/** Ambient floating particles for brand pages. Creates violet/indigo/blue
 *  dots that drift upward slowly. Call once on mount, cleanup on unmount. */

export function spawnAmbientParticles(
  container: HTMLElement,
  count = 20,
): () => void {
  const particles: HTMLDivElement[] = [];
  const colors = [
    "rgba(168,85,247,0.15)",
    "rgba(99,102,241,0.12)",
    "rgba(59,130,246,0.10)",
    "rgba(192,132,252,0.08)",
  ];

  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    const size = 2 + Math.random() * 3;
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const duration = 15 + Math.random() * 25;
    const delay = Math.random() * 20;
    const drift = (Math.random() - 0.5) * 40;

    p.style.cssText = `
      position:fixed;
      left:${x}%;
      bottom:-5px;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:${colors[i % colors.length]};
      pointer-events:none;
      z-index:0;
      opacity:0;
      animation:ambient-drift ${duration}s ${delay}s ease-in-out infinite;
      --drift:${drift}px;
    `;

    container.appendChild(p);
    particles.push(p);
  }

  return () => {
    particles.forEach((p) => p.remove());
  };
}

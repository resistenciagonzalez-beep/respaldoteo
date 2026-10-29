import React, { useEffect, useRef } from 'react';
import { ThemeName } from '../types';
import { sfx } from '../utils/audio';

interface BingoCageCanvasProps {
  isSpinning: boolean;
  isExtracting: boolean;
  theme: ThemeName;
  remainingCount: number;
  sfxEnabled: boolean;
}

interface SimulatedBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  color: string;
  number: number;
}

export const BingoCageCanvas: React.FC<BingoCageCanvasProps> = ({
  isSpinning,
  isExtracting,
  theme,
  remainingCount,
  sfxEnabled,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const ballsRef = useRef<SimulatedBall[]>([]);
  const rotationAngleRef = useRef<number>(0);
  const rotationSpeedRef = useRef<number>(0.02);
  const lastRattleTimeRef = useRef<number>(0);

  // Initialize particles / balls inside the cage
  useEffect(() => {
    const balls: SimulatedBall[] = [];
    // Display up to 36 visual representative balls inside the tumbler
    const ballCount = Math.min(36, Math.max(6, remainingCount));

    const getThemeColors = () => {
      switch (theme) {
        case 'neon':
          return ['#38bdf8', '#f43f5e', '#facc15', '#4ade80', '#c084fc'];
        case 'minimalist':
          return ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'];
        case 'vintage':
          return ['#ca8a04', '#dc2626', '#d97706', '#16a34a', '#78350f'];
        case 'classic':
        default:
          return ['#2563eb', '#dc2626', '#eab308', '#16a34a', '#9333ea'];
      }
    };

    const colors = getThemeColors();

    for (let i = 0; i < ballCount; i++) {
      // Random positions inside a sphere of radius 60
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 55;
      const sinPhi = Math.sin(phi);

      balls.push({
        x: r * sinPhi * Math.cos(theta),
        y: r * sinPhi * Math.sin(theta) + 20, // offset towards bottom
        z: r * Math.cos(phi),
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        vz: (Math.random() - 0.5) * 2,
        radius: 7.5,
        color: colors[i % colors.length],
        number: (i * 3 + 7) % 90 + 1,
      });
    }

    ballsRef.current = balls;
  }, [theme, remainingCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.offsetWidth * window.devicePixelRatio || 320);
    let height = (canvas.height = canvas.offsetHeight * window.devicePixelRatio || 320);
    let SPHERE_RADIUS = Math.min(width, height) * 0.32;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth * window.devicePixelRatio || 320;
      height = canvas.height = canvas.offsetHeight * window.devicePixelRatio || 320;
      SPHERE_RADIUS = Math.min(width, height) * 0.32;
    };

    window.addEventListener('resize', handleResize);

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2 - 10;

      // Determine rotation speed
      const targetSpeed = isExtracting ? 0.18 : isSpinning ? 0.09 : 0.012;
      rotationSpeedRef.current += (targetSpeed - rotationSpeedRef.current) * 0.08;
      rotationAngleRef.current += rotationSpeedRef.current;

      const angle = rotationAngleRef.current;

      // Play audio rattle occasionally when spinning fast
      if (sfxEnabled && (isSpinning || isExtracting)) {
        if (time - lastRattleTimeRef.current > (isExtracting ? 120 : 220)) {
          sfx.playBallRattle(isExtracting ? 0.6 : 0.35);
          lastRattleTimeRef.current = time;
        }
      }

      // 1. Draw Stand & Base (Mechanical structure)
      drawStand(ctx, centerX, centerY, SPHERE_RADIUS, theme);

      // 2. Update and simulate balls inside sphere
      const balls = ballsRef.current;
      const gravity = 0.45;
      const bounce = 0.72;
      const maxDist = SPHERE_RADIUS - 10;

      balls.forEach((b) => {
        // Gravity & Centrifugal force when rotating
        b.vy += gravity;
        if (isSpinning || isExtracting) {
          const turb = isExtracting ? 4.5 : 2.2;
          b.vx += (Math.random() - 0.5) * turb - b.y * 0.015 * (rotationSpeedRef.current * 10);
          b.vy += (Math.random() - 0.5) * turb + b.x * 0.015 * (rotationSpeedRef.current * 10);
          b.vz += (Math.random() - 0.5) * turb;
        }

        b.x += b.vx;
        b.y += b.vy;
        b.z += b.vz;

        // Friction
        b.vx *= 0.985;
        b.vy *= 0.985;
        b.vz *= 0.985;

        // Spherical boundary collision
        const dist = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
        if (dist > maxDist) {
          const nx = b.x / dist;
          const ny = b.y / dist;
          const nz = b.z / dist;

          // Push back to boundary
          b.x = nx * maxDist;
          b.y = ny * maxDist;
          b.z = nz * maxDist;

          // Reflect velocity vector
          const dot = b.vx * nx + b.vy * ny + b.vz * nz;
          b.vx = (b.vx - 2 * dot * nx) * bounce;
          b.vy = (b.vy - 2 * dot * ny) * bounce;
          b.vz = (b.vz - 2 * dot * nz) * bounce;
        }
      });

      // 3. Draw Back Wires of the Cage Sphere
      drawCageWireframe(ctx, centerX, centerY, SPHERE_RADIUS, angle, theme, false);

      // 4. Sort and Draw Balls (sorted by Z for 3D depth)
      const sortedBalls = [...balls].sort((a, b) => a.z - b.z);

      sortedBalls.forEach((b) => {
        // Simple 3D projection
        const scale = (b.z + SPHERE_RADIUS * 1.5) / (SPHERE_RADIUS * 2.5);
        const clampedScale = Math.max(0.65, Math.min(1.2, scale));
        const projX = centerX + b.x;
        const projY = centerY + b.y;
        const radius = b.radius * clampedScale * (width / 320);

        // Draw shadow/depth
        ctx.beginPath();
        ctx.arc(projX, projY, radius, 0, Math.PI * 2);

        if (theme === 'neon') {
          ctx.fillStyle = '#0a0e1a';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = b.color;
          ctx.stroke();
          // Small neon center
          ctx.beginPath();
          ctx.arc(projX, projY, radius * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = b.color;
          ctx.fill();
        } else if (theme === 'minimalist') {
          ctx.fillStyle = b.color;
          ctx.fill();
        } else if (theme === 'vintage') {
          const grad = ctx.createRadialGradient(
            projX - radius * 0.3,
            projY - radius * 0.3,
            radius * 0.1,
            projX,
            projY,
            radius
          );
          grad.addColorStop(0, '#fef08a');
          grad.addColorStop(0.3, b.color);
          grad.addColorStop(1, '#291104');
          ctx.fillStyle = grad;
          ctx.fill();
        } else {
          // Classic 3D plastic ball
          const grad = ctx.createRadialGradient(
            projX - radius * 0.35,
            projY - radius * 0.35,
            radius * 0.1,
            projX,
            projY,
            radius
          );
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, b.color);
          grad.addColorStop(1, '#020617');
          ctx.fillStyle = grad;
          ctx.fill();
        }
      });

      // 5. Draw Front Wires and Glass Sphere Sheen
      drawCageWireframe(ctx, centerX, centerY, SPHERE_RADIUS, angle, theme, true);
      drawSphereGlassHighlight(ctx, centerX, centerY, SPHERE_RADIUS, theme);

      // 6. Draw Ejection Chute / Output Hopper
      drawEjectionChute(ctx, centerX, centerY, SPHERE_RADIUS, theme, isExtracting);

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isSpinning, isExtracting, theme, sfxEnabled]);

  return (
    <div id="bingo-cage-wrapper" className="relative w-full h-36 sm:h-44 lg:h-40 xl:h-48 flex items-center justify-center select-none overflow-hidden flex-shrink-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-pointer transition-transform duration-300"
        title="Bombo de bingo interactivo"
      />
      {/* Visual Badge overlay */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full text-xs font-medium tracking-wide flex items-center gap-1.5 shadow-sm bg-black/40 backdrop-blur-md text-white/80 border border-white/10">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isExtracting
              ? 'bg-amber-400 animate-ping'
              : isSpinning
              ? 'bg-emerald-400 animate-pulse'
              : 'bg-slate-400'
          }`}
        />
        {isExtracting ? 'Extrayendo...' : isSpinning ? 'En giro continuo' : 'Bombo en espera'}
      </div>
    </div>
  );
};

// Helper renderer: Mechanical Stand
function drawStand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  theme: ThemeName
) {
  const metalColor =
    theme === 'neon'
      ? '#00f0ff'
      : theme === 'vintage'
      ? '#d97706'
      : theme === 'minimalist'
      ? '#94a3b8'
      : '#cbd5e1';

  const baseColor =
    theme === 'neon'
      ? '#0d1726'
      : theme === 'vintage'
      ? '#451a03'
      : theme === 'minimalist'
      ? '#f1f5f9'
      : '#1e293b';

  ctx.save();
  ctx.strokeStyle = metalColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  // Left & right support struts (A-frame)
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.95, cy + r * 1.15);
  ctx.lineTo(cx - r * 0.98, cy);
  ctx.lineTo(cx - r * 0.5, cy + r * 1.15);

  ctx.moveTo(cx + r * 0.95, cy + r * 1.15);
  ctx.lineTo(cx + r * 0.98, cy);
  ctx.lineTo(cx + r * 0.5, cy + r * 1.15);
  ctx.stroke();

  // Central axis pin
  ctx.beginPath();
  ctx.arc(cx - r * 0.98, cy, 7, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.98, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = metalColor;
  ctx.fill();

  // Base platform
  ctx.beginPath();
  ctx.roundRect(cx - r * 1.1, cy + r * 1.15, r * 2.2, 10, 5);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// Helper renderer: 3D Cage Wireframe
function drawCageWireframe(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  theme: ThemeName,
  front: boolean
) {
  ctx.save();
  ctx.lineWidth = front ? 2 : 1;

  if (theme === 'neon') {
    ctx.strokeStyle = front ? 'rgba(0, 240, 255, 0.45)' : 'rgba(0, 240, 255, 0.15)';
    if (front) {
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 6;
    }
  } else if (theme === 'vintage') {
    ctx.strokeStyle = front ? 'rgba(217, 119, 6, 0.55)' : 'rgba(180, 83, 9, 0.2)';
  } else if (theme === 'minimalist') {
    ctx.strokeStyle = front ? 'rgba(148, 163, 184, 0.5)' : 'rgba(203, 213, 225, 0.25)';
  } else {
    // Classic chrome / brass cage
    ctx.strokeStyle = front ? 'rgba(255, 255, 255, 0.5)' : 'rgba(148, 163, 184, 0.2)';
  }

  // Outer ring
  if (front) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Rotating longitude ribs (vertical meridians)
  const ribCount = 8;
  for (let i = 0; i < ribCount; i++) {
    const ribAngle = angle + (i * Math.PI) / ribCount;
    const cosVal = Math.cos(ribAngle);

    // Front/back segregation
    const isFrontRib = Math.sin(ribAngle) >= 0;
    if (isFrontRib !== front) continue;

    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(cosVal * r), r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Horizontal latitude bands
  if (front) {
    const latitudes = [-0.65, -0.32, 0, 0.32, 0.65];
    latitudes.forEach((lat) => {
      const latY = cy + lat * r;
      const latR = Math.sqrt(Math.max(0, r * r - (lat * r) * (lat * r)));
      ctx.beginPath();
      ctx.ellipse(cx, latY, latR, latR * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  ctx.restore();
}

// Helper renderer: Acrylic/Glass sphere reflection
function drawSphereGlassHighlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  theme: ThemeName
) {
  ctx.save();
  const grad = ctx.createRadialGradient(
    cx - r * 0.45,
    cy - r * 0.45,
    r * 0.1,
    cx - r * 0.3,
    cy - r * 0.3,
    r * 0.8
  );

  if (theme === 'neon') {
    grad.addColorStop(0, 'rgba(0, 240, 255, 0.35)');
    grad.addColorStop(0.4, 'rgba(0, 240, 255, 0.05)');
    grad.addColorStop(1, 'transparent');
  } else {
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.08)');
    grad.addColorStop(1, 'transparent');
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Highlight curve at top edge
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.25, cy - r * 0.45, r * 0.4, r * 0.18, -Math.PI / 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fill();

  ctx.restore();
}

// Helper renderer: Ejection Chute
function drawEjectionChute(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  theme: ThemeName,
  isExtracting: boolean
) {
  ctx.save();
  const chuteColor =
    theme === 'neon'
      ? '#00f0ff'
      : theme === 'vintage'
      ? '#ca8a04'
      : theme === 'minimalist'
      ? '#64748b'
      : '#e2e8f0';

  ctx.strokeStyle = chuteColor;
  ctx.lineWidth = 3;

  // Curved exit funnel at the bottom right
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.4, cy + r * 0.85);
  ctx.quadraticCurveTo(cx + r * 0.8, cy + r * 1.1, cx + r * 1.1, cy + r * 1.05);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + r * 0.2, cy + r * 0.95);
  ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 1.25, cx + r * 1.05, cy + r * 1.2);
  ctx.stroke();

  // If currently extracting, draw a glowing ball rolling out of chute
  if (isExtracting) {
    const ballX = cx + r * 0.85;
    const ballY = cy + r * 1.05;
    ctx.beginPath();
    ctx.arc(ballX, ballY, 11, 0, Math.PI * 2);
    ctx.fillStyle = theme === 'neon' ? '#f43f5e' : '#f59e0b';
    ctx.shadowColor = theme === 'neon' ? '#f43f5e' : '#f59e0b';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

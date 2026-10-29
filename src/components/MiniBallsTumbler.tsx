import React from 'react';

interface MiniBallsTumblerProps {
  size?: number | string;
}

export const MiniBallsTumbler: React.FC<MiniBallsTumblerProps> = () => {
  // Vibrant colorful mini-balls matching traditional bingo colors
  const miniBalls = [
    { num: 7, color: 'from-rose-500 to-red-600 border-red-300', text: 'text-white', anim: 'animate-mini-ball-1', top: '22%', left: '20%' },
    { num: 23, color: 'from-blue-500 to-blue-700 border-blue-300', text: 'text-white', anim: 'animate-mini-ball-2', top: '25%', left: '60%' },
    { num: 42, color: 'from-amber-400 to-amber-600 border-amber-200', text: 'text-slate-950', anim: 'animate-mini-ball-3', top: '55%', left: '22%' },
    { num: 15, color: 'from-emerald-500 to-emerald-700 border-emerald-300', text: 'text-white', anim: 'animate-mini-ball-4', top: '52%', left: '58%' },
    { num: 68, color: 'from-purple-500 to-purple-700 border-purple-300', text: 'text-white', anim: 'animate-mini-ball-1', top: '38%', left: '40%' },
    { num: 31, color: 'from-pink-500 to-rose-600 border-pink-300', text: 'text-white', anim: 'animate-mini-ball-2', top: '15%', left: '42%' },
    { num: 54, color: 'from-cyan-400 to-blue-500 border-cyan-200', text: 'text-slate-950', anim: 'animate-mini-ball-3', top: '65%', left: '40%' },
  ];

  return (
    <div
      id="mini-balls-tumbler"
      className="relative w-full h-full rounded-full overflow-hidden flex flex-col items-center justify-center select-none bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900"
      style={{
        boxShadow: 'inset 0 0 25px rgba(0, 0, 0, 0.8), inset 0 2px 5px rgba(255, 255, 255, 0.2)',
      }}
    >
      {/* Whirling background wind vortex effect */}
      <div className="absolute inset-2 rounded-full border border-dashed border-blue-400/25 animate-mini-orbit pointer-events-none" />
      <div className="absolute inset-5 rounded-full border border-dashed border-amber-400/20 animate-mini-orbit pointer-events-none [animation-direction:reverse] [animation-duration:1.2s]" />

      {/* Glossy top glass reflection highlight */}
      <div className="absolute top-1.5 left-4 w-10 h-4 rounded-full bg-white/20 blur-[1.5px] -rotate-30 pointer-events-none z-30" />

      {/* Swirling Mini Balls */}
      <div className="relative w-full h-full">
        {miniBalls.map((b, idx) => (
          <div
            key={idx}
            className={`absolute flex items-center justify-center rounded-full font-black text-[9px] sm:text-[10px] shadow-lg border bg-gradient-to-br ${b.color} ${b.text} ${b.anim}`}
            style={{
              top: b.top,
              left: b.left,
              width: 'clamp(18px, 2.8vw, 24px)',
              height: 'clamp(18px, 2.8vw, 24px)',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
              transition: 'transform 0.1s ease-out',
            }}
          >
            {/* Specular 3D dot */}
            <div className="absolute top-0.5 left-1 w-1.5 h-1 rounded-full bg-white/60 blur-[0.5px] pointer-events-none" />
            <span className="leading-none select-none drop-shadow-xs">{b.num}</span>
          </div>
        ))}
      </div>

      {/* Mixing banner at bottom */}
      <div className="absolute bottom-2 inset-x-0 flex items-center justify-center z-20 pointer-events-none">
        <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs border border-amber-400/40 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-amber-300 animate-pulse drop-shadow-sm">
          Mezclando...
        </span>
      </div>
    </div>
  );
};

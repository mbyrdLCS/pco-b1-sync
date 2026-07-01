'use client';

export default function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-center items-center text-center overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #1e293b 100%)',
      }}
    >
      {/* Dot pattern overlay */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(148,163,184,0.15) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Radial glow center */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(59,130,246,0.4) 0%, transparent 70%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-8 flex flex-col items-center gap-8">
        {/* Eyebrow */}
        <p className="text-blue-400 text-sm font-semibold tracking-[0.2em] uppercase">
          Cornerstone Church &mdash; Springfield, IL
        </p>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.08] tracking-tight max-w-4xl">
          A Community Built On What Matters Most
        </h1>

        {/* Subtitle */}
        <p className="text-slate-300 text-xl sm:text-2xl max-w-xl leading-relaxed font-light">
          Join us every Sunday in Springfield, Illinois
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mt-2">
          <a
            href="#services"
            className="bg-white text-black text-sm font-semibold px-8 py-4 rounded hover:bg-slate-100 transition-colors duration-200 tracking-wide"
          >
            Plan Your Visit
          </a>
          <a
            href="#"
            className="border border-white/60 text-white text-sm font-semibold px-8 py-4 rounded hover:bg-white/10 transition-colors duration-200 tracking-wide"
          >
            Watch Online
          </a>
        </div>

        {/* Scroll hint */}
        <div className="mt-8 flex flex-col items-center gap-2 opacity-50">
          <span className="text-white text-xs tracking-widest uppercase">Scroll</span>
          <div className="w-px h-8 bg-white/50" />
        </div>
      </div>

      {/* Bottom fade to white */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,1) 100%)',
        }}
      />
    </section>
  );
}

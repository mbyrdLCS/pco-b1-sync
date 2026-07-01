export default function ServiceTimes() {
  return (
    <section id="services" className="bg-white py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-black tracking-tight mb-4">
            Join Us This Sunday
          </h2>
          <p className="text-gray-500 text-lg max-w-lg mx-auto">
            We&apos;d love to have you &mdash; no matter where you are on your journey.
          </p>
        </div>

        {/* Service Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {/* Card 1 */}
          <div className="border border-gray-200 rounded-lg p-8 flex flex-col gap-3 hover:border-gray-400 transition-colors">
            <span className="text-xs font-semibold text-gray-400 tracking-widest uppercase">
              Sunday Morning
            </span>
            <p className="text-5xl font-black text-black tracking-tight">9:00</p>
            <p className="text-base font-medium text-gray-600">Traditional Service</p>
            <p className="text-sm text-gray-400 leading-relaxed mt-1">
              Classic hymns, liturgy, and verse-by-verse expository preaching.
            </p>
          </div>

          {/* Card 2 — Featured */}
          <div className="bg-slate-900 rounded-lg p-8 flex flex-col gap-3 ring-2 ring-slate-700 hover:ring-blue-600 transition-all">
            <span className="text-xs font-semibold text-blue-400 tracking-widest uppercase">
              Sunday Morning &mdash; Most Popular
            </span>
            <p className="text-5xl font-black text-white tracking-tight">11:00</p>
            <p className="text-base font-medium text-slate-300">Contemporary Service</p>
            <p className="text-sm text-slate-400 leading-relaxed mt-1">
              Modern worship, casual atmosphere, and practical biblical teaching.
            </p>
          </div>

          {/* Card 3 */}
          <div className="border border-gray-200 rounded-lg p-8 flex flex-col gap-3 hover:border-gray-400 transition-colors">
            <span className="text-xs font-semibold text-gray-400 tracking-widest uppercase">
              Wednesday Evening
            </span>
            <p className="text-5xl font-black text-black tracking-tight">6:30</p>
            <p className="text-base font-medium text-gray-600">Midweek Service</p>
            <p className="text-sm text-gray-400 leading-relaxed mt-1">
              Prayer, worship, and a mid-week message to carry you through the week.
            </p>
          </div>
        </div>

        {/* Address Block */}
        <div className="flex items-start gap-4 justify-center border-t border-gray-100 pt-12">
          <div className="flex-shrink-0 mt-0.5">
            {/* Pin Icon */}
            <svg
              className="w-5 h-5 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-black">
              2200 Cornerstone Blvd, Springfield, IL 62701
            </p>
            <a
              href="https://maps.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-black transition-colors mt-1 inline-block"
            >
              Get Directions &rarr;
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

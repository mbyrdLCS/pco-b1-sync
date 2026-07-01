const events = [
  {
    month: 'JUN',
    day: '1',
    name: 'New Here Lunch',
    description: "Brand new to Cornerstone? Come share a meal with our pastors and get all your questions answered.",
    meta: 'After the 11am service · Cornerstone Café',
    color: 'bg-blue-600',
  },
  {
    month: 'JUN',
    day: '20',
    name: 'Summer Youth Camp',
    description: 'A life-changing week of worship, teaching, and adventure for students grades 6–12.',
    meta: 'Jun 20–24 · Overnight Camp',
    color: 'bg-indigo-600',
  },
  {
    month: 'JUL',
    day: '11',
    name: "Men's Retreat",
    description: 'Two days away with God and brothers. Unplugged, refreshing, and deeply encouraging.',
    meta: 'Jul 11–13 · Lake Springfield Conference Center',
    color: 'bg-slate-700',
  },
  {
    month: 'AUG',
    day: '2',
    name: "Women's One-Day Conference",
    description: 'A full day of worship, speakers, breakout sessions, and community for the women of Cornerstone.',
    meta: '9am–4pm · Main Auditorium',
    color: 'bg-violet-600',
  },
  {
    month: 'AUG',
    day: '17',
    name: 'Back to School Bash',
    description: 'Free food, games, giveaways, and a backpack drive for Springfield families. Everyone welcome.',
    meta: '4pm–8pm · Church Campus',
    color: 'bg-emerald-600',
  },
];

export default function Events() {
  return (
    <section id="events" className="bg-slate-50 py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-14">
          <div>
            <h2 className="text-4xl sm:text-5xl font-bold text-black tracking-tight mb-3">
              What&apos;s Coming Up
            </h2>
            <p className="text-gray-500 text-lg">
              Don&apos;t miss what&apos;s happening at Cornerstone this season.
            </p>
          </div>
          <a
            href="#"
            className="text-black text-sm font-semibold hover:text-gray-500 transition-colors whitespace-nowrap inline-flex items-center gap-1"
          >
            View All Events <span aria-hidden>&rarr;</span>
          </a>
        </div>

        {/* Events list */}
        <div className="flex flex-col gap-4">
          {events.map((event) => (
            <div
              key={event.name}
              className="bg-white rounded-lg border border-gray-100 hover:border-gray-300 transition-colors p-6 flex flex-col sm:flex-row items-start gap-6"
            >
              {/* Date Badge */}
              <div
                className={`${event.color} rounded-lg flex-shrink-0 w-16 h-16 flex flex-col items-center justify-center text-white`}
              >
                <span className="text-[10px] font-bold tracking-widest uppercase leading-none mb-0.5">
                  {event.month}
                </span>
                <span className="text-2xl font-black leading-none">{event.day}</span>
              </div>

              {/* Content */}
              <div className="flex flex-col gap-1.5 flex-1">
                <h3 className="text-black font-bold text-lg leading-tight">{event.name}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{event.description}</p>
                <p className="text-gray-400 text-xs font-medium tracking-wide mt-0.5">
                  {event.meta}
                </p>
              </div>

              {/* Arrow */}
              <div className="hidden sm:flex items-center self-center text-gray-300 hover:text-gray-600 transition-colors">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

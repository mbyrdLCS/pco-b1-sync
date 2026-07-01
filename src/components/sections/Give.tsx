const funds = [
  {
    name: 'General Fund',
    description: 'Supports all ministries, staff, and operations of Cornerstone Church.',
  },
  {
    name: 'Building Fund',
    description: 'Expanding our campus to serve a growing congregation and community.',
  },
  {
    name: 'Missions Fund',
    description: 'Sending and supporting missionaries locally and around the world.',
  },
  {
    name: 'Youth Ministry',
    description: 'Investing in the next generation through programs, events, and camps.',
  },
];

export default function Give() {
  return (
    <section id="give" className="bg-black py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          {/* Left Column */}
          <div className="flex flex-col gap-8">
            <div>
              <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-6 leading-tight">
                Generosity Changes Everything
              </h2>
              <p className="text-gray-400 text-base leading-relaxed max-w-md">
                Giving is more than a transaction — it&apos;s an act of worship and a declaration of
                trust. When you give at Cornerstone, you&apos;re investing in life change in
                Springfield and around the world.
              </p>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed max-w-md">
              Every dollar given through Cornerstone is stewarded with integrity and accountability.
              We publish an annual financial report available to all members.
            </p>
            <div>
              <a
                href="#"
                className="inline-block bg-white text-black text-sm font-semibold px-8 py-4 rounded hover:bg-gray-100 transition-colors duration-200 tracking-wide"
              >
                Give Online &rarr;
              </a>
            </div>
          </div>

          {/* Right Column — Fund Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {funds.map((fund) => (
              <div
                key={fund.name}
                className="bg-gray-900 border border-gray-800 rounded-lg p-6 flex flex-col gap-3 hover:border-gray-600 transition-colors"
              >
                <h3 className="text-white font-bold text-base">{fund.name}</h3>
                <p className="text-gray-400 text-sm leading-relaxed flex-1">{fund.description}</p>
                <a
                  href="#"
                  className="text-gray-400 text-xs font-semibold hover:text-white transition-colors inline-flex items-center gap-1"
                >
                  Give <span aria-hidden>&rarr;</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

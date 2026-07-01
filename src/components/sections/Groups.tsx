const groups = [
  {
    name: "Men's Bible Study",
    time: 'Tuesdays at 7:00 PM',
    description:
      'Iron sharpens iron. Join men from all walks of life for deep study, prayer, and authentic brotherhood.',
    color: 'bg-slate-700',
    tag: 'Men',
  },
  {
    name: "Women's Ministry",
    time: 'Thursdays at 9:00 AM',
    description:
      'A warm, welcoming space for women to grow in faith, build friendships, and encourage one another.',
    color: 'bg-blue-700',
    tag: 'Women',
  },
  {
    name: 'Young Adults 18–30',
    time: 'Fridays at 7:00 PM',
    description:
      'Real community for the 18–30 crowd. We talk faith, life, career, and everything in between.',
    color: 'bg-indigo-700',
    tag: 'Young Adults',
  },
  {
    name: 'Youth Ministry',
    time: 'Wednesdays at 6:00 PM',
    description:
      'A safe, fun environment for students in grades 6–12 to encounter Jesus and find their people.',
    color: 'bg-violet-700',
    tag: 'Youth',
  },
];

export default function Groups() {
  return (
    <section id="groups" className="bg-white py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-14">
          <h2 className="text-4xl sm:text-5xl font-bold text-black tracking-tight mb-4">
            Life Is Better Together
          </h2>
          <p className="text-gray-500 text-lg max-w-lg">
            Find your people in one of our ministry groups.
          </p>
        </div>

        {/* Group Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {groups.map((group) => (
            <div
              key={group.name}
              className="flex flex-col border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-shadow duration-200"
            >
              {/* Colored header bar */}
              <div className={`${group.color} px-6 py-5`}>
                <span className="text-xs font-semibold text-white/70 tracking-widest uppercase">
                  {group.tag}
                </span>
              </div>

              {/* Card body */}
              <div className="flex flex-col flex-1 p-6 gap-3">
                <h3 className="text-black font-bold text-base leading-tight">{group.name}</h3>
                <p className="text-gray-400 text-xs font-medium tracking-wide">{group.time}</p>
                <p className="text-gray-500 text-sm leading-relaxed flex-1">{group.description}</p>
                <a
                  href="#"
                  className="text-black text-sm font-semibold hover:text-gray-500 transition-colors mt-2 inline-flex items-center gap-1"
                >
                  Learn More <span aria-hidden>&rarr;</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

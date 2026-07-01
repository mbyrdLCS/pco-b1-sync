export default function About() {
  const values = [
    {
      title: 'Authentic Community',
      body: 'We build real relationships where people can be known, loved, and challenged to grow — no masks required.',
    },
    {
      title: 'Biblical Teaching',
      body: 'Every week, practical and faithful teaching from Scripture that meets you where you are and moves you forward.',
    },
    {
      title: 'Serving Springfield',
      body: 'We love our city. From food pantries to neighborhood cleanups, we show up for Springfield every week.',
    },
  ];

  return (
    <section id="about" className="bg-slate-900 py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          {/* Left: Quote */}
          <div className="flex flex-col gap-8">
            <blockquote>
              <p className="text-3xl sm:text-4xl font-light italic text-white leading-snug tracking-tight">
                &ldquo;We exist to help people find and follow Jesus &mdash; together.&rdquo;
              </p>
            </blockquote>
            <p className="text-slate-400 text-base leading-relaxed max-w-md">
              Cornerstone Church has been rooted in Springfield since 2007. We are a diverse,
              multi-generational family of believers committed to gospel-centered life together.
            </p>
            <a
              href="#"
              className="text-white text-sm font-semibold hover:text-slate-300 transition-colors inline-flex items-center gap-2"
            >
              About Us <span aria-hidden>&rarr;</span>
            </a>
          </div>

          {/* Right: Value Statements */}
          <div className="flex flex-col gap-0 divide-y divide-slate-800">
            {values.map((value) => (
              <div key={value.title} className="py-8 first:pt-0 last:pb-0">
                {/* Accent line */}
                <div className="w-8 h-0.5 bg-blue-500 mb-4" />
                <h3 className="text-white text-lg font-bold mb-2">{value.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{value.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

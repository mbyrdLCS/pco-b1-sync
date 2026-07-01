const footerLinks = [
  {
    heading: 'Visit',
    links: [
      { label: 'Service Times', href: '#services' },
      { label: 'Location & Parking', href: '#' },
      { label: 'What to Expect', href: '#' },
      { label: 'New Here', href: '#' },
    ],
  },
  {
    heading: 'Ministries',
    links: [
      { label: 'Men', href: '#' },
      { label: 'Women', href: '#' },
      { label: 'Youth', href: '#' },
      { label: 'Young Adults', href: '#' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Sermons', href: '#' },
      { label: 'Podcast', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Give', href: '#give' },
    ],
  },
  {
    heading: 'Connect',
    links: [
      { label: 'Prayer Request', href: '#' },
      { label: 'Volunteer', href: '#' },
      { label: 'Contact', href: '#' },
      { label: 'Jobs', href: '#' },
    ],
  },
];

const socialLinks = [
  { label: 'Instagram', href: '#' },
  { label: 'Facebook', href: '#' },
  { label: 'YouTube', href: '#' },
  { label: 'Spotify', href: '#' },
];

export default function Footer() {
  return (
    <footer className="bg-black text-white py-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Top Row: Logo + Tagline */}
        <div className="mb-14">
          <p className="text-xl font-black tracking-widest uppercase mb-2">CORNERSTONE</p>
          <p className="text-gray-400 text-sm">
            A community built on what matters most. &mdash; Springfield, IL
          </p>
        </div>

        {/* Link Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-14">
          {footerLinks.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-bold text-gray-500 tracking-widest uppercase mb-5">
                {col.heading}
              </p>
              <ul className="flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-gray-400 text-sm hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          {/* Copyright */}
          <p className="text-gray-600 text-sm">
            &copy; {new Date().getFullYear()} Cornerstone Church, Springfield, IL. All rights
            reserved.
          </p>

          {/* Social Links */}
          <div className="flex items-center gap-6">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                className="text-gray-500 text-sm hover:text-white transition-colors"
              >
                {social.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

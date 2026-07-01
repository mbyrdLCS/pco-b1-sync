'use client';

import { useState, useEffect, useRef } from 'react';

const navLinks = [
  { label: 'About', href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'Groups', href: '#groups' },
  { label: 'Events', href: '#events' },
  { label: 'Give', href: '#give' },
];

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      setScrolled(currentScrollY > 20);

      if (currentScrollY < 80) {
        setVisible(true);
      } else if (currentScrollY > lastScrollY.current) {
        // Scrolling down
        setVisible(false);
        setMenuOpen(false);
      } else {
        // Scrolling up
        setVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`
        fixed top-0 left-0 right-0 z-50 transition-all duration-300
        ${visible ? 'translate-y-0' : '-translate-y-full'}
        ${scrolled ? 'bg-white/85 shadow-sm' : 'bg-transparent'}
      `}
      style={scrolled ? { backdropFilter: 'blur(15px)', WebkitBackdropFilter: 'blur(15px)' } : {}}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-18">
          {/* Logo */}
          <a
            href="#"
            className={`text-lg font-black tracking-widest uppercase transition-colors duration-300 ${
              scrolled ? 'text-black' : 'text-white'
            }`}
          >
            CORNERSTONE
          </a>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className={`text-sm font-medium transition-colors duration-300 hover:opacity-70 ${
                  scrolled ? 'text-black' : 'text-white/90'
                }`}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            <a
              href="#services"
              className={`
                text-sm font-semibold px-5 py-2.5 rounded transition-all duration-300
                ${scrolled
                  ? 'bg-black text-white hover:bg-gray-800'
                  : 'bg-white text-black hover:bg-white/90'
                }
              `}
            >
              Plan Your Visit
            </a>
          </div>

          {/* Mobile Hamburger */}
          <button
            className={`md:hidden flex flex-col justify-center items-center gap-1.5 w-8 h-8 transition-colors duration-300 ${
              scrolled ? 'text-black' : 'text-white'
            }`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span
              className={`block w-6 h-0.5 transition-all duration-300 ${
                scrolled ? 'bg-black' : 'bg-white'
              } ${menuOpen ? 'rotate-45 translate-y-2' : ''}`}
            />
            <span
              className={`block w-6 h-0.5 transition-all duration-300 ${
                scrolled ? 'bg-black' : 'bg-white'
              } ${menuOpen ? 'opacity-0' : ''}`}
            />
            <span
              className={`block w-6 h-0.5 transition-all duration-300 ${
                scrolled ? 'bg-black' : 'bg-white'
              } ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <div
        className={`md:hidden transition-all duration-300 overflow-hidden bg-white border-t border-gray-100 ${
          menuOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <nav className="flex flex-col px-6 py-4 gap-1">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-black text-base font-medium py-3 border-b border-gray-100 last:border-0 hover:text-gray-500 transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#services"
            onClick={() => setMenuOpen(false)}
            className="mt-4 bg-black text-white text-sm font-semibold px-5 py-3 rounded text-center hover:bg-gray-800 transition-colors"
          >
            Plan Your Visit
          </a>
        </nav>
      </div>
    </header>
  );
}

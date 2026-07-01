import Navigation from "@/components/Navigation";
import Hero from "@/components/sections/Hero";
import ServiceTimes from "@/components/sections/ServiceTimes";
import About from "@/components/sections/About";
import Groups from "@/components/sections/Groups";
import Events from "@/components/sections/Events";
import Give from "@/components/sections/Give";
import Footer from "@/components/sections/Footer";

export default function Home() {
  return (
    <main className="flex flex-col w-full">
      <Navigation />
      <Hero />
      <ServiceTimes />
      <About />
      <Groups />
      <Events />
      <Give />
      <Footer />
    </main>
  );
}

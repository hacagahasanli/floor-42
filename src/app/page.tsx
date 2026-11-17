import Link from 'next/link';

const HomePage = () => (
  <main className="grid-bg flex min-h-screen flex-col items-center justify-center gap-10 px-4 text-center">
    <div className="text-sm font-semibold tracking-[0.3em] text-blue">FLOOR 42 · AFTER HOURS</div>
    <h1 className="font-display text-5xl leading-[1.05] sm:text-7xl">
      <span className="block text-green">&lt;&lt;&lt;&lt; MERGE</span>
      <span className="block text-orange">CONFLICT &gt;&gt;&gt;&gt;</span>
    </h1>
    <p className="max-w-md text-lg text-cream/80">
      Two developers, one file, a floor full of guns. Two hits and you&apos;re out, so find cover.
    </p>
    <div className="flex flex-wrap justify-center gap-3">
      <Link href="/characters" className="panel-cut bg-gold px-7 py-3 font-bold uppercase tracking-wider text-ink-deep hover:brightness-110">
        Choose a fighter
      </Link>
      <Link href="/arena?bot=easy" className="panel-cut bg-cream/10 px-7 py-3 font-bold uppercase tracking-wider text-cream hover:bg-cream/20">
        Quick fight
      </Link>
    </div>
  </main>
);

export default HomePage;

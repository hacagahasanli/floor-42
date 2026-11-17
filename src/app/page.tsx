import Link from 'next/link';

const HomePage = () => (
  <main className="grid-bg flex min-h-screen flex-col items-center justify-center gap-10 px-4 text-center">
    <div className="text-sm font-semibold tracking-[0.3em] text-blue">
      <span className="text-green">&lt;&lt;&lt;&lt;</span> MERGE CONFLICT PRESENTS <span className="text-orange">&gt;&gt;&gt;&gt;</span>
    </div>
    <h1 className="font-display text-6xl leading-none text-cream sm:text-8xl">
      FLOOR <span className="text-gold">42</span>
    </h1>
    <p className="max-w-md text-lg text-cream/80">
      Code review got personal. Two developers, one floor of guns, and the meeting table is your only cover. Two hits
      and you&apos;re out.
    </p>
    <div className="flex flex-wrap justify-center gap-3">
      <Link href="/play" className="panel-cut bg-gold px-7 py-3 font-bold uppercase tracking-wider text-ink-deep hover:brightness-110">
        Play online
      </Link>
      <Link href="/characters" className="panel-cut bg-cream/10 px-7 py-3 font-bold uppercase tracking-wider text-cream hover:bg-cream/20">
        Practice vs bot
      </Link>
    </div>
  </main>
);

export default HomePage;

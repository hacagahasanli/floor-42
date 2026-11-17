import Link from 'next/link';

const HomePage = () => (
  <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-4 text-center">
    <div className="font-mono text-sm tracking-widest text-lilac/70">FLOOR 42 · PROTOTYPE</div>
    <h1 className="font-mono text-5xl font-black leading-none sm:text-7xl">
      <span className="text-green">&lt;&lt;&lt;</span> MERGE
      <br />
      CONFLICT <span className="text-orange">&gt;&gt;&gt;</span>
    </h1>
    <p className="max-w-md text-lg text-cream/80">
      Two developers. One file. Settle it on floor 42 with whatever is on the desk.
    </p>
    <div className="flex flex-wrap justify-center gap-3">
      <Link
        href="/characters"
        className="rounded-md bg-gold px-6 py-3 font-mono font-bold text-ink transition hover:brightness-110"
      >
        Choose a fighter
      </Link>
      <Link
        href="/arena"
        className="rounded-md border border-cream/30 px-6 py-3 font-mono font-bold text-cream transition hover:bg-cream/10"
      >
        Quick fight vs bot
      </Link>
    </div>
  </main>
);

export default HomePage;

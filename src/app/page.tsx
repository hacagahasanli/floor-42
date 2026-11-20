import { MainMenu } from '~/components/menu/MainMenu';

interface Props {
  searchParams: Promise<{ select?: string }>;
}

/** The main menu; `/?select` opens straight on the fighter select (from a match's "Change fighter"). */
const HomePage = async ({ searchParams }: Props) => {
  const { select } = await searchParams;
  return <MainMenu openSelect={select !== undefined} />;
};

export default HomePage;

import { MainMenu } from '~/components/menu/MainMenu';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Choose a fighter' };

/**
 * /characters is the main menu's own fighter select (the FIGHTER item pushes this URL; Back or Esc returns to /).
 * There is one fighter screen: this page opens the menu already on it.
 */
const CharactersPage = () => <MainMenu openSelect />;

export default CharactersPage;

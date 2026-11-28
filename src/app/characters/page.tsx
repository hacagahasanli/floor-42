import { MainMenu } from '~/components/menu/MainMenu';
import { pageUrlMeta } from '~/lib/siteMeta';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Choose a fighter', ...pageUrlMeta('/characters') };

/**
 * /characters is the main menu's own fighter select (the FIGHTER item pushes this URL; Back or Esc returns to /).
 * There is one fighter screen: this page opens the menu already on it.
 */
const CharactersPage = () => <MainMenu openSelect />;

export default CharactersPage;

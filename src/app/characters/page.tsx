import { CharacterSelect } from '~/components/CharacterSelect';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Choose a fighter' };

const CharactersPage = () => <CharacterSelect />;

export default CharactersPage;

import { GAME_NAME_TITLE } from '~/components/fieldday/brand';
import { COPY } from '~/game/copy';

import type { Metadata } from 'next';

import { STUDIO_NAME } from './studio';

/**
 * The site's share metadata, one place for the layout and the pages (pure data: the server renders it).
 * Next merges `openGraph` shallowly, so a page that sets its own `og:url` spreads SHARE_OG and adds `url`.
 * Canonical and og:url are set per page, not in the layout, so pages without one (the 404, /arena) do not point at the home page.
 */
export const SITE_URL = 'https://pewfield.nalbakigames.com';
export const SITE_TITLE = `${GAME_NAME_TITLE} — 1v1 shootout · ${STUDIO_NAME}`;
// F-066 (crazygames-store.md section 6): the field-day tagline plus the two ways to play. Replaces growth E-3's draft (CD copy wins).
export const SITE_DESCRIPTION = `${COPY.tagline} A fast 1v1 shootout from ${STUDIO_NAME}: play the bot or a friend on one keyboard.`;

export const SHARE_OG: NonNullable<Metadata['openGraph']> = {
  type: 'website',
  siteName: GAME_NAME_TITLE,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Pewfield logo: the word PEW! in a yellow burst and FIELD on an orange pennant' }],
};

/** Canonical + og:url for an indexable page. */
export const pageUrlMeta = (path: string): Metadata => ({ alternates: { canonical: path }, openGraph: { ...SHARE_OG, url: path } });

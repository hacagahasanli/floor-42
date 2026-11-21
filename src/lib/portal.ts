/**
 * The portal build (NEXT_PUBLIC_PORTAL=1, `npm run build:portal`): one static folder with relative paths, hash routes, no
 * links to our own sites and no analytics. The flag is written out as a plain comparison so the bundler can fold it and drop
 * the code behind it.
 */
export const PORTAL = process.env.NEXT_PUBLIC_PORTAL === '1';

/** A file from the public folder: `./name` in the portal folder (it may be served from any sub-path), `/name` on the site. */
export const asset = (path: string) => (process.env.NEXT_PUBLIC_PORTAL === '1' ? `./${path}` : `/${path}`);

/** Go to a screen of the game: a hash route in the portal build, a page load on the site. */
export const navigate = (path: string) => {
  if (process.env.NEXT_PUBLIC_PORTAL === '1') window.location.hash = `#${path}`;
  else window.location.href = path;
};

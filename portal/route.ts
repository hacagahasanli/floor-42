/** The portal's screens are hash routes: `#/`, `#/characters`, `#/arena?p1=hotfix&bot=hard`, `#/play`. */
export interface Route {
  path: string;
  query: URLSearchParams;
}

export const parseHash = (hash: string): Route => {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
};

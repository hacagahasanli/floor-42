/** `next/link` for the portal build: the game's screens are hash routes (#/arena?p1=...), so a link is a plain anchor. */
import type { AnchorHTMLAttributes, ReactNode, Ref } from 'react';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  ref?: Ref<HTMLAnchorElement>;
  children?: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

const Link = ({ href, prefetch: _prefetch, replace: _replace, scroll: _scroll, ...rest }: Props) => <a href={`#${href}`} {...rest} />;

export default Link;

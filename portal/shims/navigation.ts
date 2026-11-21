/** `next/navigation` for the portal build: only `useRouter`, over hash routes. */
const router = {
  push: (href: string) => {
    window.location.hash = `#${href}`;
  },
  replace: (href: string) => {
    window.location.replace(`#${href}`);
  },
  prefetch: (_href: string) => undefined,
  back: () => window.history.back(),
};

export const useRouter = () => router;

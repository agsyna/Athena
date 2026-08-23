import { Suspense } from 'react';
import AthenaViva from '@/components/athena/AthenaViva';

export const metadata = {
  title: 'Athena — viva',
};

/**
 * The viva surface.
 *
 * Rendered both inside the Chrome extension's side panel (as an iframe) and
 * standalone in a tab, so the layout is built for a ~380px column first and
 * simply centres itself when given more room.
 *
 * The passage is fetched by session id rather than passed in the query string:
 * a highlighted passage can be several thousand characters, well past what is
 * safe to put in a URL.
 */
export default async function VivaPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await searchParams;

  return (
    <Suspense>
      <div className="athena-root mx-auto h-dvh w-full max-w-[520px]">
        <AthenaViva sessionId={s ?? null} />
      </div>
    </Suspense>
  );
}

import { Suspense } from 'react';
import AthenaViva from '@/components/athena/AthenaViva';

export const metadata = {
  title: 'Athena viva',
};

// Standalone viva page. Laid out for a narrow column first and centred when
// there's more room. The passage is fetched by session id rather than passed in
// the query string, since it can run to thousands of characters.
//
// a=1 skips the pre-call card, for callers that already took a click.
export default async function VivaPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; a?: string }>;
}) {
  const { s, a } = await searchParams;

  return (
    <Suspense>
      <div className="athena-root mx-auto h-dvh w-full max-w-[520px]">
        <AthenaViva sessionId={s ?? null} autoStart={a === '1'} />
      </div>
    </Suspense>
  );
}

import { Suspense } from 'react';
import { WatchView } from '@/components/athena/WatchView';

export const metadata = {
  title: 'Watching an Athena viva',
};

// Read-only tutor view. This page never gets the passage, the transcript or an
// RTC credential: a watcher sees the map forming, and the only thing they can
// do is ask Athena to go back over a topic.
export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense>
      <div className="athena-root min-h-dvh w-full">
        <WatchView sessionId={id} />
      </div>
    </Suspense>
  );
}

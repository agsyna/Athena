import { Suspense } from 'react';
import { WatchView } from '@/components/athena/WatchView';

export const metadata = {
  title: 'Athena — watching a viva',
};

/**
 * The tutor's screen.
 *
 * Read-only by construction: this page never receives the passage, the
 * transcript, or an RTC credential. What a watcher can see is the assessment
 * forming, and the one thing they can do is ask Athena to go back over a topic.
 * That is deliberate — a viva is the student's to sit, and an observer who can
 * read the transcript is a different, much more invasive product.
 */
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

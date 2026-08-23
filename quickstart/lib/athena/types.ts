// Core domain types for Athena — the adaptive spoken viva.

/**
 * Lifecycle of a single topic chip in the understanding map.
 *
 * `partial` is the "struggling" state the plan calls amber: the student
 * showed some grasp but not enough to move on. It is the state Athena
 * deliberately circles back to, and the one that produces the recovery
 * moment when it flips to `correct`.
 */
export type TopicStatus =
  | 'unattempted'
  | 'active'
  | 'partial'
  | 'wrong'
  | 'correct';

export interface Topic {
  name: string;
  status: TopicStatus;
  /** How many times Athena has marked this topic. >1 means it was revisited. */
  attempts: number;
  /** True once a wrong/partial topic has been re-answered correctly. */
  redeemed: boolean;
}

/** A completed exchange, kept for the end-of-session summary. */
export interface TranscriptTurn {
  role: 'student' | 'athena';
  text: string;
}

/**
 * Server-side session record. Created when the extension posts a passage,
 * before any RTC channel exists, so the passage never has to travel through
 * a URL parameter.
 */
export interface AthenaSession {
  id: string;
  passage: string;
  sourceTitle?: string;
  sourceUrl?: string;
  createdAt: number;
  /**
   * Topics the student came back to revise, carried from the extension's
   * revision view. Present only on a session started from there.
   */
  focusTopics?: string[];
  agentId?: string;
  channel?: string;
  /** Rendered revision summary, set once the viva ends. */
  summary?: string;

  /**
   * Live understanding map, mirrored from the viva window.
   *
   * The viva itself never reads this back — it is written so a second screen
   * can watch the same assessment as it happens. A tutor on another machine
   * sees the chips settle without being in the room or in the channel.
   */
  live?: LiveState;

  /**
   * A topic a watcher has asked Athena to return to, waiting to be collected.
   *
   * Cleared the moment the viva window picks it up, so one press produces one
   * intervention. This is the teacher's hand on the session.
   */
  nudge?: { topic: string; at: number };
}

/** What the watch view renders. Mirrored from the viva on a short interval. */
export interface LiveState {
  topics: Topic[];
  /** Last thing asked about that the passage does not cover, if any. */
  outsideAsk?: string;
  /** True once the viva has ended. */
  ended: boolean;
  updatedAt: number;
}

export interface SummaryRequest {
  sessionId: string;
  topics: Topic[];
  transcript: TranscriptTurn[];
  durationMs: number;
}

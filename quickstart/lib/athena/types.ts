// Shared types for the viva.

// State of one chip in the understanding map. `partial` is the amber case:
// some grasp, not enough to move on. That's what Athena circles back to.
export type TopicStatus =
  | 'unattempted'
  | 'active'
  | 'partial'
  | 'wrong'
  | 'correct';

export interface Topic {
  name: string;
  status: TopicStatus;
  /** Times this topic has been marked. More than one means it was revisited. */
  attempts: number;
  /** True once a wrong/partial topic has been re-answered correctly. */
  redeemed: boolean;
}

/** A completed exchange, kept for the end-of-session summary. */
export interface TranscriptTurn {
  role: 'student' | 'athena';
  text: string;
}

// Created when the extension posts a passage, before any RTC channel exists,
// so the passage never has to go through a URL parameter.
export interface AthenaSession {
  id: string;
  passage: string;
  sourceTitle?: string;
  sourceUrl?: string;
  createdAt: number;
  /** Set only on a session started from the extension's revision view. */
  focusTopics?: string[];
  agentId?: string;
  channel?: string;
  /** Rendered revision summary, set once the viva ends. */
  summary?: string;

  /**
   * Understanding map mirrored from the viva. Write-only from the viva's side;
   * it exists so a second screen can watch the session as it happens.
   */
  live?: LiveState;

  /**
   * A topic a watcher asked Athena to go back to. Cleared as soon as the viva
   * picks it up, so one press means one intervention.
   */
  nudge?: { topic: string; at: number };
}

/** What the watch page renders, mirrored from the viva on a short interval. */
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

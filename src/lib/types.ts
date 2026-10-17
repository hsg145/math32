/* ── Shared domain types ─────────────────────────────────────────────────── */

export type FigureCurve =
  | {
      kind: 'poly';
      /** [a0, a1, a2, a3] → a0 + a1·x + a2·x² + a3·x³ */
      c: number[];
      color: string;
      width?: number;
      dash?: boolean;
      domain?: [number, number];
    }
  | {
      kind: 'sqrt';
      /** y = √(x − h) + k */
      h?: number;
      k?: number;
      color: string;
      width?: number;
      dash?: boolean;
      domain?: [number, number];
    }
  | {
      kind: 'abs';
      /** y = |x − h| + k */
      h?: number;
      k?: number;
      color: string;
      width?: number;
      dash?: boolean;
      domain?: [number, number];
    };

export interface FigurePoint {
  x: number;
  y: number;
  color?: string;
  label?: string;
  /** hollow marker (نقطة مفتوحة) */
  open?: boolean;
}

export interface FigureSpec {
  x: [number, number];
  y: [number, number];
  width?: number;
  height?: number;
  gridX?: number;
  gridY?: number;
  /** axis tick labels — default true */
  labels?: boolean;
  curves?: FigureCurve[];
  hlines?: { y: number; color: string }[];
  points?: FigurePoint[];
  texts?: { x: number; y: number; text: string; color: string }[];
}

export type Option =
  | { kind: 'text'; text: string }
  | { kind: 'figure'; figure: FigureSpec };

export interface NumberLineSpec {
  points: number[];
  signs: string;
  /** 1 = filled dot (closed) */
  closed?: number[];
}

export interface Question {
  lesson: number;
  body: string;
  figure?: FigureSpec;
  options: Option[];
  correctIndex: number;
  explanation: string;
  numberLine?: NumberLineSpec;
}

export interface StoredQuestion extends Question {
  id: string;
  position: number;
  isActive: boolean;
}

/** Raw row shape as stored in Postgres. */
export interface QuestionRow {
  id: string;
  lesson: number;
  position: number;
  body: string;
  figure: FigureSpec | null;
  options: Option[];
  correct_index: number;
  explanation: string;
  number_line: NumberLineSpec | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SessionStatus = 'lobby' | 'question' | 'reveal' | 'between' | 'finished';

export interface SessionInfo {
  id: string;
  title: string;
  status: SessionStatus;
  isOpen: boolean;
  questionSeconds: number;
  questionIndex: number;
  totalQuestions: number;
  startedAt: string | null;
  questionStartedAt: string | null;
  questionEndsAt: string | null;
  revealedAt: string | null;
  finishedAt: string | null;
  answeredCount: number;
  playerCount: number;
  isTeacher: boolean;
}

export interface Me {
  playerId: string;
  name: string;
  avatar: string;
  banner: string;
  joinedAt: string;
}

export interface MyResult {
  slot: number;
  correct: boolean;
  points: number;
  answered: boolean;
  msTaken: number | null;
  /** the option this student picked (only their own) */
  chosen: number | null;
}

export interface LeaderRow {
  player_id: string;
  name: string;
  avatar: string;
  banner: string;
  total_points: number;
  correct: number;
  answered: number;
  skipped: number;
  best_ms: number | null;
  rank: number;
}

export interface RevealPayload {
  slot: number;
  correctIndex: number;
  explanation: string;
  numberLine: NumberLineSpec | null;
  revealedAt?: string;
}

export interface LiveQuestion {
  slot: number;
  lesson: number;
  body: string;
  figure: FigureSpec | null;
  options: Option[];
  numberLine: NumberLineSpec | null;
  optionCount: number;
}

export interface SyncPayload {
  serverNow: string;
  session: SessionInfo;
  me: Me | null;
  question: LiveQuestion | null;
  reveal: RevealPayload | null;
  myResults: MyResult[];
  leaderboard: LeaderRow[];
}

export interface RosterPlayer {
  playerId: string;
  name: string;
  avatar: string;
  banner: string;
  joinedAt: string;
  answeredSlot: number | null;
  answeredChoice: number | null;
  points: number;
}

export interface RosterPayload {
  serverNow: string;
  questionIndex: number;
  players: RosterPlayer[];
}

/** Teacher-only view of the live round. */
export interface LiveDetail {
  serverNow: string;
  questionIndex: number;
  distribution: Record<string, number>;
  answers: { playerId: string; chosen: number | null; msTaken: number | null }[];
}
import { randomUUID } from "crypto";

/**
 * Tool schema definition for session storage.
 */
export interface ToolSchema {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

/**
 * Message in conversation history.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Session state stored server-side.
 */
export interface Session {
  id: string;
  messages: ChatMessage[];
  tools: ToolSchema[];
  modelId: string;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Session info returned to callers (excludes full message history).
 */
export interface SessionInfo {
  sessionId: string;
  modelId: string;
  messageCount: number;
  toolCount: number;
  createdAt: number;
  lastAccessedAt: number;
  ttlRemainingMs: number;
}

// Session store
const sessions = new Map<string, Session>();

// Session TTL: 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;

// Cleanup interval: 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

/**
 * Generate a unique session ID.
 */
function generateSessionId(): string {
  return randomUUID();
}

/**
 * Create a new session.
 */
export function createSession(
  modelId: string,
  tools: ToolSchema[],
  systemPrompt?: string
): Session {
  maybeCleanup();

  const now = Date.now();
  const session: Session = {
    id: generateSessionId(),
    messages: [],
    tools,
    modelId,
    createdAt: now,
    lastAccessedAt: now,
  };

  // Add system prompt if provided
  if (systemPrompt) {
    session.messages.push({ role: "system", content: systemPrompt });
  }

  sessions.set(session.id, session);
  return session;
}

/**
 * Get an existing session by ID.
 * Returns undefined if session doesn't exist or has expired.
 */
export function getSession(id: string): Session | undefined {
  maybeCleanup();

  const session = sessions.get(id);
  if (!session) {
    return undefined;
  }

  // Check if session has expired
  if (Date.now() - session.lastAccessedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return undefined;
  }

  // Update last accessed time
  session.lastAccessedAt = Date.now();
  return session;
}

/**
 * Get session info without full message history.
 */
export function getSessionInfo(id: string): SessionInfo | undefined {
  const session = getSession(id);
  if (!session) {
    return undefined;
  }

  return {
    sessionId: session.id,
    modelId: session.modelId,
    messageCount: session.messages.length,
    toolCount: session.tools.length,
    createdAt: session.createdAt,
    lastAccessedAt: session.lastAccessedAt,
    ttlRemainingMs: SESSION_TTL_MS - (Date.now() - session.lastAccessedAt),
  };
}

/**
 * Append a message to a session's conversation history.
 */
export function appendMessage(
  id: string,
  message: ChatMessage
): boolean {
  const session = getSession(id);
  if (!session) {
    return false;
  }

  session.messages.push(message);
  session.lastAccessedAt = Date.now();
  return true;
}

/**
 * Delete a session.
 */
export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

/**
 * Get all active session IDs (for debugging/admin).
 */
export function listSessions(): string[] {
  maybeCleanup();
  return Array.from(sessions.keys());
}

/**
 * Get the count of active sessions.
 */
export function getSessionCount(): number {
  maybeCleanup();
  return sessions.size;
}

/**
 * Clean up expired sessions.
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, session] of sessions.entries()) {
    if (now - session.lastAccessedAt > SESSION_TTL_MS) {
      sessions.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Run cleanup if enough time has passed since last cleanup.
 */
function maybeCleanup(): void {
  if (Date.now() - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanupExpiredSessions();
    lastCleanup = Date.now();
  }
}

/**
 * Clear all sessions (for testing).
 */
export function clearAllSessions(): void {
  sessions.clear();
}

/**
 * Get the session TTL in milliseconds.
 */
export function getSessionTTL(): number {
  return SESSION_TTL_MS;
}

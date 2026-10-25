const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(earlier, later) {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / DAY_MS);
}

export function isSameDay(a, b) {
  return daysBetween(new Date(a), new Date(b)) === 0;
}

/** "3:45 PM" */
export function formatMessageTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Full date and time for tooltips / screen readers. */
export function formatFullDateTime(iso) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Sidebar timestamp: time today, "Yesterday", weekday this week, otherwise a short date. */
export function formatConversationTime(iso, now = new Date()) {
  const date = new Date(iso);
  const days = daysBetween(date, now);

  if (days <= 0) return formatMessageTime(iso);
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Separator between days in the message list. */
export function formatDayLabel(iso, now = new Date()) {
  const date = new Date(iso);
  const days = daysBetween(date, now);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts.at(-1)[0] : '';
  return (first + last).toUpperCase();
}

/** In a direct conversation, the participant who isn't the current user. */
export function getOtherParticipant(conversation, currentUserId) {
  return (
    conversation.participants.find((participant) => participant.id !== currentUserId) ??
    conversation.participants[0] ?? { id: 'unknown', name: 'Unknown user', email: '' }
  );
}

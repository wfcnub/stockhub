import { ADMIN_ACTIONS_DISABLED_MESSAGE, ADMIN_ACTIONS_ENABLED } from '@/lib/api';

/** Shown next to write actions (sync, index management) when the deployment is read-only. */
export function AdminActionsNotice({ className = '' }: { className?: string }) {
  if (ADMIN_ACTIONS_ENABLED) {
    return null;
  }

  return (
    <p
      role="status"
      className={`rounded-gemini border border-gemini-accent-yellow/35 bg-gemini-accent-yellow/10 px-3 py-2 text-xs text-gemini-text-secondary ${className}`}
    >
      {ADMIN_ACTIONS_DISABLED_MESSAGE}
    </p>
  );
}

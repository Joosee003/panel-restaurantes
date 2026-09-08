/** A request scope belongs to exactly one restaurant/date view. */
export function createSalaRequestScope() {
  let disposed = false;
  let active: AbortController | null = null;

  return {
    begin() {
      if (disposed) return null;
      active?.abort();
      const controller = new AbortController();
      active = controller;
      return {
        controller,
        // A timeout may abort the current request and must still report its error.
        isCurrent: () => !disposed && active === controller,
      };
    },
    dispose() {
      disposed = true;
      active?.abort();
      active = null;
    },
  };
}

/** Serialize snapshots and keep at most one follow-up read for an event burst. */
export function createSalaRefreshQueue(
  read: (silent: boolean) => Promise<void>,
  isDisposed: () => boolean,
) {
  let inFlight: Promise<void> | null = null;
  let refreshQueued = false;
  let queuedSilent = true;

  const refresh = (silent = false): Promise<void> => {
    if (isDisposed()) return Promise.resolve();
    if (inFlight) {
      // Repeatedly aborting a slow read during a busy service would prevent any update.
      refreshQueued = true;
      queuedSilent = queuedSilent && silent;
      return inFlight;
    }
    inFlight = read(silent).finally(() => {
      inFlight = null;
      if (!refreshQueued || isDisposed()) return;
      const nextSilent = queuedSilent;
      refreshQueued = false;
      queuedSilent = true;
      return refresh(nextSilent);
    });
    return inFlight;
  };
  return refresh;
}

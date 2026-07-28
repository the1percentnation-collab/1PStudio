// Completion notifications for long-running publishes. System notifications
// (the Notification API) only exist where the browser allows them — on iOS
// Safari that's only for home-screen-installed apps — so callers must pair
// notify() with an in-app signal (toast/badge) rather than rely on it.

export function requestNotifyPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      // Must be called from a user gesture (the Post button click).
      Notification.requestPermission().catch(() => {});
    }
  } catch {
    /* unsupported — in-app signals still fire */
  }
}

export function notify(title, body) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
      return true;
    }
  } catch {
    /* unsupported */
  }
  return false;
}

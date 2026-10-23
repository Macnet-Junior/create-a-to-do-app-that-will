// scheduler.js - Manages verse publication timer, alarms, and notifications

export class VerseScheduler {
  constructor(options = {}) {
    this.onPublish = options.onPublish || (() => {});
    this.storageKey = 'gracetasks_schedule_settings';
    
    // Default configuration
    this.config = {
      enabled: true,
      mode: 'times', // 'times' or 'interval'
      times: ['08:00', '13:00', '20:00'], // default morning, noon, evening
      intervalHours: 2, // for interval mode (hours)
      intervalMinutes: 120, // total minutes for interval
      autoSpeak: false,
      playChime: true,
      desktopNotifications: false,
      lastTriggerDateKey: null
    };

    this.timerInterval = null;
    this.nextPublishDate = null;
    this.loadSettings();
    this.init();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn("Could not load schedule settings:", e);
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
    } catch (e) {
      console.warn("Could not save schedule settings:", e);
    }
    this.recalculateNextPublish();
  }

  init() {
    this.recalculateNextPublish();
    // Check every second for snappy prompt execution on the minute
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.checkSchedule(), 1000);
  }

  // Calculate the next date/time the verse will be published
  recalculateNextPublish() {
    if (!this.config.enabled) {
      this.nextPublishDate = null;
      return;
    }

    const now = new Date();
    
    if (this.config.mode === 'interval') {
      const mins = this.config.intervalMinutes || (this.config.intervalHours * 60) || 120;
      // If we don't have a next date or it's in the past, set it from now
      if (!this.nextPublishDate || this.nextPublishDate.getTime() <= now.getTime()) {
        this.nextPublishDate = new Date(now.getTime() + mins * 60 * 1000);
      }
      return;
    }

    // Specific times mode (find next upcoming time today or tomorrow)
    if (!this.config.times || this.config.times.length === 0) {
      this.nextPublishDate = null;
      return;
    }

    const upcomingCandidates = [];

    // Check today, tomorrow, and day after for all configured times
    [0, 1, 2].forEach(dayOffset => {
      this.config.times.forEach(tStr => {
        const parts = tStr.split(':').map(Number);
        if (parts.length >= 2) {
          const hours = parts[0];
          const minutes = parts[1];
          const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hours, minutes, 0, 0);
          if (target.getTime() > now.getTime()) {
            upcomingCandidates.push(target);
          }
        }
      });
    });

    upcomingCandidates.sort((a, b) => a.getTime() - b.getTime());
    this.nextPublishDate = upcomingCandidates[0] || null;
  }

  checkSchedule() {
    if (!this.config.enabled) return;

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;
    const todayDateKey = `${now.toDateString()}_${currentTimeStr}`;

    // If we've already triggered in this minute, don't repeat
    if (this.config.lastTriggerDateKey === todayDateKey) {
      return;
    }

    let shouldTrigger = false;

    if (this.config.mode === 'times') {
      if (this.config.times && this.config.times.includes(currentTimeStr)) {
        shouldTrigger = true;
      }
    } else if (this.config.mode === 'interval') {
      if (this.nextPublishDate && now.getTime() >= this.nextPublishDate.getTime()) {
        shouldTrigger = true;
      }
    }

    if (shouldTrigger) {
      this.config.lastTriggerDateKey = todayDateKey;
      this.triggerPublish({ reason: 'scheduled', timeStr: currentTimeStr });
      if (this.config.mode === 'interval') {
        const mins = this.config.intervalMinutes || (this.config.intervalHours * 60) || 120;
        this.nextPublishDate = new Date(Date.now() + mins * 60 * 1000);
      }
      this.saveSettings();
    }
  }

  triggerPublish(metadata = { reason: 'manual' }) {
    // Send browser desktop notification if enabled
    if (this.config.desktopNotifications && "Notification" in window && Notification.permission === "granted") {
      try {
        const notif = new Notification("🕊️ Daily Scripture Published", {
          body: "A new Bible verse has arrived for your screen. Click to read and reflect.",
          icon: "https://api.iconify.design/lucide:book-open.svg?color=%234f46e5"
        });
        notif.onclick = () => {
          window.focus();
        };
      } catch (e) {
        console.warn("Desktop notification error:", e);
      }
    }

    // Call publish handler
    this.onPublish(metadata);
  }

  // Quick helper to schedule a time N minutes from now
  scheduleTimeInMinutes(minutesAhead = 1) {
    const target = new Date(Date.now() + minutesAhead * 60 * 1000);
    const hh = String(target.getHours()).padStart(2, '0');
    const mm = String(target.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    if (!this.config.times.includes(timeStr)) {
      this.config.times.push(timeStr);
      this.config.times.sort();
    }
    this.config.mode = 'times';
    this.config.enabled = true;
    this.saveSettings();
    return timeStr;
  }

  getTimeUntilNextPublish() {
    if (!this.config.enabled || !this.nextPublishDate) {
      return null;
    }
    const diffMs = this.nextPublishDate.getTime() - Date.now();
    if (diffMs <= 0) {
      return { hours: 0, minutes: 0, seconds: 0, formatted: "Moments away", targetDate: this.nextPublishDate };
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formattedTime = this.nextPublishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formatted = `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${String(seconds).padStart(2, '0')}s (at ${formattedTime})`;

    return { hours, minutes, seconds, formatted, targetDate: this.nextPublishDate };
  }

  async requestNotificationPermission() {
    if (!("Notification" in window)) {
      return false;
    }
    const permission = await Notification.requestPermission();
    this.config.desktopNotifications = (permission === "granted");
    this.saveSettings();
    return this.config.desktopNotifications;
  }
}

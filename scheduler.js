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
      intervalHours: 3, // for interval mode
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
    // Check every 10 seconds for trigger condition
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.checkSchedule(), 10000);
  }

  // Calculate the next date/time the verse will be published
  recalculateNextPublish() {
    if (!this.config.enabled) {
      this.nextPublishDate = null;
      return;
    }

    const now = new Date();
    
    if (this.config.mode === 'interval') {
      const msInterval = (this.config.intervalHours || 3) * 60 * 60 * 1000;
      this.nextPublishDate = new Date(now.getTime() + msInterval);
      return;
    }

    // Specific times mode (find next upcoming time today or tomorrow)
    if (!this.config.times || this.config.times.length === 0) {
      this.nextPublishDate = null;
      return;
    }

    const upcomingCandidates = [];

    // Check today and tomorrow for all configured times
    [0, 1].forEach(dayOffset => {
      this.config.times.forEach(tStr => {
        const [hours, minutes] = tStr.split(':').map(Number);
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hours, minutes, 0, 0);
        if (target.getTime() > now.getTime()) {
          upcomingCandidates.push(target);
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
      if (this.config.times.includes(currentTimeStr)) {
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
      this.recalculateNextPublish();
    }
  }

  triggerPublish(metadata = { reason: 'manual' }) {
    // Send browser desktop notification if enabled
    if (this.config.desktopNotifications && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("🕊️ Daily Scripture Published", {
          body: "A new Bible verse has arrived for your screen. Click to read and reflect.",
          icon: "https://api.iconify.design/lucide:book-open.svg?color=%234f46e5"
        });
      } catch (e) {
        console.warn("Desktop notification error:", e);
      }
    }

    // Call publish handler
    this.onPublish(metadata);
  }

  getTimeUntilNextPublish() {
    if (!this.config.enabled || !this.nextPublishDate) {
      return null;
    }
    const diffMs = this.nextPublishDate.getTime() - Date.now();
    if (diffMs <= 0) return { hours: 0, minutes: 0, seconds: 0, formatted: "Moments away" };

    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formattedTime = this.nextPublishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formatted = `${hours}h ${minutes}m ${seconds}s (at ${formattedTime})`;

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

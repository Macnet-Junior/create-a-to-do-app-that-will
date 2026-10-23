// app.js - Main Application Controller for GraceTasks

import { BIBLE_BOOKS, DAILY_VERSES } from './bible-data.js';
import { bibleService } from './bible-service.js';
import { audioEngine } from './audio-engine.js';
import { VerseScheduler } from './scheduler.js';

class GraceTasksApp {
  constructor() {
    this.tasks = [];
    this.favorites = [];
    this.currentPublishedVerse = null;
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.activeTab = 'tasks';
    this.theme = 'light';

    // Reader state
    this.readerBook = 'Philippians';
    this.readerChapter = 4;
    this.readerChapterData = null;
    this.readerActiveVerseIndex = null;
    this.readerIsPlayingAll = false;
    this.readerFontSize = 18; // px

    this.init();
  }

  async init() {
    this.loadState();
    this.initTheme();
    this.initScheduler();
    this.bindEvents();
    this.setupAudioListeners();
    this.initReaderSelectors();

    // Default published verse is today's verse
    this.currentPublishedVerse = bibleService.getDailyVerse();
    this.renderDailyVerseBanner();
    this.renderTasks();
    this.renderFavorites();
    this.renderScheduledTimes();
    this.updateScheduleSummary();

    // Preload reader with default chapter
    await this.loadReaderChapter(this.readerBook, this.readerChapter);

    // Refresh icons
    this.refreshIcons();

    // Start live countdown ticker
    setInterval(() => this.updateCountdownTimer(), 1000);
    this.updateCountdownTimer();
  }

  // --- Persistence & State ---
  loadState() {
    try {
      const savedTasks = localStorage.getItem('gracetasks_tasks');
      if (savedTasks) {
        this.tasks = JSON.parse(savedTasks);
      } else {
        // Sample default tasks to get started
        this.seedSampleTasks(false);
      }

      const savedFavorites = localStorage.getItem('gracetasks_favorites');
      if (savedFavorites) {
        this.favorites = JSON.parse(savedFavorites);
      }

      const savedTheme = localStorage.getItem('gracetasks_theme');
      if (savedTheme) {
        this.theme = savedTheme;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        this.theme = 'dark';
      }
    } catch (e) {
      console.warn("Error loading state:", e);
    }
  }

  saveTasks() {
    try {
      localStorage.setItem('gracetasks_tasks', JSON.stringify(this.tasks));
    } catch (e) {
      console.warn("Error saving tasks:", e);
    }
    this.renderTasks();
  }

  saveFavorites() {
    try {
      localStorage.setItem('gracetasks_favorites', JSON.stringify(this.favorites));
    } catch (e) {
      console.warn("Error saving favorites:", e);
    }
    this.renderFavorites();
  }

  seedSampleTasks(save = true) {
    this.tasks = [
      {
        id: 'task-1',
        title: 'Morning Scripture Meditation & Prayer',
        notes: 'Read Philippians 4:6-7 and surrender anxieties for today.',
        category: 'Faith & Prayer',
        priority: 'High',
        dueDate: new Date().toISOString().split('T')[0],
        completed: false,
        linkedVerse: {
          reference: "Philippians 4:6-7",
          text: "In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God."
        },
        createdAt: Date.now() - 3600000
      },
      {
        id: 'task-2',
        title: 'Review weekly project goals and tasks',
        notes: 'Prioritize the top 3 most important deliverables.',
        category: 'Work & Study',
        priority: 'High',
        dueDate: new Date().toISOString().split('T')[0],
        completed: true,
        completedAt: Date.now() - 1800000,
        createdAt: Date.now() - 7200000
      },
      {
        id: 'task-3',
        title: 'Send an encouraging word to a friend or colleague',
        notes: 'Share a verse or a thoughtful note of support.',
        category: 'Faith & Prayer',
        priority: 'Normal',
        dueDate: new Date().toISOString().split('T')[0],
        completed: false,
        createdAt: Date.now() - 1000000
      },
      {
        id: 'task-4',
        title: 'Evening walk & restful reflection',
        notes: 'Disconnect from screens and listen to peaceful audio.',
        category: 'Health & Rest',
        priority: 'Normal',
        dueDate: new Date().toISOString().split('T')[0],
        completed: false,
        createdAt: Date.now() - 500000
      }
    ];

    if (save) {
      this.saveTasks();
      this.showToast("Loaded sample faith & daily tasks!");
    }
  }

  // --- Scheduler Integration ---
  initScheduler() {
    this.scheduler = new VerseScheduler({
      onPublish: (metadata) => this.handleScheduledPublish(metadata)
    });

    // Sync toggle UI with scheduler config
    const toggleEnabled = document.getElementById('toggle-scheduler-enabled');
    if (toggleEnabled) {
      toggleEnabled.checked = this.scheduler.config.enabled;
      toggleEnabled.addEventListener('change', (e) => {
        this.scheduler.config.enabled = e.target.checked;
        this.scheduler.saveSettings();
        this.updateScheduleSummary();
        this.showToast(e.target.checked ? "Automated publishing enabled!" : "Publishing paused.");
      });
    }

    const toggleAutoSpeak = document.getElementById('toggle-auto-speak');
    if (toggleAutoSpeak) {
      toggleAutoSpeak.checked = this.scheduler.config.autoSpeak;
      toggleAutoSpeak.addEventListener('change', (e) => {
        this.scheduler.config.autoSpeak = e.target.checked;
        this.scheduler.saveSettings();
        this.showToast(e.target.checked ? "Auto-speech on publish enabled!" : "Auto-speech disabled.");
      });
    }

    const toggleChime = document.getElementById('toggle-sound-chime');
    if (toggleChime) {
      toggleChime.checked = this.scheduler.config.playChime;
      toggleChime.addEventListener('change', (e) => {
        this.scheduler.config.playChime = e.target.checked;
        this.scheduler.saveSettings();
      });
    }
  }

  handleScheduledPublish(metadata) {
    // Pick an inspiring fresh verse
    const verse = bibleService.getRandomVerse();
    this.currentPublishedVerse = verse;

    // Play Sacred Chime if enabled
    if (this.scheduler.config.playChime) {
      audioEngine.playChime('verse');
    }

    // Publish to Screen (show the prominent modal!)
    this.openPublishModal(verse);

    // If auto-speak is enabled, trigger audio reading
    if (this.scheduler.config.autoSpeak) {
      setTimeout(() => {
        this.speakCurrentVerse();
      }, 700);
    }

    this.showToast(`🕊️ Word of Grace: ${verse.reference} published to your screen!`, 5000);
  }

  updateCountdownTimer() {
    const headerCountdown = document.getElementById('header-countdown-text');
    const statusSummary = document.getElementById('scheduler-status-summary');
    if (!this.scheduler) return;

    const info = this.scheduler.getTimeUntilNextPublish();

    if (!info) {
      if (headerCountdown) headerCountdown.textContent = 'Publishing Paused';
      if (statusSummary) statusSummary.textContent = 'Publishing Paused (Enable in settings)';
      return;
    }

    if (headerCountdown) {
      headerCountdown.textContent = `${info.hours}h ${String(info.minutes).padStart(2, '0')}m ${String(info.seconds).padStart(2, '0')}s`;
    }

    if (statusSummary) {
      const formattedTime = info.targetDate ? info.targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
      statusSummary.textContent = `Active • Next publish at ${formattedTime} (${info.hours}h ${info.minutes}m left)`;
    }
  }

  renderScheduledTimes() {
    const container = document.getElementById('scheduled-times-container');
    if (!container) return;

    container.innerHTML = '';
    const times = this.scheduler.config.times || [];

    if (times.length === 0) {
      container.innerHTML = `<span class="text-xs text-slate-400 italic">No scheduled times set. Add a time below!</span>`;
      return;
    }

    times.forEach(tStr => {
      const [h, m] = tStr.split(':');
      const d = new Date();
      d.setHours(parseInt(h, 10), parseInt(m, 10));
      const displayTime = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      const badge = document.createElement('div');
      badge.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800';
      badge.innerHTML = `
        <i data-lucide="clock" class="w-3.5 h-3.5"></i>
        <span>${displayTime}</span>
        <button data-remove-time="${tStr}" title="Remove time" class="ml-1 text-slate-400 hover:text-rose-500 transition">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      `;

      badge.querySelector('[data-remove-time]').addEventListener('click', (e) => {
        const targetTime = e.currentTarget.getAttribute('data-remove-time');
        this.scheduler.config.times = this.scheduler.config.times.filter(t => t !== targetTime);
        this.scheduler.saveSettings();
        this.renderScheduledTimes();
        this.updateScheduleSummary();
        this.showToast(`Removed scheduled time: ${displayTime}`);
      });

      container.appendChild(badge);
    });

    this.refreshIcons();
  }

  updateScheduleSummary() {
    this.updateCountdownTimer();
  }

  // --- Audio Event Listeners & Waveform UI ---
  setupAudioListeners() {
    audioEngine.onStatusChange((status) => {
      // Update Daily Verse banner audio button
      const dailyBtnLabel = document.getElementById('btn-listen-daily-label');
      const dailyWaveform = document.getElementById('daily-verse-waveform');
      if (dailyBtnLabel && dailyWaveform) {
        if (status.isPlayingTTS && !status.isPausedTTS) {
          dailyBtnLabel.textContent = "Pause Audio";
          dailyWaveform.classList.remove('hidden', 'paused');
        } else if (status.isPausedTTS) {
          dailyBtnLabel.textContent = "Resume Audio";
          dailyWaveform.classList.add('paused');
          dailyWaveform.classList.remove('hidden');
        } else {
          dailyBtnLabel.textContent = "Listen Audio";
          dailyWaveform.classList.add('hidden', 'paused');
        }
      }

      // Update Popup Modal audio button
      const popupAudioLabel = document.getElementById('popup-audio-status-label');
      const popupWaveform = document.getElementById('popup-waveform');
      const popupAudioIcon = document.getElementById('popup-audio-icon');
      if (popupAudioLabel && popupWaveform) {
        if (status.isPlayingTTS && !status.isPausedTTS) {
          popupAudioLabel.textContent = "Playing Audio Narration...";
          popupWaveform.classList.remove('hidden', 'paused');
          if (popupAudioIcon) popupAudioIcon.setAttribute('data-lucide', 'pause');
        } else if (status.isPausedTTS) {
          popupAudioLabel.textContent = "Audio Paused";
          popupWaveform.classList.add('paused');
          if (popupAudioIcon) popupAudioIcon.setAttribute('data-lucide', 'play');
        } else {
          popupAudioLabel.textContent = "Listen to Audio Version";
          popupWaveform.classList.add('hidden', 'paused');
          if (popupAudioIcon) popupAudioIcon.setAttribute('data-lucide', 'volume-2');
        }
        this.refreshIcons();
      }

      // Update Ambient button labels
      const ambientBtnLabel = document.getElementById('ambient-btn-label');
      if (ambientBtnLabel) {
        ambientBtnLabel.textContent = status.isAmbientPlaying ? "Peace Pad: On" : "Peace Pad: Off";
      }
      const popupAmbientLabel = document.getElementById('popup-ambient-label');
      if (popupAmbientLabel) {
        popupAmbientLabel.textContent = status.isAmbientPlaying ? "Ambient: On" : "Ambient: Off";
      }

      // Update voice selection options if ready
      this.populateVoiceDropdown(status.voices, status.selectedVoice);
    });
  }

  populateVoiceDropdown(voices, selectedVoice) {
    const voiceSelect = document.getElementById('setting-voice-select');
    if (!voiceSelect || voices.length === 0) return;

    if (voiceSelect.dataset.populated === 'true') return;

    voiceSelect.innerHTML = '';
    voices.forEach(voice => {
      const opt = document.createElement('option');
      opt.value = voice.name;
      opt.textContent = `${voice.name} (${voice.lang})`;
      if (selectedVoice && selectedVoice.name === voice.name) {
        opt.selected = true;
      }
      voiceSelect.appendChild(opt);
    });
    voiceSelect.dataset.populated = 'true';

    voiceSelect.addEventListener('change', (e) => {
      audioEngine.setVoice(e.target.value);
    });
  }

  speakCurrentVerse() {
    const verse = this.currentPublishedVerse || bibleService.getDailyVerse();
    if (!verse) return;

    const speechText = `${verse.reference}. ${verse.text}. Devotional thought: ${verse.reflection || ''}`;
    audioEngine.speak(speechText, {
      onEnd: () => {
        // finished
      }
    });
  }

  // --- Screen Publishing Modal Logic ---
  openPublishModal(verse) {
    if (!verse) return;
    this.currentPublishedVerse = verse;

    const modal = document.getElementById('modal-publish-screen');
    const textEl = document.getElementById('popup-verse-text');
    const refEl = document.getElementById('popup-verse-reference');
    const catEl = document.getElementById('popup-category-badge');
    const refThoughtEl = document.getElementById('popup-verse-reflection');

    if (textEl) textEl.textContent = `"${verse.text}"`;
    if (refEl) refEl.textContent = verse.reference;
    if (catEl) catEl.textContent = verse.category || "Scripture Reflection";
    if (refThoughtEl) refThoughtEl.textContent = `"${verse.reflection || 'Meditate on His promises throughout your day.'}"`;

    this.updateModalBookmarkState(verse);

    if (modal) {
      modal.classList.remove('hidden');
    }
    this.refreshIcons();
  }

  closePublishModal() {
    const modal = document.getElementById('modal-publish-screen');
    if (modal) {
      modal.classList.add('hidden');
    }
    // Stop TTS if playing
    if (audioEngine.isPlayingTTS) {
      audioEngine.stopTTS();
    }
  }

  updateModalBookmarkState(verse) {
    const bookmarkIcon = document.getElementById('popup-bookmark-icon');
    if (!bookmarkIcon) return;
    const isSaved = this.favorites.some(f => f.reference === verse.reference);
    if (isSaved) {
      bookmarkIcon.classList.add('text-rose-400', 'fill-current');
    } else {
      bookmarkIcon.classList.remove('text-rose-400', 'fill-current');
    }
  }

  // --- Daily Banner Render ---
  renderDailyVerseBanner() {
    const verse = this.currentPublishedVerse || bibleService.getDailyVerse();
    if (!verse) return;

    const textEl = document.getElementById('daily-verse-text');
    const refEl = document.getElementById('daily-verse-reference');
    const badgeEl = document.getElementById('daily-verse-badge');

    if (textEl) textEl.textContent = `"${verse.text}"`;
    if (refEl) refEl.textContent = `— ${verse.reference}`;
    if (badgeEl) badgeEl.textContent = verse.category || "Daily Word";
  }

  // --- Task Management & Rendering ---
  addTask(title, category = 'Faith & Prayer', priority = 'Normal', dueDate = null, linkedVerse = null) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const newTask = {
      id: 'task-' + Date.now(),
      title: trimmedTitle,
      notes: '',
      category: category,
      priority: priority,
      dueDate: dueDate || new Date().toISOString().split('T')[0],
      completed: false,
      completedAt: null,
      linkedVerse: linkedVerse || null,
      createdAt: Date.now()
    };

    this.tasks.unshift(newTask);
    this.saveTasks();
    this.showToast(`Task added: "${newTask.title}"`);
  }

  toggleTaskCompleted(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    task.completedAt = task.completed ? Date.now() : null;

    if (task.completed) {
      // Play rewarding chime
      audioEngine.playChime('complete');

      // Trigger celebratory confetti
      if (typeof window.confetti === 'function') {
        window.confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#6366f1', '#a855f7', '#10b981', '#f59e0b']
        });
      }
    }

    this.saveTasks();
  }

  deleteTask(taskId) {
    const index = this.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return;

    const deleted = this.tasks.splice(index, 1)[0];
    this.saveTasks();
    this.showToast(`Deleted task: "${deleted.title}"`);
  }

  renderTasks() {
    const container = document.getElementById('tasks-list-container');
    const emptyState = document.getElementById('tasks-empty-state');
    if (!container) return;

    // Filter tasks
    const query = this.searchQuery.toLowerCase();
    const filtered = this.tasks.filter(task => {
      // Search
      const matchesSearch = !query || 
        task.title.toLowerCase().includes(query) || 
        task.category.toLowerCase().includes(query) ||
        (task.notes && task.notes.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // Filter Tab
      if (this.currentFilter === 'pending') return !task.completed;
      if (this.currentFilter === 'completed') return task.completed;
      if (this.currentFilter === 'faith') return task.category.includes('Faith');
      if (this.currentFilter === 'high') return task.priority === 'High' || task.priority === 'Urgent';
      return true;
    });

    // Update Stats
    this.updateTaskStats();

    if (filtered.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    container.innerHTML = '';

    filtered.forEach(task => {
      const card = document.createElement('div');
      card.className = `glass-panel rounded-xl p-4 transition-all duration-200 border ${
        task.completed 
          ? 'opacity-65 bg-slate-100/50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/40' 
          : 'hover:shadow-md border-slate-200/90 dark:border-slate-800/80'
      }`;

      // Priority styling
      let priorityClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
      if (task.priority === 'Urgent') priorityClass = 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300';
      if (task.priority === 'High') priorityClass = 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300';
      if (task.priority === 'Low') priorityClass = 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300';

      // Category icon
      let categoryIcon = 'check';
      if (task.category.includes('Faith')) categoryIcon = 'sparkles';
      else if (task.category.includes('Work')) categoryIcon = 'briefcase';
      else if (task.category.includes('Personal')) categoryIcon = 'user';
      else if (task.category.includes('Family')) categoryIcon = 'home';
      else if (task.category.includes('Health')) categoryIcon = 'heart-pulse';

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          
          <!-- Checkbox & Title -->
          <div class="flex items-start gap-3 flex-1 min-w-0">
            <button data-action="toggle" data-id="${task.id}" class="mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center transition ${
              task.completed 
                ? 'bg-emerald-600 border-emerald-600 text-white' 
                : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500 bg-white dark:bg-slate-900'
            }">
              ${task.completed ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>' : ''}
            </button>

            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <span class="text-xs px-2 py-0.5 rounded-md font-medium ${priorityClass}">
                  ${task.priority}
                </span>
                <span class="text-xs px-2 py-0.5 rounded-md font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <i data-lucide="${categoryIcon}" class="w-3 h-3"></i>
                  <span>${task.category}</span>
                </span>
                ${task.dueDate ? `
                  <span class="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <i data-lucide="calendar" class="w-3 h-3"></i>
                    <span>${task.dueDate}</span>
                  </span>
                ` : ''}
              </div>

              <h4 class="text-sm font-semibold text-slate-900 dark:text-white leading-snug break-words ${task.completed ? 'task-done-title' : ''}">
                ${this.escapeHtml(task.title)}
              </h4>

              ${task.notes ? `
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  ${this.escapeHtml(task.notes)}
                </p>
              ` : ''}

              <!-- Linked Scripture Attachment if present -->
              ${task.linkedVerse ? `
                <div class="mt-2.5 p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/40 text-xs flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-scripture italic truncate">
                    <i data-lucide="book-marked" class="w-3.5 h-3.5 text-indigo-500 shrink-0"></i>
                    <span class="truncate">"${task.linkedVerse.reference}: ${task.linkedVerse.text}"</span>
                  </div>
                  <button data-action="speak-verse" data-id="${task.id}" title="Listen to verse" class="p-1 rounded text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 shrink-0">
                    <i data-lucide="volume-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 shrink-0">
            <button data-action="delete" data-id="${task.id}" title="Delete task" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>

        </div>
      `;

      // Event bindings
      card.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        this.toggleTaskCompleted(task.id);
      });

      card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        this.deleteTask(task.id);
      });

      const speakBtn = card.querySelector('[data-action="speak-verse"]');
      if (speakBtn && task.linkedVerse) {
        speakBtn.addEventListener('click', () => {
          audioEngine.speak(`${task.linkedVerse.reference}. ${task.linkedVerse.text}`);
        });
      }

      container.appendChild(card);
    });

    this.refreshIcons();
  }

  updateTaskStats() {
    const total = this.tasks.length;
    const completed = this.tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const statTotal = document.getElementById('stat-total');
    const statPending = document.getElementById('stat-pending');
    const statCompleted = document.getElementById('stat-completed');
    const statPercent = document.getElementById('stat-percent');
    const tabBadge = document.getElementById('tab-badge-pending');

    if (statTotal) statTotal.textContent = total;
    if (statPending) statPending.textContent = pending;
    if (statCompleted) statCompleted.textContent = completed;
    if (statPercent) statPercent.textContent = `${percent}%`;
    if (tabBadge) tabBadge.textContent = pending;
  }

  // --- Favorites / Saved Verses ---
  toggleFavorite(verse) {
    if (!verse) return;
    const index = this.favorites.findIndex(f => f.reference === verse.reference);
    if (index > -1) {
      this.favorites.splice(index, 1);
      this.showToast(`Removed from saved verses: ${verse.reference}`);
    } else {
      this.favorites.unshift({
        ...verse,
        savedAt: Date.now()
      });
      this.showToast(`Saved to favorites: ${verse.reference}`);
    }

    this.saveFavorites();
    this.updateModalBookmarkState(verse);
  }

  renderFavorites() {
    const container = document.getElementById('favorites-list-container');
    const emptyState = document.getElementById('favorites-empty-state');
    const badgeSaved = document.getElementById('tab-badge-saved');

    if (badgeSaved) badgeSaved.textContent = this.favorites.length;
    if (!container) return;

    if (this.favorites.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    container.innerHTML = '';

    this.favorites.forEach(verse => {
      const card = document.createElement('div');
      card.className = 'glass-panel rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3';
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300">
            ${verse.category || 'Scripture'}
          </span>
          <div class="flex items-center gap-1">
            <button data-action="speak-fav" class="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 transition" title="Listen">
              <i data-lucide="volume-2" class="w-4 h-4"></i>
            </button>
            <button data-action="read-fav" class="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 transition" title="Read Full Chapter">
              <i data-lucide="book-open" class="w-4 h-4"></i>
            </button>
            <button data-action="remove-fav" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition" title="Remove">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <p class="font-scripture text-base sm:text-lg text-slate-900 dark:text-slate-100 italic leading-relaxed">
          "${verse.text}"
        </p>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <span class="font-semibold text-xs text-indigo-700 dark:text-indigo-400">
            ${verse.reference}
          </span>
          <button data-action="add-task-fav" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
            <span>Add to Tasks</span>
          </button>
        </div>
      `;

      card.querySelector('[data-action="speak-fav"]').addEventListener('click', () => {
        audioEngine.speak(`${verse.reference}. ${verse.text}`);
      });

      card.querySelector('[data-action="read-fav"]').addEventListener('click', () => {
        this.openReaderForVerse(verse);
      });

      card.querySelector('[data-action="remove-fav"]').addEventListener('click', () => {
        this.toggleFavorite(verse);
      });

      card.querySelector('[data-action="add-task-fav"]').addEventListener('click', () => {
        this.addTask(`Meditate on ${verse.reference}`, 'Faith & Prayer', 'Normal', null, verse);
      });

      container.appendChild(card);
    });

    this.refreshIcons();
  }

  // --- Read Through All (Bible Reader Tab) ---
  initReaderSelectors() {
    const bookSelect = document.getElementById('reader-select-book');
    const chapterSelect = document.getElementById('reader-select-chapter');
    if (!bookSelect || !chapterSelect) return;

    bookSelect.innerHTML = '';
    BIBLE_BOOKS.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = `${b.name} (${b.chapters} ch)`;
      if (b.name === this.readerBook) opt.selected = true;
      bookSelect.appendChild(opt);
    });

    const updateChapters = (bookName) => {
      const bObj = BIBLE_BOOKS.find(b => b.name === bookName) || BIBLE_BOOKS[0];
      chapterSelect.innerHTML = '';
      for (let c = 1; c <= bObj.chapters; c++) {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = `Chapter ${c}`;
        if (c === this.readerChapter) opt.selected = true;
        chapterSelect.appendChild(opt);
      }
    };

    updateChapters(this.readerBook);

    bookSelect.addEventListener('change', (e) => {
      this.readerBook = e.target.value;
      this.readerChapter = 1;
      updateChapters(this.readerBook);
    });

    chapterSelect.addEventListener('change', (e) => {
      this.readerChapter = parseInt(e.target.value, 10);
    });
  }

  async loadReaderChapter(book, chapter) {
    this.readerBook = book;
    this.readerChapter = chapter;

    const titleEl = document.getElementById('reader-chapter-title');
    const badgeEl = document.getElementById('reader-translation-badge');
    const container = document.getElementById('reader-verses-container');

    if (titleEl) titleEl.textContent = `${book} Chapter ${chapter}`;
    if (container) {
      container.innerHTML = `
        <div class="py-12 text-center text-slate-400">
          <i data-lucide="loader-2" class="w-6 h-6 mx-auto animate-spin mb-2"></i>
          <span>Loading scripture passages...</span>
        </div>
      `;
      this.refreshIcons();
    }

    try {
      const data = await bibleService.getChapter(book, chapter);
      this.readerChapterData = data;

      if (titleEl) titleEl.textContent = data.title || `${book} Chapter ${chapter}`;
      if (badgeEl) badgeEl.textContent = data.translation || "World English Bible";

      this.renderReaderVerses(data.verses);
    } catch (err) {
      if (container) {
        container.innerHTML = `<p class="text-rose-500 py-4">Unable to load ${book} ${chapter}. Please try another chapter.</p>`;
      }
    }
  }

  renderReaderVerses(verses = []) {
    const container = document.getElementById('reader-verses-container');
    if (!container) return;

    container.innerHTML = '';
    container.style.fontSize = `${this.readerFontSize}px`;

    verses.forEach((v, index) => {
      const p = document.createElement('p');
      p.id = `reader-verse-${index}`;
      p.className = 'group transition-colors duration-200 py-1 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-300';
      p.innerHTML = `
        <span class="font-sans font-bold text-xs text-indigo-500 dark:text-indigo-400 mr-2 select-none">
          ${v.verse}
        </span>
        <span class="verse-text">${this.escapeHtml(v.text)}</span>
      `;

      // Click individual verse to listen to that verse alone
      p.addEventListener('click', () => {
        this.highlightReaderVerse(index);
        audioEngine.speak(`${this.readerBook} chapter ${this.readerChapter} verse ${v.verse}: ${v.text}`);
      });

      container.appendChild(p);
    });
  }

  highlightReaderVerse(index) {
    const container = document.getElementById('reader-verses-container');
    if (!container) return;

    // Clear existing highlight
    container.querySelectorAll('.verse-active-reading').forEach(el => el.classList.remove('verse-active-reading'));

    if (index !== null) {
      const target = document.getElementById(`reader-verse-${index}`);
      if (target) {
        target.classList.add('verse-active-reading');
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  playEntireChapterAudio() {
    if (!this.readerChapterData || !this.readerChapterData.verses || this.readerChapterData.verses.length === 0) {
      return;
    }

    const verses = this.readerChapterData.verses;
    const playIcon = document.getElementById('reader-play-icon');
    const statusLabel = document.getElementById('reader-audio-status');
    const waveform = document.getElementById('reader-waveform');
    const verseIndicator = document.getElementById('reader-audio-verse-indicator');

    // If currently playing, toggle pause/stop
    if (audioEngine.isPlayingTTS) {
      audioEngine.stopTTS();
      this.readerIsPlayingAll = false;
      this.highlightReaderVerse(null);
      if (playIcon) playIcon.setAttribute('data-lucide', 'play');
      if (statusLabel) statusLabel.textContent = "Stopped";
      if (waveform) waveform.classList.add('hidden', 'paused');
      if (verseIndicator) verseIndicator.textContent = "Click play to listen to entire chapter";
      this.refreshIcons();
      return;
    }

    this.readerIsPlayingAll = true;
    let currentIdx = 0;

    const readNextVerse = () => {
      if (!this.readerIsPlayingAll || currentIdx >= verses.length) {
        this.readerIsPlayingAll = false;
        this.highlightReaderVerse(null);
        if (playIcon) playIcon.setAttribute('data-lucide', 'play');
        if (statusLabel) statusLabel.textContent = "Finished Chapter";
        if (waveform) waveform.classList.add('hidden', 'paused');
        if (verseIndicator) verseIndicator.textContent = "Completed reading chapter";
        this.refreshIcons();
        return;
      }

      const v = verses[currentIdx];
      this.highlightReaderVerse(currentIdx);

      if (playIcon) playIcon.setAttribute('data-lucide', 'pause');
      if (statusLabel) statusLabel.textContent = "Reading Aloud";
      if (waveform) waveform.classList.remove('hidden', 'paused');
      if (verseIndicator) verseIndicator.textContent = `Reading verse ${v.verse} of ${verses.length}...`;
      this.refreshIcons();

      const verseSpeech = currentIdx === 0 
        ? `${this.readerBook} chapter ${this.readerChapter}. Verse ${v.verse}: ${v.text}` 
        : `Verse ${v.verse}: ${v.text}`;

      audioEngine.speak(verseSpeech, {
        onEnd: () => {
          currentIdx++;
          readNextVerse();
        },
        onError: () => {
          this.readerIsPlayingAll = false;
          this.highlightReaderVerse(null);
        }
      });
    };

    readNextVerse();
  }

  openReaderForVerse(verse) {
    if (!verse) return;
    this.closePublishModal();
    this.switchTab('reader');

    const bookSelect = document.getElementById('reader-select-book');
    const chapterSelect = document.getElementById('reader-select-chapter');

    if (bookSelect) bookSelect.value = verse.book;
    this.initReaderSelectors();

    if (chapterSelect) chapterSelect.value = verse.chapter;
    this.loadReaderChapter(verse.book, verse.chapter);
  }

  // --- Theme Controller ---
  initTheme() {
    if (this.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    this.updateThemeIcon();
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    if (this.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('gracetasks_theme', this.theme);
    this.updateThemeIcon();
  }

  updateThemeIcon() {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    icon.setAttribute('data-lucide', this.theme === 'dark' ? 'sun' : 'moon');
    this.refreshIcons();
  }

  // --- UI Navigation Tabs ---
  switchTab(tabKey) {
    this.activeTab = tabKey;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const match = btn.getAttribute('data-tab') === tabKey;
      if (match) {
        btn.classList.add('active', 'text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-950/70');
        btn.classList.remove('text-slate-600', 'dark:text-slate-400');
      } else {
        btn.classList.remove('active', 'text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-950/70');
        btn.classList.add('text-slate-600', 'dark:text-slate-400');
      }
    });

    ['tasks', 'scheduler', 'reader', 'favorites'].forEach(key => {
      const content = document.getElementById(`tab-content-${key}`);
      if (content) {
        if (key === tabKey) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      }
    });

    this.refreshIcons();
  }

  // --- Toast Notifications ---
  showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xl border border-slate-700 dark:border-slate-200 text-xs font-medium animate-bounce-in transition-all';
    toast.innerHTML = `
      <i data-lucide="info" class="w-4 h-4 text-indigo-400 dark:text-indigo-600 shrink-0"></i>
      <span>${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    this.refreshIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // --- Event Bindings ---
  bindEvents() {
    // Top Bar Actions
    document.getElementById('btn-trigger-now')?.addEventListener('click', () => {
      this.scheduler.triggerPublish({ reason: 'manual-trigger' });
    });

    document.getElementById('btn-toggle-theme')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    document.getElementById('btn-toggle-ambient')?.addEventListener('click', () => {
      const state = audioEngine.toggleAmbient();
      this.showToast(state ? "Tranquil ambient background music turned ON" : "Ambient music turned OFF");
    });

    // Navigation Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.getAttribute('data-tab'));
      });
    });

    // Quick Add Task Form
    const quickAddForm = document.getElementById('form-quick-add');
    if (quickAddForm) {
      quickAddForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const titleInput = document.getElementById('input-task-title');
        const catSelect = document.getElementById('select-task-category');
        const prioSelect = document.getElementById('select-task-priority');
        const dueInput = document.getElementById('input-task-due');

        this.addTask(
          titleInput.value,
          catSelect.value,
          prioSelect.value,
          dueInput.value
        );

        titleInput.value = '';
      });
    }

    // Filter pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active', 'bg-indigo-100', 'dark:bg-indigo-900/60', 'text-indigo-700', 'dark:text-indigo-300'));
        pill.classList.add('active', 'bg-indigo-100', 'dark:bg-indigo-900/60', 'text-indigo-700', 'dark:text-indigo-300');
        this.currentFilter = pill.getAttribute('data-filter');
        this.renderTasks();
      });
    });

    // Search input
    document.getElementById('input-search-tasks')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderTasks();
    });

    // Daily Verse Banner Controls
    document.getElementById('btn-listen-daily-verse')?.addEventListener('click', () => {
      if (audioEngine.isPlayingTTS) {
        audioEngine.stopTTS();
      } else {
        this.speakCurrentVerse();
      }
    });

    document.getElementById('btn-read-daily-context')?.addEventListener('click', () => {
      this.openReaderForVerse(this.currentPublishedVerse || bibleService.getDailyVerse());
    });

    document.getElementById('btn-favorite-daily-verse')?.addEventListener('click', () => {
      this.toggleFavorite(this.currentPublishedVerse || bibleService.getDailyVerse());
    });

    // Scheduler Tab Controls
    document.getElementById('btn-scheduler-test-now')?.addEventListener('click', () => {
      this.scheduler.triggerPublish({ reason: 'manual-test' });
    });

    document.getElementById('btn-add-publish-time')?.addEventListener('click', () => {
      const timeInput = document.getElementById('input-new-publish-time');
      if (!timeInput || !timeInput.value) return;

      const timeVal = timeInput.value;
      if (!this.scheduler.config.times.includes(timeVal)) {
        this.scheduler.config.times.push(timeVal);
        this.scheduler.config.times.sort();
        this.scheduler.saveSettings();
        this.renderScheduledTimes();
        this.showToast(`Added publish time: ${timeVal}`);
      } else {
        this.showToast("This time is already scheduled!");
      }
    });

    document.getElementById('btn-request-notifications')?.addEventListener('click', async () => {
      const granted = await this.scheduler.requestNotificationPermission();
      const statusEl = document.getElementById('notification-permission-status');
      if (statusEl) {
        statusEl.textContent = granted 
          ? "Desktop notifications active!" 
          : "Notifications blocked or denied by browser.";
      }
      this.showToast(granted ? "Desktop notifications enabled!" : "Notifications not granted.");
    });

    // Popup Modal Controls
    document.getElementById('btn-close-publish-modal')?.addEventListener('click', () => {
      this.closePublishModal();
    });

    document.getElementById('btn-popup-dismiss')?.addEventListener('click', () => {
      this.closePublishModal();
    });

    document.getElementById('btn-popup-toggle-audio')?.addEventListener('click', () => {
      if (audioEngine.isPlayingTTS) {
        audioEngine.stopTTS();
      } else {
        this.speakCurrentVerse();
      }
    });

    document.getElementById('btn-popup-ambient')?.addEventListener('click', () => {
      audioEngine.toggleAmbient();
    });

    document.getElementById('btn-popup-bookmark')?.addEventListener('click', () => {
      this.toggleFavorite(this.currentPublishedVerse);
    });

    document.getElementById('btn-popup-add-task')?.addEventListener('click', () => {
      if (this.currentPublishedVerse) {
        this.addTask(
          `Meditate on ${this.currentPublishedVerse.reference}`,
          'Faith & Prayer',
          'High',
          null,
          this.currentPublishedVerse
        );
        this.closePublishModal();
      }
    });

    document.getElementById('btn-popup-read-full')?.addEventListener('click', () => {
      this.openReaderForVerse(this.currentPublishedVerse);
    });

    // Reader Tab Controls
    document.getElementById('btn-load-chapter')?.addEventListener('click', () => {
      this.loadReaderChapter(this.readerBook, this.readerChapter);
    });

    document.getElementById('btn-reader-play-audio')?.addEventListener('click', () => {
      this.playEntireChapterAudio();
    });

    document.getElementById('reader-speech-speed')?.addEventListener('change', (e) => {
      audioEngine.setRate(e.target.value);
    });

    document.getElementById('btn-font-smaller')?.addEventListener('click', () => {
      this.readerFontSize = Math.max(14, this.readerFontSize - 2);
      const container = document.getElementById('reader-verses-container');
      if (container) container.style.fontSize = `${this.readerFontSize}px`;
    });

    document.getElementById('btn-font-larger')?.addEventListener('click', () => {
      this.readerFontSize = Math.min(28, this.readerFontSize + 2);
      const container = document.getElementById('reader-verses-container');
      if (container) container.style.fontSize = `${this.readerFontSize}px`;
    });

    // Settings Modal
    const settingsModal = document.getElementById('modal-settings');
    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.add('hidden');
    });

    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.add('hidden');
    });

    document.getElementById('setting-speech-rate')?.addEventListener('input', (e) => {
      const val = e.target.value;
      audioEngine.setRate(val);
      const lbl = document.getElementById('label-speech-rate');
      if (lbl) lbl.textContent = `${val}x`;
    });

    document.getElementById('setting-ambient-vol')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      audioEngine.setAmbientVolume(val);
      const lbl = document.getElementById('label-ambient-vol');
      if (lbl) lbl.textContent = `${Math.round(val * 100)}%`;
    });

    document.getElementById('btn-seed-sample-tasks')?.addEventListener('click', () => {
      this.seedSampleTasks(true);
      if (settingsModal) settingsModal.classList.add('hidden');
    });
  }

  refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new GraceTasksApp();
});

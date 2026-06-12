export type Locale = "en" | "ru";

const STORAGE_KEY = "gachify:locale";

const messages: Record<Locale, Record<string, string>> = {
  en: {
    "nav.home": "Home",
    "nav.search": "Search",
    "nav.library": "Your Library",
    "nav.discover": "Discover",
    "nav.charts": "Charts",
    "nav.party": "Party",
    "nav.following": "Following",
    "nav.creator": "Creator",
    "nav.upload": "Upload",
    "nav.profile": "My profile",
    "nav.library_short": "Library",
    "settings.language": "Language",
    "settings.shortcuts": "Keyboard shortcuts",
    "player.queue": "Queue",
    "library.liked": "Liked songs",
    "library.sort.recent": "Recently added",
    "library.sort.title": "A–Z",
    "library.sort.duration": "Duration",
    "settings.queueSync": "Sync queue across devices",
    "settings.queueSyncHint": "Restore queue and position when you log in on another device.",
    "home.quick.heading": "Explore",
    "home.quick.charts.title": "Top this week",
    "home.quick.charts.desc": "Weekly chart — top 50 remixes",
    "home.quick.party.title": "Listening party",
    "home.quick.party.desc": "Jam together in sync",
    "home.quick.discover.title": "Discover",
    "home.quick.discover.desc": "Filters, moods & karaoke",
    "home.quick.nowPlayingHint": "Tip: tap the track bar at the bottom for waveform, EQ, sleep timer & speed.",
    "player.openExpanded": "Expanded player",
    "install.title": "Get Gachify on your phone",
    "install.subtitle": "Install the app for lock-screen controls and background play.",
    "install.feature.lock": "Lock screen controls",
    "install.feature.bg": "Background audio",
    "install.feature.offline": "Offline liked tracks",
    "install.installPwa": "Install app",
    "install.installing": "Installing…",
    "install.downloadApk": "Download Android APK",
    "install.iosTitle": "Add to Home Screen",
    "install.iosSteps": "Safari → Share → Add to Home Screen.",
    "install.later": "Later",
    "install.never": "Don't show again",
    "install.close": "Close",
    "install.unavailable": "Use your browser menu to install or add to home screen.",
    "install.openFromSettings": "Install mobile app",
  },
  ru: {
    "nav.home": "Главная",
    "nav.search": "Поиск",
    "nav.library": "Медиатека",
    "nav.discover": "Обзор",
    "nav.charts": "Топ",
    "nav.party": "Jam",
    "nav.following": "Подписки",
    "nav.creator": "Креатор",
    "nav.upload": "Загрузка",
    "nav.profile": "Профиль",
    "nav.library_short": "Медиатека",
    "settings.language": "Язык",
    "settings.shortcuts": "Горячие клавиши",
    "player.queue": "Очередь",
    "library.liked": "Лайки",
    "library.sort.recent": "Недавние",
    "library.sort.title": "А–Я",
    "library.sort.duration": "Длительность",
    "settings.queueSync": "Синхронизация очереди",
    "settings.queueSyncHint": "Восстанавливать очередь и позицию при входе на другом устройстве.",
    "home.quick.heading": "Разделы",
    "home.quick.charts.title": "Топ недели",
    "home.quick.charts.desc": "Чарт — 50 лучших ремиксов",
    "home.quick.party.title": "Jam-сессия",
    "home.quick.party.desc": "Слушаем вместе в синхроне",
    "home.quick.discover.title": "Обзор",
    "home.quick.discover.desc": "Фильтры, настроения, караоке",
    "home.quick.nowPlayingHint": "Подсказка: нажми на полоску плеера внизу — waveform, EQ, таймер сна и скорость.",
    "player.openExpanded": "Расширенный плеер",
    "install.title": "Gachify на телефон",
    "install.subtitle": "Установи приложение — плеер в фоне и на экране блокировки.",
    "install.feature.lock": "Управление с lock screen",
    "install.feature.bg": "Фоновое воспроизведение",
    "install.feature.offline": "Офлайн-лайки",
    "install.installPwa": "Установить приложение",
    "install.installing": "Устанавливаем…",
    "install.downloadApk": "Скачать APK для Android",
    "install.iosTitle": "На экран «Домой»",
    "install.iosSteps": "Safari → Поделиться → На экран «Домой».",
    "install.later": "Позже",
    "install.never": "Больше не показывать",
    "install.close": "Закрыть",
    "install.unavailable": "Открой меню браузера → установить или добавить на главный экран.",
    "install.openFromSettings": "Установить мобильное приложение",
  },
};

export function getLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ru" || stored === "en") return stored;
  const lang = navigator.language.toLowerCase();
  return lang.startsWith("ru") ? "ru" : "en";
}

export function setLocale(locale: Locale) {
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

export function t(key: string, locale: Locale = getLocale()): string {
  return messages[locale][key] ?? messages.en[key] ?? key;
}

export function initLocale() {
  document.documentElement.lang = getLocale();
}

/**
 * TEI Education Platform -- Completion Store
 * -----------------------------------------------------------------
 * Placeholder data layer for progress and reflections (per the confirmed
 * build order: database is parked, build against placeholder/in-memory
 * data first). Backed by localStorage today so a client's progress
 * survives a page refresh during the pilot, keyed to whatever identifies
 * them right now.
 *
 * IMPORTANT -- this deliberately does NOT build client identity itself.
 * That is Build Step 1 (lightweight name-input), not this step. Until
 * that lands, getCurrentClientId() falls back to a single local slot,
 * which is sufficient for building and testing the session flow. Every
 * function here is already written against a clientId, so wiring in
 * real identity later is a one-line change inside getCurrentClientId(),
 * not a rebuild of this module or anything that calls it.
 *
 * Every function is async and returns plain data, matching the shape a
 * real per-client database/API would return, so Stage B/C can replace
 * the localStorage internals here with real network calls without
 * changing any call site in lesson-session.js or module-entry.js.
 */

const STORAGE_KEY = "tei_edu_progress_v1";
const CLIENT_ID_KEY = "tei_edu_client_id";

// Safe storage wrapper. Browsers block localStorage entirely when a page
// is opened via file:// (each local file is treated as a unique "opaque"
// origin with no storage access) -- accessing it throws a SecurityError,
// which was silently killing every render before this fix. Falls back to
// an in-memory object so the platform still works file://; once this is
// hosted for real (Netlify, same as the rest of the site) localStorage
// works normally and progress persists across page loads as intended.
const _memoryFallback = {};
const _safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return Object.prototype.hasOwnProperty.call(_memoryFallback, key) ? _memoryFallback[key] : null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      _memoryFallback[key] = value;
    }
  },
};

function _readAll() {
  try {
    const raw = _safeStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function _writeAll(data) {
  _safeStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function _clientRecord(data, clientId) {
  if (!data[clientId]) {
    data[clientId] = {
      completedLessons: {}, // lessonId -> ISO timestamp
      reflections: {}, // lessonId -> { text, savedAt, coachingOptIn }
      commitmentCompletedAt: null,
    };
  }
  return data[clientId];
}

window.CompletionStore = {
  /**
   * Placeholder client identity until Build Step 1 (name-input) lands.
   * Reads a name from localStorage if step 1's UI has already set one;
   * otherwise uses a fixed local slot so progress is still testable.
   */
  getCurrentClientId() {
    return _safeStorage.getItem(CLIENT_ID_KEY) || "pilot-client";
  },

  /** Called by Build Step 1's name-input screen once it exists. */
  async setCurrentClientId(name) {
    _safeStorage.setItem(CLIENT_ID_KEY, name);
  },

  async isCommitmentComplete(clientId) {
    const data = _readAll();
    return Boolean(_clientRecord(data, clientId).commitmentCompletedAt);
  },

  async markCommitmentComplete(clientId) {
    const data = _readAll();
    _clientRecord(data, clientId).commitmentCompletedAt = new Date().toISOString();
    _writeAll(data);
  },

  async isLessonComplete(clientId, lessonId) {
    const data = _readAll();
    return Boolean(_clientRecord(data, clientId).completedLessons[lessonId]);
  },

  async getCompletedLessonIds(clientId) {
    const data = _readAll();
    return Object.keys(_clientRecord(data, clientId).completedLessons);
  },

  async markLessonComplete(clientId, lessonId) {
    const data = _readAll();
    _clientRecord(data, clientId).completedLessons[lessonId] = new Date().toISOString();
    _writeAll(data);
  },

  /**
   * Module unlock check (Prerequisite entity, lightweight form).
   * A module is unlocked once every lesson in each prerequisite module's
   * Lesson Sequence has been completed. Formal CompletionEvidence
   * (Build Step 3) will refine "complete" beyond "every lesson opened
   * and reflected on" -- this is the placeholder version that lets
   * Module Entry screens show correct locked/unlocked state today.
   */
  // REVIEW_MODE: this delivered build is for internal review, not live
  // clients -- prerequisite locking is bypassed so every built module can
  // be browsed freely regardless of completion state. Set to false (or
  // delete this block) before any real client-facing deployment; the
  // actual prerequisite logic below is left fully intact underneath it.
  REVIEW_MODE: true,

  async isModuleUnlocked(clientId, moduleId, contentStore) {
    if (this.REVIEW_MODE) return true;
    const mod = await contentStore.getModule(moduleId);
    if (!mod) return false;
    if (!mod.prerequisites || mod.prerequisites.length === 0) return true;
    for (const prereqId of mod.prerequisites) {
      const complete = await this.isModuleComplete(clientId, prereqId, contentStore);
      if (!complete) return false;
    }
    return true;
  },

  async isModuleComplete(clientId, moduleId, contentStore) {
    const lessons = await contentStore.listLessonsForModule(moduleId);
    if (lessons.length === 0) return false;
    const data = _readAll();
    const completed = _clientRecord(data, clientId).completedLessons;
    return lessons.every((l) => Boolean(completed[l.id]));
  },

  async saveReflection(clientId, lessonId, text, coachingOptIn = false) {
    const data = _readAll();
    _clientRecord(data, clientId).reflections[lessonId] = {
      text,
      savedAt: new Date().toISOString(),
      coachingOptIn,
    };
    _writeAll(data);
  },

  async getReflection(clientId, lessonId) {
    const data = _readAll();
    return _clientRecord(data, clientId).reflections[lessonId] || null;
  },

  /** Every reflection a client has written, for the future Learning
   *  Journal view (Build Step 4) -- exposed now so that step doesn't
   *  need a new storage shape when it's built. */
  async listReflections(clientId) {
    const data = _readAll();
    return _clientRecord(data, clientId).reflections;
  },
};

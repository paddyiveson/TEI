/**
 * TEI Education Platform -- Completion Store
 * -----------------------------------------------------------------
 * Per-user progress and reflections backed by Supabase (education_progress).
 * Call CompletionStore.init() once per page before any other method.
 *
 * Identity comes from Supabase Auth (see hub/js/supabase-client.js).
 * Every function is async and returns plain data, matching the shape callers
 * already expect from lesson-session.js and module-entry.js.
 */

let _userId = null;
let _record = {
  completedLessons: {},
  reflections: {},
  commitmentCompletedAt: null,
};

function _emptyRecord() {
  return {
    completedLessons: {},
    reflections: {},
    commitmentCompletedAt: null,
  };
}

function _rowToRecord(row) {
  if (!row) return _emptyRecord();
  return {
    completedLessons: row.completed_lessons || {},
    reflections: row.reflections || {},
    commitmentCompletedAt: row.commitment_completed_at || null,
  };
}

function _assertClientId(clientId) {
  if (!_userId) {
    throw new Error("CompletionStore.init() must be called before use");
  }
  if (clientId && clientId !== _userId) {
    throw new Error("clientId does not match authenticated user");
  }
}

async function _persist() {
  const { error } = await window.teiSupabase.from("education_progress").upsert(
    {
      user_id: _userId,
      completed_lessons: _record.completedLessons,
      reflections: _record.reflections,
      commitment_completed_at: _record.commitmentCompletedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

window.CompletionStore = {
  /** Load authenticated user and their progress row from Supabase. */
  async init() {
    await TeiAuth.waitForReady();
    const {
      data: { user },
      error: authError,
    } = await window.teiSupabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Not authenticated");
    }
    _userId = user.id;

    const { data, error } = await window.teiSupabase
      .from("education_progress")
      .select("*")
      .eq("user_id", _userId)
      .maybeSingle();

    if (error) throw error;
    _record = _rowToRecord(data);
  },

  getCurrentClientId() {
    _assertClientId(null);
    return _userId;
  },

  /** Legacy hook from placeholder identity step — auth user replaces this. */
  async setCurrentClientId() {},

  async isCommitmentComplete(clientId) {
    _assertClientId(clientId);
    return Boolean(_record.commitmentCompletedAt);
  },

  async markCommitmentComplete(clientId) {
    _assertClientId(clientId);
    _record.commitmentCompletedAt = new Date().toISOString();
    await _persist();
  },

  async isLessonComplete(clientId, lessonId) {
    _assertClientId(clientId);
    return Boolean(_record.completedLessons[lessonId]);
  },

  async getCompletedLessonIds(clientId) {
    _assertClientId(clientId);
    return Object.keys(_record.completedLessons);
  },

  async markLessonComplete(clientId, lessonId) {
    _assertClientId(clientId);
    _record.completedLessons[lessonId] = new Date().toISOString();
    await _persist();
  },

  // REVIEW_MODE: bypass prerequisite locking for internal review builds.
  // Set to false before strict client-facing deployment.
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
    _assertClientId(clientId);
    const lessons = await contentStore.listLessonsForModule(moduleId);
    if (lessons.length === 0) return false;
    return lessons.every((l) => Boolean(_record.completedLessons[l.id]));
  },

  async saveReflection(clientId, lessonId, text, coachingOptIn = false) {
    _assertClientId(clientId);
    _record.reflections[lessonId] = {
      text,
      savedAt: new Date().toISOString(),
      coachingOptIn,
    };
    await _persist();
  },

  async getReflection(clientId, lessonId) {
    _assertClientId(clientId);
    return _record.reflections[lessonId] || null;
  },

  async listReflections(clientId) {
    _assertClientId(clientId);
    return _record.reflections;
  },
};

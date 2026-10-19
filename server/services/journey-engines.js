// Motor Universal de Jornadas: Colección unificada de motores compartidos por todos los programas:
// - JourneyEngine
// - ChapterEngine
// - LessonEngine
// - ExerciseEngine
// - ProgressEngine
// - GoalEngine
// - AchievementEngine

import {
  BLOCK_TYPES,
  JourneyError,
  completeLesson as completeLessonCore,
  getLesson as getLessonCore,
  journeyState,
  programOfLesson,
  replaceBlocks,
  saveResponse as saveResponseCore,
  seedJourney,
  validateLesson,
} from './journey.js';
import { checkAchievements, unlockAchievement } from './achievements.js';

/**
 * 1. JourneyEngine: Orquestador general del recorrido del programa
 */
export const JourneyEngine = {
  BLOCK_TYPES,
  JourneyError,
  async getJourneyState(q, userId, programSlug = null) {
    return journeyState(q, userId, programSlug);
  },
  async seed(db, journeyData, options = {}) {
    return seedJourney(db, journeyData, options);
  },
  async getProgramSlugForLesson(q, lessonSlug) {
    return programOfLesson(q, lessonSlug);
  },
};

/**
 * 2. ChapterEngine: Gestión y estados de capítulos
 */
export const ChapterEngine = {
  async getChaptersForProgram(q, programSlug) {
    const state = await journeyState(q, null, programSlug);
    return state.chapters;
  },
  computeChapterStatus(lessons) {
    const statuses = lessons.map((l) => l.status);
    if (statuses.length && statuses.every((s) => s === 'completed')) return 'completed';
    if (statuses.length && statuses.every((s) => s === 'locked')) return 'locked';
    if (statuses.some((s) => s === 'completed' || s === 'in_progress')) return 'in_progress';
    return 'available';
  },
};

/**
 * 3. LessonEngine: Validación, recuperación e inspección de lecciones
 */
export const LessonEngine = {
  validate(lesson) {
    return validateLesson(lesson);
  },
  async get(q, userId, lessonSlug) {
    return getLessonCore(q, userId, lessonSlug);
  },
  async replaceBlocks(q, lessonId, blocks) {
    return replaceBlocks(q, lessonId, blocks);
  },
};

/**
 * 4. ExerciseEngine: Interacciones, preguntas, reflexiones, respiraciones y compromisos
 */
export const ExerciseEngine = {
  async saveResponse(qUser, qService, userId, lessonSlug, blockKey, response) {
    return saveResponseCore(qUser, qService, userId, lessonSlug, blockKey, response);
  },
};

/**
 * 5. ProgressEngine: Cálculo de estados (LOCKED, AVAILABLE, IN_PROGRESS, COMPLETED) y persistencia
 */
export const ProgressEngine = {
  STATUSES: ['locked', 'available', 'in_progress', 'completed'],
  async completeLesson(qUser, qService, userId, lessonSlug) {
    return completeLessonCore(qUser, qService, userId, lessonSlug);
  },
  async getUserProgress(q, userId, programSlug) {
    return journeyState(q, userId, programSlug);
  },
};

/**
 * 6. GoalEngine: Metas y seguimiento diario por programa
 */
export const GoalEngine = {
  async getActiveGoal(q, userId, programSlug = 'sem-fumo') {
    return q.one(
      'select * from public.user_goals where user_id = $1 and program_slug = $2 and superseded_at is null',
      [userId, programSlug]
    );
  },
  async updateGoal(q, userId, programSlug = 'sem-fumo', changes) {
    const cur = await this.getActiveGoal(q, userId, programSlug);
    if (!cur) throw new JourneyError('PLAN_PENDING', 'Tu plan todavía se está preparando.', 409);
    const next = { ...cur, ...changes };
    await q.exec('update public.user_goals set superseded_at = now() where id = $1', [cur.id]);
    return q.one(`
      insert into public.user_goals (user_id, program_slug, strategy, start_date, quit_date, max_daily, exercise_per_week, money_goal, money_goal_label)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [
      userId, programSlug, next.strategy, next.start_date, next.quit_date,
      next.max_daily, next.exercise_per_week, next.money_goal, next.money_goal_label
    ]);
  },
};

/**
 * 7. AchievementEngine: Evaluación y desbloqueo de hitos por programa
 */
export const AchievementEngine = {
  async evaluate(q, userId, timezone = 'UTC') {
    return checkAchievements(q, userId, timezone);
  },
  async unlock(q, userId, achievementSlug) {
    return unlockAchievement(q, userId, achievementSlug);
  },
};

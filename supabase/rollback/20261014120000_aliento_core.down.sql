-- Reversión de 20261014120000_aliento_core.sql
-- ⚠️ DESTRUCTIVO: borra todas las tablas de Aliento y sus datos.
-- Ejecutar solo en un entorno sin datos reales o tras verificar una copia de seguridad recuperable.
begin;
drop function if exists public.has_premium(uuid) cascade;
drop table if exists
  public.support_messages, public.support_conversations,
  public.billing_reconciliation_reviews, public.billing_events, public.subscriptions, public.checkout_sessions,
  public.notification_deliveries, public.notification_preferences,
  public.user_achievements, public.achievements,
  public.breathing_sessions, public.breathing_exercises,
  public.mood_entries, public.craving_entries, public.smoking_entries,
  public.user_chapter_progress, public.user_lesson_progress, public.lesson_responses,
  public.lesson_blocks, public.journey_lessons, public.journey_chapters, public.journey_programs,
  public.daily_goals, public.user_goals, public.plan_versions, public.personalized_plans,
  public.user_assessments, public.questionnaire_answers, public.questionnaire_sessions,
  public.admin_audit_logs, public.admin_users, public.profiles;
drop function if exists public.touch_updated_at() cascade;
commit;

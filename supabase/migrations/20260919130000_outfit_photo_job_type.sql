-- Add the new enum value in its own transaction. PostgreSQL cannot use a new
-- enum value in data changes until the ALTER TYPE transaction commits.
alter type public.ai_job_type add value 'outfit_photo';

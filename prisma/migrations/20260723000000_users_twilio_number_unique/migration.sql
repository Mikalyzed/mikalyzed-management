-- Each rep gets their own Twilio number; enforce one number per user.
-- Applied to the live DB via direct SQL on 2026-07-23 (only one user had
-- a number, no duplicates); IF NOT EXISTS keeps this a no-op there.
CREATE UNIQUE INDEX IF NOT EXISTS "users_twilio_number_key" ON "users"("twilio_number");

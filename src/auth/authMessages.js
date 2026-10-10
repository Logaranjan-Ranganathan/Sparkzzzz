// Maps Supabase auth errors to concise, non-technical guidance.
export const friendlyAuthError = (error) => {
  const message = String(error?.message || '');
  if (/email not confirmed/i.test(message)) {
    return 'Please confirm your email address first — open the verification link we sent you, then sign in.';
  }
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/user already registered/i.test(message)) return 'An account already exists for this email. Try signing in instead.';
  if (/rate limit|too many|after \d+ seconds/i.test(message)) return 'Too many attempts — please wait a moment and try again.';
  if (/is invalid/i.test(message)) return 'The server rejected that email address — please use a working personal or work email.';
  if (/password should be at least|password is too short/i.test(message)) return 'Password is too short — use at least 8 characters.';
  return message || 'Something went wrong. Please try again.';
};

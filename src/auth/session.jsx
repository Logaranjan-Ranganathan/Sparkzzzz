import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../supabase/client.js';

const AuthContext = createContext(null);

// Role always comes from the `profiles` table, which is protected by RLS.
// It is never read from localStorage or from user-editable auth metadata.
const fetchProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return data || null;
};

const fetchOfficerProfile = async (userId) => {
  const { data, error } = await supabase
    .from('officer_profiles')
    .select('user_id, officer_id, ward_id, department, zone, active')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return data || null;
};

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [officerProfile, setOfficerProfile] = useState(null);
  const [profileReady, setProfileReady] = useState(!isSupabaseConfigured);
  const [recoveryMode, setRecoveryMode] = useState(false);

  // Session bootstrap + persistence across reloads.
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session || null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setSession(nextSession || null);
      setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Re-query role and officer scope from the database whenever the user changes.
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      setOfficerProfile(null);
      setProfileReady(true);
      return undefined;
    }
    let cancelled = false;
    setProfileReady(false);
    (async () => {
      const nextProfile = await fetchProfile(userId);
      const nextOfficer =
        nextProfile && nextProfile.role !== 'citizen'
          ? await fetchOfficerProfile(userId)
          : null;
      if (cancelled) return;
      setProfile(nextProfile);
      setOfficerProfile(nextOfficer);
      setProfileReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const value = useMemo(() => {
    const role = profile?.role || null;
    return {
      configured: isSupabaseConfigured,
      ready: ready && profileReady,
      session,
      user: session?.user || null,
      profile,
      officerProfile,
      role,
      isOfficer: role === 'officer' || role === 'admin',
      isAdmin: role === 'admin',
      recoveryMode,
      clearRecovery: () => setRecoveryMode(false),
      signUp: async ({ email, password, fullName, phone }) => {
        if (!isSupabaseConfigured) throw new Error('Server connection is not configured.');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, phone },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (error) throw error;
        return data;
      },
      signIn: async ({ email, password }) => {
        if (!isSupabaseConfigured) throw new Error('Server connection is not configured.');
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
      },
      signOut: async () => {
        if (!isSupabaseConfigured) return;
        await supabase.auth.signOut();
        setRecoveryMode(false);
      },
      requestPasswordReset: async (email) => {
        if (!isSupabaseConfigured) throw new Error('Server connection is not configured.');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
      },
      updatePassword: async (password) => {
        if (!isSupabaseConfigured) throw new Error('Server connection is not configured.');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setRecoveryMode(false);
      },
    };
  }, [ready, profileReady, session, profile, officerProfile, recoveryMode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

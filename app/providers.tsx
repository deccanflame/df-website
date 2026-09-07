"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firebaseConfigured, firestore } from "../lib/firebase";

export type UserRole = "user" | "admin";

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
};

type AuthMode = "login" | "register";

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  configured: boolean;
  authOpen: boolean;
  authMode: AuthMode;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  setAuthMode: (mode: AuthMode) => void;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function requireFirebase() {
  if (!firebaseAuth || !firestore) {
    throw new Error("Firebase is not configured yet. Add the local Firebase environment values first.");
  }
  return { auth: firebaseAuth, db: firestore };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  useEffect(() => {
    if (!firebaseConfigured || !firebaseAuth || !firestore) {
      return;
    }

    let stopProfile = () => undefined;
    const stopAuth = onAuthStateChanged(firebaseAuth, (nextUser) => {
      stopProfile();
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      stopProfile = onSnapshot(
        doc(firestore!, "users", nextUser.uid),
        (snapshot) => {
          const data = snapshot.data();
          setProfile({
            uid: nextUser.uid,
            displayName: data?.displayName ?? nextUser.displayName ?? "Deccan guest",
            email: data?.email ?? nextUser.email ?? "",
            role: data?.role === "admin" ? "admin" : "user",
          });
          setLoading(false);
        },
        () => {
          setProfile({
            uid: nextUser.uid,
            displayName: nextUser.displayName ?? "Deccan guest",
            email: nextUser.email ?? "",
            role: "user",
          });
          setLoading(false);
        },
      );
    });

    return () => {
      stopProfile();
      stopAuth();
    };
  }, []);

  const openAuth = useCallback((mode: AuthMode = "login") => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const register = useCallback(async (displayName: string, email: string, password: string) => {
    const { auth, db } = requireFirebase();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    await setDoc(doc(db, "users", credential.user.uid), {
      displayName,
      email: credential.user.email,
      role: "user",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setAuthOpen(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { auth } = requireFirebase();
    await signInWithEmailAndPassword(auth, email, password);
    setAuthOpen(false);
  }, []);

  const logout = useCallback(async () => {
    const { auth } = requireFirebase();
    await signOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { auth } = requireFirebase();
    await sendPasswordResetEmail(auth, email);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      configured: firebaseConfigured,
      authOpen,
      authMode,
      openAuth,
      closeAuth,
      setAuthMode,
      register,
      login,
      logout,
      resetPassword,
    }),
    [user, profile, loading, authOpen, authMode, openAuth, closeAuth, register, login, logout, resetPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

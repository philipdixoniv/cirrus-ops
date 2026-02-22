import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

const BASE_URL = "/api";

interface Profile {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  personas: string[];
  approval_stages: string[];
  approvers: string[];
}

interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  setActiveProfile: (profile: Profile | null) => void;
  profileId: string | undefined;
  isLoading: boolean;
}

const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  activeProfile: null,
  setActiveProfile: () => {},
  profileId: undefined,
  isLoading: true,
});

const STORAGE_KEY = "content-studio-active-profile";

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/profiles`);
      if (!res.ok) throw new Error("Failed to fetch profiles");
      return res.json() as Promise<Profile[]>;
    },
  });

  // Restore from localStorage once profiles load
  useEffect(() => {
    if (profiles.length === 0) return;
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (savedId) {
      const found = profiles.find((p) => p.id === savedId);
      if (found) {
        setActiveProfileState(found);
        return;
      }
    }
    // Default to first profile
    setActiveProfileState(profiles[0]);
  }, [profiles]);

  const setActiveProfile = (profile: Profile | null) => {
    setActiveProfileState(profile);
    if (profile) {
      localStorage.setItem(STORAGE_KEY, profile.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        setActiveProfile,
        profileId: activeProfile?.id,
        isLoading,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}

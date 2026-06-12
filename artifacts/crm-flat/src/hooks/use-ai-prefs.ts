import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

const DEFAULT_TONE = "Professional";
const DEFAULT_GOAL = "";

function storageKey(userId: string, field: "tone" | "goal") {
  return `crm_ai_${field}_${userId}`;
}

export function useAiPrefs() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const loadedRef = useRef<string | null>(null);

  const [tone, setToneState] = useState(DEFAULT_TONE);
  const [goal, setGoalState] = useState(DEFAULT_GOAL);

  useEffect(() => {
    if (!userId || loadedRef.current === userId) return;
    loadedRef.current = userId;

    const savedTone = localStorage.getItem(storageKey(userId, "tone"));
    const savedGoal = localStorage.getItem(storageKey(userId, "goal"));
    if (savedTone) setToneState(savedTone);
    if (savedGoal !== null) setGoalState(savedGoal);
  }, [userId]);

  function setTone(value: string) {
    setToneState(value);
    if (userId) localStorage.setItem(storageKey(userId, "tone"), value);
  }

  function setGoal(value: string) {
    setGoalState(value);
    if (userId) localStorage.setItem(storageKey(userId, "goal"), value);
  }

  return { tone, setTone, goal, setGoal };
}

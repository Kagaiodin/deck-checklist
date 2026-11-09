import { useState, useEffect } from "react";
import type React from "react";
import { loadJson, saveJson } from "../store/savedJson";

export function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [stored, setStored] = useState<T>(() => loadJson(key, initialValue));

  useEffect(() => {
    saveJson(key, stored);
  }, [key, stored]);

  return [stored, setStored];
}

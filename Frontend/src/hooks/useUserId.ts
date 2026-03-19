import { useState, useEffect } from 'react';

const STORAGE_KEY = 'platziflix_user_id';

function generateUserId(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}

export function useUserId(): number | null {
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setUserId(parseInt(stored, 10));
    } else {
      const newId = generateUserId();
      localStorage.setItem(STORAGE_KEY, String(newId));
      setUserId(newId);
    }
  }, []);

  return userId;
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { ratingsApi } from '@/services/ratingsApi';
import { ApiError } from '@/types/rating';

interface RatingState {
  userRating: number | null;
  averageRating: number;
  totalRatings: number;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

export function useUserRating(
  courseId: number,
  userId: number | null,
  initialAverageRating: number,
  initialTotalRatings: number
) {
  const [state, setState] = useState<RatingState>({
    userRating: null,
    averageRating: initialAverageRating,
    totalRatings: initialTotalRatings,
    isLoading: false,
    isSaving: false,
    error: null,
  });

  // Ref para leer el estado actual dentro de callbacks sin incluirlo en deps
  const stateRef = useRef(state);
  stateRef.current = state;

  // Carga el rating existente del usuario cuando userId está disponible
  useEffect(() => {
    if (!userId) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    ratingsApi
      .getUserRating(courseId, userId)
      .then(rating => {
        setState(prev => ({
          ...prev,
          userRating: rating ? rating.rating : null,
          isLoading: false,
        }));
      })
      .catch(() => {
        setState(prev => ({ ...prev, isLoading: false }));
      });
  }, [courseId, userId]);

  const submitRating = useCallback(
    async (newRating: number) => {
      if (!userId) return;

      const current = stateRef.current;
      const prevState = { ...current };

      // Cálculo optimista del nuevo promedio
      const isNew = current.userRating === null;
      const newTotal = isNew ? current.totalRatings + 1 : current.totalRatings;
      const newAverage = isNew
        ? (current.averageRating * current.totalRatings + newRating) / newTotal
        : (current.averageRating * current.totalRatings -
            (current.userRating ?? 0) +
            newRating) /
          current.totalRatings;

      setState(prev => ({
        ...prev,
        userRating: newRating,
        averageRating: Math.round(newAverage * 100) / 100,
        totalRatings: newTotal,
        isSaving: true,
        error: null,
      }));

      try {
        await ratingsApi.createRating(courseId, { user_id: userId, rating: newRating });
        // Reemplaza con datos reales del servidor
        const stats = await ratingsApi.getRatingStats(courseId);
        setState(prev => ({
          ...prev,
          averageRating: stats.average_rating,
          totalRatings: stats.total_ratings,
          isSaving: false,
        }));
      } catch (error) {
        // Rollback al estado anterior
        setState({
          ...prevState,
          error:
            error instanceof ApiError
              ? error.message
              : 'Error al guardar la calificación',
          isSaving: false,
        });
      }
    },
    [courseId, userId]
  );

  const removeRating = useCallback(async () => {
    if (!userId) return;

    const current = stateRef.current;
    if (current.userRating === null) return;

    const prevState = { ...current };

    // Cálculo optimista del nuevo promedio
    const newTotal = Math.max(0, current.totalRatings - 1);
    const newAverage =
      newTotal === 0
        ? 0
        : (current.averageRating * current.totalRatings - current.userRating) /
          newTotal;

    setState(prev => ({
      ...prev,
      userRating: null,
      averageRating: Math.round(newAverage * 100) / 100,
      totalRatings: newTotal,
      isSaving: true,
      error: null,
    }));

    try {
      await ratingsApi.deleteRating(courseId, userId);
      const stats = await ratingsApi.getRatingStats(courseId);
      setState(prev => ({
        ...prev,
        averageRating: stats.average_rating,
        totalRatings: stats.total_ratings,
        isSaving: false,
      }));
    } catch (error) {
      setState({
        ...prevState,
        error:
          error instanceof ApiError
            ? error.message
            : 'Error al eliminar la calificación',
        isSaving: false,
      });
    }
  }, [courseId, userId]);

  return { ...state, submitRating, removeRating };
}

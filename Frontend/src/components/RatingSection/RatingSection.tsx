'use client';

import { StarRating } from '@/components/StarRating/StarRating';
import { useUserId } from '@/hooks/useUserId';
import { useUserRating } from '@/hooks/useUserRating';
import { InteractiveStarRating } from './InteractiveStarRating';
import styles from './RatingSection.module.scss';

interface RatingSectionProps {
  courseId: number;
  initialAverageRating: number;
  initialTotalRatings: number;
}

export function RatingSection({
  courseId,
  initialAverageRating,
  initialTotalRatings,
}: RatingSectionProps) {
  const userId = useUserId();
  const {
    userRating,
    averageRating,
    totalRatings,
    isLoading,
    isSaving,
    error,
    submitRating,
    removeRating,
  } = useUserRating(courseId, userId, initialAverageRating, initialTotalRatings);

  return (
    <div className={styles.ratingSection}>
      {/* Promedio global del curso */}
      <StarRating
        rating={averageRating}
        totalRatings={totalRatings}
        size="medium"
        showCount
      />

      {/* Rating interactivo del usuario */}
      <div className={styles.userRating}>
        <span className={styles.label}>
          {isLoading
            ? 'Cargando tu calificación...'
            : userRating
            ? 'Tu calificación:'
            : 'Califica este curso:'}
        </span>

        <div className={styles.interactiveRow}>
          <InteractiveStarRating
            currentRating={userRating}
            onRate={submitRating}
            disabled={isLoading || isSaving || !userId}
          />
          {isSaving && <span className={styles.saving}>Guardando...</span>}
        </div>

        {userRating && !isSaving && (
          <button
            type="button"
            className={styles.deleteButton}
            onClick={removeRating}
            disabled={isSaving}
          >
            Eliminar calificación
          </button>
        )}

        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
}

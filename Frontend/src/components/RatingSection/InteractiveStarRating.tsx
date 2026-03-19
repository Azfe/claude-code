import { useState } from 'react';
import styles from './RatingSection.module.scss';

interface InteractiveStarRatingProps {
  currentRating: number | null;
  onRate: (rating: number) => void;
  disabled?: boolean;
}

export function InteractiveStarRating({
  currentRating,
  onRate,
  disabled = false,
}: InteractiveStarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const displayRating = hovered ?? currentRating ?? 0;

  return (
    <div
      className={`${styles.interactiveStars} ${disabled ? styles.disabled : ''}`}
      role="group"
      aria-label="Califica este curso"
    >
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          className={`${styles.starButton} ${displayRating >= star ? styles.starActive : ''}`}
          onClick={() => !disabled && onRate(star)}
          onMouseEnter={() => !disabled && setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          disabled={disabled}
          aria-label={`Calificar con ${star} estrella${star > 1 ? 's' : ''}`}
          aria-pressed={currentRating === star}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
              fill={displayRating >= star ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}

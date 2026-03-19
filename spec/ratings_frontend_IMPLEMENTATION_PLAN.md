# Plan de Implementación: Sistema de Ratings Interactivo — Frontend

## Problema

El usuario no puede enviar su propio rating desde la UI. El componente `StarRating` es puramente visual
(read-only). El servicio `ratingsApi.ts` está completo con las 6 operaciones HTTP, pero ningún
componente las invoca para mutaciones. El backend está 100% operativo y no requiere cambios.

---

## Análisis Arquitectural

### Restricción central: Server vs Client Components en Next.js 15

La página de detalle (`/course/[slug]/page.tsx`) es un **Server Component** (async function que hace
`fetch`). Los Server Components no pueden tener estado local (`useState`), efectos (`useEffect`),
ni manejar eventos del browser. La interactividad de ratings — hover, click, llamadas API desde
el browser — requiere un **Client Component** (`'use client'`).

La estrategia correcta en Next.js 15 App Router es el patrón **"Server Shell + Client Island"**:

```
CoursePage (Server Component)
  └── CourseDetailComponent (Server Component — estructura y datos estáticos)
        ├── [datos del curso, lista de clases]  ← renderizado en servidor
        └── RatingSectionClient ('use client')  ← isla interactiva en cliente
```

El Server Component obtiene los datos del curso (incluyendo `average_rating` y `total_ratings`)
y los pasa como props al componente cliente. El componente cliente toma control únicamente de la
sección de ratings, manteniendo el resto de la página sin overhead de JavaScript.

### Problema del user_id sin autenticación

No existe sistema de autenticación en la aplicación. El backend requiere un `user_id` numérico.
La solución es **localStorage con ID persistente generado una sola vez**:

- En el primer render del Client Component, verificar si existe `platziflix_user_id` en localStorage.
- Si no existe, generar un entero aleatorio en rango 1–999999 y persistirlo.
- Este ID se usa en todas las llamadas a la API de ratings.
- Consecuencia asumida: en la demo no hay "usuario real", pero el comportamiento es consistente
  entre navegaciones en la misma sesión del navegador.

---

## Impacto Arquitectural

### Archivos a crear (nuevos)

| Archivo | Tipo | Responsabilidad |
|---|---|---|
| `src/hooks/useUserRating.ts` | Custom Hook | Estado, lógica de negocio, llamadas API |
| `src/hooks/useUserId.ts` | Custom Hook | Persistencia del user_id en localStorage |
| `src/components/RatingSection/RatingSection.tsx` | Client Component | Orquestador de la sección interactiva |
| `src/components/RatingSection/RatingSection.module.scss` | Estilos | Estilos de la sección |
| `src/components/InteractiveStarRating/InteractiveStarRating.tsx` | Client Component | Estrellas clickeables con hover |
| `src/components/InteractiveStarRating/InteractiveStarRating.module.scss` | Estilos | Estilos interactivos |

### Archivos a modificar (existentes)

| Archivo | Cambio requerido |
|---|---|
| `src/components/CourseDetail/CourseDetail.tsx` | Reemplazar el bloque `<StarRating>` read-only por `<RatingSectionClient>` |
| `src/components/StarRating/StarRating.tsx` | Sin cambios — se mantiene read-only para la vista de lista |

### Archivos sin cambios

- `src/app/course/[slug]/page.tsx` — el Server Component no cambia
- `src/services/ratingsApi.ts` — ya está completo
- `src/types/rating.ts` — ya tiene los tipos necesarios
- `src/app/page.tsx` — la home solo muestra rating promedio, no interactivo

---

## Diseño Detallado de Cada Componente

### 1. `src/hooks/useUserId.ts`

Responsabilidad única: obtener y persistir el user_id anónimo.

```typescript
// Firma del hook
export function useUserId(): number | null
```

Comportamiento:
- Retorna `null` en el primer render (SSR/hidratación — localStorage no disponible en servidor).
- En `useEffect`, lee o genera el ID y actualiza el estado.
- El componente que lo consume muestra un placeholder hasta que el ID esté disponible.

### 2. `src/hooks/useUserRating.ts`

Este hook centraliza TODA la lógica de ratings interactivos. Es el corazón del feature.

```typescript
// Firma del hook
export function useUserRating(courseId: number, initialAverageRating: number, initialTotalRatings: number): {
  // Estado
  userRating: number | null;        // Rating actual del usuario (null si no ha calificado)
  averageRating: number;            // Promedio actualizado localmente tras mutación
  totalRatings: number;             // Total actualizado localmente
  hoverRating: number | null;       // Estrella sobre la que está el cursor
  ratingState: RatingState;         // 'idle' | 'loading' | 'success' | 'error'
  errorMessage: string | null;

  // Acciones
  handleStarHover: (star: number) => void;
  handleStarLeave: () => void;
  handleStarClick: (star: number) => Promise<void>;
  handleDeleteRating: () => Promise<void>;
}
```

Lógica interna:
1. Al montar (`useEffect`), llama `ratingsApi.getUserRating(courseId, userId)` para cargar el
   rating existente del usuario.
2. `handleStarClick`:
   - Si `userRating === null`: llama `ratingsApi.createRating` (POST con upsert).
   - Si `userRating !== null` y el star es diferente: llama `ratingsApi.updateRating` (PUT).
   - Si el star es igual al `userRating` actual: llama `handleDeleteRating` (toggle para quitar).
   - Implementa **optimistic update**: actualiza el estado local antes de recibir respuesta,
     revierte si la API falla.
3. `handleDeleteRating`: llama `ratingsApi.deleteRating` y limpia `userRating`.

El cálculo del optimistic update para `averageRating`:
- Al crear: `(average * total + newRating) / (total + 1)`
- Al actualizar: `(average * total - oldRating + newRating) / total`
- Al eliminar: `total > 1 ? (average * total - oldRating) / (total - 1) : 0`

### 3. `src/components/InteractiveStarRating/InteractiveStarRating.tsx`

Client Component puro de presentación. Recibe callbacks del hook, no tiene estado propio.

```typescript
// Props
interface InteractiveStarRatingProps {
  userRating: number | null;     // Rating guardado del usuario
  hoverRating: number | null;    // Estrella bajo el cursor
  disabled: boolean;             // true mientras loading
  onStarHover: (star: number) => void;
  onStarLeave: () => void;
  onStarClick: (star: number) => void;
  size?: 'medium' | 'large';
}
```

Lógica visual de cada estrella:
- Si `hoverRating !== null`: mostrar relleno hasta `hoverRating` (preview).
- Si `hoverRating === null` y `userRating !== null`: mostrar relleno hasta `userRating` (estado guardado).
- Si ambos son null: mostrar vacías.
- Estrella igual a `userRating` cuando no hay hover: usar color diferenciado (ej. amarillo intenso vs
  amarillo claro del promedio) para indicar "esta es tu calificación".
- `disabled=true`: cursor not-allowed, sin eventos.

Accesibilidad:
- El contenedor tiene `role="group"` y `aria-label="Califica este curso"`.
- Cada estrella es un `<button>` con `aria-label="Calificar con N estrellas"`.
- `aria-pressed={star === userRating}` para indicar la estrella seleccionada.
- Soporte de teclado: `Tab` navega entre estrellas, `Enter`/`Space` selecciona.

### 4. `src/components/RatingSection/RatingSection.tsx`

Este es el Client Component orquestador. Usa `'use client'` y combina los hooks con la UI.

```typescript
'use client';

interface RatingSectionProps {
  courseId: number;
  initialAverageRating: number;
  initialTotalRatings: number;
}
```

Responsabilidades:
- Llama `useUserId()` y `useUserRating()`.
- Mientras `userId === null` (hidratación): muestra el `<StarRating>` read-only como placeholder.
- Una vez hidratado: muestra la sección interactiva completa.
- Maneja los estados visuales de feedback (loading spinner, mensaje de éxito, mensaje de error).

Layout interno de la sección:

```
┌─────────────────────────────────────────────────────┐
│  Calificación promedio                               │
│  ★★★★½  4.3  (127 calificaciones)                   │  ← StarRating read-only (promedio)
│                                                     │
│  Tu calificación                                    │
│  ★ ★ ★ ★ ★  [Eliminar]                              │  ← InteractiveStarRating
│  [mensaje de estado: "Guardando..." / "Guardado!"]  │
└─────────────────────────────────────────────────────┘
```

---

## Flujo Completo de Datos

### Flujo: primer render (sin rating previo)

```
1. CoursePage (Server) — fetch /courses/{slug} → { id, average_rating, total_ratings, ... }
2. CourseDetailComponent (Server) — renderiza estructura, pasa courseId + ratings como props
3. RatingSectionClient (Client) — monta en browser
4. useUserId() — lee localStorage, retorna userId
5. useUserRating() — GET /courses/{id}/ratings/user/{userId} → 404 → userRating = null
6. UI renderiza InteractiveStarRating con 5 estrellas vacías
```

### Flujo: usuario hace click en estrella 4

```
1. handleStarClick(4) ejecuta
2. Optimistic update: userRating=4, averageRating recalculado, totalRatings+1, ratingState='loading'
3. POST /courses/{id}/ratings { user_id, rating: 4 }
4a. Éxito: ratingState='success', datos confirmados del servidor
4b. Error: revertir estado optimista, ratingState='error', mostrar mensaje
```

### Flujo: usuario cambia de estrella 4 a estrella 2

```
1. handleStarClick(2) ejecuta
2. Optimistic update: userRating=2, averageRating recalculado (reemplaza), ratingState='loading'
3. PUT /courses/{id}/ratings/{userId} { rating: 2 }
4a. Éxito: confirmado
4b. Error: revertir a userRating=4
```

### Flujo: usuario hace click en su misma estrella (toggle off)

```
1. handleStarClick(4) cuando userRating === 4
2. Interpretar como solicitud de eliminar
3. Optimistic update: userRating=null, averageRating recalculado (resta), totalRatings-1
4. DELETE /courses/{id}/ratings/{userId}
```

---

## Plan de Implementación Paso a Paso

### Paso 1 — Hook de identidad anónima

Archivo: `src/hooks/useUserId.ts`

Implementar el hook que lee/genera el user_id en localStorage. Este es el paso más simple y
es prerequisito de todo lo demás. No requiere ninguna dependencia externa.

Verificación: el hook retorna `null` en SSR y un número entero en el cliente.

### Paso 2 — Hook de lógica de ratings

Archivo: `src/hooks/useUserRating.ts`

Implementar con el contrato de firma definido arriba. Comenzar con el flujo de carga (GET),
luego crear, luego actualizar, luego eliminar. El optimistic update se puede agregar en una
segunda pasada una vez que el flujo básico funciona.

Verificación: probar manualmente en la consola del browser llamando los handlers.

### Paso 3 — Componente InteractiveStarRating

Archivos: `src/components/InteractiveStarRating/InteractiveStarRating.tsx` y `.module.scss`

Implementar el componente visual puro. En este paso usar valores hardcodeados para probar
el comportamiento visual del hover y la selección. No conectar al hook todavía.

Estilos necesarios en el SCSS:
- `.star.interactive`: `cursor: pointer`
- `.star.hovered`: color amarillo de preview (ligeramente más claro)
- `.star.selected`: color amarillo intenso (la estrella guardada del usuario)
- `.star.disabled`: `cursor: not-allowed`, `opacity: 0.5`
- Transiciones de `color` y `transform: scale(1.1)` en hover

Verificación: abrir Storybook o una página de prueba y validar todos los estados visuales.

### Paso 4 — Componente RatingSection

Archivos: `src/components/RatingSection/RatingSection.tsx` y `.module.scss`

Conectar `useUserId`, `useUserRating` y `InteractiveStarRating`. Implementar el layout con
las dos sub-secciones (promedio + calificación del usuario).

El bloque de feedback de estado (`ratingState`):
- `'loading'`: mostrar texto "Guardando..." con un spinner CSS simple
- `'success'`: mostrar "Calificacion guardada" con auto-hide a los 3 segundos (`setTimeout`)
- `'error'`: mostrar `errorMessage` en rojo con botón "Reintentar"

El botón "Eliminar calificacion":
- Solo visible cuando `userRating !== null`
- Deshabilitado durante `ratingState === 'loading'`

### Paso 5 — Integrar en CourseDetailComponent

Archivo: `src/components/CourseDetail/CourseDetail.tsx`

Reemplazar el bloque existente:

```tsx
// Eliminar esto:
{course.average_rating !== undefined && (
  <div className={styles.rating}>
    <StarRating
      rating={course.average_rating}
      totalRatings={course.total_ratings}
      size="medium"
      showCount={true}
    />
  </div>
)}

// Agregar esto:
<RatingSectionClient
  courseId={course.id}
  initialAverageRating={course.average_rating ?? 0}
  initialTotalRatings={course.total_ratings ?? 0}
/>
```

`CourseDetailComponent` no necesita `'use client'` — solo importa un Client Component,
lo cual Next.js permite desde un Server Component.

Verificación: navegar a `/course/[slug]` y confirmar que el componente hidrata correctamente.

### Paso 6 — CSS: evitar Cumulative Layout Shift (CLS)

El componente `RatingSectionClient` tiene un momento entre el render inicial (SSR) y la
hidratación donde el `userId` es `null`. Para evitar que la UI salte visualmente:

- El placeholder SSR debe tener exactamente las mismas dimensiones que la versión interactiva.
- Usar `min-height` fijo en el contenedor de la sección de rating.
- La `StarRating` read-only usada como placeholder debe tener el mismo `size="large"` que la
  versión interactiva.

### Paso 7 — Tests

Archivos a crear:
- `src/hooks/useUserRating.test.ts`
- `src/components/InteractiveStarRating/InteractiveStarRating.test.tsx`
- `src/components/RatingSection/RatingSection.test.tsx`

Casos de test prioritarios para `useUserRating`:
1. Carga inicial: sin rating previo → `userRating === null`
2. Carga inicial: con rating previo → `userRating === 3`
3. `handleStarClick`: crea rating cuando `userRating === null`
4. `handleStarClick`: actualiza cuando ya existe
5. `handleStarClick` en la misma estrella: elimina el rating
6. Revert en error: el estado optimista se revierte si la API falla

Casos de test para `InteractiveStarRating`:
1. Render con `userRating=null`: 5 estrellas vacías
2. Render con `userRating=3`: primeras 3 llenas, últimas 2 vacías
3. Hover sobre estrella 4: 4 estrellas en estado hover
4. Click en estrella: callback invocado con el número correcto
5. `disabled=true`: clicks no disparan callbacks

Mock de `ratingsApi` usando `vi.mock` de Vitest.

---

## Consideraciones de UX

### Optimistic Updates

Se implementan porque la latencia de la API (aunque sea local) crea una experiencia confusa
si el usuario ve que "nada pasa" al hacer click. El optimistic update hace que la UI responda
inmediatamente. El rollback en error es aceptable porque es un caso poco frecuente.

### Debounce en clicks rápidos

Si el usuario hace click rápidamente en varias estrellas consecutivas, se generan múltiples
requests en vuelo. Estrategia: usar un flag `isSubmitting` (parte de `ratingState === 'loading'`)
que deshabilita las estrellas hasta recibir respuesta. No se usa debounce porque queremos que
el request de la estrella en la que el usuario "termina" siempre se envíe, y deshabilitando
durante loading se evita el problema sin complejidad adicional.

### Hidratación

La secuencia es:
1. Servidor renderiza `RatingSectionClient` con los props iniciales.
2. El HTML llega al browser con el StarRating read-only (placeholder).
3. React hidrata: `useUserId` retorna `null` → sigue mostrando placeholder.
4. `useEffect` de `useUserId` corre → obtiene ID de localStorage → actualiza estado.
5. `useEffect` de `useUserRating` corre → llama API → obtiene rating del usuario.
6. UI transiciona a la versión interactiva.

Este proceso es imperceptible para el usuario si los estilos del placeholder y la versión
interactiva tienen las mismas dimensiones.

### Accesibilidad

- El componente interactivo no usa `<div>` con `onClick`. Usa `<button>` reales.
- `aria-disabled` durante loading (no `disabled` nativo, para mantener el foco accesible).
- El mensaje de estado tiene `role="status"` y `aria-live="polite"` para anunciarse a screen readers.
- El color de las estrellas no es el único indicador visual — se usa también `transform: scale`.

---

## Árbol de Archivos Final

```
Frontend/src/
├── hooks/
│   ├── useUserId.ts                    [NUEVO]
│   └── useUserRating.ts                [NUEVO]
├── components/
│   ├── InteractiveStarRating/
│   │   ├── InteractiveStarRating.tsx   [NUEVO]
│   │   └── InteractiveStarRating.module.scss  [NUEVO]
│   ├── RatingSection/
│   │   ├── RatingSection.tsx           [NUEVO]
│   │   └── RatingSection.module.scss   [NUEVO]
│   ├── CourseDetail/
│   │   └── CourseDetail.tsx            [MODIFICAR — solo el bloque de rating]
│   └── StarRating/
│       └── StarRating.tsx              [SIN CAMBIOS]
└── services/
    └── ratingsApi.ts                   [SIN CAMBIOS]
```

Total: 5 archivos nuevos, 1 archivo modificado.

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| localStorage no disponible (SSR, modo incógnito extremo) | Usuario no puede calificar | `useUserId` maneja `typeof window === 'undefined'` y el error de acceso con try/catch |
| Race condition: dos requests en vuelo simultáneos | Estado inconsistente | Deshabilitar stars durante `loading` |
| El backend retorna error 409 en upsert si hay un bug | Rating no se guarda | Mostrar error claro con mensaje del server |
| Optimistic update diverge del server | UI muestra datos incorrectos | En éxito, reemplazar datos locales con la respuesta real del servidor |
| CLS en hidratación | Experiencia visual degradada | Placeholder con mismas dimensiones + `min-height` en contenedor |

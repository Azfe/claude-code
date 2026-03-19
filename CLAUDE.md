# Platziflix - Proyecto Multi-plataforma

Plataforma de cursos online estilo Netflix con arquitectura multi-cliente. Un único Backend REST sirve a tres clientes independientes: Web, Android e iOS.

## Arquitectura General

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENTES                              │
│  ┌────────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │  Next.js 15    │  │   Android   │  │       iOS        │  │
│  │  TypeScript    │  │   Kotlin    │  │      Swift       │  │
│  └───────┬────────┘  └──────┬──────┘  └────────┬─────────┘  │
└──────────┼─────────────────┼───────────────────┼────────────┘
           └─────────────────┼───────────────────┘
                             │ HTTP REST (JSON)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│              BACKEND — FastAPI / Python 3.11                 │
│  Routes → CourseService → SQLAlchemy ORM → PostgreSQL 15     │
└──────────────────────────────────────────────────────────────┘
```

## Stack Tecnológico

| | Backend | Frontend | Android | iOS |
|---|---|---|---|---|
| **Lenguaje** | Python 3.11 | TypeScript | Kotlin | Swift |
| **Framework** | FastAPI | Next.js 15 | Jetpack Compose | SwiftUI |
| **Estado/DB** | SQLAlchemy 2.0 | Server Components | StateFlow | Combine |
| **Arquitectura** | Service Layer | App Router + SSR | MVVM + MVI | MVVM |
| **HTTP** | REST API | `fetch` nativo | Retrofit2 | URLSession |
| **Testing** | Pytest | Vitest + RTL | Instrumented | XCTest |
| **Puerto** | 8000 | 3000 | — | — |

## Estructura del Proyecto

```
claude-code/
├── Backend/                    # FastAPI + PostgreSQL (Docker)
├── Frontend/                   # Next.js 15 App
├── Mobile/
│   ├── PlatziFlixAndroid/      # Kotlin + Jetpack Compose
│   └── PlatziFlixiOS/          # Swift + SwiftUI
└── spec/                       # Especificaciones de implementación
```

## Backend

### Estructura interna

```
Backend/app/
├── main.py                     # Entry point FastAPI
├── core/config.py              # Settings & env vars
├── db/
│   ├── base.py                 # Engine + Session SQLAlchemy
│   └── seed.py                 # Datos de prueba
├── models/                     # ORM models (todos con soft delete)
│   ├── base.py                 # BaseModel: id, created_at, updated_at, deleted_at
│   ├── course.py
│   ├── course_rating.py        # rating 1-5, UNIQUE(course_id, user_id) WHERE deleted_at IS NULL
│   ├── teacher.py
│   ├── lesson.py
│   ├── class_.py
│   └── course_teacher.py       # Junction table M2M
├── schemas/                    # Pydantic v2 (validación request/response)
│   └── rating.py
├── services/
│   └── course_service.py       # Toda la lógica de negocio
└── alembic/versions/           # Migraciones de DB
```

### Modelo de datos

```
Course ←──(M2M via course_teachers)──→ Teacher
Course ──(1toM)──→ Lesson
Course ──(1toM)──→ CourseRating (user_id, rating 1-5, soft delete)
```

Todos los modelos tienen `deleted_at`; las queries filtran `WHERE deleted_at IS NULL`.

### API Endpoints

```
GET  /                                    # Bienvenida
GET  /health                              # Health check + DB connectivity
GET  /courses                             # Todos los cursos con rating stats
GET  /courses/{slug}                      # Detalle: profesores + lecciones + ratings
GET  /classes/{class_id}                  # Detalle de clase (video)

POST   /courses/{id}/ratings              # Crear/actualizar rating (upsert)
GET    /courses/{id}/ratings              # Todos los ratings del curso
GET    /courses/{id}/ratings/stats        # { average_rating, total_ratings, distribution }
GET    /courses/{id}/ratings/user/{uid}   # Rating de un usuario específico
PUT    /courses/{id}/ratings/{uid}        # Actualizar rating (falla si no existe)
DELETE /courses/{id}/ratings/{uid}        # Soft delete del rating
```

### Base de datos (Docker)

- **Usuario**: `platziflix_user`
- **Password**: `platziflix_password`
- **Database**: `platziflix_db`
- **Puerto**: `5432`

### Comandos Backend

> **IMPORTANTE**: Antes de ejecutar comandos del Backend, verifica que el contenedor Docker esté corriendo. Revisa el `Makefile` para los comandos disponibles y úsalos.

```bash
cd Backend
make start            # Iniciar Docker Compose (API + DB)
make stop             # Detener containers
make migrate          # Aplicar migraciones Alembic
make create-migration # Crear nueva migración
make seed             # Poblar datos de prueba
make seed-fresh       # Reset completo + seed
make logs             # Ver logs de todos los servicios
```

## Frontend

### Estructura interna

```
Frontend/src/
├── app/                            # Next.js App Router
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Home: grid de cursos (Server Component)
│   ├── course/[slug]/
│   │   ├── page.tsx                # Detalle del curso (SSR, cache: no-store)
│   │   ├── loading.tsx             # Skeleton
│   │   ├── error.tsx               # Error boundary
│   │   └── not-found.tsx
│   └── classes/[class_id]/
│       └── page.tsx                # Video player
├── components/
│   ├── Course/                     # Tarjeta con StarRating
│   ├── CourseDetail/               # Vista detallada
│   ├── StarRating/                 # SVG half-stars, readonly, accesible
│   └── VideoPlayer/                # Reproductor (plyr)
├── services/
│   └── ratingsApi.ts               # HTTP client con timeout 10s + AbortController
├── types/
│   ├── index.ts                    # Course, Class, CourseDetail
│   └── rating.ts                  # CourseRating, RatingStats, ApiError
└── styles/
    ├── reset.scss
    └── vars.scss                   # Design tokens
```

### Patrones Frontend

- **Server Components** para fetch inicial (sin JS overhead en cliente)
- `fetch` nativo con `AbortController` (timeout 10s por defecto)
- CSS Modules + SCSS, sin librerías de UI externas
- TypeScript strict

### Comandos Frontend

```bash
cd Frontend
yarn dev          # Servidor de desarrollo (localhost:3000)
yarn build        # Build de producción
yarn test         # Ejecutar tests con Vitest
yarn lint         # ESLint
```

## Mobile — Android

### Arquitectura: MVVM + MVI + Repository Pattern

```
Presentation
└── CourseListScreen (Composable)
    └── CourseListViewModel (StateFlow)
        └── CourseRepository (Interface)
            ├── RemoteCourseRepository → Retrofit2 → API
            └── MockCourseRepository  → datos de prueba

Domain: Course.kt (modelo puro, sin dependencias Android)
Data:   CourseDTO → CourseMapper → Course
DI:     Manual con `by lazy { }` en AppModule
```

- Eventos unidireccionales: `UiEvent` → ViewModel → `UiState`
- Coroutines con `viewModelScope.launch { }`

## Mobile — iOS

### Arquitectura: MVVM + Repository Protocol + Combine

```
Views (SwiftUI)
└── CourseListView
    └── CourseListViewModel (@MainActor, @Published)
        └── CourseRepositoryProtocol
            └── RemoteCourseRepository → URLSession async/await → API

Data: CourseDTO (Codable) → CourseMapper → Course
Services: APIEndpoint protocol + CourseAPIEndpoints enum
```

- `@Published` + Combine para reactividad en la UI
- `async/await` para networking
- Protocol de repositorio para testabilidad e inyección de dependencias

## Consideraciones de Desarrollo

1. **Docker obligatorio** para el backend — la DB y la API corren en contenedores
2. **TypeScript strict** en Frontend — no usar `any`
3. **Testing requerido** para nuevas funcionalidades en todos los proyectos
4. **Migraciones** para cualquier cambio de esquema de DB (nunca modificar directamente)
5. **Soft deletes** — nunca borrar registros físicamente, usar `deleted_at`
6. **API REST como única fuente de datos** — Frontend y Mobile no tienen lógica de negocio propia
7. **Naming conventions**:
   - Python: `snake_case`
   - JS/TS: `camelCase` (variables/funciones), `PascalCase` (componentes/tipos)
   - Kotlin/Swift: `camelCase` (variables), `PascalCase` (clases/structs)

## URLs del Sistema

- **Frontend Web**: http://localhost:3000
- **Backend API**: http://localhost:8001
- **API Docs (Swagger)**: http://localhost:8001/docs

# API del companheiro de programa (Alcohol, Azúcar, Ansiedad, Sueño)

Contrato de producto: `docs/PROGRAM_COMPANION_CONTRACT.md`. Este documento describe lo que el backend **realmente** hace.

- Código: `server/routes/program.js` (rutas), `server/services/program-companion.js` (motor), `server/content/companions/{alcohol,azucar,ansiedad,sueno}.js` (definiciones, textos, metas semanales, logros).
- Montaje: `/api/app/programs/:slug`, dentro del router de `server/routes/app.js`, **antes** de las rutas genéricas `/programs/:slug/activity` (que siguen funcionando). `:slug` ∈ `alcohol | azucar | ansiedad | sueno`. Cualquier otro slug (p. ej. `sem-fumo`) sale del router y cae en las rutas genéricas / 404.
- Sem Fumo no cambia: conserva `/onboarding`, `/dashboard`, `/smoking`, `/cravings`, `/checkins`, `/goals`, `/progress`.
- Autenticación: cookie de sesión. Todas las rutas exigen acceso **a ese programa** (suscripción activa o cortesía): sin sesión `401 AUTH_REQUIRED`; sin acceso a ese programa `402 SUBSCRIPTION_REQUIRED` (aunque el usuario tenga otro programa).
- Errores: `{ error, code, field? }`. Validación `422 INVALID` (con `field`), `404 NOT_FOUND`, `409 ONBOARDING_REQUIRED | HAS_ENTRIES`.
- Fechas: `day` = `YYYY-MM-DD` en la zona horaria del usuario (`req.user.timezone`); instantes en ISO 8601.

## Modelo de datos

| Qué | Dónde |
|---|---|
| Registro principal | `program_activity_entries` (`kind` = `consumo` alcohol, `habito` azúcar, `emocion` ansiedad, `sueno` sueño) |
| Momento difícil | `program_activity_entries` (`kind='urge'`, `value:{feeling,intensity,technique,note,outcome,afterIntensity}`) |
| Check-in del día | `program_activity_entries` (`kind='checkin'`, `value:{day}`; índice único por usuario+programa+día) |
| Objetivo (versionado) | `user_goals` (`strategy`, `start_date`, `exercise_per_week`, `settings:{target,start}`; `max_daily` = objetivo si es entero) |
| Plan (versionado) | `personalized_plans` + `plan_versions` (`data.program = slug`, estrategia, objetivo, estimaciones de base, herramientas) |
| Metas semanales | `daily_goals` (`program_slug`), 10 semanas por programa |
| Ánimo / respiración | `mood_entries` / `breathing_sessions` con `program_slug` |
| Logros | `achievements` (`program_slug`, slug con prefijo `alc-`, `azu-`, `ans-`, `sue-`) + `user_achievements` (PK usuario+logro: nunca se duplica) |

Migración: `supabase/migrations/20261022100000_program_companion.sql` (rollback en `supabase/rollback/`). Las lecturas y escrituras de registros van con el rol del usuario (RLS, políticas `*_own`); los logros se conceden con el rol de servicio.

## Conceptos

- **Métrica diaria** (`metric`): cómo se agrega el registro principal de un día.

| Programa | Valor del día | Agregación | Dirección | Unidad | `weekMeta.format` |
|---|---|---|---|---|---|
| alcohol | bebidas estándar | suma | `max` (≤ objetivo) | `bebidas` | `decimal1` |
| azucar | porciones dulces | suma | `max` | `porciones` | `decimal1` |
| ansiedad | nivel 0-10 | media del día | `max` | `de 10` | `decimal1` |
| sueno | horas dormidas (acostarse→despertar) | última noche del día | `min` (≥ objetivo − 0,5 h) | `horas` | `hours` (p. ej. 7.5 → «7 h 30 min») |

- **`status` de un día**: `none` (sin registro), `ok` (dentro del objetivo) o `warn` (fuera). Un check-in sin valor cuenta como `ok` (alcohol/azúcar/ansiedad) salvo en sueño, donde queda `none` (no sabemos cuántas horas fueron).
- **Objetivo (`target`)**: depende de la estrategia. `alcohol.pausa` y `azucar.sin-anadido` = 0 fijo; `reducir` baja de `start` a `target` en 6 semanas (pasos de 0,5, redondeando hacia arriba); el resto es constante. El objetivo vigente se aplica a todo el historial (igual que Sem Fumo).
- **Racha (`streak`)**: días consecutivos con `status='ok'` desde `startDate`; hoy sin registrar todavía no corta la racha; un día sin datos la corta (no se asume nada). `label` se pinta tal cual («días seguidos sin beber», «noches seguidas dentro de tu objetivo»…).
- **Estimaciones**: toda tarjeta con `estimate: true` es una estimación a partir del cuestionario del programa (extremo inferior de cada tramo, solo en días registrados) y su `sub` lo explica; el front debe rotularla «Estimación». Sin cuestionario no se muestran estimaciones de ahorro/evitado. Nada se inventa.
- **Totales del panel**: desde `startDate`. **Totales de `/progress`**: el rango pedido.
- Los registros hechos antes de `startDate` aparecen en el gráfico y en `/progress`, pero no en los totales del panel ni en la racha.

## Rutas

### `GET /setup`
```json
{ "program": "alcohol", "completed": false, "planReady": false,
  "strategies": [{ "id": "pausa", "name": "Pausa", "description": "…", "fixedTarget": 0, "defaultTarget": null, "usesStart": false }],
  "goal": null,
  "notifications": { "enabled": false, "time": "20:00" },
  "form": { "intro": "…", "fields": [
    { "id": "strategy", "type": "select", "required": true, "options": [{ "id": "pausa", "label": "Pausa", "help": "…" }] },
    { "id": "startDate", "type": "date", "default": "2026-10-20", "min": "2026-09-20", "max": "2026-12-19" },
    { "id": "target", "type": "number", "unit": "bebidas", "min": 0, "max": 20, "step": 0.5, "default": 2, "hideFor": ["pausa"] },
    { "id": "start", "type": "number", "min": 1, "max": 30, "step": 0.5, "default": 4, "showFor": ["reducir"] },
    { "id": "exercisePerWeek", "type": "number", "min": 0, "max": 21, "default": 3 },
    { "id": "notifications", "type": "reminder", "default": { "enabled": false, "time": "20:00" } } ] },
  "suggestions": { "start": null }, "today": "2026-10-20" }
```
`completed`/`planReady` = hay objetivo vigente válido para el programa. `suggestions.start` sale del cuestionario si existe.

### `PUT /setup`
Body `{ strategy, startDate, target?, start?, exercisePerWeek?, notifications:{enabled,time} }`. `startDate` entre hoy−30 y hoy+60. `target` se ignora si la estrategia lo fija. Crea objetivo (cierra el anterior), versión de plan, las metas semanales (10), preferencias de notificación del programa y marca `profiles.onboarded_at`. **Idempotente**: el mismo cuerpo no crea versiones ni duplica metas. Devuelve lo mismo que `GET /setup`.

### `GET /dashboard`
`409 ONBOARDING_REQUIRED` si falta la configuración (ir a `/configuracion?p=<slug>`). Si no, ver ejemplos reales abajo. Campos:

`program{slug,name,tagline,color,icon,theme}`, `user{name}`, `today`, `dayNumber`, `startDate`, `strategy{id,name,description}`, `goal{strategy,startDate,target,start,exercisePerWeek}`,
`todayStatus{value,unit,label,target,direction,status,checkedIn,urges,urgesResolved,mood,entries[{id,at,value,summary}]}`, `week[7]{day,value,target,status}`, `weekMeta{label,unit,format,direction}`,
`totals{cards[{id,label,value,unit,sub,estimate}],periodLabel}`, `streak{current,best,label}`, `journey{nextLesson,currentChapter,totals}` (igual que Sem Fumo), `recommendedExercise` (slug de `breathing_exercises`), `exercises{thisWeek,goal}`,
`weekNumber`, `tasks[{id,week,title,detail,done}]` (todas las semanas; la actual es `weekNumber`), `logForm{label,cta,kind,fields}`, `urgeForm{cta,title,body,intensity{min,max,label},feelings,techniques[{id,label,detail,exerciseId?}],afterLabel,resolvedLabel,continuedLabel,supportText,crisis?}`,
`checkinLabel`, `achievements{unlocked,total,recent[{slug,title,icon}]}`, `subscription{status,provider,currentPeriodEnd,cancelAtPeriodEnd}`, `safety{text,resources[{label,detail,tel?}]}`, `ui{tagline,emptyToday,logSuccess}`, `currency`, `locale`.

`logForm.fields[]`: `{id,label,type,options?,min?,max?,step?,integer?,required?,help?,unit?,maxLength?,placeholder?}` con `type` ∈ `number | select | multi | scale | time | text`. El front genera el formulario de aquí. Los `techniques[].exerciseId` apuntan a `/respirar` (`calma-4-6`, `caja-4-4`, `sueno-4-7-8`).

### Registro principal
- `POST /log` `{ value:{…campos de logForm…}, at? }` → `201 { entry:{id,at,value,summary}, achievements:[{slug,title,description,icon}] }`. Valida tipos, rangos, opciones y longitud; **rechaza campos desconocidos** y campos obligatorios ausentes (`422` con `field`). `at` no puede ser futuro (margen 5 min) ni de hace más de 400 días. Máx. 100 registros por día. Sueño: además valida que acostarse→despertar dé entre 1 y 16 h. Un registro que contradice el check-in del día (p. ej. bebidas > 0 tras «Hoy no bebí») retira ese check-in.
- `GET /log?from&to&limit` (días locales; por defecto últimos 30 días, `limit` 1-200, 50) → `{ entries:[…] }` más recientes primero.
- `PATCH /log/:id` `{ value, at? }` (reemplaza el valor, mismo validador) → `{ entry, achievements }`. `DELETE /log/:id` → `{ ok:true }`. Otro usuario u otro programa: `404`.

### Momento difícil
- `POST /urge` `{ feeling, intensity, technique?, note? }` (`feeling` ∈ `urgeForm.feelings[].id`; `intensity` dentro de `urgeForm.intensity`) → `201 { urge:{id,at,feeling,feelingLabel,intensity,technique,note,outcome:null,afterIntensity:null}, achievements }`.
- `PATCH /urge/:id` `{ outcome:'resolved'|'continued', afterIntensity?, technique? }` → `{ urge, achievements }`.
- `GET /urge?from&to` → `{ urges:[…] }`.

### Check-in del día
- `POST /checkin` `{ day? }` → `201 { ok, day, already:false, achievements }`; si ya existía `200 { already:true }`. `409 HAS_ENTRIES` si ese día ya tiene registros incompatibles (alcohol: bebidas > 0; azúcar/ansiedad: día fuera de objetivo; sueño: noche ya registrada).
- `DELETE /checkin/:day` → `{ ok:true }`.
- Etiquetas: alcohol «Hoy no bebí», azúcar «Hoy cuidé mi equilibrio», ansiedad «Hoy fue un día de calma», sueño «Noche registrada sin detalles».

### `GET /progress?range=7|30|90|365`
`range` (o `days`) fuera de la lista → `422`. Respuesta: `range{days,from,to}`, `program`, `metric{id,label,unit,format,direction}`, `series[{day,value,target,status,urges,urgesResolved,checkedIn,mood}]` (un elemento por día, `value:null` sin datos), `totals{cards,period,trackedDays,okDays,urges,urgesResolved,breathing}`, `streak`, `byWeekday[{weekday(1=lunes…7),label,average,days}]`, `topTriggers[{id,label,count}]`, `timeline[{type:'log'|'urge'|'checkin'|'breathing',at,day,title,detail?}]`, `insights[{text}]`, `goalHistory`, `journey{totals,chapters}`.
`insights` son frases derivadas de los datos (comparación con la semana anterior, día de la semana con más carga, gatillo más frecuente, técnicas que más bajan el nivel, regularidad del sueño…); solo aparecen con datos suficientes y sin diagnóstico.

### Objetivos y metas
- `GET /goals` → `{ goal, current, history[], strategies, form, tasks[] }` (`409 ONBOARDING_REQUIRED` si no hay setup).
- `PUT /goals` `{ strategy?, target?, start?, exercisePerWeek?, startDate? }` (parcial; lo no enviado se conserva) → `{ goal, current, changed }`. Nueva versión de objetivo y de plan; el historial queda en `history`.
- `PATCH /tasks/:id` `{ done:boolean }` → `{ ok, id, done, achievements }`.

### `GET /achievements`
`{ achievements:[{slug,title,description,icon,unlocked,unlockedAt}] }` (10 por programa). Concede lo pendiente antes de responder. Iconos usados: `sprout book leaf pen calendar wave wind sun mountain` (los mismos que Sem Fumo).

## Rutas transversales con `?program=`
- `GET/PUT /api/app/mood[/:day]?program=<slug>`: ánimo del programa (uno por usuario, programa y día). Sin `program` = Sem Fumo, sin cambios. Programa desconocido `404`, sin acceso `402`.
- `GET /api/app/breathing?program=` (sesiones recientes del programa) y `POST /api/app/breathing/sessions?program=` (o `program` en el body) etiquetan `program_slug`. Nuevo ejercicio `sueno-4-7-8`.
- `GET/PUT /api/app/notifications?program=` ya funcionaban por programa. `PUT /setup` crea la fila del programa.
- `GET /api/app/achievements` (sin `program`) devuelve **solo** los 9 de Sem Fumo; `?program=<slug>` filtra por programa.

## Ejemplos reales
Generados contra el Supabase local con 14 días de datos de prueba (usuario con los 4 programas, `startDate` hace 13 días). Para abreviar se recortaron: `tasks` (2 de 10), `logForm.fields` y `urgeForm.feelings/techniques` (2), `todayStatus.entries` (1), `safety.resources` (2), `series` de progress (últimos 4 días de 7), `timeline` (3), `journey.nextLesson` (campos clave) y se omitió `ui`.

### Alcohol (`alcohol`)

`GET /api/app/programs/alcohol/dashboard`

```json
{
  "program": {
    "slug": "alcohol",
    "name": "Alcohol",
    "tagline": "Construye una relación más consciente.",
    "color": "#9B8CFF",
    "icon": "/assets/brand/alento-icone-alcool.svg",
    "theme": "light"
  },
  "user": {
    "name": "Ana"
  },
  "today": "2026-10-20",
  "dayNumber": 14,
  "startDate": "2026-10-07",
  "strategy": {
    "id": "reducir",
    "name": "Reducir poco a poco",
    "description": "Bajas la cantidad de forma gradual, semana a semana, hasta el máximo que elijas. Es un camino con menos sobresaltos."
  },
  "goal": {
    "strategy": "reducir",
    "startDate": "2026-10-07",
    "target": 1,
    "start": 4,
    "exercisePerWeek": 3
  },
  "todayStatus": {
    "value": null,
    "unit": "bebidas",
    "label": "Bebidas de hoy",
    "target": 3.5,
    "direction": "max",
    "status": "none",
    "checkedIn": false,
    "urges": 1,
    "urgesResolved": 1,
    "mood": null,
    "entries": []
  },
  "week": [
    {
      "day": "2026-10-14",
      "value": 3,
      "target": 3.5,
      "status": "ok"
    },
    {
      "day": "2026-10-15",
      "value": 1,
      "target": 3.5,
      "status": "ok"
    },
    {
      "day": "2026-10-16",
      "value": 0,
      "target": 3.5,
      "status": "ok"
    },
    {
      "day": "2026-10-17",
      "value": 1.5,
      "target": 3.5,
      "status": "ok"
    },
    {
      "day": "2026-10-18",
      "value": 3,
      "target": 3.5,
      "status": "ok"
    },
    {
      "day": "2026-10-19",
      "value": 1,
      "target": 3.5,
      "status": "ok"
    },
    {
      "day": "2026-10-20",
      "value": null,
      "target": 3.5,
      "status": "none"
    }
  ],
  "weekMeta": {
    "label": "Bebidas por día",
    "unit": "bebidas",
    "format": "decimal1",
    "direction": "max"
  },
  "totals": {
    "cards": [
      {
        "id": "dias-sin-beber",
        "label": "Días sin beber",
        "value": 1,
        "unit": "días",
        "sub": "de 11 días registrados",
        "estimate": false
      },
      {
        "id": "bebidas-periodo",
        "label": "Bebidas registradas",
        "value": 17.5,
        "unit": "bebidas",
        "sub": "desde que empezaste",
        "estimate": false
      },
      {
        "id": "momentos-superados",
        "label": "Momentos difíciles superados",
        "value": 1,
        "unit": "",
        "sub": "de 1 registrados",
        "estimate": false
      }
    ],
    "periodLabel": "desde que empezaste"
  },
  "streak": {
    "current": 7,
    "best": 7,
    "label": "días seguidos dentro de tu objetivo"
  },
  "journey": {
    "nextLesson": {
      "slug": "alc-bienvenida",
      "title": "Bienvenida a Alento",
      "status": "available"
    },
    "currentChapter": {
      "slug": "tu-punto-de-partida",
      "number": 0,
      "title": "Tu punto de partida",
      "completedLessons": 0,
      "totalLessons": 3
    },
    "totals": {
      "lessons": 30,
      "completed": 0
    }
  },
  "recommendedExercise": "calma-4-6",
  "exercises": {
    "thisWeek": 0,
    "goal": 3
  },
  "weekNumber": 2,
  "tasks": [
    {
      "id": "dde2c2e6-6088-46ca-b91f-e6864c38a0b2",
      "week": 1,
      "title": "Observa sin juzgar",
      "detail": "Anota cada bebida de la semana: cuánto, con quién y por qué. Solo mirar; todavía no hace falta cambiar nada.",
      "done": true
    },
    {
      "id": "c02614f2-340a-4645-ab86-63f776feff60",
      "week": 2,
      "title": "Conoce tu medida",
      "detail": "Aprende qué es una bebida estándar y mide cuánto sirves en casa. Muchos vasos y copas son más grandes de lo que parecen.",
      "done": false
    }
  ],
  "logForm": {
    "label": "Registrar una bebida",
    "cta": "Registrar bebida",
    "kind": "consumo",
    "fields": [
      {
        "id": "bebidas",
        "label": "Bebidas estándar",
        "type": "number",
        "min": 0.5,
        "max": 30,
        "step": 0.5,
        "required": true,
        "unit": "bebidas",
        "help": "Una bebida estándar es una caña o lata de cerveza, una copa de vino o un chupito. Los servidos en casa suelen ser más grandes: cuenta lo que sirves de verdad."
      },
      {
        "id": "contexto",
        "label": "¿Con quién o dónde?",
        "type": "select",
        "options": [
          {
            "id": "solo",
            "label": "A solas en casa"
          },
          {
            "id": "pareja-familia",
            "label": "Con pareja o familia"
          },
          {
            "id": "amigos",
            "label": "Con amigos"
          },
          {
            "id": "trabajo",
            "label": "Evento de trabajo"
          },
          {
            "id": "bar",
            "label": "Bar o restaurante"
          },
          {
            "id": "fiesta",
            "label": "Fiesta o celebración"
          }
        ]
      }
    ]
  },
  "urgeForm": {
    "cta": "Tengo ganas de beber",
    "title": "Un momento difícil",
    "body": "Las ganas suben, llegan a un pico y después bajan, aunque ahora no lo parezca. No tienes que decidir nada todavía: solo atravesar este rato. Elige qué sientes y una cosa que puedas probar ahora mismo.",
    "intensity": {
      "min": 1,
      "max": 5,
      "label": "¿Qué tan fuertes son las ganas?"
    },
    "feelings": [
      {
        "id": "estres",
        "label": "Estrés o agobio"
      },
      {
        "id": "desconexion",
        "label": "Desconectar tras el trabajo"
      }
    ],
    "techniques": [
      {
        "id": "respiracion",
        "label": "Respirar con calma",
        "detail": "Dos minutos de respiración lenta, con la exhalación más larga que la inhalación.",
        "exerciseId": "calma-4-6"
      },
      {
        "id": "agua",
        "label": "Beber agua y esperar 10 minutos",
        "detail": "Sirve un vaso de agua, tómalo despacio y deja pasar diez minutos antes de decidir."
      }
    ],
    "afterLabel": "¿Cómo están las ganas ahora?",
    "resolvedLabel": "Pasaron o bajaron",
    "continuedLabel": "Siguen ahí",
    "supportText": "Que las ganas sigan no es un fracaso. Pide apoyo si lo necesitas: cada vez que las atraviesas aprendes algo."
  },
  "checkinLabel": "Hoy no bebí",
  "achievements": {
    "unlocked": 6,
    "total": 10,
    "recent": [
      {
        "slug": "alc-ganas-superadas",
        "title": "Ganas atravesadas",
        "icon": "wave"
      },
      {
        "slug": "alc-primer-dia-sin-beber",
        "title": "Un día sin beber",
        "icon": "sun"
      },
      {
        "slug": "alc-racha-7",
        "title": "Una semana dentro del objetivo",
        "icon": "calendar"
      }
    ]
  },
  "subscription": {
    "status": "active",
    "provider": "courtesy",
    "currentPeriodEnd": null,
    "cancelAtPeriodEnd": false
  },
  "safety": {
    "text": "Alento es un programa educativo y de apoyo: no sustituye a un profesional ni diagnostica. Si bebes a diario o has notado temblores, sudoración o malestar al pasar horas sin beber, no pares de golpe: consulta antes con un profesional de salud. Si crees que tu vida o la de otra persona corre peligro, pide ayuda urgente.",
    "resources": [
      {
        "label": "Emergencias",
        "detail": "112 (España y Unión Europea). Si tu vida o la de otra persona está en peligro, llama ahora.",
        "tel": "112"
      },
      {
        "label": "Tu médico o centro de salud",
        "detail": "Pueden orientarte y derivarte a un servicio especializado en alcohol. Fuera de España, contacta con los servicios de emergencia o de salud de tu país."
      }
    ]
  },
  "currency": "USD",
  "locale": "es-US"
}
```

`GET /api/app/programs/alcohol/progress?range=7`

```json
{
  "range": {
    "days": 7,
    "from": "2026-10-14",
    "to": "2026-10-20"
  },
  "program": "alcohol",
  "metric": {
    "id": "bebidas",
    "label": "Bebidas por día",
    "unit": "bebidas",
    "format": "decimal1",
    "direction": "max"
  },
  "series": [
    {
      "day": "2026-10-17",
      "value": 1.5,
      "target": 3.5,
      "status": "ok",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-18",
      "value": 3,
      "target": 3.5,
      "status": "ok",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-19",
      "value": 1,
      "target": 3.5,
      "status": "ok",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-20",
      "value": null,
      "target": 3.5,
      "status": "none",
      "urges": 1,
      "urgesResolved": 1,
      "checkedIn": false,
      "mood": null
    }
  ],
  "totals": {
    "cards": [
      {
        "id": "dias-sin-beber",
        "label": "Días sin beber",
        "value": 1,
        "unit": "días",
        "sub": "de 6 días registrados",
        "estimate": false
      },
      {
        "id": "bebidas-periodo",
        "label": "Bebidas registradas",
        "value": 9.5,
        "unit": "bebidas",
        "sub": "últimos 7 días",
        "estimate": false
      },
      {
        "id": "momentos-superados",
        "label": "Momentos difíciles superados",
        "value": 1,
        "unit": "",
        "sub": "de 1 registrados",
        "estimate": false
      }
    ],
    "period": {
      "from": "2026-10-14",
      "to": "2026-10-20",
      "days": 7
    },
    "trackedDays": 6,
    "okDays": 6,
    "urges": 1,
    "urgesResolved": 1,
    "breathing": 0
  },
  "streak": {
    "current": 7,
    "best": 7,
    "label": "días seguidos dentro de tu objetivo"
  },
  "byWeekday": [
    {
      "weekday": 1,
      "label": "Lun",
      "average": 1,
      "days": 1
    },
    {
      "weekday": 2,
      "label": "Mar",
      "average": null,
      "days": 0
    },
    {
      "weekday": 3,
      "label": "Mié",
      "average": 3,
      "days": 1
    },
    {
      "weekday": 4,
      "label": "Jue",
      "average": 1,
      "days": 1
    },
    {
      "weekday": 5,
      "label": "Vie",
      "average": 0,
      "days": 1
    },
    {
      "weekday": 6,
      "label": "Sáb",
      "average": 1.5,
      "days": 1
    },
    {
      "weekday": 7,
      "label": "Dom",
      "average": 3,
      "days": 1
    }
  ],
  "topTriggers": [
    {
      "id": "social",
      "label": "Presión o ambiente social",
      "count": 2
    },
    {
      "id": "desconexion",
      "label": "Desconectar tras el trabajo",
      "count": 2
    },
    {
      "id": "estres",
      "label": "Estrés o agobio",
      "count": 2
    }
  ],
  "timeline": [
    {
      "type": "urge",
      "at": "2026-10-20T20:13:17.120Z",
      "day": "2026-10-20",
      "id": "90790980-0da4-4f55-96ab-044154f210a5",
      "title": "Tengo ganas de beber: Estrés o agobio",
      "detail": "Pasaron o bajaron"
    },
    {
      "type": "log",
      "at": "2026-10-19T12:00:00.000Z",
      "day": "2026-10-19",
      "title": "1 bebida · a solas en casa · ganas 3/5",
      "id": "a06b5cc6-052e-4e28-bb5b-a515d4c0b6ef"
    },
    {
      "type": "log",
      "at": "2026-10-18T12:00:00.000Z",
      "day": "2026-10-18",
      "title": "3 bebidas · con pareja o familia · ganas 4/5",
      "id": "9f07793e-9150-42dc-a189-89a23fc83553"
    }
  ],
  "insights": [
    {
      "text": "Pasaste por 1 momento difícil y en 1 saliste adelante con una técnica. Cada vez es más fácil reconocerlos."
    },
    {
      "text": "Tu racha actual es de 7 días seguidos dentro de tu objetivo."
    }
  ],
  "currency": "USD",
  "locale": "es-US",
  "goalHistory": [
    {
      "strategy": "reducir",
      "startDate": "2026-10-07",
      "target": 1,
      "start": 4,
      "createdAt": "2026-10-20T20:13:16.982Z",
      "supersededAt": null
    }
  ],
  "journey": {
    "totals": {
      "lessons": 30,
      "completed": 0
    },
    "chapters": [
      {
        "number": 0,
        "title": "Tu punto de partida",
        "status": "available",
        "completedLessons": 0,
        "totalLessons": 3
      },
      {
        "number": 1,
        "title": "Comprender tu relación con el alcohol",
        "status": "locked",
        "completedLessons": 0,
        "totalLessons": 3
      }
    ]
  }
}
```

### Azúcar (`azucar`)

`GET /api/app/programs/azucar/dashboard`

```json
{
  "program": {
    "slug": "azucar",
    "name": "Azúcar",
    "tagline": "Encuentra equilibrio en tus hábitos.",
    "color": "#FF7A59",
    "icon": "/assets/brand/alento-icone-acucar.svg",
    "theme": "light"
  },
  "user": {
    "name": "Ana"
  },
  "today": "2026-10-20",
  "dayNumber": 14,
  "startDate": "2026-10-07",
  "strategy": {
    "id": "equilibrio",
    "name": "Equilibrio sin culpa",
    "description": "Te marcas un máximo razonable de porciones dulces al día. Nada está prohibido: se trata de elegir con atención."
  },
  "goal": {
    "strategy": "equilibrio",
    "startDate": "2026-10-07",
    "target": 3,
    "start": null,
    "exercisePerWeek": 3
  },
  "todayStatus": {
    "value": 3,
    "unit": "porciones",
    "label": "Porciones dulces de hoy",
    "target": 3,
    "direction": "max",
    "status": "ok",
    "checkedIn": false,
    "urges": 1,
    "urgesResolved": 1,
    "mood": null,
    "entries": [
      {
        "id": "a4ede80a-4310-41ad-a228-ddf555039cce",
        "at": "2026-10-20T20:13:17.322Z",
        "value": {
          "hora": "15:30",
          "tipo": "cafe",
          "hambre": 1,
          "gatillo": "bajon",
          "porciones": 3
        },
        "summary": "3 porciones · azúcar en café, té o infusión · 15:30"
      }
    ]
  },
  "week": [
    {
      "day": "2026-10-14",
      "value": 4,
      "target": 3,
      "status": "warn"
    },
    {
      "day": "2026-10-15",
      "value": 2,
      "target": 3,
      "status": "ok"
    },
    {
      "day": "2026-10-16",
      "value": 3,
      "target": 3,
      "status": "ok"
    },
    {
      "day": "2026-10-17",
      "value": 5,
      "target": 3,
      "status": "warn"
    },
    {
      "day": "2026-10-18",
      "value": 4,
      "target": 3,
      "status": "warn"
    },
    {
      "day": "2026-10-19",
      "value": 2,
      "target": 3,
      "status": "ok"
    },
    {
      "day": "2026-10-20",
      "value": 3,
      "target": 3,
      "status": "ok"
    }
  ],
  "weekMeta": {
    "label": "Porciones dulces por día",
    "unit": "porciones",
    "format": "decimal1",
    "direction": "max"
  },
  "totals": {
    "cards": [
      {
        "id": "dias-objetivo",
        "label": "Días dentro de tu objetivo",
        "value": 8,
        "unit": "días",
        "sub": "de 14 días registrados",
        "estimate": false
      },
      {
        "id": "porciones-periodo",
        "label": "Porciones registradas",
        "value": 47,
        "unit": "porciones",
        "sub": "desde que empezaste",
        "estimate": false
      },
      {
        "id": "antojos-superados",
        "label": "Antojos atravesados",
        "value": 1,
        "unit": "",
        "sub": "de 1 registrados",
        "estimate": false
      }
    ],
    "periodLabel": "desde que empezaste"
  },
  "streak": {
    "current": 2,
    "best": 2,
    "label": "días seguidos dentro de tu objetivo"
  },
  "journey": {
    "nextLesson": {
      "slug": "azu-bienvenida",
      "title": "Bienvenida a Alento",
      "status": "available"
    },
    "currentChapter": {
      "slug": "empezar-con-equilibrio",
      "number": 0,
      "title": "Empezar con equilibrio",
      "completedLessons": 0,
      "totalLessons": 3
    },
    "totals": {
      "lessons": 30,
      "completed": 0
    }
  },
  "recommendedExercise": "calma-4-6",
  "exercises": {
    "thisWeek": 0,
    "goal": 3
  },
  "weekNumber": 2,
  "tasks": [
    {
      "id": "03c261ea-a52c-4f4e-bedc-2da3e177affb",
      "week": 1,
      "title": "Observa tus dulces",
      "detail": "Registra cada vez que tomes algo dulce, sin cambiar nada todavía. Anota la hora y qué sentías.",
      "done": true
    },
    {
      "id": "c948c145-dcb6-43e4-830c-26c1ad70ad67",
      "week": 2,
      "title": "Aprende a leer etiquetas",
      "detail": "Mira la lista de ingredientes de tres productos que sueles comprar. El azúcar aparece con muchos nombres: jarabe, glucosa, dextrosa, miel…",
      "done": false
    }
  ],
  "logForm": {
    "label": "Registrar algo dulce",
    "cta": "Registrar algo dulce",
    "kind": "habito",
    "fields": [
      {
        "id": "porciones",
        "label": "Porciones dulces",
        "type": "number",
        "min": 0.5,
        "max": 20,
        "step": 0.5,
        "required": true,
        "unit": "porciones",
        "help": "Una porción es una unidad razonable: un café con azúcar, una galleta, un trozo de tarta, un refresco pequeño. No hace falta pesar nada ni contar calorías."
      },
      {
        "id": "tipo",
        "label": "¿Qué fue?",
        "type": "select",
        "options": [
          {
            "id": "bolleria",
            "label": "Dulces, galletas o bollería"
          },
          {
            "id": "refrescos",
            "label": "Refresco, zumo envasado o bebida energética"
          },
          {
            "id": "chocolate",
            "label": "Chocolate o golosinas"
          },
          {
            "id": "postre",
            "label": "Postre"
          },
          {
            "id": "cafe",
            "label": "Azúcar en café, té o infusión"
          },
          {
            "id": "otro",
            "label": "Otro"
          }
        ]
      }
    ]
  },
  "urgeForm": {
    "cta": "Tengo antojo de dulce",
    "title": "Un antojo, sin drama",
    "body": "Los antojos suben y bajan. No son un fallo tuyo ni te obligan a nada. Elige qué te pasa y prueba una cosa pequeña antes de decidir.",
    "intensity": {
      "min": 1,
      "max": 5,
      "label": "¿Qué tan fuerte es el antojo?"
    },
    "feelings": [
      {
        "id": "bajon",
        "label": "Bajón de energía"
      },
      {
        "id": "estres",
        "label": "Estrés o agobio"
      }
    ],
    "techniques": [
      {
        "id": "agua",
        "label": "Agua y esperar 10 minutos",
        "detail": "Bebe un vaso de agua despacio y deja pasar diez minutos. A veces es sed o cansancio."
      },
      {
        "id": "hambre",
        "label": "Preguntarte por el hambre",
        "detail": "¿Tienes hambre de estómago? Si es así, come algo con proteína o fibra, y si no, busca qué necesitas de verdad."
      }
    ],
    "afterLabel": "¿Cómo está el antojo ahora?",
    "resolvedLabel": "Bajó o pasó",
    "continuedLabel": "Sigue ahí",
    "supportText": "Tomarlo también es válido. Lo que cuenta es que lo hayas notado y elegido."
  },
  "checkinLabel": "Hoy cuidé mi equilibrio",
  "achievements": {
    "unlocked": 5,
    "total": 10,
    "recent": [
      {
        "slug": "azu-antojo-atravesado",
        "title": "Antojo atravesado",
        "icon": "wave"
      },
      {
        "slug": "azu-semana-seguimiento",
        "title": "Una semana de seguimiento",
        "icon": "calendar"
      },
      {
        "slug": "azu-primer-registro",
        "title": "Primer registro",
        "icon": "pen"
      }
    ]
  },
  "subscription": {
    "status": "active",
    "provider": "courtesy",
    "currentPeriodEnd": null,
    "cancelAtPeriodEnd": false
  },
  "safety": {
    "text": "Alento es un programa educativo: no es una dieta, no cuenta calorías ni sustituye a un profesional. Si tienes diabetes u otra condición de salud, o notas que comes de forma descontrolada, con mucha culpa o atracones frecuentes, habla con un profesional de salud o de nutrición.",
    "resources": [
      {
        "label": "Tu médico o centro de salud",
        "detail": "Pueden orientarte y derivarte a un profesional de nutrición o salud mental si lo necesitas."
      },
      {
        "label": "Emergencias",
        "detail": "112 (España y Unión Europea). Si tu vida o la de otra persona está en peligro, llama ahora.",
        "tel": "112"
      }
    ]
  },
  "currency": "USD",
  "locale": "es-US"
}
```

`GET /api/app/programs/azucar/progress?range=7`

```json
{
  "range": {
    "days": 7,
    "from": "2026-10-14",
    "to": "2026-10-20"
  },
  "program": "azucar",
  "metric": {
    "id": "porciones",
    "label": "Porciones dulces por día",
    "unit": "porciones",
    "format": "decimal1",
    "direction": "max"
  },
  "series": [
    {
      "day": "2026-10-17",
      "value": 5,
      "target": 3,
      "status": "warn",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-18",
      "value": 4,
      "target": 3,
      "status": "warn",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-19",
      "value": 2,
      "target": 3,
      "status": "ok",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-20",
      "value": 3,
      "target": 3,
      "status": "ok",
      "urges": 1,
      "urgesResolved": 1,
      "checkedIn": false,
      "mood": null
    }
  ],
  "totals": {
    "cards": [
      {
        "id": "dias-objetivo",
        "label": "Días dentro de tu objetivo",
        "value": 4,
        "unit": "días",
        "sub": "de 7 días registrados",
        "estimate": false
      },
      {
        "id": "porciones-periodo",
        "label": "Porciones registradas",
        "value": 23,
        "unit": "porciones",
        "sub": "últimos 7 días",
        "estimate": false
      },
      {
        "id": "antojos-superados",
        "label": "Antojos atravesados",
        "value": 1,
        "unit": "",
        "sub": "de 1 registrados",
        "estimate": false
      }
    ],
    "period": {
      "from": "2026-10-14",
      "to": "2026-10-20",
      "days": 7
    },
    "trackedDays": 7,
    "okDays": 4,
    "urges": 1,
    "urgesResolved": 1,
    "breathing": 0
  },
  "streak": {
    "current": 2,
    "best": 2,
    "label": "días seguidos dentro de tu objetivo"
  },
  "byWeekday": [
    {
      "weekday": 1,
      "label": "Lun",
      "average": 2,
      "days": 1
    },
    {
      "weekday": 2,
      "label": "Mar",
      "average": 3,
      "days": 1
    },
    {
      "weekday": 3,
      "label": "Mié",
      "average": 4,
      "days": 1
    },
    {
      "weekday": 4,
      "label": "Jue",
      "average": 2,
      "days": 1
    },
    {
      "weekday": 5,
      "label": "Vie",
      "average": 3,
      "days": 1
    },
    {
      "weekday": 6,
      "label": "Sáb",
      "average": 5,
      "days": 1
    },
    {
      "weekday": 7,
      "label": "Dom",
      "average": 4,
      "days": 1
    }
  ],
  "topTriggers": [
    {
      "id": "bajon",
      "label": "Bajón de energía",
      "count": 4
    },
    {
      "id": "recompensa",
      "label": "Como premio",
      "count": 2
    },
    {
      "id": "estres",
      "label": "Estrés o agobio",
      "count": 2
    }
  ],
  "timeline": [
    {
      "type": "urge",
      "at": "2026-10-20T20:13:17.331Z",
      "day": "2026-10-20",
      "id": "aa2e3e82-9a37-4a5c-8f8a-544a6660d553",
      "title": "Tengo antojo de dulce: Bajón de energía",
      "detail": "Bajó o pasó"
    },
    {
      "type": "log",
      "at": "2026-10-20T20:13:17.322Z",
      "day": "2026-10-20",
      "title": "3 porciones · azúcar en café, té o infusión · 15:30",
      "id": "a4ede80a-4310-41ad-a228-ddf555039cce"
    },
    {
      "type": "log",
      "at": "2026-10-19T12:00:00.000Z",
      "day": "2026-10-19",
      "title": "2 porciones · dulces, galletas o bollería · 16:30",
      "id": "ad67a3ab-ca8f-4056-b925-af51f3eaf914"
    }
  ],
  "insights": [
    {
      "text": "Tu promedio de los últimos 7 días fue de 3,3 porciones por día registrado, frente a 3,4 la semana anterior: vas en la dirección que buscas."
    },
    {
      "text": "Lo que más aparece en tus registros es «Bajón de energía» (4 veces). Conocerlo te ayuda a preparar una alternativa."
    },
    {
      "text": "Pasaste por 1 momento difícil y en 1 saliste adelante con una técnica. Cada vez es más fácil reconocerlos."
    },
    {
      "text": "Tu racha actual es de 2 días seguidos dentro de tu objetivo."
    },
    {
      "text": "Sueles tomar dulce a mediodía y por la tarde (4 registros). Es un buen momento para preparar una alternativa."
    },
    {
      "text": "En 4 de 7 registros tenías poca hambre física: muchas veces el dulce busca otra cosa (descanso, premio, consuelo)."
    }
  ],
  "currency": "USD",
  "locale": "es-US",
  "goalHistory": [
    {
      "strategy": "equilibrio",
      "startDate": "2026-10-07",
      "target": 3,
      "start": null,
      "createdAt": "2026-10-20T20:13:17.183Z",
      "supersededAt": null
    }
  ],
  "journey": {
    "totals": {
      "lessons": 30,
      "completed": 0
    },
    "chapters": [
      {
        "number": 0,
        "title": "Empezar con equilibrio",
        "status": "available",
        "completedLessons": 0,
        "totalLessons": 3
      },
      {
        "number": 1,
        "title": "Comprender tus hábitos",
        "status": "locked",
        "completedLessons": 0,
        "totalLessons": 3
      }
    ]
  }
}
```

### Ansiedad (`ansiedad`)

`GET /api/app/programs/ansiedad/dashboard`

```json
{
  "program": {
    "slug": "ansiedad",
    "name": "Ansiedad",
    "tagline": "Un espacio para recuperar la calma.",
    "color": "#FFC857",
    "icon": "/assets/brand/alento-icone-ansiedade-sono.svg",
    "theme": "light"
  },
  "user": {
    "name": "Ana"
  },
  "today": "2026-10-20",
  "dayNumber": 14,
  "startDate": "2026-10-07",
  "strategy": {
    "id": "herramientas",
    "name": "Herramientas para el momento",
    "description": "Aprendes técnicas breves (respiración, anclaje, relajación) para usarlas cuando la ansiedad sube."
  },
  "goal": {
    "strategy": "herramientas",
    "startDate": "2026-10-07",
    "target": 4,
    "start": null,
    "exercisePerWeek": 3
  },
  "todayStatus": {
    "value": 6,
    "unit": "de 10",
    "label": "Nivel medio de hoy",
    "target": 4,
    "direction": "max",
    "status": "warn",
    "checkedIn": false,
    "urges": 1,
    "urgesResolved": 1,
    "mood": null,
    "entries": [
      {
        "id": "e9c5b9fe-34cf-42a3-b1d8-f9221ea6c740",
        "at": "2026-10-20T20:13:17.633Z",
        "value": {
          "nivel": 6,
          "despues": 4,
          "gatillo": "trabajo",
          "tecnica": "respiracion"
        },
        "summary": "nivel 6/10 · trabajo o estudios · respiración lenta (6→4)"
      }
    ]
  },
  "week": [
    {
      "day": "2026-10-14",
      "value": 3,
      "target": 4,
      "status": "ok"
    },
    {
      "day": "2026-10-15",
      "value": 4,
      "target": 4,
      "status": "ok"
    },
    {
      "day": "2026-10-16",
      "value": 6,
      "target": 4,
      "status": "warn"
    },
    {
      "day": "2026-10-17",
      "value": 7,
      "target": 4,
      "status": "warn"
    },
    {
      "day": "2026-10-18",
      "value": 3,
      "target": 4,
      "status": "ok"
    },
    {
      "day": "2026-10-19",
      "value": 4,
      "target": 4,
      "status": "ok"
    },
    {
      "day": "2026-10-20",
      "value": 6,
      "target": 4,
      "status": "warn"
    }
  ],
  "weekMeta": {
    "label": "Nivel medio de ansiedad por día",
    "unit": "de 10",
    "format": "decimal1",
    "direction": "max"
  },
  "totals": {
    "cards": [
      {
        "id": "dias-calma",
        "label": "Días de calma",
        "value": 7,
        "unit": "días",
        "sub": "de 14 días registrados",
        "estimate": false
      },
      {
        "id": "nivel-medio",
        "label": "Nivel medio",
        "value": 5,
        "unit": "de 10",
        "sub": "desde que empezaste",
        "estimate": false
      },
      {
        "id": "momentos-superados",
        "label": "Momentos difíciles atravesados",
        "value": 1,
        "unit": "",
        "sub": "de 1 registrados",
        "estimate": false
      },
      {
        "id": "respiraciones",
        "label": "Ejercicios de respiración",
        "value": 0,
        "unit": "",
        "sub": "desde que empezaste",
        "estimate": false
      },
      {
        "id": "bajada-media",
        "label": "Cambio medio tras una técnica",
        "value": 2,
        "unit": "puntos",
        "estimate": false,
        "sub": "En 14 registros con «antes» y «después». Es un promedio de tus datos, no un resultado clínico."
      }
    ],
    "periodLabel": "desde que empezaste"
  },
  "streak": {
    "current": 0,
    "best": 2,
    "label": "días de calma seguidos"
  },
  "journey": {
    "nextLesson": null,
    "currentChapter": null,
    "totals": {
      "lessons": 0,
      "completed": 0
    }
  },
  "recommendedExercise": "calma-4-6",
  "exercises": {
    "thisWeek": 0,
    "goal": 3
  },
  "weekNumber": 2,
  "tasks": [
    {
      "id": "26e49f6f-b131-4504-9a6d-0efa5fa7ae5a",
      "week": 1,
      "title": "Observa cómo estás",
      "detail": "Registra tu nivel una vez al día, a la misma hora, sin intentar cambiar nada. Solo ponerle nombre ya ayuda.",
      "done": true
    },
    {
      "id": "4bad8107-4728-4165-8a21-ed72294a2548",
      "week": 2,
      "title": "Practica la respiración lenta",
      "detail": "Haz dos minutos de respiración 4·6 cada día, mejor cuando estés tranquilo/a: así será más fácil usarla cuando la necesites.",
      "done": false
    }
  ],
  "logForm": {
    "label": "Registrar cómo estoy",
    "cta": "Registrar cómo estoy",
    "kind": "emocion",
    "fields": [
      {
        "id": "nivel",
        "label": "¿Cuánta ansiedad sientes ahora?",
        "type": "scale",
        "min": 0,
        "max": 10,
        "required": true,
        "help": "0 = ninguna, 10 = la máxima que has sentido. No hay respuestas buenas o malas."
      },
      {
        "id": "gatillo",
        "label": "¿Qué la despertó?",
        "type": "select",
        "options": [
          {
            "id": "trabajo",
            "label": "Trabajo o estudios"
          },
          {
            "id": "relaciones",
            "label": "Relaciones o conflictos"
          },
          {
            "id": "salud",
            "label": "Preocupación por la salud"
          },
          {
            "id": "dinero",
            "label": "Dinero o responsabilidades"
          },
          {
            "id": "incertidumbre",
            "label": "Incertidumbre o futuro"
          },
          {
            "id": "multitudes",
            "label": "Lugares con mucha gente"
          },
          {
            "id": "sueno",
            "label": "Poco descanso"
          },
          {
            "id": "sin-motivo",
            "label": "Sin motivo claro"
          },
          {
            "id": "otro",
            "label": "Otro motivo"
          }
        ]
      }
    ]
  },
  "urgeForm": {
    "cta": "Necesito calma ahora",
    "title": "Vamos paso a paso",
    "body": "Lo que sientes es incómodo, pero puede pasar. Elige qué notas y prueba una técnica: no tienes que resolver nada ahora, solo bajar un poco el ritmo.",
    "intensity": {
      "min": 1,
      "max": 10,
      "label": "¿Qué nivel de ansiedad sientes?"
    },
    "feelings": [
      {
        "id": "corazon",
        "label": "Corazón acelerado"
      },
      {
        "id": "pecho",
        "label": "Presión en el pecho o respiración corta"
      }
    ],
    "techniques": [
      {
        "id": "respiracion",
        "label": "Respiración lenta 4·6",
        "detail": "Inhala 4 segundos y exhala 6. La exhalación larga ayuda a bajar el ritmo.",
        "exerciseId": "calma-4-6"
      },
      {
        "id": "caja",
        "label": "Respiración cuadrada",
        "detail": "Cuatro tiempos iguales: inhala, retén, exhala, retén. Si te incomoda retener, hazlo sin pausas.",
        "exerciseId": "caja-4-4"
      }
    ],
    "afterLabel": "¿Cómo te sientes ahora?",
    "resolvedLabel": "Estoy algo mejor",
    "continuedLabel": "Sigo igual",
    "supportText": "Seguir igual no significa que lo hagas mal. Prueba otra técnica o pide apoyo. Si sientes que no puedes con esto, tienes pensamientos de hacerte daño o crees que tu vida corre peligro, pide ayuda ahora: llama al 024 (línea de atención a la conducta suicida, gratuita y 24 h, en España) o al 112. Fuera de España, contacta con los servicios de emergencia o de salud de tu país.",
    "crisis": "Si sientes que no puedes con esto, tienes pensamientos de hacerte daño o crees que tu vida corre peligro, pide ayuda ahora: llama al 024 (línea de atención a la conducta suicida, gratuita y 24 h, en España) o al 112. Fuera de España, contacta con los servicios de emergencia o de salud de tu país."
  },
  "checkinLabel": "Hoy fue un día de calma",
  "achievements": {
    "unlocked": 5,
    "total": 10,
    "recent": [
      {
        "slug": "ans-primer-momento",
        "title": "Primer momento atravesado",
        "icon": "wave"
      },
      {
        "slug": "ans-semana-seguimiento",
        "title": "Una semana de seguimiento",
        "icon": "calendar"
      },
      {
        "slug": "ans-tres-tecnicas",
        "title": "Tres técnicas distintas",
        "icon": "leaf"
      }
    ]
  },
  "subscription": {
    "status": "active",
    "provider": "courtesy",
    "currentPeriodEnd": null,
    "cancelAtPeriodEnd": false
  },
  "safety": {
    "text": "Alento ofrece herramientas de apoyo y no sustituye la atención de un profesional ni diagnostica. Si sientes que no puedes con esto, tienes pensamientos de hacerte daño o crees que tu vida corre peligro, pide ayuda ahora: llama al 024 (línea de atención a la conducta suicida, gratuita y 24 h, en España) o al 112. Fuera de España, contacta con los servicios de emergencia o de salud de tu país.",
    "resources": [
      {
        "label": "Línea 024",
        "detail": "Atención a la conducta suicida. Gratuita, 24 horas (España).",
        "tel": "024"
      },
      {
        "label": "Emergencias",
        "detail": "112 (España y Unión Europea). Si tu vida o la de otra persona está en peligro, llama ahora.",
        "tel": "112"
      }
    ]
  },
  "currency": "USD",
  "locale": "es-US"
}
```

`GET /api/app/programs/ansiedad/progress?range=7`

```json
{
  "range": {
    "days": 7,
    "from": "2026-10-14",
    "to": "2026-10-20"
  },
  "program": "ansiedad",
  "metric": {
    "id": "nivel",
    "label": "Nivel medio de ansiedad por día",
    "unit": "de 10",
    "format": "decimal1",
    "direction": "max"
  },
  "series": [
    {
      "day": "2026-10-17",
      "value": 7,
      "target": 4,
      "status": "warn",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-18",
      "value": 3,
      "target": 4,
      "status": "ok",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-19",
      "value": 4,
      "target": 4,
      "status": "ok",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-20",
      "value": 6,
      "target": 4,
      "status": "warn",
      "urges": 1,
      "urgesResolved": 1,
      "checkedIn": false,
      "mood": null
    }
  ],
  "totals": {
    "cards": [
      {
        "id": "dias-calma",
        "label": "Días de calma",
        "value": 4,
        "unit": "días",
        "sub": "de 7 días registrados",
        "estimate": false
      },
      {
        "id": "nivel-medio",
        "label": "Nivel medio",
        "value": 4.7,
        "unit": "de 10",
        "sub": "últimos 7 días",
        "estimate": false
      },
      {
        "id": "momentos-superados",
        "label": "Momentos difíciles atravesados",
        "value": 1,
        "unit": "",
        "sub": "de 1 registrados",
        "estimate": false
      },
      {
        "id": "respiraciones",
        "label": "Ejercicios de respiración",
        "value": 0,
        "unit": "",
        "sub": "últimos 7 días",
        "estimate": false
      },
      {
        "id": "bajada-media",
        "label": "Cambio medio tras una técnica",
        "value": 2,
        "unit": "puntos",
        "estimate": false,
        "sub": "En 7 registros con «antes» y «después». Es un promedio de tus datos, no un resultado clínico."
      }
    ],
    "period": {
      "from": "2026-10-14",
      "to": "2026-10-20",
      "days": 7
    },
    "trackedDays": 7,
    "okDays": 4,
    "urges": 1,
    "urgesResolved": 1,
    "breathing": 0
  },
  "streak": {
    "current": 0,
    "best": 2,
    "label": "días de calma seguidos"
  },
  "byWeekday": [
    {
      "weekday": 1,
      "label": "Lun",
      "average": 4,
      "days": 1
    },
    {
      "weekday": 2,
      "label": "Mar",
      "average": 6,
      "days": 1
    },
    {
      "weekday": 3,
      "label": "Mié",
      "average": 3,
      "days": 1
    },
    {
      "weekday": 4,
      "label": "Jue",
      "average": 4,
      "days": 1
    },
    {
      "weekday": 5,
      "label": "Vie",
      "average": 6,
      "days": 1
    },
    {
      "weekday": 6,
      "label": "Sáb",
      "average": 7,
      "days": 1
    },
    {
      "weekday": 7,
      "label": "Dom",
      "average": 3,
      "days": 1
    }
  ],
  "topTriggers": [
    {
      "id": "trabajo",
      "label": "Trabajo o estudios",
      "count": 3
    },
    {
      "id": "relaciones",
      "label": "Relaciones o conflictos",
      "count": 2
    },
    {
      "id": "incertidumbre",
      "label": "Incertidumbre o futuro",
      "count": 2
    },
    {
      "id": "pensamientos",
      "label": "Pensamientos en bucle",
      "count": 1
    }
  ],
  "timeline": [
    {
      "type": "urge",
      "at": "2026-10-20T20:13:17.653Z",
      "day": "2026-10-20",
      "id": "6d109457-5327-407e-a9e3-e323fb8a5742",
      "title": "Necesito calma ahora: Pensamientos en bucle",
      "detail": "Estoy algo mejor"
    },
    {
      "type": "log",
      "at": "2026-10-20T20:13:17.633Z",
      "day": "2026-10-20",
      "title": "nivel 6/10 · trabajo o estudios · respiración lenta (6→4)",
      "id": "e9c5b9fe-34cf-42a3-b1d8-f9221ea6c740"
    },
    {
      "type": "log",
      "at": "2026-10-19T12:00:00.000Z",
      "day": "2026-10-19",
      "title": "nivel 4/10 · incertidumbre o futuro · anclaje 5-4-3-2-1 (4→2)",
      "id": "750324d2-5bac-4e42-bf34-bf065121b90a"
    }
  ],
  "insights": [
    {
      "text": "Tu promedio de los últimos 7 días fue de 4,7 de 10 por día registrado, frente a 5,3 la semana anterior: vas en la dirección que buscas."
    },
    {
      "text": "Lo que más aparece en tus registros es «Trabajo o estudios» (3 veces). Conocerlo te ayuda a preparar una alternativa."
    },
    {
      "text": "Pasaste por 1 momento difícil y en 1 saliste adelante con una técnica. Cada vez es más fácil reconocerlos."
    },
    {
      "text": "Tras «Respiración lenta» tu nivel bajó de media 2 puntos (3 veces). Puede ser una buena aliada para ti."
    }
  ],
  "currency": "USD",
  "locale": "es-US",
  "goalHistory": [
    {
      "strategy": "herramientas",
      "startDate": "2026-10-07",
      "target": 4,
      "start": null,
      "createdAt": "2026-10-20T20:13:17.390Z",
      "supersededAt": null
    }
  ],
  "journey": {
    "totals": {
      "lessons": 0,
      "completed": 0
    },
    "chapters": []
  }
}
```

### Sueño (`sueno`)

`GET /api/app/programs/sueno/dashboard`

```json
{
  "program": {
    "slug": "sueno",
    "name": "Sueño",
    "tagline": "Descansa. Mañana es otro comienzo.",
    "color": "#FFC857",
    "icon": "/assets/brand/alento-icone-ansiedade-sono.svg",
    "theme": "night"
  },
  "user": {
    "name": "Ana"
  },
  "today": "2026-10-20",
  "dayNumber": 14,
  "startDate": "2026-10-07",
  "strategy": {
    "id": "rutina",
    "name": "Rutina nocturna",
    "description": "Creas un ritual breve y constante antes de dormir para que tu cuerpo entienda que es hora de descansar."
  },
  "goal": {
    "strategy": "rutina",
    "startDate": "2026-10-07",
    "target": 7.5,
    "start": null,
    "exercisePerWeek": 3
  },
  "todayStatus": {
    "value": 7.75,
    "unit": "horas",
    "label": "Horas dormidas anoche",
    "target": 7.5,
    "direction": "min",
    "status": "ok",
    "checkedIn": false,
    "urges": 1,
    "urgesResolved": 1,
    "mood": null,
    "entries": [
      {
        "id": "63913797-cc0a-48e4-a9cf-d3a72e50f2bb",
        "at": "2026-10-20T20:13:18.143Z",
        "value": {
          "cafeina": "manana",
          "calidad": 2,
          "acostarse": "23:15",
          "despertar": "07:00",
          "pantallas": "menos-30",
          "despertares": 0
        },
        "summary": "7 h 45 min · descanso 2/5"
      }
    ]
  },
  "week": [
    {
      "day": "2026-10-14",
      "value": 6.83,
      "target": 7.5,
      "status": "warn"
    },
    {
      "day": "2026-10-15",
      "value": 7.25,
      "target": 7.5,
      "status": "ok"
    },
    {
      "day": "2026-10-16",
      "value": 7.75,
      "target": 7.5,
      "status": "ok"
    },
    {
      "day": "2026-10-17",
      "value": 7.5,
      "target": 7.5,
      "status": "ok"
    },
    {
      "day": "2026-10-18",
      "value": 6.83,
      "target": 7.5,
      "status": "warn"
    },
    {
      "day": "2026-10-19",
      "value": 7.25,
      "target": 7.5,
      "status": "ok"
    },
    {
      "day": "2026-10-20",
      "value": 7.75,
      "target": 7.5,
      "status": "ok"
    }
  ],
  "weekMeta": {
    "label": "Horas dormidas por noche",
    "unit": "horas",
    "format": "hours",
    "direction": "min"
  },
  "totals": {
    "cards": [
      {
        "id": "horas-medias",
        "label": "Horas dormidas (media)",
        "value": 7.36,
        "unit": "horas",
        "sub": "desde que empezaste",
        "estimate": false
      },
      {
        "id": "calidad-media",
        "label": "Descanso medio",
        "value": 3.4,
        "unit": "de 5",
        "sub": "desde que empezaste",
        "estimate": false
      },
      {
        "id": "noches",
        "label": "Noches registradas",
        "value": 14,
        "unit": "noches",
        "sub": "desde que empezaste",
        "estimate": false
      },
      {
        "id": "regularidad",
        "label": "Regularidad al acostarte",
        "value": 20,
        "unit": "min de variación",
        "sub": "Variación de tu hora de acostarte en tus últimos registros.",
        "estimate": false
      },
      {
        "id": "deuda-sueno",
        "label": "Deuda de sueño (7 días)",
        "estimate": true,
        "unit": "horas",
        "value": 1.8,
        "sub": "Estimación: horas que faltaron frente a tu objetivo en las noches registradas esta semana. No es un diagnóstico."
      }
    ],
    "periodLabel": "desde que empezaste"
  },
  "streak": {
    "current": 2,
    "best": 3,
    "label": "noches seguidas dentro de tu objetivo"
  },
  "journey": {
    "nextLesson": {
      "slug": "sue-bienvenido-a-tu-descanso",
      "title": "Bienvenido a tu descanso",
      "status": "available"
    },
    "currentChapter": {
      "slug": "bienvenido-a-tu-descanso",
      "number": 0,
      "title": "Bienvenido a tu descanso",
      "completedLessons": 0,
      "totalLessons": 3
    },
    "totals": {
      "lessons": 30,
      "completed": 0
    }
  },
  "recommendedExercise": "sueno-4-7-8",
  "exercises": {
    "thisWeek": 0,
    "goal": 3
  },
  "weekNumber": 2,
  "tasks": [
    {
      "id": "842d7e21-78de-4ee1-a7d8-e65b7d028633",
      "week": 1,
      "title": "Observa tus noches",
      "detail": "Cada mañana registra a qué hora te acostaste, cuándo despertaste y cómo descansaste. Sin cambiar nada todavía.",
      "done": true
    },
    {
      "id": "62f4dcbe-5b1f-4672-bd80-73d95806cf98",
      "week": 2,
      "title": "Una hora fija para levantarte",
      "detail": "Elige una hora de despertar que puedas mantener todos los días, incluso el fin de semana (con una variación de una hora como máximo).",
      "done": false
    }
  ],
  "logForm": {
    "label": "Registrar mi noche",
    "cta": "Registrar mi noche",
    "kind": "sueno",
    "fields": [
      {
        "id": "acostarse",
        "label": "¿A qué hora te acostaste?",
        "type": "time",
        "required": true,
        "help": "La hora a la que te metiste en la cama con intención de dormir."
      },
      {
        "id": "despertar",
        "label": "¿A qué hora te despertaste?",
        "type": "time",
        "required": true,
        "help": "La hora a la que abriste los ojos por última vez."
      }
    ]
  },
  "urgeForm": {
    "cta": "No logro dormir",
    "title": "Una noche difícil",
    "body": "Cuanto más intentas dormir, más se aleja el sueño. No lo fuerces: cambia el foco y ayuda a tu cuerpo a bajar el ritmo. Elige qué te pasa y prueba una cosa.",
    "intensity": {
      "min": 1,
      "max": 5,
      "label": "¿Qué tan despierto/a te sientes?"
    },
    "feelings": [
      {
        "id": "mente",
        "label": "Mente acelerada"
      },
      {
        "id": "preocupacion",
        "label": "Preocupaciones o pendientes"
      }
    ],
    "techniques": [
      {
        "id": "respiracion",
        "label": "Respiración para la noche",
        "detail": "Inhala 4 segundos, retén 7 y exhala 8. Si te mareas, respira con normalidad.",
        "exerciseId": "sueno-4-7-8"
      },
      {
        "id": "pendientes",
        "label": "Anotar los pendientes",
        "detail": "Escribe en papel lo que te ronda y lo primero que harás mañana. Después, déjalo ahí."
      }
    ],
    "afterLabel": "¿Cómo te sientes ahora?",
    "resolvedLabel": "Me relajé",
    "continuedLabel": "Sigo despierto/a",
    "supportText": "Una mala noche no arruina tu progreso. Mañana mantén tu hora de levantarte y sé amable contigo."
  },
  "checkinLabel": "Noche registrada sin detalles",
  "achievements": {
    "unlocked": 6,
    "total": 10,
    "recent": [
      {
        "slug": "sue-noche-dificil",
        "title": "Una noche difícil atravesada",
        "icon": "wave"
      },
      {
        "slug": "sue-semana-seguimiento",
        "title": "Una semana de noches",
        "icon": "calendar"
      },
      {
        "slug": "sue-horario-regular",
        "title": "Horario regular",
        "icon": "sun"
      }
    ]
  },
  "subscription": {
    "status": "active",
    "provider": "courtesy",
    "currentPeriodEnd": null,
    "cancelAtPeriodEnd": false
  },
  "safety": {
    "text": "Alento ofrece hábitos de higiene del sueño y no diagnostica trastornos ni sustituye a un profesional. Si roncas mucho con pausas al respirar, tienes mucho sueño durante el día o el insomnio dura semanas y afecta a tu vida, consulta con un profesional de salud. Si sientes somnolencia al conducir, para y descansa.",
    "resources": [
      {
        "label": "Tu médico o centro de salud",
        "detail": "Pueden valorar tu caso y derivarte a una unidad del sueño si hace falta."
      },
      {
        "label": "Emergencias",
        "detail": "112 (España y Unión Europea). Si tu vida o la de otra persona está en peligro, llama ahora.",
        "tel": "112"
      }
    ]
  },
  "currency": "USD",
  "locale": "es-US"
}
```

`GET /api/app/programs/sueno/progress?range=7`

```json
{
  "range": {
    "days": 7,
    "from": "2026-10-14",
    "to": "2026-10-20"
  },
  "program": "sueno",
  "metric": {
    "id": "horas",
    "label": "Horas dormidas por noche",
    "unit": "horas",
    "format": "hours",
    "direction": "min"
  },
  "series": [
    {
      "day": "2026-10-17",
      "value": 7.5,
      "target": 7.5,
      "status": "ok",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-18",
      "value": 6.83,
      "target": 7.5,
      "status": "warn",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-19",
      "value": 7.25,
      "target": 7.5,
      "status": "ok",
      "urges": 0,
      "urgesResolved": 0,
      "checkedIn": false,
      "mood": null
    },
    {
      "day": "2026-10-20",
      "value": 7.75,
      "target": 7.5,
      "status": "ok",
      "urges": 1,
      "urgesResolved": 1,
      "checkedIn": false,
      "mood": null
    }
  ],
  "totals": {
    "cards": [
      {
        "id": "horas-medias",
        "label": "Horas dormidas (media)",
        "value": 7.31,
        "unit": "horas",
        "sub": "últimos 7 días",
        "estimate": false
      },
      {
        "id": "calidad-media",
        "label": "Descanso medio",
        "value": 3.3,
        "unit": "de 5",
        "sub": "últimos 7 días",
        "estimate": false
      },
      {
        "id": "noches",
        "label": "Noches registradas",
        "value": 7,
        "unit": "noches",
        "sub": "últimos 7 días",
        "estimate": false
      },
      {
        "id": "regularidad",
        "label": "Regularidad al acostarte",
        "value": 21,
        "unit": "min de variación",
        "sub": "Variación de tu hora de acostarte en tus últimos registros.",
        "estimate": false
      },
      {
        "id": "deuda-sueno",
        "label": "Deuda de sueño (7 días)",
        "estimate": true,
        "unit": "horas",
        "value": 1.8,
        "sub": "Estimación: horas que faltaron frente a tu objetivo en las noches registradas esta semana. No es un diagnóstico."
      }
    ],
    "period": {
      "from": "2026-10-14",
      "to": "2026-10-20",
      "days": 7
    },
    "trackedDays": 7,
    "okDays": 5,
    "urges": 1,
    "urgesResolved": 1,
    "breathing": 0
  },
  "streak": {
    "current": 2,
    "best": 3,
    "label": "noches seguidas dentro de tu objetivo"
  },
  "byWeekday": [
    {
      "weekday": 1,
      "label": "Lun",
      "average": 7.25,
      "days": 1
    },
    {
      "weekday": 2,
      "label": "Mar",
      "average": 7.75,
      "days": 1
    },
    {
      "weekday": 3,
      "label": "Mié",
      "average": 6.83,
      "days": 1
    },
    {
      "weekday": 4,
      "label": "Jue",
      "average": 7.25,
      "days": 1
    },
    {
      "weekday": 5,
      "label": "Vie",
      "average": 7.75,
      "days": 1
    },
    {
      "weekday": 6,
      "label": "Sáb",
      "average": 7.5,
      "days": 1
    },
    {
      "weekday": 7,
      "label": "Dom",
      "average": 6.83,
      "days": 1
    }
  ],
  "topTriggers": [
    {
      "id": "mente",
      "label": "Mente acelerada",
      "count": 1
    }
  ],
  "timeline": [
    {
      "type": "urge",
      "at": "2026-10-20T20:13:18.154Z",
      "day": "2026-10-20",
      "id": "32d0f40f-d825-44bf-a2df-7eba341741f3",
      "title": "No logro dormir: Mente acelerada",
      "detail": "Me relajé"
    },
    {
      "type": "log",
      "at": "2026-10-20T20:13:18.143Z",
      "day": "2026-10-20",
      "title": "7 h 45 min · descanso 2/5",
      "id": "63913797-cc0a-48e4-a9cf-d3a72e50f2bb"
    },
    {
      "type": "log",
      "at": "2026-10-19T12:00:00.000Z",
      "day": "2026-10-19",
      "title": "7 h 15 min · descanso 3/5 · 1 despertar",
      "id": "86289fc1-da76-421e-bc58-496948e9afa9"
    }
  ],
  "insights": [
    {
      "text": "Pasaste por 1 momento difícil y en 1 saliste adelante con una técnica. Cada vez es más fácil reconocerlos."
    },
    {
      "text": "Tu racha actual es de 2 noches seguidas dentro de tu objetivo."
    },
    {
      "text": "Tu hora de acostarte es bastante regular (variación de unos 21 minutos). Eso suele ayudar."
    }
  ],
  "currency": "USD",
  "locale": "es-US",
  "goalHistory": [
    {
      "strategy": "rutina",
      "startDate": "2026-10-07",
      "target": 7.5,
      "start": null,
      "createdAt": "2026-10-20T20:13:17.864Z",
      "supersededAt": null
    }
  ],
  "journey": {
    "totals": {
      "lessons": 30,
      "completed": 0
    },
    "chapters": [
      {
        "number": 0,
        "title": "Bienvenido a tu descanso",
        "status": "available",
        "completedLessons": 0,
        "totalLessons": 3
      },
      {
        "number": 1,
        "title": "Comprender tu sueño",
        "status": "locked",
        "completedLessons": 0,
        "totalLessons": 3
      }
    ]
  }
}
```


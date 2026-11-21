# Spec: Fitness Coach MVP v1 — Coach activo con Base de Conocimiento curada mensualmente

## Problem Statement

Un **Atleta** dedicado a la ganancia muscular, la hipertrofia, el fisioculturismo y la nutrición deportiva toma decisiones cada semana que determinan su progreso real: selección y sustitución de ejercicios, volumen semanal efectivo por grupo muscular, gestión de proximidad al fallo (RIR/RPE), momento óptimo de descarga (*deload*), ajustes calóricos y de macronutrientes según su evolución real de peso y elección de suplementación con respaldo científico.

Hoy existen dos problemas estructurales que ninguna herramienta convencional resuelve conjuntamente:

1. **Falta de continuidad y rigor en el coaching con IA**: los chats genéricos de IA no conservan un contexto estructurado y auditable del Atleta (olvidan lesiones activas, equipamiento real del gimnasio, el Mesociclo en curso, las cargas levantadas en Sesiones de Entrenamiento previas o la tendencia de peso de sus Check-ins). Además, mezclan consensos científicos sólidos con estudios aislados de baja calidad o modas de redes sociales sin declarar el nivel de evidencia ni citar fuentes verificables.
2. **Sobrecarga y ruido en la literatura científica mensual**: las ciencias del deporte y la nutrición deportiva publican cada mes decenas de estudios nuevos (en su mayoría en inglés), muchos detrás de muros de pago (*paywalls*), otros con muestras diminutas, poblaciones no entrenadas o conflictos de interés. Mantenerse actualizado manualmente exige filtrar fuentes primarias, distinguir qué se pudo leer a texto completo frente a solo *abstract*, auditar metodología y comprobar si un nuevo meta-análisis matiza o contradice recomendaciones anteriores.

## Solution

Construir una aplicación web instalable (**PWA móvil-first**) respaldada por un núcleo en **Python** que unifica dos capacidades complementarias bajo un modelo de dominio estricto:

1. **Coach Activo con memoria transparente por Atleta**:
   - Cada **Atleta** dispone de un **Perfil Vivo** visible y editable que recoge su biometría, experiencia, objetivo, disponibilidad, equipo, lesiones/restricciones activas, alergias y preferencias alimentarias; el **Coach** lo consulta en cada decisión y propone actualizaciones cuando detecta cambios en la conversación.
   - El Atleta interactúa en español en streaming mediante **texto, imágenes** (comidas, etiquetas nutricionales, capturas) y **dictado de voz**, gestiona sus **Mesociclos**, registra **Sesiones de Entrenamiento** reales (por formulario o lenguaje natural/voz), controla su **Fase Nutricional** y completa un **Check-in** semanal guiado para recibir ajustes concretos de volumen, cargas, calorías y macros.
   - El Coach razona respaldado por búsqueda híbrida sobre la **Base de Conocimiento**, cita explícitamente las **Fichas de Evidencia** y su nivel de evidencia, mantiene fronteras claras (entrenamiento natural por defecto sin prescripción de farmacología/PEDs y sin diagnóstico médico ni nutrición clínica) y somete cualquier búsqueda en vivo a **cuarentena explícita**.
2. **Sistema de actualización científica mensual con curación humana obligatoria**:
   - Un **Corte Mensual** (ejecutado automáticamente cada mes y bajo demanda) recolecta literatura científica primaria como **Estudios Candidatos** —cada uno acompañado de una ficha crítica obligatoria de seis bloques— y genera un bloque separado de **Temas de Actualidad** contrastados críticamente frente a la evidencia disponible.
   - El **Curador** revisa, audita y decide qué aprobar (creando una **Ficha de Evidencia** indexada al instante en la **Base de Conocimiento**), qué rechazar (recordando el descarte para no repetirlo), cuándo subir un PDF completo para re-analizar un estudio de pago evaluado solo por *abstract*, y qué relaciones de evolución (`confirms`, `nuances`, `supersedes`) vinculan la nueva evidencia con fichas anteriores.
   - Un **lote semilla inicial** (~15–20 meta-análisis y *Position Stands* fundacionales) pasa por la misma bandeja de aprobación para evitar el arranque en frío desde el día 1.
3. **Escalabilidad y sostenibilidad desde el día 1**:
   - El sistema arranca para uso personal a **$0/mes** en la nube con acceso cerrado por invitación y modelos gratuitos de Google AI Studio detrás de una capa agnóstica de proveedor de IA, modelando desde el inicio una única **Base de Conocimiento** compartida y aislamiento estricto por **Atleta** para escalar a múltiples Atletas sin migraciones de esquema.

## User Stories

### Autenticación, Roles y Aislamiento Multi-Atleta

1. Como Curador, quiero iniciar sesión con acceso cerrado por invitación, para proteger los datos de salud del Atleta y las herramientas de curación frente a accesos no autorizados.
2. Como Curador, quiero poder generar invitaciones para incorporar futuros Atletas, para escalar el sistema de forma controlada sin abrir un registro público.
3. Como persona no invitada, quiero que cualquier intento de registro libre o acceso a rutas protegidas sea rechazado, para garantizar la privacidad del sistema en la nube.
4. Como Atleta, quiero que mi Perfil Vivo, Mesociclos, Sesiones de Entrenamiento, Fase Nutricional, Check-ins, adjuntos y conversaciones estén estrictamente aislados de cualquier otro Atleta, para que nunca exista fuga ni mezcla de contextos personales.
5. Como Atleta sin rol de Curador, quiero que las acciones de aprobación, rechazo, ejecución de Corte Mensual y edición de la Base de Conocimiento me estén bloqueadas, para proteger la integridad científica de la Base de Conocimiento compartida.
6. Como Curador que también entrena, quiero poder operar simultáneamente con rol de Curador y Atleta desde mi propia cuenta, para usar el Coach a diario y gestionar la curación mensual sin cambiar de cuenta.

### Experiencia PWA Móvil-First y Disponibilidad

7. Como Atleta, quiero instalar la aplicación web en la pantalla de inicio de mi móvil como PWA a pantalla completa, para usarla en el gimnasio con la comodidad de una app nativa y sin barra de navegador.
8. Como Atleta, quiero navegar de forma ágil desde el móvil entre el chat del Coach, mi Mesociclo activo, el registro rápido de Sesión de Entrenamiento, mi Fase Nutricional/Check-in y mi Perfil Vivo, para consultar y registrar datos entre series con el mínimo número de toques.
9. Como Atleta, quiero ver un indicador de estado claro si la API en capa gratuita está despertando tras inactividad (*cold start*), para saber que la aplicación está cargando y no interpretar el retraso inicial como un fallo.
10. Como Curador, quiero disponer de una vista optimizada tanto en escritorio como en móvil para leer fichas críticas de Estudios Candidatos y aprobar o rechazar cómodamente, para completar mi revisión mensual desde cualquier dispositivo.

### Perfil Vivo y Memoria Persistente Transparente

11. Como Atleta, quiero completar y editar mi Perfil Vivo estructurado (edad, sexo, altura, peso base, nivel de experiencia, objetivo principal, días y duración disponible de entrenamiento, equipamiento del gimnasio, lesiones o restricciones activas, alergias, intolerancias y preferencias alimentarias), para que el Coach parta siempre de mi contexto real.
12. Como Atleta, quiero que el Coach detecte en la conversación cambios relevantes (una molestia articular nueva, un cambio de gimnasio o equipo, un cambio de horario o preferencia alimentaria) y genere una propuesta estructurada de actualización de mi Perfil Vivo, para mantener mi perfil al día sin teclear todo a mano.
13. Como Atleta, quiero revisar, aceptar o descartar cada propuesta de actualización del Perfil Vivo con un clic antes de que se guarde definitivamente, para conservar control total y evitar memorias implícitas erróneas.
14. Como Atleta, quiero marcar una lesión o restricción del Perfil Vivo como resuelta o eliminarla directamente, para que el Coach deje de restringir esos ejercicios desde la siguiente interacción.
15. Como Atleta, quiero ver en todo momento qué información de mi Perfil Vivo está activa, para auditar exactamente qué contexto está usando el Coach al responderme.

### Coaching Conversacional Multimodal y Fronteras de Dominio

16. Como Atleta, quiero mantener conversaciones persistentes con el Coach en español con respuestas en streaming en tiempo real, para recibir orientación fluida y consultar conversaciones pasadas.
17. Como Atleta, quiero iniciar hilos de conversación distintos o continuar el hilo actual con acceso continuo a mi Perfil Vivo, Mesociclo activo, historial reciente de Sesiones de Entrenamiento, Fase Nutricional y últimos Check-ins, para no tener que repetir mi situación en cada charla.
18. Como Atleta, quiero dictar mensajes por voz desde el móvil en el gimnasio para que se transcriban al chat, para consultar ajustes o registrar sensaciones sin escribir entre series.
19. Como Atleta, quiero adjuntar fotos de comidas en el chat, para que el Coach estime aproximadamente calorías y macronutrientes y valore su encaje dentro de mi Fase Nutricional diaria.
20. Como Atleta, quiero adjuntar fotos de etiquetas nutricionales o suplementos, para que el Coach evalúe ingredientes activos, dosis efectivas y respaldo científico según la Base de Conocimiento.
21. Como Atleta, quiero adjuntar capturas de pantalla de mi báscula inteligente o app de seguimiento, para que el Coach extraiga los datos relevantes y los integre en el análisis de mi progreso o Check-in.
22. Como Atleta, quiero que cada recomendación basada en evidencia del Coach muestre citas clicables a las Fichas de Evidencia de la Base de Conocimiento indicando el nivel de evidencia (meta-análisis, revisión sistemática, RCT, observacional, mecanicista), para verificar el rigor de la respuesta.
23. Como Atleta, quiero que el Coach distinga explícitamente entre lo que está respaldado por Fichas de Evidencia aprobadas y lo que responde por conocimiento general (especialmente durante el arranque en frío), para conocer siempre el grado de respaldo trazable.
24. Como Atleta, quiero que, si pregunto por un estudio o tema reciente que todavía no figura en la Base de Conocimiento, el Coach pueda ejecutar una búsqueda en vivo marcando visiblemente la información como *"no verificada en Base de Conocimiento"* y ofreciendo un botón para enviarla como Estudio Candidato al Curador, para obtener respuesta inmediata sin comprometer la integridad de la base.
25. Como Atleta, quiero que el Coach asuma entrenamiento natural por defecto y rechace prescribir protocolos, ciclos o dosis de farmacología/PEDs (limitándose a ofrecer contexto científico objetivo y reducción de daños si pregunto por el tema), para mantener un marco ético y responsable.
26. Como Atleta, quiero que el Coach proponga adaptaciones prácticas de entrenamiento ante molestias declaradas pero rechace diagnosticar patologías médicas o prescribir nutrición clínica, derivando explícitamente a médico, fisioterapeuta o nutricionista clínico cuando existan señales de alarma, para respetar los límites clínicos.

### Entrenamiento: Mesociclos y Sesiones de Entrenamiento

27. Como Atleta, quiero pedirle al Coach que diseñe un Mesociclo personalizado según mi Perfil Vivo y evidencia de hipertrofia (duración en semanas, división semanal, ejercicios, series objetivo por grupo muscular, rango de repeticiones, RIR/RPE objetivo, progresión esperada y criterio de descarga), para seguir una planificación coherente.
28. Como Atleta, quiero revisar, editar manualmente y activar un Mesociclo propuesto por el Coach (archivando o completando el anterior), para mantener siempre un único Mesociclo activo claro.
29. Como Atleta, quiero consultar la sesión planificada de hoy dentro de mi Mesociclo activo viendo mis marcas de la sesión anterior del mismo ejercicio, para saber exactamente qué carga o repeticiones intentar superar.
30. Como Atleta, quiero registrar una Sesión de Entrenamiento completada mediante un formulario rápido móvil (ejercicios, series, repeticiones, carga, RIR/RPE y notas de fatiga/molestia), para guardar datos precisos sin fricción.
31. Como Atleta, quiero registrar una Sesión de Entrenamiento describiéndola en lenguaje natural por texto o dictado de voz en el chat (por ejemplo, *"press inclinado mancuernas 3x8 con 32 kg a RIR 1, última serie costó mucho"*), revisando el borrador estructurado antes de confirmarlo, para registrar entrenamientos de la forma más rápida posible.
32. Como Atleta, quiero editar o eliminar una Sesión de Entrenamiento ya guardada, para corregir errores de carga, repeticiones o ejercicios registrados.
33. Como Atleta, quiero que el Coach calcule mi volumen semanal efectivo por grupo muscular y analice la tendencia de cargas y RIR/RPE a lo largo de las semanas del Mesociclo, para detectar estancamientos, sobrealcance funcional o fatiga acumulada.
34. Como Atleta, quiero que el Coach me proponga cuándo ejecutar una semana de descarga (*deload*) o ajustar volumen y selección de ejercicios cuando detecte caída de rendimiento o fatiga persistente, para maximizar la hipertrofia sostenible.
35. Como Atleta, quiero consultar el historial de Mesociclos y Sesiones de Entrenamiento anteriores, para comparar ciclos y saber qué volumen o ejercicios me funcionaron mejor.

### Nutrición: Fase Nutricional y Check-in Semanal

36. Como Atleta, quiero crear y actualizar mi Fase Nutricional activa (volumen, definición, mantenimiento o mini-cut) con objetivos diarios de calorías, proteína, grasas y carbohidratos, fecha de inicio y ritmo objetivo de cambio de peso, para alinear la nutrición con mi entrenamiento.
37. Como Atleta, quiero pedirle al Coach recomendaciones prácticas de distribución de proteína, timing peri-entreno, estructura de comidas acorde a mis preferencias/alergias y suplementación basada en evidencia, para aplicar la teoría nutricional sin necesidad de un escáner de códigos de barras.
38. Como Atleta, quiero completar un Check-in semanal guiado registrando mi peso corporal (o media semanal), medidas corporales opcionales, adherencia nutricional, calidad de sueño/energía, fatiga percibida y notas de rendimiento, para dar visibilidad real al Coach sobre cómo responde mi cuerpo.
39. Como Atleta, quiero que tras cada Check-in semanal el Coach compare mi tendencia real de peso frente al objetivo de mi Fase Nutricional, estime el ajuste de mi gasto energético real y me proponga modificaciones concretas de calorías/macros o volumen de entrenamiento, para evitar estancamientos prolongados.
40. Como Atleta, quiero consultar el historial cronológico de mis Check-ins y Fases Nutricionales pasadas, para evaluar la evolución real de mi composición corporal y adherencia.

### Corte Mensual y Recolección Científica Automatizada

41. Como Curador, quiero que el Corte Mensual se ejecute automáticamente cada mes desde GitHub Actions sin depender de que la API web gratuita esté despierta, para mantener un flujo continuo de literatura reciente sin timeouts.
42. Como Curador, quiero poder disparar un Corte Mensual manualmente cuando lo necesite (con ventana de fechas o consulta configurable), para ejecutar barridos extraordinarios sin esperar al mes siguiente.
43. Como Curador, quiero que el Corte Mensual consulte fuentes científicas primarias relevantes (PubMed, Europe PMC, Crossref, SportRxiv y revistas objetivo de hipertrofia, fuerza y nutrición deportiva) y obtenga el texto completo automáticamente siempre que exista versión Open Access, para maximizar la profundidad del análisis.
44. Como Curador, quiero que el Corte Mensual aplique primero un pre-filtrado determinista sin llamadas al LLM (por revistas objetivo, palabras clave del dominio y deduplicación contra DOI/PMID ya aprobados, pendientes o rechazados), para eliminar ruido y ahorrar cuota de API.
45. Como Curador, quiero que el Corte Mensual priorice y limite los resultados a un tope configurable de Estudios Candidatos más relevantes por corte (por defecto 10–15), para mantener la revisión mensual manejable y de alta señal.
46. Como Curador, quiero que el Corte Mensual ejecute el análisis con una cola persistente, control de ritmo (*rate limiting*) y *checkpointing* por candidato, para que si se agota la cuota diaria gratuita de Google AI Studio el proceso guarde su estado y se reanude automáticamente sin repetir llamadas ni duplicar registros.
47. Como Curador, quiero que el Corte Mensual genere un bloque independiente de Temas de Actualidad (debates, afirmaciones y tendencias recientes del fitness y fisioculturismo contrastados críticamente frente a la evidencia disponible), para vigilar la actualidad del sector sin mezclarla con literatura primaria.
48. Como Curador, quiero consultar el historial y estado de cada ejecución del Corte Mensual (fecha, fuentes consultadas, artículos filtrados, candidatos generados, estado `completed`/`paused_rate_limit`/`failed` y motivo de cualquier pausa), para auditar el funcionamiento del pipeline.

### Bandeja de Curación, Ficha Crítica y Base de Conocimiento

49. Como Curador, quiero que cada Estudio Candidato presente obligatoriamente una ficha crítica estructurada de seis bloques: (1) identificación y enlace directo DOI/PubMed; (2) diseño y nivel de evidencia; (3) población, muestra (`n`), duración y protocolo; (4) hallazgos clave con tamaño del efecto y aplicabilidad práctica; (5) limitaciones, sesgos y conflictos de interés; (6) impacto frente a Fichas de Evidencia ya aprobadas (confirma, matiza o contradice), para evaluar su validez científica en menos de un minuto.
50. Como Curador, quiero que cualquier Estudio Candidato cuyo texto completo esté tras paywall muestre de forma destacada la etiqueta *"Evaluado solo con abstract (texto completo de pago)"* y limite explícitamente sus conclusiones a lo demostrable en el abstract, para evitar extrapolaciones infundadas.
51. Como Curador, quiero poder subir el PDF completo a un Estudio Candidato que solo tenía abstract para que el sistema extraiga el texto completo y regenere la ficha crítica antes de mi decisión final, para profundizar en estudios de pago clave.
52. Como Curador, quiero poder proponer manualmente un estudio nuevo subiendo un PDF o introduciendo un DOI/enlace, para que pase por exactamente la misma generación de ficha crítica de seis bloques y bandeja de aprobación.
53. Como Curador, quiero aprobar un Estudio Candidato —pudiendo añadir notas prácticas propias y etiquetas temáticas antes de confirmar— para crear automáticamente una Ficha de Evidencia indexada (vectorial + léxicamente) en la Base de Conocimiento.
54. Como Curador, quiero rechazar un Estudio Candidato indicando un motivo (p. ej. muestra insuficiente, población no extrapolable, fallo metodológico, conflicto de interés, fuera de foco), para que el sistema recuerde el rechazo por DOI/PMID y no vuelva a proponerlo.
55. Como Curador, quiero confirmar o editar relaciones de evolución entre la nueva Ficha de Evidencia y fichas anteriores (`confirms`, `nuances`, `supersedes`), para que el Coach priorice la evidencia vigente más fuerte manteniendo el rastro histórico.
56. Como Curador, quiero revisar el bloque de Temas de Actualidad del Corte Mensual y aprobar o descartar síntesis contextuales marcadas explícitamente como *Tema de Actualidad* (nunca como evidencia primaria), para que el Coach sepa responder con criterio sobre debates recientes.
57. Como Curador, quiero ejecutar una carga semilla inicial idempotente de ~15–20 revisiones sistemáticas, meta-análisis y *Position Stands* fundacionales que entren en mi bandeja como Estudios Candidatos, para poblar la Base de Conocimiento con pilares sólidos desde el día 1 respetando siempre la aprobación humana.
58. Como Curador y Atleta, quiero explorar y buscar directamente en la Base de Conocimiento con búsqueda híbrida (semántica + léxica exacta para siglas como `RIR`, `1RM`, `HMB`, `ISSN`, `mTOR` y filtros por etiqueta, nivel de evidencia y vigencia), para consultar fuentes aprobadas en segundos.
59. Como Curador, quiero poder editar mis notas de curador o archivar/marcar como superada una Ficha de Evidencia existente sin romper el historial de citas antiguas, para mantener la Base de Conocimiento limpia a largo plazo.

### Flexibilidad de Proveedores de IA y Mantenimiento

60. Como Curador, quiero poder cambiar el proveedor o modelo de LLM (Google AI Studio Gemini, OpenAI, Anthropic u otro compatible) mediante variables de configuración sin modificar lógica de negocio ni perder mis embeddings existentes, para evitar dependencia de un único proveedor.
61. Como Curador, quiero disponer de una operación controlada de re-indexación de la Base de Conocimiento a partir del texto curado almacenado, para poder migrar de modelo de embeddings en el futuro sin perder ninguna Ficha de Evidencia.

## Implementation Decisions

### Arquitectura General y Separación de Capas (ADR-0003)

- **Monorepo cohesivo con fronteras limpias**: el repositorio aloja el backend en Python, el frontend PWA en TypeScript y la documentación viva del dominio (glosario y ADRs).
- **Arquitectura limpia/hexagonal en el backend Python**:
  - **Capa de Dominio**: entidades puras, objetos de valor, máquinas de estado (ciclo de vida de *Estudio Candidato*, *Ficha de Evidencia*, *Mesociclo*, *Propuesta de Perfil Vivo* y *Corte Mensual*), cálculo de volumen efectivo por grupo muscular, reglas de ponderación de evidencia y políticas de fronteras del *Coach*. Cero dependencias directas de FastAPI, SQLAlchemy o SDKs de IA.
  - **Capa de Aplicación**: casos de uso transaccionales orquestando puertos abstractos (repositorios, proveedor de IA, proveedor de embeddings, fuentes científicas, almacenamiento de archivos, transcripción). Esto permite añadir en el futuro un canal secundario (p. ej. bot de Telegram) invocando los mismos casos de uso sin duplicar reglas de negocio.
  - **Capa de Infraestructura**: adaptadores concretos para FastAPI (REST + SSE), SQLAlchemy 2 async + Alembic sobre PostgreSQL (`pgvector` + `tsvector`), PydanticAI (multi-proveedor), clientes HTTP de literatura científica (PubMed E-utilities, Europe PMC, Crossref, SportRxiv), PyMuPDF para extracción de PDFs, verificación JWT de Supabase Auth, Supabase Storage y runner CLI/GitHub Actions del *Corte Mensual*.
- **Contrato tipado extremo a extremo**: FastAPI expone un esquema OpenAPI estricto derivado de Pydantic v2; el frontend React + Vite + TypeScript genera automáticamente sus tipos y cliente HTTP a partir de ese esquema para garantizar sincronización en tiempo de compilación.

### Modelo de Dominio, Esquema Conceptual y Aislamiento (ADR-0002)

Todas las entidades persistentes residen en una única base de datos **PostgreSQL** con extensiones `pgvector` y búsqueda full-text (`tsvector`), divididas en dos zonas de propiedad claras:

1. **Zona aislada por Atleta** (todas las tablas incluyen clave obligatoria `athlete_id` verificada en cada consulta y política de acceso):
   - **Atleta y roles**: vínculo con el identificador de identidad de Supabase Auth, rol(es) asignados (`athlete`, `curator`) y metadatos de invitación.
   - **Perfil Vivo**: snapshot versionado o editable con biometría, experiencia, objetivo, disponibilidad, equipo, lista estructurada de lesiones/restricciones (con estado `active` / `resolved`), alergias y preferencias alimentarias.
   - **Propuesta de Actualización de Perfil Vivo**: cambios estructurados sugeridos por el *Coach* a partir de un mensaje concreto, con estado `proposed → accepted | dismissed`.
   - **Mesociclo**: nombre, objetivo, duración en semanas, estado (`draft → active → deload → completed | archived`), estructura de sesiones planificadas (ejercicios, grupos musculares primarios/secundarios, series objetivo, rango de reps, RIR/RPE objetivo) y criterios de progresión/descarga. Invariante: un Atleta tiene como máximo un Mesociclo en estado `active` o `deload` simultáneamente.
   - **Sesión de Entrenamiento**: fecha, vínculo opcional al Mesociclo/sesión planificada, origen (`manual_form`, `chat_text`, `chat_voice`), notas generales de fatiga/molestias y detalle ordenado de series ejecutadas (ejercicio, repeticiones, carga, unidad, RIR/RPE, notas).
   - **Fase Nutricional**: tipo (`bulk`, `cut`, `maintenance`, `mini_cut`), fecha inicio/fin, estado (`active` / `completed`), calorías objetivo, gramos objetivo de proteína/grasas/carbohidratos, ritmo objetivo de cambio de peso semanal y notas prácticas.
   - **Check-in Semanal**: fecha/semana, peso medio (y lecturas diarias opcionales), medidas corporales opcionales, adherencia nutricional (escala estructurada), sueño/estrés/fatiga percibida, notas de rendimiento, estimación calculada de gasto energético y resumen de ajustes recomendados por el *Coach*.
   - **Conversaciones, Mensajes y Adjuntos**: hilos por Atleta, mensajes con rol, contenido, citas estructuradas a *Fichas de Evidencia* o advertencias de búsqueda en vivo, metadatos de adjuntos (imágenes/audio) almacenados en Supabase Storage bajo prefijo del Atleta.

2. **Zona compartida curada** (escritura exclusiva del rol *Curador*; lectura disponible para todos los *Atletas* y el *Coach*):
   - **Ejecución de Corte Mensual**: identificador de corte, tipo (`scheduled`, `manual`, `seed`), rango de fechas, estado (`queued → collecting → filtering → analyzing → completed | paused_rate_limit | failed`), contadores de artículos recolectados/filtrados/analizados, cursor de *checkpoint* y registro de errores/pausas.
   - **Estudio Candidato**: identificadores canónicos deduplicables (`doi`, `pmid`, `pmcid`, URL), metadatos bibliográficos, origen (`monthly_cut`, `live_search_promoted`, `manual_upload`, `seed_batch`), nivel de acceso del texto (`full_text_open_access`, `full_text_uploaded_pdf`, `abstract_only_paywall`), ficha crítica estructurada de 6 bloques, estado (`pending → approved | rejected`), motivo de rechazo (obligatorio al rechazar), notas preliminares y referencia al PDF en Supabase Storage si fue subido.
   - **Ficha de Evidencia**: creada únicamente al aprobar un *Estudio Candidato*; conserva enlace al candidato de origen, metadatos, nivel de evidencia normalizado (`meta_analysis`, `systematic_review`, `rct`, `controlled_trial`, `observational`, `mechanistic`, `position_stand`, `preprint`), etiqueta de cobertura (`full_text` vs `abstract_only`), texto curado completo en español + términos técnicos clave originales en inglés, etiquetas temáticas, notas del Curador, estado de vigencia (`active`, `nuanced`, `superseded`, `archived`), vector de embedding (`pgvector`) y vector léxico (`tsvector`) ponderado por campos (título, siglas/términos clave, hallazgos prácticos).
   - **Relaciones de Evidencia**: aristas dirigidas entre Fichas de Evidencia (`source_card_id`, `target_card_id`, tipo `confirms | nuances | supersedes`, justificación breve).
   - **Tema de Actualidad**: título, fecha/corte de origen, descripción de la tendencia o afirmación popular, evaluación crítica frente a la Base de Conocimiento (con citas a Fichas de Evidencia existentes o declaración de falta de evidencia), estado de revisión del Curador (`pending → approved_context | dismissed`) y separación explícita de tabla/tipo para impedir que entre en el índice de evidencia primaria.

### Capa de IA Multi-Proveedor, Herramientas del Coach y Búsqueda Híbrida

- **Adaptador agnóstico en PydanticAI con dos perfiles de modelo**:
  - **Perfil rápido (`fast_tier`)**: cribado de relevancia en el Corte Mensual, extracción estructurada de Sesiones de Entrenamiento desde texto/voz, normalización de datos de Check-in/capturas y resumen auxiliar.
  - **Perfil avanzado (`reasoning_tier`)**: generación de respuestas del Coach, diseño y ajuste de Mesociclos y Fases Nutricionales, interpretación multimodal compleja y redacción de la ficha crítica de 6 bloques de Estudios Candidatos.
  - Configuración desacoplada por proveedor (`google_ai_studio` por defecto en tier gratuito, extensible a `openai`, `anthropic` o proveedores compatibles vía variables de entorno).
- **Embeddings desacoplados y recuperación híbrida**:
  - El adaptador de embeddings opera independientemente del LLM de chat (arrancando con embeddings gratuitos de Google AI Studio) y almacena el identificador/versión del modelo de embeddings junto a cada vector para soportar re-indexaciones limpias.
  - La recuperación sobre la Base de Conocimiento combina búsqueda vectorial (`pgvector` similitud coseno) + búsqueda léxica full-text (`tsvector` con soporte para términos técnicos en inglés y español y coincidencia exacta de siglas como `RIR`, `1RM`, `HMB`, `ISSN`, `mTOR`) fusionadas mediante *Reciprocal Rank Fusion* (RRF), aplicando un ajuste de relevancia que favorece fichas `active` de mayor jerarquía de evidencia y advierte siempre si una ficha recuperada está marcada como `nuanced` o `superseded` (trayendo también la ficha que la actualiza).
- **Herramientas estructuradas del Coach**:
  - Consulta de *Base de Conocimiento* (búsqueda híbrida con devolución de IDs citables, nivel de evidencia y vigencia).
  - Lectura del contexto del *Atleta* (*Perfil Vivo*, *Mesociclo* activo, últimas *Sesiones de Entrenamiento*, volumen semanal calculado, *Fase Nutricional* activa y últimos *Check-ins*).
  - Emisión de propuestas estructuradas no destructivas: (a) propuesta de actualización de *Perfil Vivo*, (b) borrador de *Sesión de Entrenamiento* para confirmación, (c) borrador de *Mesociclo* o ajuste de *Fase Nutricional*.
  - Búsqueda científica en vivo en **cuarentena** (solo cuando la Base de Conocimiento no cubre la duda o el Atleta pregunta explícitamente por algo recién publicado): devuelve resultados etiquetados obligatoriamente como no verificados y adjunta metadatos para que el Atleta/Curador pueda promoverlos con un clic a *Estudio Candidato*.
- **Política inmutable de fronteras del Coach**: las reglas de jerarquía de evidencia, enfoque natural sin prescripción de farmacología/PEDs (solo contexto educativo y reducción de daños si se pregunta), límite clínico sin diagnóstico ni nutrición clínica y distinción entre conocimiento general vs. Base de Conocimiento se imponen tanto en la configuración del agente como en las salidas estructuradas citadas y en la suite de pruebas de comportamiento.

### Pipeline del Corte Mensual, Cuotas Gratuitas y Lote Semilla (ADR-0001)

- **Ejecución fuera del servidor web**: el pipeline corre como tarea Python autónoma ejecutada por **GitHub Actions** (cron mensual + disparo manual `workflow_dispatch`) o CLI local conectada a PostgreSQL, evitando el límite de tiempo y *cold start* de Render gratuito. También puede dispararse desde el panel de Curador (activando el workflow de GitHub o cola asíncrona).
- **Flujo en 3 etapas resilientes**:
  1. **Recolección y pre-filtrado determinista (0 tokens de LLM)**: consulta a PubMed E-utilities, Europe PMC, Crossref y SportRxiv con lista blanca configurable de revistas clave de hipertrofia/fisioculturismo/nutrición deportiva y reglas léxicas de inclusión/exclusión; descarte inmediato de cualquier DOI/PMID ya presente en *Estudios Candidatos* (pendientes o rechazados) o *Fichas de Evidencia*; detección automática de texto completo Open Access (Europe PMC / PMC / SportRxiv) frente a solo-abstract.
  2. **Priorización y cola con *rate limiting* y *checkpointing***: ordenación determinista preliminar (priorizando meta-análisis, revisiones sistemáticas, RCTs y revistas núcleo) + cribado ligero por lotes con `fast_tier` respetando límites configurables de RPM/RPD y pausas entre lotes; selección del top configurable (defecto 10–15) de *Estudios Candidatos* por corte. Cada transición por candidato se persiste en PostgreSQL de modo que una respuesta `429` o agotamiento diario pausa la ejecución en `paused_rate_limit` y la siguiente ejecución reanuda exactamente en el siguiente ítem sin duplicar llamadas.
  3. **Análisis crítico de 6 bloques y Temas de Actualidad**: generación con `reasoning_tier` de la ficha crítica estructurada (restringiendo estrictamente afirmaciones cuando `access_level = abstract_only_paywall`), cruce automático por búsqueda híbrida contra la Base de Conocimiento existente para sugerir relaciones (`confirms`, `nuances`, `supersedes`), y generación independiente del bloque mensual de *Temas de Actualidad*.
- **Procesamiento de PDFs manuales y re-análisis**: al subir un PDF a un Estudio Candidato existente (o nuevo), se guarda en Supabase Storage, PyMuPDF extrae el texto estructurado (o se pasa a capacidad nativa de PDF del proveedor si está habilitada), se actualiza el nivel de acceso a `full_text_uploaded_pdf` y se regenera la ficha crítica de 6 bloques conservando el registro del análisis previo para comparación.
- **Lote semilla inicial**: comando/acción idempotente que inserta en la bandeja un conjunto curado de ~15–20 referencias fundacionales (p. ej. *Position Stands* de la ISSN sobre proteína, creatina, cafeína y composición corporal; grandes meta-análisis de volumen, frecuencia, proximidad al fallo, rango de movimiento y sobrecarga progresiva) pasando exactamente por el mismo flujo de generación de ficha y aprobación humana del Curador.

### Contratos de API, Streaming y Frontend PWA

- **Grupos de API en FastAPI**:
  - Identidad y roles (resolución de sesión actual, gestión de invitaciones por Curador).
  - *Perfil Vivo* y propuestas de actualización (`GET/PUT`, aceptar/descartar propuestas).
  - Chat del *Coach* (gestión de conversaciones, envío de mensajes con adjuntos de imagen/audio, respuesta vía **SSE** emitiendo eventos tipados: fragmentos de texto, citas a *Fichas de Evidencia*, banderas de cuarentena de búsqueda en vivo, propuestas de *Perfil Vivo* y borradores de *Sesión de Entrenamiento*).
  - Entrenamiento (*Mesociclos*, sesión planificada del día con historial de cargas previas, CRUD de *Sesiones de Entrenamiento* y resumen de volumen efectivo semanal).
  - Nutrición (*Fases Nutricionales*, historial y CRUD de *Check-ins* semanales con disparo de análisis del *Coach*).
  - Base de Conocimiento (búsqueda híbrida y consulta detallada de *Fichas de Evidencia* y sus relaciones de evolución).
  - Curación (bandeja de *Estudios Candidatos*, subida de PDF/DOI para alta o re-análisis, aprobar con notas/etiquetas/relaciones, rechazar con motivo, revisión de *Temas de Actualidad*, historial y disparo de *Corte Mensual* y carga del lote semilla).
- **Vistas de la PWA (React + Vite + TypeScript + Tailwind + shadcn/ui + `vite-plugin-pwa`)**:
  - Navegación móvil inferior con acceso rápido a: **Coach (Chat)**, **Entreno** (*Mesociclo* + registro rápido de *Sesión de Entrenamiento*), **Nutrición** (*Fase Nutricional* + *Check-in*), **Ciencia** (explorador de *Base de Conocimiento* + bandeja del *Curador* visible solo para rol Curador) y **Perfil Vivo**.
  - Soporte de dictado de voz en el compositor del chat y registro rápido; previsualización de adjuntos; banner discreto de activación si la API despierta de *cold start*.

### Despliegue e Infraestructura ($0/mes)

- **Supabase (free tier)**: PostgreSQL + `pgvector` + `tsvector`, Supabase Auth (registro público deshabilitado, alta únicamente por invitación), Supabase Storage (buckets privados separados para adjuntos de Atleta y PDFs científicos del Curador).
- **Cloudflare Pages o Vercel (free tier)**: despliegue automático de la PWA estática.
- **Render (free tier)**: despliegue del servicio FastAPI.
- **GitHub Actions (free tier)**: ejecución programada mensual y manual del *Corte Mensual* + pipeline CI de tests y validación de tipos OpenAPI.

## Testing Decisions

### Qué Hace a un Buen Test en Este Proyecto

- **Comportamiento observable, nunca detalles internos**: cada test verifica contratos externos reales — respuestas HTTP/SSE de FastAPI, estado persistido observable, resultados de búsqueda híbrida, salida del runner del *Corte Mensual* y flujos visibles en pantalla de la PWA. Refactorizar clases internas no debe romper ningún test mientras el comportamiento externo se mantenga.
- **Base de datos real en tests de integración**: no se mockean repositorios ni SQLAlchemy; los tests del backend corren contra una instancia real de PostgreSQL con `pgvector` y `tsvector` y las migraciones reales de Alembic aplicadas.
- **Cero dependencias de red externa ni consumo de cuotas en CI**: las pruebas son 100% deterministas, rápidas y reproducibles sin acceso a Google AI Studio, PubMed ni Supabase en la nube.

### Costuras de Prueba (*Testing Seams*)

Se mantienen exactamente **cuatro costuras en las fronteras más altas posibles**:

1. **Costura de Proveedor de IA (LLM + Embeddings + Transcripción)** *(backend)*: único puerto sustituido por un *fake* determinista que produce salidas estructuradas válidas para el *Coach* (incluyendo invocaciones a herramientas, citas, fronteras y propuestas), fichas críticas de 6 bloques, *Temas de Actualidad*, transcripciones de audio y vectores de embedding reproducibles (con capacidad de simular errores HTTP 429 / cuotas agotadas).
2. **Costura de Fuentes Científicas y Búsqueda en Vivo** *(backend)*: único adaptador HTTP hacia PubMed, Europe PMC, Crossref, SportRxiv y búsqueda web, alimentado en test por fixtures controlados (estudios Open Access completos, estudios tras paywall solo con *abstract*, duplicados por DOI/PMID, PDFs de prueba y fallos transitorios de red).
3. **Costura de Identidad y Almacenamiento Binario (Supabase Auth + Storage)** *(backend)*: sustitución en la frontera de verificación JWT/roles (para emitir identidades de *Atleta A*, *Atleta B* y *Curador* de forma limpia) y almacenamiento binario en memoria/directorio temporal para probar subida de imágenes y PDFs sin llamadas externas.
4. **Costura Única de Red HTTP/SSE en Frontend PWA** *(frontend)*: todos los tests de interfaz interceptan únicamente el tráfico de red contra el contrato OpenAPI de FastAPI (con MSW), validando lo que ve e interactúa el *Atleta* y el *Curador* en el navegador simulado.

### Módulos y Comportamientos Bajo Prueba

Al tratarse de un repositorio *greenfield* sin arte previo de tests, se establecerá la suite desde el primer ticket con `pytest` (backend) y `Vitest` + Testing Library + MSW (frontend), cubriendo obligatoriamente:

- **Seguridad y aislamiento multi-atleta**: verificación de rechazo a peticiones sin sesión, bloqueo de acceso cruzado entre *Atleta A* y *Atleta B* en todas las entidades personales y bloqueo de endpoints de curación para cuentas sin rol *Curador*.
- **Ciclo de vida de la Base de Conocimiento (ADR-0001)**:
  - Flujo completo `Estudio Candidato (pending)` → aprobación → creación de `Ficha de Evidencia` inmediatamente localizable por búsqueda híbrida.
  - Rechazo con motivo y verificación de que el mismo DOI/PMID se descarta automáticamente en posteriores *Cortes Mensuales* sin volver a entrar como pendiente.
  - Etiquetado obligatorio de `abstract_only_paywall` y re-análisis completo tras subir un PDF.
  - Vinculación de relaciones (`confirms`, `nuances`, `supersedes`) y priorización de fichas vigentes frente a superadas.
  - Separación estricta de *Temas de Actualidad* respecto al índice de evidencia primaria.
- **Resiliencia del Corte Mensual**: pre-filtrado determinista, tope configurable de candidatos, simulación de error de cuota (HTTP 429) a mitad de lote verificando persistencia de `paused_rate_limit` y reanudación idempotente desde el último checkpoint sin duplicados; idempotencia del lote semilla inicial.
- **Búsqueda híbrida (`pgvector` + `tsvector`)**: pruebas de recuperación verificando tanto coincidencia semántica en español sobre contenido en inglés como coincidencia léxica exacta de acrónimos deportivos (`RIR`, `1RM`, `HMB`, `ISSN`, `mTOR`).
- **Flujos de Coaching, Entrenamiento y Nutrición**: creación/edición del *Perfil Vivo*, aceptación/descarte de propuestas de actualización del *Coach*, activación única de *Mesociclo*, registro y edición de *Sesiones de Entrenamiento* (formulario y borrador desde lenguaje natural/voz), cálculo de volumen semanal por grupo muscular, gestión de *Fase Nutricional*, registro de *Check-in* semanal, cuarentena de búsqueda en vivo y cumplimiento de fronteras (citas, PEDs y límite clínico).
- **Interfaz PWA**: flujos visibles críticos de *Atleta* (chat con streaming/citas/cuarentena, confirmación de propuesta de *Perfil Vivo*, registro rápido de sesión y *Check-in*) y de *Curador* (revisión de ficha de 6 bloques, marca de solo-abstract, subida de PDF, aprobación y rechazo con motivo).

## Out of Scope

Quedan explícitamente **fuera del alcance de la MVP v1**:

- **Planificado para Fase 2**:
  - *Service Worker* con almacenamiento offline avanzado y sincronización diferida de *Sesiones de Entrenamiento* registradas sin cobertura en gimnasios en sótano.
  - Notificaciones Push web (recordatorio de *Check-in* semanal y aviso de nuevo *Corte Mensual* listo).
  - Panel analítico visual avanzado con gráficas interactivas de volumen semanal por grupo muscular, progresión de fuerza estimada (e1RM) y curvas de tendencia de peso vs. calorías.
  - Canal secundario de mensajería (bot de Telegram conectado al mismo núcleo de aplicación).
  - Onboarding autoservicio, registro público abierto, pasarela de pagos/suscripciones y panel de entrenador para gestionar múltiples *Atletas* desde una vista consolidada.
- **Excluido de la v1 por fiabilidad/complejidad**:
  - **Análisis biomecánico de vídeo** de ejecución técnica de ejercicios.
  - **Contador de calorías alimento por alimento** con base de datos comercial de productos y escáner de códigos de barras (tipo MyFitnessPal/MacroFactor).
- **Fuera de alcance permanente (frontera de dominio)**:
  - Prescripción de farmacología deportiva / PEDs (esteroides anabólicos, SARMs, péptidos, ciclos o dosificaciones).
  - Diagnóstico médico de lesiones o patologías, rehabilitación clínica y prescripción de nutrición clínica para enfermedades.

## Further Notes

### Restricciones Operativas y de Diseño

- **Coste de infraestructura $0/mes en fase personal**: toda la arquitectura opera dentro de capas gratuitas (Supabase, Cloudflare Pages/Vercel, Render, GitHub Actions y Google AI Studio free tier). El frontend debe absorber con elegancia los *cold starts* de ~30–50s de Render gratuito mediante estados de espera claros y reintentos idempotentes en lecturas.
- **Privacidad y tier gratuito de Google AI Studio**: el Curador asume que en la capa gratuita de Google AI Studio el proveedor puede usar prompts para mejora de modelos; la capa agnóstica permite migrar a tier de pago de Gemini, OpenAI o Anthropic cambiando únicamente configuración cuando el sistema escale o se requiera privacidad contractual estricta.
- **Convención lingüística**: interfaz, prompts de interacción, fichas de *Estudios Candidatos*, respuestas del *Coach* y documentación de dominio (`GLOSSARY.md`, ADRs) en **español**; código fuente, esquema de base de datos, contratos técnicos y pruebas en **inglés**; recolección y procesamiento científico bilingüe (predominantemente inglés).
- **Trazabilidad de fuentes**: toda *Ficha de Evidencia* conserva obligatoriamente el enlace original (DOI o PubMed URL) para permitir verificación humana directa.

### Casos Límite (*Edge Cases*) Detallados

1. **Estudio tras paywall (solo abstract)**: el *Corte Mensual* no lo descarta; lo guarda con `access_level = abstract_only_paywall`, muestra una advertencia visual prominente (*"Evaluado solo con abstract (texto completo de pago)"*), prohíbe al modelo inferir detalles metodológicos ausentes del abstract y habilita la subida de PDF para re-analizarlo antes de aprobar.
2. **Reaparición de estudio rechazado**: si un estudio previamente rechazado reaparece en otro *Corte Mensual* o en una búsqueda en vivo con el mismo DOI/PMID, el pre-filtro lo excluye automáticamente; si el Curador intenta subirlo manualmente, el sistema muestra el rechazo previo y su motivo permitiendo decidir conscientemente si reabrirlo.
3. **Contradicción o actualización científica**: cuando un nuevo meta-análisis o RCT relevante matiza o contradice una *Ficha de Evidencia* previa, la ficha antigua nunca se elimina físicamente; se registra la relación (`nuances` o `supersedes`) para que el Coach priorice la evidencia vigente citando la evolución y las conversaciones históricas conserven referencias válidas.
4. **Agotamiento de cuota diaria/por minuto de Google AI Studio durante el Corte Mensual**: ante HTTP 429 o cuota excedida, el pipeline aplica *backoff* y, si agota los reintentos, marca la ejecución como `paused_rate_limit` guardando el cursor exacto; al volver a lanzarse retoma desde el siguiente candidato sin repetir análisis ya guardados ni duplicar filas.
5. **Búsqueda en vivo durante una conversación**: el resultado se entrega al Atleta con una advertencia explícita e inconfundible de *"fuente externa aún no verificada en Base de Conocimiento"*, jamás se escribe en la tabla de *Fichas de Evidencia* y ofrece un botón para crear un *Estudio Candidato* pendiente.
6. **Lesión o restricción resuelta en el Perfil Vivo**: al marcar una molestia como resuelta o eliminarla en el Perfil Vivo, el Coach deja de aplicar sustituciones restrictivas a partir del siguiente turno conversacional, conservando el historial previo de forma no invasiva.
7. **Arranque en frío (Base de Conocimiento vacía)**: antes de aprobar el lote semilla o el primer Corte Mensual, el Coach funciona con normalidad apoyándose en conocimiento general y declara explícitamente que aún no cuenta con *Fichas de Evidencia* aprobadas para respaldar esa afirmación con cita interna.
8. **Acceso cruzado entre Atletas o escalada de privilegios**: si el *Atleta A* intenta leer, editar o borrar cualquier recurso del *Atleta B* (perfil, Mesociclo, Sesión, Check-in, conversación o adjunto) o invocar endpoints de *Curador*, la API responde `403` o `404` sin filtrar existencia de recursos ajenos.
9. **Solicitud de farmacología/PEDs o diagnóstico médico**: si el Atleta pide un ciclo de esteroides/SARMs/péptidos o un diagnóstico clínico de una lesión/patología, el Coach rechaza la prescripción o diagnóstico, ofrece únicamente contexto científico neutral y reducción de daños (en PEDs) o adaptaciones conservadoras + derivación a especialista sanitario (en lesiones/clínica).
10. **Registro de Sesión de Entrenamiento incompleto o ambiguo por voz/texto**: si el dictado omite carga o RIR (p. ej. *"hice 3x10 de curl bíceps"*), el Coach genera un borrador editable señalando los campos faltantes y pide confirmación rápida antes de persistirlo en el historial.
11. **PDF corrupto, escaneado sin capa de texto o demasiado grande**: al subir un PDF ilegible o que supere el límite permitido, la API devuelve un error claro en español sin corromper el *Estudio Candidato* existente ni sobreescribir su análisis previo.
12. **Subida de imagen borrosa o no relacionada en el chat**: si una foto de comida o etiqueta no es legible, el Coach declara explícitamente la incertidumbre y pide aclaración o mejor foto en lugar de inventar valores nutricionales exactos.
13. **Múltiples Mesociclos**: al activar un nuevo Mesociclo mientras otro está activo, el sistema garantiza la invariante de unicidad pasando el anterior a `completed` o `archived` con confirmación explícita del Atleta.
14. **Cold start de Render durante envío de mensaje o Check-in**: la PWA distingue un despertar lento del servidor de un fallo de red real, evita envíos duplicados (idempotencia/deshabilitación de doble envío) y muestra estado claro al Atleta.

### Criterios de Aceptación (MVP v1)

#### Seguridad, Roles y Aislamiento
- [ ] El registro público está deshabilitado; una persona sin invitación no puede crear cuenta ni acceder a ningún endpoint protegido.
- [ ] Una cuenta con rol `athlete` (sin rol `curator`) recibe `403` en todos los endpoints de curación, ejecución de *Corte Mensual* y carga de lote semilla.
- [ ] Un *Atleta* solo puede leer y modificar sus propios datos (*Perfil Vivo*, *Mesociclos*, *Sesiones de Entrenamiento*, *Fases Nutricionales*, *Check-ins*, conversaciones y adjuntos); los intentos cruzados fallan sin fuga de datos.

#### Perfil Vivo y Coaching Conversacional Multimodal
- [ ] El *Atleta* puede crear, consultar y editar todos los campos de su *Perfil Vivo*, incluyendo marcar lesiones/restricciones como resueltas.
- [ ] El *Coach* propone actualizaciones estructuradas del *Perfil Vivo* cuando detecta cambios en el chat, y dichas actualizaciones solo se persisten tras confirmación explícita del *Atleta*.
- [ ] El chat funciona en español con streaming SSE, soporta texto, imágenes (comidas/etiquetas/capturas) y dictado de voz, y mantiene contexto longitudinal del *Atleta*.
- [ ] El *Coach* cita explícitamente *Fichas de Evidencia* aprobadas con su nivel de evidencia cuando existen, declara conocimiento general si no hay ficha aprobada, marca cualquier búsqueda en vivo como no verificada con opción de envío a *Estudio Candidato*, y respeta las fronteras de PEDs y límite clínico.

#### Entrenamiento y Nutrición
- [ ] El *Atleta* puede generar con el *Coach*, editar y activar un *Mesociclo* (garantizando un único *Mesociclo* activo) y consultar la sesión del día junto a sus marcas previas.
- [ ] El *Atleta* puede registrar y editar *Sesiones de Entrenamiento* tanto por formulario rápido como mediante lenguaje natural/voz (con borrador de confirmación), y el sistema calcula el volumen semanal efectivo por grupo muscular.
- [ ] El *Atleta* puede gestionar su *Fase Nutricional* activa y completar un *Check-in* semanal recibiendo análisis de tendencia de peso y propuestas concretas de ajuste de calorías, macros o entrenamiento.

#### Corte Mensual, Curación y Base de Conocimiento
- [ ] El *Corte Mensual* se ejecuta programadamente vía GitHub Actions y manualmente bajo demanda, realiza pre-filtrado determinista sin LLM, respeta el tope configurable de candidatos, separa *Estudios Candidatos* de *Temas de Actualidad* y retoma limpiamente desde checkpoint tras un límite de cuota (`paused_rate_limit`).
- [ ] Cada *Estudio Candidato* contiene la ficha crítica completa de 6 bloques con enlace DOI/PubMed; los estudios tras paywall muestran explícitamente la marca de *"Evaluado solo con abstract (texto completo de pago)"* y permiten subir un PDF para re-análisis antes de aprobar.
- [ ] El *Curador* puede cargar el lote semilla inicial de forma idempotente, proponer estudios manualmente por PDF/DOI, aprobar candidatos (creando *Fichas de Evidencia* buscables inmediatamente), rechazarlos con motivo (bloqueando futuras duplicaciones) y vincular relaciones `confirms` / `nuances` / `supersedes`.
- [ ] La búsqueda híbrida (`pgvector` + `tsvector`) recupera resultados relevantes tanto para consultas conceptuales en español sobre estudios en inglés como para siglas exactas (`RIR`, `1RM`, `HMB`, `ISSN`, `mTOR`), priorizando evidencia vigente frente a `superseded`.

#### Arquitectura, PWA y Calidad
- [ ] El proveedor de LLM de chat/razonamiento puede cambiarse por configuración (Google AI Studio Gemini / OpenAI / Anthropic) sin modificar código de dominio ni perder los embeddings almacenados, y existe operación controlada de re-indexación si cambia el modelo de embeddings.
- [ ] La PWA se instala a pantalla completa en móvil con `manifest` válido, usa tipos generados desde el OpenAPI de FastAPI y gestiona visiblemente el *cold start* de la API.
- [ ] Toda la suite automatizada (tests de integración backend contra PostgreSQL real con `pgvector`/`tsvector` usando las 3 costuras de backend + tests de comportamiento frontend con MSW) pasa en verde en CI.

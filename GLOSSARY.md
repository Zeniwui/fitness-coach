# Fitness Coach

Dominio de un agente de IA especializado en ciencias del deporte, hipertrofia, fisioculturismo y nutrición deportiva, con coaching personalizado persistente y curación mensual de evidencia científica.

## Language

**Atleta**:
La persona cuyo entrenamiento, nutrición y evolución física son gestionados por el sistema.
_Avoid_: usuario, cliente, perfil

**Coach**:
El agente de IA que acompaña al Atleta con memoria persistente para planificar, analizar y ajustar su entrenamiento y nutrición.
_Avoid_: asistente, bot, chatbot

**Curador**:
La persona con autoridad para evaluar, aprobar o rechazar la incorporación de nueva evidencia a la Base de Conocimiento.
_Avoid_: administrador, editor, revisor

**Base de Conocimiento**:
El cuerpo curado y aprobado de evidencia científica que el Coach utiliza como referencia autoritativa.
_Avoid_: base de datos, RAG, índice, memoria

**Estudio Candidato**:
Una publicación científica descubierta por el sistema, acompañada de su análisis crítico, que espera la aprobación del Curador para ingresar a la Base de Conocimiento (puede quedar pendiente, aprobado o rechazado).
_Avoid_: paper pendiente, artículo, borrador

**Ficha de Evidencia**:
Registro curado de un estudio científico aprobado por el Curador dentro de la Base de Conocimiento; conserva su nivel de evidencia y puede marcarse como matizada o superada por estudios posteriores.
_Avoid_: documento, chunk, vector, paper

**Tema de Actualidad**:
Una tendencia, debate o afirmación reciente del mundo del fitness y fisioculturismo contrastada críticamente frente a la evidencia disponible; se mantiene separado de la evidencia científica primaria.
_Avoid_: noticia, moda, estudio

**Corte Mensual**:
El proceso periódico mensual que recolecta nueva literatura científica y Temas de Actualidad, generando Estudios Candidatos y un resumen para la revisión del Curador.
_Avoid_: cron, job, boletín, digest

## Entrenamiento y Nutrición

**Perfil Vivo**:
El contexto persistente, visible y editable del Atleta (biometría, objetivo, experiencia, equipo disponible, horarios, lesiones o restricciones activas y preferencias alimentarias) que el Coach consulta y puede proponer actualizar.
_Avoid_: memoria opaca, configuración, ficha básica

**Mesociclo**:
Un bloque planificado de varias semanas de entrenamiento orientado a hipertrofia o fuerza, con volumen, selección de ejercicios y progresión estructurados hasta una fase de descarga.
_Avoid_: rutina, programa genérico, plan

**Sesión de Entrenamiento**:
El registro real de un entrenamiento completado por el Atleta, incluyendo ejercicios, series, repeticiones, carga y proximidad al fallo (RIR/RPE).
_Avoid_: entreno, log, workout

**Fase Nutricional**:
Un periodo con objetivo calórico y de composición corporal definido para el Atleta (volumen, definición, mantenimiento o mini-cut).
_Avoid_: dieta, plan alimenticio

**Check-in**:
Una revisión periódica del estado del Atleta (peso corporal, medidas, adherencia, fatiga y rendimiento) utilizada por el Coach para ajustar entrenamiento y nutrición.
_Avoid_: seguimiento, reporte, actualización

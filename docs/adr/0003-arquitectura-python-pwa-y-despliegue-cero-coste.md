# Arquitectura Python (FastAPI) + PWA React/Vite y despliegue a coste cero

Separamos el sistema en un monorepo con backend en Python (FastAPI, PydanticAI, SQLAlchemy 2 + Alembic, PyMuPDF y `uv` con núcleo de dominio desacoplado) y frontend PWA en React + Vite + TypeScript (con tipos generados desde el OpenAPI de FastAPI). Para operar inicialmente a $0/mes sin comprometer el escalado futuro ni la búsqueda científica, usamos Supabase (PostgreSQL + `pgvector` + búsqueda híbrida `tsvector`, Auth cerrada por invitación y Storage), Cloudflare Pages/Vercel para la PWA, Render gratuito para la API y GitHub Actions para ejecutar el Corte Mensual con cola y reanudación (*checkpointing*) acorde a las cuotas gratuitas de Google AI Studio.

## Considered Options

- **Todo TypeScript (Next.js + Drizzle + Vercel AI SDK)**: menor complejidad de despliegue (1 solo servicio), descartado por preferencia explícita por Python en el backend y su ecosistema para procesamiento científico/PDFs.
- **Ejecutar el Corte Mensual dentro del servidor web gratuito**: descartado por los *cold starts* y límites de tiempo de ejecución en capas gratuitas al convivir con pausas de *rate limit* del tier gratuito de Gemini.

## Consequences

- La API en Render gratuito puede sufrir un *cold start* de ~30–50 segundos tras periodos de inactividad en la fase personal (eliminable pasando a un plan de pago al escalar).
- El modelo de embeddings queda desacoplado del LLM de chat/razonamiento y el texto curado se conserva en PostgreSQL para poder cambiar de proveedor (Gemini, OpenAI, Anthropic u otros) o re-indexar sin pérdida de datos.

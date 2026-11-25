"""PyMuPDF PDF text extractor with strict size, corruption, and text-layer validation."""

from __future__ import annotations

import pymupdf

from fitness_coach.domain.knowledge import (
    MAX_PDF_EXTRACTED_CHARS,
    MAX_PDF_PAGES,
    MAX_PDF_SIZE_BYTES,
    InvalidPdfError,
)


def extract_pdf_text(
    pdf_bytes: bytes,
    *,
    max_size_bytes: int = MAX_PDF_SIZE_BYTES,
    max_pages: int = MAX_PDF_PAGES,
    max_chars: int = MAX_PDF_EXTRACTED_CHARS,
) -> str:
    """Extract text from a PDF document using PyMuPDF.

    Raises InvalidPdfError with a clear Spanish message if the file is empty,
    exceeds the maximum size, is corrupt/unreadable, or has no extractable text layer.
    """
    if not pdf_bytes:
        raise InvalidPdfError("El archivo PDF está vacío.")

    if len(pdf_bytes) > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise InvalidPdfError(f"El archivo PDF supera el tamaño máximo permitido de {max_mb} MB.")

    if not pdf_bytes.lstrip().startswith(b"%PDF"):
        raise InvalidPdfError("El archivo subido no es un PDF válido o está dañado.")

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise InvalidPdfError("El archivo PDF está corrupto o no se puede leer.") from exc

    try:
        if doc.page_count == 0:
            raise InvalidPdfError("El archivo PDF no contiene páginas.")
        if doc.page_count > max_pages:
            raise InvalidPdfError(
                f"El archivo PDF supera el límite máximo permitido de {max_pages} páginas."
            )
        pages_text: list[str] = []
        total_chars = 0
        for page in doc:
            page_text = page.get_text("text").strip()
            if not page_text:
                continue
            separator_len = 2 if pages_text else 0
            remaining = max_chars - total_chars - separator_len
            if remaining <= 0:
                break
            if len(page_text) > remaining:
                pages_text.append(page_text[:remaining])
                total_chars += separator_len + remaining
                break
            pages_text.append(page_text)
            total_chars += separator_len + len(page_text)
            if total_chars >= max_chars:
                break
    except InvalidPdfError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise InvalidPdfError(
            "Error al extraer el contenido del archivo PDF (documento dañado)."
        ) from exc
    finally:
        doc.close()

    extracted = "\n\n".join(p for p in pages_text if p).strip()
    if len(extracted) < 20:
        raise InvalidPdfError(
            "El PDF no contiene una capa de texto seleccionable (posiblemente es un escaneo "
            "de solo imagen). Sube un PDF con texto o aplica OCR antes de subirlo."
        )
    return extracted

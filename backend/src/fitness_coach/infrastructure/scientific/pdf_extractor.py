"""PyMuPDF PDF text extractor with strict size, corruption, and text-layer validation."""

from __future__ import annotations

import pymupdf

from fitness_coach.domain.knowledge import MAX_PDF_SIZE_BYTES, InvalidPdfError


def extract_pdf_text(pdf_bytes: bytes, *, max_size_bytes: int = MAX_PDF_SIZE_BYTES) -> str:
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
        pages_text = [page.get_text("text").strip() for page in doc]
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

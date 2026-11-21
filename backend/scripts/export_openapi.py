"""Export the FastAPI OpenAPI schema to JSON for frontend TypeScript codegen."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from fitness_coach.infrastructure.api.main import create_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Export FastAPI OpenAPI schema")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "openapi.json",
        help="Destination path for openapi.json",
    )
    args = parser.parse_args()
    app = create_app()
    schema = app.openapi()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Exported OpenAPI schema to {args.output}")


if __name__ == "__main__":
    main()

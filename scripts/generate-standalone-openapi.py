#!/usr/bin/env python3
"""Generate the standalone OpenAPI 3 contract from the legacy CMDB catalog.

The legacy catalog is Swagger 2 plus BlueKing API Gateway extensions.  Those
extensions describe publication to BlueKing, not the CMDB business API, so
this generator keeps only the path/method/operation metadata and emits a
portable OpenAPI 3 document.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/apidoc/apigw/open/bk_apigw_resources_bk-cmdb.yaml"
TARGET = ROOT / "api/openapi.yaml"

METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}
PATH_PARAM = re.compile(r"\{([^{}]+)\}")


def tag_for(operation_id: str | None, path: str) -> str:
    value = f"{operation_id or ''} {path}".lower()
    if any(word in value for word in ("object", "classification", "attribute", "field_template")):
        return "models"
    if any(word in value for word in ("inst", "association", "label")):
        return "instances"
    if any(word in value for word in ("host", "cloudarea", "module")):
        return "hosts"
    if any(word in value for word in ("biz", "business", "set")):
        return "businesses"
    if "proc" in value or "service_template" in value or "service_instance" in value:
        return "processes"
    if "topo" in value:
        return "topology"
    return "system"


def parameter(name: str) -> dict[str, Any]:
    return {
        "name": name,
        "in": "path",
        "required": True,
        "schema": {"type": "string"},
        "description": f"Path parameter: {name}",
    }


def response() -> dict[str, Any]:
    return {
        "description": "CMDB response",
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/CmdbResponse"}
            }
        },
    }


def request_body() -> dict[str, Any]:
    return {
        "required": False,
        "description": "Request payload. Endpoint-specific fields are documented by the corresponding API guide.",
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/JsonObject"}
            }
        },
    }


def main() -> None:
    source = yaml.safe_load(SOURCE.read_text())
    paths: dict[str, Any] = {}

    for path, path_item in source.get("paths", {}).items():
        converted: dict[str, Any] = {}
        names = PATH_PARAM.findall(path)
        for method, operation in path_item.items():
            method = method.lower()
            if method not in METHODS or not isinstance(operation, dict):
                continue
            operation_id = operation.get("operationId")
            item: dict[str, Any] = {
                "operationId": operation_id or f"{method}_{path.strip('/').replace('/', '_')}",
                "summary": operation.get("description") or operation_id or "CMDB API",
                "description": operation.get("description") or "CMDB API endpoint.",
                "tags": [tag_for(operation_id, path)],
                "responses": {"200": response()},
            }
            if names:
                item["parameters"] = [parameter(name) for name in names]
            if method in {"post", "put", "patch", "delete"}:
                item["requestBody"] = request_body()
            converted[method] = item
        if converted:
            paths[path] = converted

    document = {
        "openapi": "3.0.3",
        "info": {
            "title": "CMDB Open API",
            "version": "1.0.0",
            "description": (
                "Independent CMDB compatibility API. The /api/v3 paths are "
                "the existing CMDB business endpoints; BlueKing API Gateway "
                "publication extensions are intentionally excluded."
            ),
        },
        "servers": [{"url": "/", "description": "CMDB deployment"}],
        "tags": [
            {"name": "models", "description": "Model and attribute operations"},
            {"name": "instances", "description": "Instance and association operations"},
            {"name": "hosts", "description": "Host, module and cloud-area operations"},
            {"name": "businesses", "description": "Business and topology operations"},
            {"name": "processes", "description": "Process and service-template operations"},
            {"name": "topology", "description": "Topology queries"},
            {"name": "system", "description": "Other CMDB operations"},
        ],
        "security": [{"apiKey": []}, {"bearerAuth": []}],
        "paths": paths,
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT",
                    "description": "Independent API credential. X-API-Key is supported now; Bearer is accepted as a compatibility alias.",
                },
                "apiKey": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "X-API-Key",
                    "description": "Reserved for the standalone API-key provider rollout.",
                },
            },
            "schemas": {
                "JsonObject": {
                    "type": "object",
                    "additionalProperties": True,
                    "description": "Compatibility payload. Endpoint-specific schemas are tightened incrementally.",
                },
                "CmdbResponse": {
                    "type": "object",
                    "required": ["result", "code", "message"],
                    "properties": {
                        "result": {"type": "boolean"},
                        "code": {"type": "integer"},
                        "message": {"type": "string"},
                        "data": {},
                        "permissions": {"type": "array", "items": {"type": "object"}},
                    },
                    "additionalProperties": True,
                    "description": "Current CMDB response envelope; data is endpoint-specific.",
                },
                "ErrorResponse": {
                    "type": "object",
                    "properties": {
                        "result": {"type": "boolean", "example": False},
                        "code": {"type": "integer"},
                        "message": {"type": "string"},
                    },
                    "additionalProperties": True,
                },
            },
        },
        "x-cmdb-contract": {
            "source": "docs/apidoc/apigw/open/bk_apigw_resources_bk-cmdb.yaml",
            "sourceFormat": "swagger-2.0-blueking-gateway-catalog",
            "pathCount": len(paths),
            "operationCount": sum(len(item) for item in paths.values()),
            "compatibility": "/api/v3 is preserved; use api/changelog.md for changes",
            "schemaPolicy": "compatibility-first; tighten schemas with contract tests",
        },
    }

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(yaml.safe_dump(document, allow_unicode=True, sort_keys=False), encoding="utf-8")
    print(f"generated {TARGET} ({len(paths)} paths, {sum(len(item) for item in paths.values())} operations)")


if __name__ == "__main__":
    main()

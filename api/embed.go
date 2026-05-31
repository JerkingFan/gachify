package api

import _ "embed"

// OpenAPI is the machine-readable API contract (also used for web type generation).
//
//go:embed openapi.yaml
var OpenAPI []byte

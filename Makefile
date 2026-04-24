.PHONY: help go-build go-vet go-test go-check clean

GOCACHE ?= $(HOME)/.cache/go-build
export GOCACHE

help: ## Show this help message
	@echo "Verbal Build System"
	@echo ""
	@echo "Targets:"
	@echo "  go-build  Build all packages"
	@echo "  go-vet    Run go vet on all packages"
	@echo "  go-test   Run all tests"
	@echo "  go-check  Run vet, build, and tests in sequence (CI mode)"
	@echo "  clean     Remove build artifacts"
	@echo ""
	@echo "Environment:"
	@echo "  GOCACHE   Build cache location (default: ~/.cache/go-build)"

go-build: ## Build all packages
	go build ./...

go-vet: ## Run go vet
	go vet ./...

go-test: ## Run all tests
	go test ./... -count=1

go-check: ## Run vet, build, tests in sequence (optimal for CI)
	go vet ./...
	go build ./...
	go test ./... -count=1

clean: ## Remove build artifacts
	rm -f verbal
	go clean -cache
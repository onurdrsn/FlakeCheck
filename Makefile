SHELL := /bin/sh

PNPM ?= pnpm
WRANGLER ?= $(PNPM) exec wrangler
GATEWAY_DIR := services/gateway-service
WORKER_CONFIGS := \
	services/ingestion-service/wrangler.jsonc \
	services/analysis-service/wrangler.jsonc \
	services/quarantine-service/wrangler.jsonc \
	services/gateway-service/wrangler.jsonc


.PHONY: all help install build build-ingestion build-analysis build-quarantine \
	build-gateway build-shared build-pages typecheck test dev dev-pages \
	dev-worker dev-ingestion dev-analysis dev-quarantine deploy deploy-ingestion \
	deploy-analysis deploy-quarantine deploy-gateway dry-run doctor db-generate \
	db-migrate db-push db-seed flakecheck-update flakecheck-build flakecheck-publish clean


help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}'


all: build ## Default target: build all packages and services

install: ## Install repository dependencies with pnpm
	$(PNPM) install

build: ## Build all packages and services
	$(PNPM) run build

build-ingestion: build-shared ## Build ingestion service worker
	$(PNPM) --filter @flakecheck/ingestion-service run build

build-analysis: build-shared ## Build analysis service worker
	$(PNPM) --filter @flakecheck/analysis-service run build

build-quarantine: build-shared ## Build quarantine service worker
	$(PNPM) --filter @flakecheck/quarantine-service run build

build-gateway: build-shared ## Build gateway service worker and client bundle
	$(PNPM) --filter @flakecheck/gateway-service run build

build-shared: ## Build shared-kernel package
	$(PNPM) --filter @flakecheck/shared-kernel run build

build-pages: ## Build gateway frontend single-page application
	$(PNPM) --filter @flakecheck/gateway-service run build:web

typecheck: ## Run TypeScript type checks across all workspaces
	$(PNPM) run typecheck

test: ## Run test suite across all packages and services
	$(PNPM) run test

# Run the dashboard and all four Workers together. Use Ctrl-C to stop them.
dev: ## Run dashboard and all backend workers concurrently in development
	$(MAKE) -j5 dev-pages dev-ingestion dev-analysis dev-quarantine dev-worker

dev-pages: ## Start Vite development server for gateway web UI
	FLAKECHECK_GATEWAY_URL=$${FLAKECHECK_GATEWAY_URL:-http://127.0.0.1:8787} $(PNPM) --filter @flakecheck/gateway-service exec vite --host 0.0.0.0

dev-worker: ## Start gateway Cloudflare worker with Wrangler dev
	$(WRANGLER) dev --config $(GATEWAY_DIR)/wrangler.jsonc --port 8787 --inspector-port 9230

dev-ingestion: ## Start ingestion service worker with Wrangler dev
	$(WRANGLER) dev --config services/ingestion-service/wrangler.jsonc --port 8788 --inspector-port 9231

dev-analysis: ## Start analysis service worker with Wrangler dev
	$(WRANGLER) dev --config services/analysis-service/wrangler.jsonc --port 8789 --inspector-port 9232

dev-quarantine: ## Start quarantine service worker with Wrangler dev
	$(WRANGLER) dev --config services/quarantine-service/wrangler.jsonc --port 8790 --inspector-port 9233

deploy: build deploy-ingestion deploy-analysis deploy-quarantine deploy-gateway ## Deploy all backend services and workers

deploy-ingestion: ## Deploy ingestion service worker to Cloudflare
	$(PNPM) --filter @flakecheck/shared-kernel run build
	$(WRANGLER) deploy --config services/ingestion-service/wrangler.jsonc

deploy-analysis: ## Deploy analysis service worker to Cloudflare
	$(PNPM) --filter @flakecheck/shared-kernel run build
	$(WRANGLER) deploy --config services/analysis-service/wrangler.jsonc

deploy-quarantine: ## Deploy quarantine service worker to Cloudflare
	$(PNPM) --filter @flakecheck/shared-kernel run build
	$(WRANGLER) deploy --config services/quarantine-service/wrangler.jsonc

deploy-gateway: ## Deploy gateway service worker and assets to Cloudflare
	$(PNPM) --filter @flakecheck/shared-kernel run build
	$(WRANGLER) deploy --config $(GATEWAY_DIR)/wrangler.jsonc

dry-run: ## Validate Cloudflare worker deployment configs without deploying
	@set -e; \
	$(PNPM) --filter @flakecheck/shared-kernel run build; \
	for config in $(WORKER_CONFIGS); do \
		echo "==> dry-run: $$config"; \
		$(WRANGLER) deploy --dry-run --config "$$config"; \
	done

doctor: ## Build CLI and run doctor diagnostics against environment
	$(PNPM) --filter @onurdrsn/flakecheck run build
	node ./packages/cli/dist/index.js doctor

db-generate: ## Generate Drizzle database migration files
	$(PNPM) run db:generate

db-migrate: ## Apply database migrations to database
	$(PNPM) run db:migrate

db-push: ## Push schema directly to database (development)
	$(PNPM) run db:push

db-seed: ## Seed database with initial synthetic test data
	$(PNPM) run db:seed

flakecheck-update: ## Bump patch version of @onurdrsn/flakecheck CLI package
	$(PNPM) --filter @onurdrsn/flakecheck exec npm version patch

flakecheck-build: ## Build @onurdrsn/flakecheck CLI package
	$(PNPM) --filter @onurdrsn/flakecheck run build

flakecheck-publish: ## Publish @onurdrsn/flakecheck CLI package to npm registry
	$(PNPM) --filter @onurdrsn/flakecheck publish --access public

clean: ## Clean build artifacts, dist folders, and web bundles
	@set -e; \
	for path in packages/*/dist services/*/dist services/gateway-service/public/assets services/gateway-service/public/index.html; do \
		if [ -e "$$path" ]; then rm -rf "$$path"; fi; \
	done

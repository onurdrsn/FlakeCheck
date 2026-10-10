SHELL := /bin/sh

PNPM ?= pnpm
WRANGLER ?= $(PNPM) exec wrangler
GATEWAY_DIR := services/gateway-service
WORKER_CONFIGS := \
	services/ingestion-service/wrangler.jsonc \
	services/analysis-service/wrangler.jsonc \
	services/quarantine-service/wrangler.jsonc \
	services/gateway-service/wrangler.jsonc


.PHONY: all install build typecheck test clean \
	dev dev-pages dev-worker dev-ingestion dev-analysis dev-quarantine build-pages \
	deploy deploy-ingestion deploy-analysis deploy-quarantine deploy-gateway \
	dry-run doctor db-generate db-migrate db-push db-seed


help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}'


all: build

install:
	$(PNPM) install

build:
	$(PNPM) run build

build-ingestion: build-shared
	$(PNPM) --filter @flakecheck/ingestion-service run build

build-analysis: build-shared
	$(PNPM) --filter @flakecheck/analysis-service run build

build-quarantine: build-shared
	$(PNPM) --filter @flakecheck/quarantine-service run build

build-gateway: build-shared
	$(PNPM) --filter @flakecheck/gateway-service run build

build-shared:
	$(PNPM) --filter @flakecheck/shared-kernel run build

build-pages:
	$(PNPM) --filter @flakecheck/gateway-service run build:web

typecheck:
	$(PNPM) run typecheck

test:
	$(PNPM) run test

# Run the dashboard and all four Workers together. Use Ctrl-C to stop them.
dev:
	$(MAKE) -j5 dev-pages dev-ingestion dev-analysis dev-quarantine dev-worker

dev-pages:
	FLAKECHECK_GATEWAY_URL=$${FLAKECHECK_GATEWAY_URL:-http://127.0.0.1:8787} $(PNPM) --filter @flakecheck/gateway-service exec vite --host 0.0.0.0

dev-worker:
	$(WRANGLER) dev --config $(GATEWAY_DIR)/wrangler.jsonc --port 8787 --inspector-port 9230

dev-ingestion:
	$(WRANGLER) dev --config services/ingestion-service/wrangler.jsonc --port 8788 --inspector-port 9231

dev-analysis:
	$(WRANGLER) dev --config services/analysis-service/wrangler.jsonc --port 8789 --inspector-port 9232

dev-quarantine:
	$(WRANGLER) dev --config services/quarantine-service/wrangler.jsonc --port 8790 --inspector-port 9233

deploy: build deploy-ingestion deploy-analysis deploy-quarantine deploy-gateway

deploy-ingestion:
	$(PNPM) --filter @flakecheck/shared-kernel run build
	$(WRANGLER) deploy --config services/ingestion-service/wrangler.jsonc

deploy-analysis:
	$(PNPM) --filter @flakecheck/shared-kernel run build
	$(WRANGLER) deploy --config services/analysis-service/wrangler.jsonc

deploy-quarantine:
	$(PNPM) --filter @flakecheck/shared-kernel run build
	$(WRANGLER) deploy --config services/quarantine-service/wrangler.jsonc

deploy-gateway:
	$(PNPM) --filter @flakecheck/shared-kernel run build
	$(WRANGLER) deploy --config $(GATEWAY_DIR)/wrangler.jsonc

dry-run:
	@set -e; \
	$(PNPM) --filter @flakecheck/shared-kernel run build; \
	for config in $(WORKER_CONFIGS); do \
		echo "==> dry-run: $$config"; \
		$(WRANGLER) deploy --dry-run --config "$$config"; \
	done

doctor:
	$(PNPM) --filter @onurdrsn/flakecheck run build
	node ./packages/cli/dist/index.js doctor

db-generate:
	$(PNPM) run db:generate

db-migrate:
	$(PNPM) run db:migrate

db-push:
	$(PNPM) run db:push

db-seed:
	$(PNPM) run db:seed

clean:
	@set -e; \
	for path in packages/*/dist services/*/dist services/gateway-service/public/assets services/gateway-service/public/index.html; do \
		if [ -e "$$path" ]; then rm -rf "$$path"; fi; \
	done

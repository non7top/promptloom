# Every target runs in a disposable container — nothing here needs node,
# npm, electron or wine installed on the host. Exporting the host's uid/gid
# is what keeps container-written output (out/, dist/, package-lock.json)
# owned by the invoking user; without it the containers run as root and
# leave files the host user can no longer rewrite.
export DOCKER_UID := $(shell id -u)
export DOCKER_GID := $(shell id -g)

COMPOSE := docker compose

# Which service ordinary commands run in. Locally this is `dev` — the small
# image, which also carries xvfb and Electron's runtime libs for `make
# start`. CI sets SERVICE=win so one image does install, checks, bundle and
# packaging: it saves pulling a second image for steps the Wine image can
# run anyway, and both are node 24. (`?=` defers to the environment, so
# exporting SERVICE is enough — no need to pass it per target.)
SERVICE ?= dev

.PHONY: help image-dev image-win install lint typecheck check build win publish-win start stop destroy

help: ## Show this help
	@grep -hE '^[a-z][a-z-]*:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

image-dev: ## Build the dev image
	$(COMPOSE) build dev

image-win: ## Build the Wine cross-build image
	$(COMPOSE) build win

install: ## Install dependencies into the node_modules volume
	$(COMPOSE) run --rm $(SERVICE) npm ci

lint: ## Run biome
	$(COMPOSE) run --rm $(SERVICE) npm run lint

typecheck: ## Run tsc --noEmit
	$(COMPOSE) run --rm $(SERVICE) npx tsc --noEmit

check: lint typecheck ## Lint and type-check

build: ## Bundle main/preload/renderer into out/
	$(COMPOSE) run --rm $(SERVICE) npm run build

# Depends on build: electron-builder packages whatever is in out/ (see
# `files:` in electron-builder.yml), so packaging a stale bundle is the
# easiest way to ship a change that isn't in the installer.
win: build ## Cross-build the Windows NSIS installer into dist/ (Wine)
	$(COMPOSE) run --rm win npx electron-builder --win --publish never

# CI-only: needs GH_TOKEN in the environment, which is forwarded into the
# container (electron-builder's GitHub publisher reads GH_TOKEN, not
# GITHUB_TOKEN — that was electron-forge's convention).
publish-win: build ## Cross-build the installer and publish it to the GitHub release
	$(COMPOSE) run --rm -e GH_TOKEN -e GITHUB_TOKEN win npx electron-builder --win --publish always

# Always `dev`, never $(SERVICE): the Wine image has no xvfb and none of
# Electron's Chromium runtime libs, so the app can't launch there.
start: ## Run the app (needs an X server on $$DISPLAY)
	$(COMPOSE) run --rm dev npm start

stop: ## Stop and remove the containers
	$(COMPOSE) down

# Keeps nothing: the caches are all rebuildable, just slowly. `make win`
# after this re-downloads the Electron win32 binaries and re-initialises
# the Wine prefix.
destroy: ## Remove containers, locally-built images and cache volumes
	$(COMPOSE) down -v --rmi local

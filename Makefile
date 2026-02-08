.PHONY: build test test-v test-cover lint fmt fmt-check typecheck clean npm-publish docker docker-release docker-buildx-setup docker-login docker-push docker-publish ci release version set-version commit-version tag-version

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

# Docker Hub configuration
DOCKER_REPO ?= portertech/lm-studio-mcp-server
DOCKER_PLATFORMS ?= linux/amd64,linux/arm64
DOCKER_BUILDER ?= lm-studio-mcp-builder

# Build the TypeScript project
build:
	npm run build

# Run all tests
test:
	npm test

# Run tests with verbose output
test-v:
	npx vitest

# Run tests with coverage
test-cover:
	npx vitest run --coverage

# Format code
fmt:
	npx prettier --write .

# Check formatting (fails if not formatted)
fmt-check:
	npx prettier --check .

# Run eslint
lint:
	npm run lint

# Run typecheck
typecheck:
	npm run typecheck

# Clean build artifacts
clean:
	rm -rf dist

# Publish to npm (version must be set before calling this)
npm-publish: build
	echo "Publishing to npm..."
	npm publish --access public

# Build Docker image
docker:
	docker build -t lm-studio-mcp-server:latest .

# Build Docker image with version tag
docker-release:
	docker build -t $(DOCKER_REPO):$(VERSION) -t $(DOCKER_REPO):latest .

# Setup buildx builder for multi-arch builds
docker-buildx-setup:
	@docker buildx inspect $(DOCKER_BUILDER) >/dev/null 2>&1 || \
		docker buildx create --name $(DOCKER_BUILDER) --driver docker-container --bootstrap
	@docker buildx use $(DOCKER_BUILDER)

# Login to Docker Hub (requires DOCKER_USERNAME and DOCKER_PASSWORD env vars)
docker-login:
	@echo "$(DOCKER_PASSWORD)" | docker login -u "$(DOCKER_USERNAME)" --password-stdin

# Build and push multi-arch image to Docker Hub
docker-push: docker-buildx-setup
	docker buildx build \
		--platform $(DOCKER_PLATFORMS) \
		--tag $(DOCKER_REPO):$(VERSION) \
		--tag $(DOCKER_REPO):latest \
		--push .

# Publish to Docker Hub (assumes already logged in, or use docker-login first)
docker-publish: docker-push

# List version
version:
	@echo $(VERSION)

# Run all checks (used in CI)
ci: lint typecheck test

# Set version in package.json
set-version:
	npm pkg set version=$(VERSION)

# Commit the version bump
commit-version: set-version
	git add package.json
	git commit -m "v$(VERSION)"

# Create annotated git tag
tag-version: commit-version
	git tag -a "v$(VERSION)" -m "v$(VERSION)"

# Full release: ci -> set-version -> commit-version -> tag-version -> npm-publish -> docker-publish
release: ci set-version commit-version tag-version npm-publish docker-publish

#!/usr/bin/env bash
set -euo pipefail

# Release script for lm-studio-mcp-server
# Usage: ./scripts/release.sh [patch|minor|major]

BUMP_TYPE="${1:-patch}"
DOCKER_IMAGE="portertech/lm-studio-mcp-server"

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Error: Version bump type must be 'patch', 'minor', or 'major'"
  echo "Usage: ./scripts/release.sh [patch|minor|major]"
  exit 1
fi

echo "==> Running tests..."
npm test

echo "==> Running lint..."
npm run lint

echo "==> Running typecheck..."
npm run typecheck

echo "==> Bumping version ($BUMP_TYPE)..."
npm version "$BUMP_TYPE" --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
echo "    New version: $VERSION"

echo "==> Building npm package..."
npm run build

echo "==> Publishing to npm..."
npm publish --access public

echo "==> Building Docker image..."
docker build -t "$DOCKER_IMAGE:$VERSION" -t "$DOCKER_IMAGE:latest" .

echo "==> Pushing Docker image..."
docker push "$DOCKER_IMAGE:$VERSION"
docker push "$DOCKER_IMAGE:latest"

echo "==> Creating git commit and tag..."
git add package.json package-lock.json
git commit -m "v$VERSION"
git tag "v$VERSION"

echo "==> Release complete!"
echo "    npm: @portertech/lm-studio-mcp-server@$VERSION"
echo "    Docker: $DOCKER_IMAGE:$VERSION"
echo ""
echo "Don't forget to push: git push && git push --tags"

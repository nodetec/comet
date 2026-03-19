#!/usr/bin/env sh
set -eu

notes_path="${RUNNER_TEMP:-/tmp}/comet-release-notes.md"
repo_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}"
current_sha="${GITHUB_SHA}"
short_sha="$(printf '%s' "$current_sha" | cut -c1-7)"
previous_tag="$(git tag --list 'alpha-*' --sort=-creatordate | head -n 1)"

{
  printf 'Automated build from [`%s`](%s/commit/%s).\n' "$short_sha" "$repo_url" "$current_sha"

  if [ -n "$previous_tag" ]; then
    printf '\nPrevious release: [`%s`](%s/releases/tag/%s)\n' "$previous_tag" "$repo_url" "$previous_tag"
    printf 'Compare: [%s...%s](%s/compare/%s...%s)\n' "$previous_tag" "$short_sha" "$repo_url" "$previous_tag" "$current_sha"
  fi

  printf '\n## Changes\n'

  if [ -n "$previous_tag" ]; then
    git log --no-merges --format='%H%x09%h%x09%s' "${previous_tag}..HEAD" \
      | while IFS="$(printf '\t')" read -r full_hash short_hash subject; do
          printf -- '- %s ([`%s`](%s/commit/%s))\n' "$subject" "$short_hash" "$repo_url" "$full_hash"
        done
  else
    printf '%s\n' '- Initial alpha release.'
  fi

  printf '\n'
} > "$notes_path"

printf 'path=%s\n' "$notes_path" >> "$GITHUB_OUTPUT"

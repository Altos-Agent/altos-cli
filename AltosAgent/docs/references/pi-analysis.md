# Reference Analysis: pi

**Generated:** 2026-06-18T20:17:58.227Z
**Repository:** pi

## Quick Summary

| Metric | Score |
|--------|-------|
| Architecture | ★★★★★★★★★★ |
| Plugin System | ★★★★★★★★★★ |
| Tool System | ★★★★★★★★★★ |
| Memory Management | ★★★★★★★★★★ |
| Security | ★★★★★★★★★★ |
| **Overall** | ★★★★★★★★★★ |

## Repository Overview

**Languages:** TypeScript, Markdown, Other, JSON, YAML
**Total Files:** undefined
**Total Lines:** 0

## Directory Structure (Top 20)

```
  ISSUE_TEMPLATE/
  workflows/
  extensions/
  git/
  npm/
  prompts/
  skills/
  agent/
  agent/docs/
  agent/src/
  agent/src/harness/
  agent/src/harness/compaction/
  agent/src/harness/env/
  agent/src/harness/session/
  agent/src/harness/utils/
  agent/test/
  agent/test/harness/
  agent/test/scratch/
  agent/test/utils/
  ai/
```

## Key Files

- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/agent/src/index.ts`
- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/ai/src/index.ts`
- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/ai/src/utils/oauth/index.ts`
- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/coding-agent/examples/extensions/custom-provider-anthropic/index.ts`
- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/coding-agent/examples/extensions/custom-provider-gitlab-duo/index.ts`
- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/coding-agent/examples/extensions/doom-overlay/index.ts`
- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/coding-agent/examples/extensions/dynamic-resources/index.ts`
- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/coding-agent/examples/extensions/gondolin/index.ts`
- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/coding-agent/examples/extensions/plan-mode/index.ts`
- `/home/oguz/Masaüstü/AltosAgent/repository_reference/pi/packages/coding-agent/examples/extensions/sandbox/index.ts`

## Detected Patterns

### CLI Patterns

- CLI-related: src/cli.ts
- CLI-related: bun/cli.ts
- CLI-related: cli/args.ts
- CLI-related: cli/config-selector.ts
- CLI-related: cli/file-processor.ts
- CLI-related: cli/initial-message.ts
- CLI-related: cli/list-models.ts
- CLI-related: cli/project-trust.ts
- CLI-related: cli/session-picker.ts
- CLI-related: cli/startup-ui.ts
- CLI-related: rpc/rpc-client.ts
- CLI-related: src/package-manager-cli.ts
- CLI-related: utils/clipboard-image.ts
- CLI-related: utils/clipboard-native.ts
- CLI-related: utils/clipboard.ts
- CLI-related: test/clipboard-image-bmp-conversion.test.ts
- CLI-related: test/clipboard-image.test.ts
- CLI-related: test/clipboard-native.test.ts
- CLI-related: test/clipboard.test.ts
- CLI-related: test/rpc-client-clone.test.ts
- CLI-related: test/rpc-client-process-exit.test.ts

### Plugin/Extension Patterns

- Plugin/Extension: extensions/prompt-url-widget.ts
- Plugin/Extension: extensions/redraws.ts
- Plugin/Extension: extensions/tps.ts
- Plugin/Extension: docs/hooks.md
- Plugin/Extension: images/register-builtins.ts
- Plugin/Extension: providers/register-builtins.ts
- Plugin/Extension: test/bedrock-thinking-payload.test.ts
- Plugin/Extension: test/lazy-module-load.test.ts
- Plugin/Extension: test/openai-codex-cache-affinity-e2e.test.ts
- Plugin/Extension: test/openai-responses-cache-affinity-e2e.test.ts
- Plugin/Extension: docs/extensions.md
- Plugin/Extension: images/doom-extension.png
- Plugin/Extension: extensions/README.md
- Plugin/Extension: extensions/auto-commit-on-exit.ts
- Plugin/Extension: extensions/bash-spawn-hook.ts
- Plugin/Extension: extensions/bookmark.ts
- Plugin/Extension: extensions/border-status-editor.ts
- Plugin/Extension: extensions/built-in-tool-renderer.ts
- Plugin/Extension: extensions/claude-rules.ts
- Plugin/Extension: extensions/commands.ts
- Plugin/Extension: extensions/confirm-destructive.ts
- Plugin/Extension: extensions/custom-compaction.ts
- Plugin/Extension: extensions/custom-footer.ts
- Plugin/Extension: extensions/custom-header.ts
- Plugin/Extension: custom-provider-anthropic/.gitignore
- Plugin/Extension: custom-provider-anthropic/index.ts
- Plugin/Extension: custom-provider-anthropic/package-lock.json
- Plugin/Extension: custom-provider-anthropic/package.json
- Plugin/Extension: custom-provider-gitlab-duo/.gitignore
- Plugin/Extension: custom-provider-gitlab-duo/index.ts
- Plugin/Extension: custom-provider-gitlab-duo/package.json
- Plugin/Extension: custom-provider-gitlab-duo/test.ts
- Plugin/Extension: extensions/dirty-repo-guard.ts
- Plugin/Extension: doom-overlay/.gitignore
- Plugin/Extension: doom-overlay/README.md
- Plugin/Extension: doom-overlay/doom-component.ts
- Plugin/Extension: doom-overlay/doom-engine.ts
- Plugin/Extension: doom-overlay/doom-keys.ts
- Plugin/Extension: doom-overlay/index.ts
- Plugin/Extension: doom-overlay/wad-finder.ts
- Plugin/Extension: dynamic-resources/SKILL.md
- Plugin/Extension: dynamic-resources/dynamic.json
- Plugin/Extension: dynamic-resources/dynamic.md
- Plugin/Extension: dynamic-resources/index.ts
- Plugin/Extension: extensions/dynamic-tools.ts
- Plugin/Extension: extensions/event-bus.ts
- Plugin/Extension: extensions/file-trigger.ts
- Plugin/Extension: extensions/git-checkpoint.ts
- Plugin/Extension: extensions/git-merge-and-resolve.ts
- Plugin/Extension: extensions/github-issue-autocomplete.ts
- Plugin/Extension: gondolin/.gitignore
- Plugin/Extension: gondolin/index.ts
- Plugin/Extension: gondolin/package-lock.json
- Plugin/Extension: gondolin/package.json
- Plugin/Extension: extensions/handoff.ts
- Plugin/Extension: extensions/hello.ts
- Plugin/Extension: extensions/hidden-thinking-label.ts
- Plugin/Extension: extensions/inline-bash.ts
- Plugin/Extension: extensions/input-transform-streaming.ts
- Plugin/Extension: extensions/input-transform.ts
- Plugin/Extension: extensions/interactive-shell.ts
- Plugin/Extension: extensions/mac-system-theme.ts
- Plugin/Extension: extensions/message-renderer.ts
- Plugin/Extension: extensions/minimal-mode.ts
- Plugin/Extension: extensions/modal-editor.ts
- Plugin/Extension: extensions/model-status.ts
- Plugin/Extension: extensions/notify.ts
- Plugin/Extension: extensions/overlay-qa-tests.ts
- Plugin/Extension: extensions/overlay-test.ts
- Plugin/Extension: extensions/permission-gate.ts
- Plugin/Extension: extensions/pirate.ts
- Plugin/Extension: plan-mode/README.md
- Plugin/Extension: plan-mode/index.ts
- Plugin/Extension: plan-mode/utils.ts
- Plugin/Extension: extensions/preset.ts
- Plugin/Extension: extensions/project-trust.ts
- Plugin/Extension: extensions/prompt-customizer.ts
- Plugin/Extension: extensions/protected-paths.ts
- Plugin/Extension: extensions/provider-payload.ts
- Plugin/Extension: extensions/qna.ts
- Plugin/Extension: extensions/question.ts
- Plugin/Extension: extensions/questionnaire.ts
- Plugin/Extension: extensions/rainbow-editor.ts
- Plugin/Extension: extensions/reload-runtime.ts
- Plugin/Extension: extensions/rpc-demo.ts
- Plugin/Extension: sandbox/.gitignore
- Plugin/Extension: sandbox/index.ts
- Plugin/Extension: sandbox/package-lock.json
- Plugin/Extension: sandbox/package.json
- Plugin/Extension: extensions/send-user-message.ts
- Plugin/Extension: extensions/session-name.ts
- Plugin/Extension: extensions/shutdown-command.ts
- Plugin/Extension: extensions/snake.ts
- Plugin/Extension: extensions/space-invaders.ts
- Plugin/Extension: extensions/ssh.ts
- Plugin/Extension: extensions/status-line.ts
- Plugin/Extension: extensions/structured-output.ts
- Plugin/Extension: subagent/README.md
- Plugin/Extension: subagent/agents.ts
- Plugin/Extension: subagent/index.ts
- Plugin/Extension: extensions/summarize.ts
- Plugin/Extension: extensions/system-prompt-header.ts
- Plugin/Extension: extensions/tic-tac-toe.ts
- Plugin/Extension: extensions/timed-confirm.ts
- Plugin/Extension: extensions/titlebar-spinner.ts
- Plugin/Extension: extensions/todo.ts
- Plugin/Extension: extensions/tool-override.ts
- Plugin/Extension: extensions/tools.ts
- Plugin/Extension: extensions/trigger-compact.ts
- Plugin/Extension: extensions/truncated-tool.ts
- Plugin/Extension: extensions/widget-placement.ts
- Plugin/Extension: with-deps/.gitignore
- Plugin/Extension: with-deps/index.ts
- Plugin/Extension: with-deps/package-lock.json
- Plugin/Extension: with-deps/package.json
- Plugin/Extension: extensions/working-indicator.ts
- Plugin/Extension: extensions/working-message-test.ts
- Plugin/Extension: examples/rpc-extension-ui.ts
- Plugin/Extension: sdk/06-extensions.ts
- Plugin/Extension: bun/register-bedrock.ts
- Plugin/Extension: cli/initial-message.ts
- Plugin/Extension: extensions/index.ts
- Plugin/Extension: extensions/loader.ts
- Plugin/Extension: extensions/runner.ts
- Plugin/Extension: extensions/types.ts
- Plugin/Extension: extensions/wrapper.ts
- Plugin/Extension: core/resource-loader.ts
- Plugin/Extension: tools/tool-definition-wrapper.ts
- Plugin/Extension: test/compaction-extensions-example.test.ts
- Plugin/Extension: test/compaction-extensions.test.ts
- Plugin/Extension: test/extensions-discovery.test.ts
- Plugin/Extension: test/extensions-input-event.test.ts
- Plugin/Extension: test/extensions-runner.test.ts
- Plugin/Extension: test/git-merge-and-resolve-extension.test.ts
- Plugin/Extension: test/initial-message.test.ts
- Plugin/Extension: test/resource-loader.test.ts
- Plugin/Extension: suite/agent-session-model-extension.test.ts
- Plugin/Extension: regressions/2753-reload-stale-resource-settings.test.ts
- Plugin/Extension: regressions/2835-tools-allowlist-filters-extension-tools.test.ts
- Plugin/Extension: regressions/3592-no-builtin-tools-keeps-extension-tools.test.ts
- Plugin/Extension: regressions/3616-settings-inmemory-reload.test.ts
- Plugin/Extension: regressions/5080-signal-shutdown-extension-cleanup.test.ts
- Plugin/Extension: regressions/5433-extension-oauth-prompt-input.test.ts
- Plugin/Extension: test/trigger-compact-extension.test.ts
- Plugin/Extension: components/cancellable-loader.ts
- Plugin/Extension: components/loader.ts

### Memory/State Patterns

- Memory/State: session/jsonl-repo.ts
- Memory/State: session/jsonl-storage.ts
- Memory/State: session/memory-repo.ts
- Memory/State: session/memory-storage.ts
- Memory/State: session/repo-utils.ts
- Memory/State: session/session.ts
- Memory/State: session/uuid.ts
- Memory/State: harness/session-test-utils.ts
- Memory/State: harness/session-uuid.test.ts
- Memory/State: harness/session.test.ts
- Memory/State: providers/openai-prompt-cache.ts
- Memory/State: src/session-resources.ts
- Memory/State: test/anthropic-cache-write-1h-cost.test.ts
- Memory/State: test/anthropic-long-cache-retention-e2e.test.ts
- Memory/State: test/cache-retention.test.ts
- Memory/State: test/codex-websocket-cached-probe.ts
- Memory/State: test/context-overflow.test.ts
- Memory/State: test/openai-codex-cache-affinity-e2e.test.ts
- Memory/State: test/openai-completions-cache-control-format.test.ts
- Memory/State: test/openai-completions-prompt-cache.test.ts
- Memory/State: test/openai-responses-cache-affinity-e2e.test.ts
- Memory/State: test/openrouter-cache-write-repro.test.ts
- Memory/State: docs/session-format.md
- Memory/State: docs/sessions.md
- Memory/State: extensions/session-name.ts
- Memory/State: sdk/07-context-files.ts
- Memory/State: sdk/11-sessions.ts
- Memory/State: sdk/13-session-runtime.ts
- Memory/State: scripts/migrate-sessions.sh
- Memory/State: bun/restore-sandbox-env.ts
- Memory/State: cli/session-picker.ts
- Memory/State: core/agent-session-runtime.ts
- Memory/State: core/agent-session-services.ts
- Memory/State: core/agent-session.ts
- Memory/State: core/session-cwd.ts
- Memory/State: core/session-manager.ts
- Memory/State: test/agent-session-auto-compaction-queue.test.ts
- Memory/State: test/agent-session-branching.test.ts
- Memory/State: test/agent-session-compaction.test.ts
- Memory/State: test/agent-session-concurrent.test.ts
- Memory/State: test/agent-session-dynamic-provider.test.ts
- Memory/State: test/agent-session-dynamic-tools.test.ts
- Memory/State: test/agent-session-retry.test.ts
- Memory/State: test/agent-session-runtime-events.test.ts
- Memory/State: test/agent-session-stats.test.ts
- Memory/State: test/agent-session-tree-navigation.test.ts
- Memory/State: fixtures/large-session.jsonl
- Memory/State: test/restore-sandbox-env.test.ts
- Memory/State: test/sdk-codex-cache-probe-tool-loop.ts
- Memory/State: test/sdk-session-manager.test.ts
- Memory/State: test/session-cwd.test.ts
- Memory/State: test/session-id-readonly.test.ts
- Memory/State: test/session-info-modified-timestamp.test.ts
- Memory/State: session-manager/build-context.test.ts
- Memory/State: session-manager/custom-session-id.test.ts
- Memory/State: session-manager/file-operations.test.ts
- Memory/State: session-manager/labels.test.ts
- Memory/State: session-manager/migration.test.ts
- Memory/State: session-manager/save-entry.test.ts
- Memory/State: session-manager/tree-traversal.test.ts
- Memory/State: test/session-selector-path-delete.test.ts
- Memory/State: test/session-selector-rename.test.ts
- Memory/State: test/session-selector-search.test.ts
- Memory/State: test/startup-session-name.test.ts
- Memory/State: suite/agent-session-bash-persistence.test.ts
- Memory/State: suite/agent-session-compaction.test.ts
- Memory/State: suite/agent-session-model-extension.test.ts
- Memory/State: suite/agent-session-prompt.test.ts
- Memory/State: suite/agent-session-queue.test.ts
- Memory/State: suite/agent-session-retry-events.test.ts
- Memory/State: suite/agent-session-runtime.test.ts
- Memory/State: regressions/1717-2113-agent-session-event-settlement.test.ts
- Memory/State: regressions/2860-replaced-session-context.test.ts
- Memory/State: regressions/3616-settings-inmemory-reload.test.ts
- Memory/State: regressions/3686-session-name-event.test.ts
- Memory/State: scripts/session-context-stats.mjs
- Memory/State: scripts/session-transcripts.ts

### Tool/Executor Patterns

- Tool/Executor: git/.gitignore
- Tool/Executor: utils/shell-output.ts
- Tool/Executor: test/anthropic-eager-tool-input-compat.test.ts
- Tool/Executor: test/anthropic-eager-tool-input-e2e.test.ts
- Tool/Executor: test/anthropic-tool-name-normalization.test.ts
- Tool/Executor: test/google-shared-convert-tools.test.ts
- Tool/Executor: test/google-shared-gemini3-unsigned-tool-call.test.ts
- Tool/Executor: test/google-shared-image-tool-result-routing.test.ts
- Tool/Executor: test/image-tool-result.test.ts
- Tool/Executor: test/mistral-tool-schema.test.ts
- Tool/Executor: test/openai-completions-empty-tools.test.ts
- Tool/Executor: test/openai-completions-tool-choice.test.ts
- Tool/Executor: test/openai-completions-tool-result-images.test.ts
- Tool/Executor: test/openai-responses-foreign-toolcall-id.test.ts
- Tool/Executor: test/openai-responses-tool-result-images.test.ts
- Tool/Executor: test/tool-call-id-normalization.test.ts
- Tool/Executor: test/tool-call-without-result.test.ts
- Tool/Executor: docs/shell-aliases.md
- Tool/Executor: extensions/bash-spawn-hook.ts
- Tool/Executor: extensions/built-in-tool-renderer.ts
- Tool/Executor: extensions/dynamic-tools.ts
- Tool/Executor: extensions/inline-bash.ts
- Tool/Executor: extensions/interactive-shell.ts
- Tool/Executor: extensions/tool-override.ts
- Tool/Executor: extensions/tools.ts
- Tool/Executor: extensions/truncated-tool.ts
- Tool/Executor: sdk/05-tools.ts
- Tool/Executor: core/bash-executor.ts
- Tool/Executor: core/exec.ts
- Tool/Executor: export-html/tool-renderer.ts
- Tool/Executor: extensions/runner.ts
- Tool/Executor: tools/bash.ts
- Tool/Executor: tools/edit-diff.ts
- Tool/Executor: tools/edit.ts
- Tool/Executor: tools/file-mutation-queue.ts
- Tool/Executor: tools/find.ts
- Tool/Executor: tools/grep.ts
- Tool/Executor: tools/index.ts
- Tool/Executor: tools/ls.ts
- Tool/Executor: tools/output-accumulator.ts
- Tool/Executor: tools/path-utils.ts
- Tool/Executor: tools/read.ts
- Tool/Executor: tools/render-utils.ts
- Tool/Executor: tools/tool-definition-wrapper.ts
- Tool/Executor: tools/truncate.ts
- Tool/Executor: tools/write.ts
- Tool/Executor: utils/shell.ts
- Tool/Executor: utils/tools-manager.ts
- Tool/Executor: test/agent-session-dynamic-tools.test.ts
- Tool/Executor: test/bash-close-hang-windows.test.ts
- Tool/Executor: test/bash-execution-width.test.ts
- Tool/Executor: test/edit-tool-legacy-input.test.ts
- Tool/Executor: test/edit-tool-no-full-redraw.test.ts
- Tool/Executor: test/extensions-runner.test.ts
- Tool/Executor: test/sdk-codex-cache-probe-tool-loop.ts
- Tool/Executor: suite/agent-session-bash-persistence.test.ts
- Tool/Executor: regressions/2835-tools-allowlist-filters-extension-tools.test.ts
- Tool/Executor: regressions/3302-find-path-glob.test.ts
- Tool/Executor: regressions/3592-no-builtin-tools-keeps-extension-tools.test.ts
- Tool/Executor: regressions/4167-thinking-toggle-pending-tool-render.test.ts
- Tool/Executor: regressions/5109-exclude-tools.test.ts
- Tool/Executor: regressions/5208-late-bash-output.test.ts
- Tool/Executor: regressions/5303-bash-output-truncation.test.ts
- Tool/Executor: test/tool-execution-component.test.ts
- Tool/Executor: test/tools.test.ts
- Tool/Executor: scripts/edit-tool-stats.mjs
- Tool/Executor: scripts/read-tool-stats.mjs
- Tool/Executor: scripts/tool-stats.ts

### Configuration Patterns

- Config/Options: ISSUE_TEMPLATE/config.yml
- Config/Options: agent/tsconfig.build.json
- Config/Options: agent/vitest.config.ts
- Config/Options: agent/vitest.harness.config.ts
- Config/Options: providers/simple-options.ts
- Config/Options: test/mistral-tool-schema.test.ts
- Config/Options: ai/tsconfig.build.json
- Config/Options: ai/vitest.config.ts
- Config/Options: docs/settings.md
- Config/Options: sdk/10-settings.ts
- Config/Options: cli/config-selector.ts
- Config/Options: src/config.ts
- Config/Options: core/defaults.ts
- Config/Options: core/resolve-config-value.ts
- Config/Options: core/settings-manager.ts
- Config/Options: test/config-value-migration.test.ts
- Config/Options: test/config.test.ts
- Config/Options: test/sdk-stream-options.test.ts
- Config/Options: test/settings-manager-bug.test.ts
- Config/Options: test/settings-manager.test.ts
- Config/Options: regressions/2753-reload-stale-resource-settings.test.ts
- Config/Options: regressions/3616-settings-inmemory-reload.test.ts
- Config/Options: coding-agent/tsconfig.build.json
- Config/Options: coding-agent/tsconfig.examples.json
- Config/Options: coding-agent/vitest.config.ts
- Config/Options: components/settings-list.ts
- Config/Options: test/overlay-options.test.ts
- Config/Options: tui/tsconfig.build.json
- Config/Options: tui/vitest.config.ts
- Config/Options: pi/tsconfig.base.json
- Config/Options: pi/tsconfig.json

## What Altos Should Learn

- Clean separation of concerns between packages
- Plugin lifecycle management (init/dispose)
- Tool interface design patterns
- Configuration schema validation
- Error handling and logging strategies
- Skill system architecture and trigger patterns
- TUI component composition patterns
- MCP tool integration patterns
- Theme system for terminal UI

## What Altos Must NOT Copy Directly

- Direct code copying without license review
- Copying proprietary algorithms
- Replicating file structures without adaptation
- Using copyrighted variable/function names

## Notes

_No additional notes_

---

*Analysis generated automatically. Always verify findings manually.*
*See [ADR-0004](../adr/0004-repository-reference-policy.md) for reference policies.*
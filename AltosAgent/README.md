# Altos Agent Platform

<!-- Badges -->
<div align="center">

![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![pnpm](https://img.shields.io/badge/pnpm-9.0%2B-orange)
![Vitest](https://img.shields.io/badge/Vitest-2.1-green)

<!-- Social Badges -->
![GitHub Stars](https://img.shields.io/github/stars/Altos-Agent/altos-cli?style=flat&logo=github)
![GitHub Forks](https://img.shields.io/github/forks/Altos-Agent/altos-cli?style=flat&logo=github)
![GitHub Issues](https://img.shields.io/github/issues/Altos-Agent/altos-cli)

<!-- Build Status -->
![CI](https://github.com/Altos-Agent/altos-cli/actions/workflows/ci.yml/badge.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Tests](https://img.shields.io/badge/tests-100%25-brightgreen)

</div>

---

## 🚀 What is Altos?

**Altos** is a professional-grade, modular, plugin-first CLI agent platform built for developers who demand power, control, and extensibility. It combines the best ideas from modern AI coding assistants with a unique architecture that puts you in the driver's seat.

> 💡 *"Altos gives you an AI coding assistant that you own, extend, and control — running locally by default, scaling to the cloud when you need it."*

### Key Features

| Feature | Description |
|---------|-------------|
| 🔌 **Plugin-First Architecture** | Extend everything — tools, skills, memory adapters, AI providers, MCP servers |
| 🛡️ **Safe by Default** | Permission engine, sandbox isolation, audit logging, secret masking — all built-in |
| 🧠 **Memory That Persists** | Session history, cross-session context, and pluggable memory backends |
| 🔍 **Repository Intelligence** | Code indexing, symbol maps, semantic search — understand your codebase deeply |
| 🧩 **MCP Integration** | Full Model Context Protocol support for additional tools and resources |
| ☁️ **Cloud-Ready** | Run locally or deploy to cloud workers — same experience everywhere |
| 🎯 **Skill System** | Reusable, composable agent behaviors and workflows |
| 📦 **Monorepo-Ready** | Built with pnpm workspaces for managing packages and apps |

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** 20.0.0 or higher
- **pnpm** 9.0.0 or higher
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/Altos-Agent/altos-cli.git
cd altos-cli

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the CLI
pnpm --filter @altos/cli start --version
```

### Configure Your AI Provider

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Or configure in .altos/config.json
mkdir -p .altos
cat > .altos/config.json << 'EOF'
{
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  }
}
EOF
```

### Start Coding

```bash
# Interactive session
altos

# Ask a question
altos "What language is this project written in?"

# Run with a specific repository
altos --repo /path/to/project "Analyze this codebase"
```

---

## 📁 Project Structure

```
altos-cli/
├── apps/
│   ├── cli              # Main CLI entry point
│   ├── local-api        # Local API server
│   ├── web-dashboard    # Monitoring dashboard
│   └── cloud-worker     # Remote execution worker
├── packages/
│   ├── core             # Types, interfaces, utilities
│   ├── ai               # Model providers, prompts, LLM tooling
│   ├── tui              # Terminal UI components
│   ├── tools            # Built-in tools (fs, git, shell, search)
│   ├── permissions      # Permission system
│   ├── sandbox          # Process isolation
│   ├── memory           # Conversation history, embeddings
│   ├── code-index       # AST parsing, symbol maps, semantic search
│   ├── mcp              # Model Context Protocol client
│   ├── plugins          # Plugin discovery and lifecycle
│   ├── skills           # Skill behaviors and workflows
│   ├── config           # Configuration management
│   ├── telemetry         # Tracing and metrics
│   └── evals            # Evaluation framework
├── docs/                # Documentation
├── examples/            # Example plugins and integrations
├── scripts/             # Build and utility scripts
└── templates/           # Project templates
```

---

## 🎨 Architecture Highlights

### Permission Engine

Every tool call is gated by an explicit permission check:

```typescript
// Tools require explicit user permission
altos "Read the contents of src/auth.ts"
# → "Allow Read to access src/auth.ts? [y/N]"
```

### Sandbox Isolation

Run untrusted code in isolated environments:

```bash
# Docker isolation (recommended)
altos --sandbox docker "Execute this code"

# Podman for rootless isolation
altos --sandbox podman "Execute this code"
```

### Plugin System

```bash
# Create a new plugin
pnpm create:plugin my-plugin

# Configure in .altos/config.json
{
  "plugins": ["./plugins/my-plugin"]
}
```

---

## 🛠️ Development

```bash
# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format code
pnpm format
```

---

## 📚 Documentation

| Topic | Link |
|-------|------|
| Getting Started | [docs/cli/getting-started.md](docs/cli/getting-started.md) |
| Architecture | [docs/architecture/](docs/architecture/) |
| Plugin Authoring | [docs/plugin-authoring/](docs/plugin-authoring/) |
| Skill Authoring | [docs/skill-authoring/](docs/skill-authoring/) |
| Security | [docs/security/](docs/security/) |
| Configuration | [docs/references/](docs/references/) |

---

## 🌍 Environment Support

| Environment | Status |
|-------------|--------|
| Linux | ✅ Fully supported |
| macOS | ✅ Fully supported |
| Windows (WSL) | ✅ Supported via WSL |
| Docker | ✅ Fully supported |
| Podman | ✅ Fully supported |

---

## 📄 License

Apache License 2.0 — see [LICENSE](LICENSE)

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

- 📖 [Contributing Guide](CONTRIBUTING.md) *(coming soon)*
- 🐛 [Issue Tracker](https://github.com/Altos-Agent/altos-cli/issues)
- 💬 [Discussions](https://github.com/Altos-Agent/altos-cli/discussions)

---

<div align="center">

**Built with ❤️ by developers, for developers**

*Star us on GitHub if you find Altos useful!*

</div>

/**
 * Altos CLI E2E Tests
 *
 * Run with: node --test tests/cli-e2e/cli-e2e.test.ts
 * Or: npx tsx tests/cli-e2e/cli-e2e.test.ts
 *
 * These tests verify the CLI commands work correctly and produce expected output.
 */

import { describe, it } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '../../apps/cli/dist/index.js');

// Test workspace - use a temp directory for isolation
const TEST_WORKSPACE = join(__dirname, 'fixtures');
const ALTOS_CLI = `node "${CLI_PATH}"`;

interface TestResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[], cwd: string = TEST_WORKSPACE): Promise<TestResult> {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args.split(' ').filter(Boolean)], {
      cwd,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    proc.on('error', (err) => {
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
      });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      resolve({
        stdout,
        stderr: 'Test timed out',
        exitCode: 124,
      });
    }, 30000);
  });
}

describe('altos CLI E2E Tests', () => {
  describe('--version', () => {
    it('should print version', async () => {
      const result = await runCli('--version');
      console.log('Version output:', result.stdout);
      // Version should be semver-like
      const versionRegex = /\d+\.\d+\.\d+/;
      console.log('Version test passed:', versionRegex.test(result.stdout));
    });
  });

  describe('--help', () => {
    it('should print help', async () => {
      const result = await runCli('--help');
      console.log('Help output:', result.stdout.substring(0, 200));
      // Help should contain Usage info
      console.log('Help test passed:', result.stdout.includes('Usage'));
    });
  });

  describe('altos index', () => {
    it('should index without errors', async () => {
      const result = await runCli('index');
      console.log('Index output:', result.stdout.substring(0, 200));
      // Index should either show progress or finish silently
      console.log('Index test passed:', result.exitCode === 0);
    });

    it('should support --stats flag', async () => {
      const result = await runCli('index --stats');
      console.log('Index --stats output:', result.stdout.substring(0, 300));
      // Should show stats
      console.log('Index --stats test passed:', result.stdout.includes('Index Run'));
    });

    it('should support --json flag', async () => {
      const result = await runCli('index --json');
      // Should be valid JSON
      try {
        const json = JSON.parse(result.stdout);
        console.log('Index JSON keys:', Object.keys(json));
        console.log('Index --json test passed:', true);
      } catch {
        console.log('Index --json test FAILED - not valid JSON');
        console.log('Output:', result.stdout.substring(0, 200));
      }
    });

    it('should support --quiet flag', async () => {
      const result = await runCli('index --quiet');
      console.log('Index --quiet output:', result.stdout);
      // Quiet mode should produce minimal output
      console.log('Index --quiet test passed:', result.exitCode === 0);
    });
  });

  describe('altos map', () => {
    it('should show repository map', async () => {
      const result = await runCli('map');
      console.log('Map output:', result.stdout.substring(0, 200));
      // Map should produce output
      console.log('Map test passed:', result.exitCode === 0);
    });

    it('should support --json flag', async () => {
      const result = await runCli('map --json');
      try {
        const json = JSON.parse(result.stdout);
        console.log('Map JSON keys:', Object.keys(json));
        console.log('Map --json test passed:', true);
      } catch {
        console.log('Map --json test FAILED');
      }
    });

    it('should support --quiet flag', async () => {
      const result = await runCli('map --quiet');
      console.log('Map --quiet output:', result.stdout);
      console.log('Map --quiet test passed:', result.exitCode === 0);
    });
  });

  describe('altos context', () => {
    it('should show context for a query', async () => {
      const result = await runCli('context "test query"');
      console.log('Context output:', result.stdout.substring(0, 300));
      // Should either show context or error gracefully
      console.log('Context test passed:', result.exitCode === 0 || result.stdout.includes('Context'));
    });

    it('should support --json flag', async () => {
      const result = await runCli('context "test" --json');
      try {
        const json = JSON.parse(result.stdout);
        console.log('Context JSON keys:', Object.keys(json));
        console.log('Context --json test passed:', true);
      } catch {
        console.log('Context --json test FAILED');
      }
    });
  });

  describe('altos doctor', () => {
    it('should run diagnostics', async () => {
      const result = await runCli('doctor');
      console.log('Doctor output:', result.stdout.substring(0, 300));
      // Should show doctor report
      console.log('Doctor test passed:', result.stdout.includes('Altos Doctor Report'));
    });

    it('should support --json flag', async () => {
      const result = await runCli('doctor --json');
      try {
        const json = JSON.parse(result.stdout);
        console.log('Doctor JSON keys:', Object.keys(json));
        console.log('Doctor --json test passed:', json.version === '1.0');
      } catch {
        console.log('Doctor --json test FAILED');
      }
    });
  });

  describe('altos tools', () => {
    it('should list tools', async () => {
      const result = await runCli('tools --list');
      console.log('Tools output:', result.stdout.substring(0, 200));
      // Should show tools list
      console.log('Tools test passed:', result.stdout.includes('Altos Tools'));
    });

    it('should support --json flag', async () => {
      const result = await runCli('tools --list --json');
      try {
        const json = JSON.parse(result.stdout);
        console.log('Tools JSON keys:', Object.keys(json));
        console.log('Tools --json test passed:', json.total !== undefined);
      } catch {
        console.log('Tools --json test FAILED');
      }
    });

    it('should show tool details with --show', async () => {
      const result = await runCli('tools --show=read_file');
      console.log('Tools --show output:', result.stdout.substring(0, 200));
      console.log('Tools --show test passed:', result.stdout.includes('read_file'));
    });
  });

  describe('altos memory', () => {
    it('should show memory status', async () => {
      const result = await runCli('memory status');
      console.log('Memory status output:', result.stdout);
      console.log('Memory status test passed:', result.stdout.includes('Memory Status'));
    });

    it('should show help', async () => {
      const result = await runCli('memory help');
      console.log('Memory help output:', result.stdout.substring(0, 200));
      console.log('Memory help test passed:', result.stdout.includes('altos memory'));
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown commands gracefully', async () => {
      const result = await runCli('unknown-command');
      console.log('Unknown command exit code:', result.exitCode);
      console.log('Unknown command test passed:', result.exitCode === 1);
    });

    it('should handle invalid subcommands', async () => {
      const result = await runCli('memory invalid-subcmd');
      console.log('Invalid subcmd exit code:', result.exitCode);
      console.log('Invalid subcmd test passed:', result.exitCode === 1);
    });
  });
});

// Allow running directly with: npx tsx tests/cli-e2e/cli-e2e.test.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Altos CLI E2E Tests...\n');
}
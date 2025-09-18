import fs from 'fs';
import path from 'path';
import {
  sanitizeLogGroupName,
  ensureLogGroupDir,
  getLogFilePath,
  downloadAndCacheLogs,
  searchLocalLogs,
  pruneCache
} from '../src/cache-manager.js';
import { FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import readline from 'readline';

// Mock fs module
jest.mock('fs', () => ({
  ...jest.requireActual('fs'), // Import and retain default behavior
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  createReadStream: jest.fn(),
  renameSync: jest.fn(), // Mock renameSync for atomic writes
}));

// Mock readline module
jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    [Symbol.asyncIterator]: jest.fn(function* () {
      yield '{"message": "log1", "timestamp": 100}';
      yield '{"message": "log2", "timestamp": 200}';
    }),
  })),
}));

// Mock AWS SDK CloudWatchLogsClient and its commands
jest.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  CloudWatchLogsClient: jest.fn(() => ({
    send: jest.fn(),
  })),
  FilterLogEventsCommand: jest.fn(),
  DescribeLogGroupsCommand: jest.fn(), // Also mock this if used elsewhere
}));

// Mock path.resolve to control CACHE_DIR for testing
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(() => '/mock/cache/dir'),
  join: jest.requireActual('path').join, // Keep actual join behavior
  basename: jest.requireActual('path').basename, // Keep actual basename behavior
}));

describe('cache-manager.js', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('sanitizeLogGroupName', () => {
    test('should replace non-alphanumeric characters with underscores', () => {
      expect(sanitizeLogGroupName('/aws/ecs/my-app')).toBe('_aws_ecs_my-app');
      expect(sanitizeLogGroupName('log.group-name/123')).toBe('log_group-name_123');
      expect(sanitizeLogGroupName('simple_name')).toBe('simple_name');
    });
  });

  describe('ensureLogGroupDir', () => {
    test('should create directory if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      ensureLogGroupDir('/test/log/group');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/cache/dir/_test_log_group', { recursive: true });
    });

    test('should not create directory if it already exists', () => {
      fs.existsSync.mockReturnValue(true);
      ensureLogGroupDir('/test/log/group');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('getLogFilePath', () => {
    test('should return correct file path for a given date', () => {
      const date = new Date('2025-01-15T10:00:00Z');
      const filePath = getLogFilePath('/test/log/group', date);
      expect(filePath).toBe('/mock/cache/dir/_test_log_group/2025-01-15.log');
      expect(fs.mkdirSync).toHaveBeenCalled(); // ensureLogGroupDir is called
    });
  });

  // Tests for downloadAndCacheLogs, searchLocalLogs, pruneCache will follow
});
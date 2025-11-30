#!/usr/bin/env node

/**
 * Helper script to download CloudWatch logs using the MCP server
 * 
 * Usage:
 *   node download-logs.js <logGroupName> [options]
 * 
 * Options:
 *   --start <ISO date or timestamp>  Start time (default: today)
 *   --end <ISO date or timestamp>    End time (default: today)
 *   --force                          Re-download even if already cached
 *   --groups <group1,group2>         Multiple log groups (comma-separated)
 * 
 * Examples:
 *   node download-logs.js "/aws/lambda/my-function" --start "2024-11-28" --end "2024-11-30"
 *   node download-logs.js "/aws/lambda/my-function" --start "2024-11-28T00:00:00Z" --force
 *   node download-logs.js --groups "/aws/lambda/my-function,/aws/lambda/another-function" --start "2024-11-28"
 */

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:4010';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    logGroupNames: [],
    startTime: null,
    endTime: null,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--start' && i + 1 < args.length) {
      options.startTime = parseTime(args[++i]);
    } else if (arg === '--end' && i + 1 < args.length) {
      options.endTime = parseTime(args[++i]);
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--groups' && i + 1 < args.length) {
      options.logGroupNames = args[++i].split(',').map(g => g.trim());
    } else if (!arg.startsWith('--') && options.logGroupNames.length === 0) {
      // First non-option argument is the log group name
      options.logGroupNames = [arg];
    }
  }

  // Set defaults
  if (!options.startTime) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    options.startTime = today.getTime();
  }
  if (!options.endTime) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    options.endTime = today.getTime();
  }

  return options;
}

function parseTime(timeStr) {
  // If it's a number, assume it's a timestamp
  if (/^\d+$/.test(timeStr)) {
    return parseInt(timeStr, 10);
  }
  
  // Try parsing as ISO date string
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) {
    console.error(`Invalid date format: ${timeStr}`);
    process.exit(1);
  }
  return date.getTime();
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function downloadLogs(options) {
  if (options.logGroupNames.length === 0) {
    console.error('Error: At least one log group name is required');
    console.error('\nUsage: node download-logs.js <logGroupName> [options]');
    console.error('   or: node download-logs.js --groups <group1,group2> [options]');
    process.exit(1);
  }

  console.log('Downloading CloudWatch logs...');
  console.log(`  Log Groups: ${options.logGroupNames.join(', ')}`);
  console.log(`  Start Time: ${formatTimestamp(options.startTime)}`);
  console.log(`  End Time: ${formatTimestamp(options.endTime)}`);
  if (options.force) {
    console.log(`  Force: true (will re-download cached logs)`);
  }
  console.log('');

  try {
    const response = await fetch(`${MCP_SERVER_URL}/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        logGroupNames: options.logGroupNames,
        startTime: options.startTime,
        endTime: options.endTime,
        force: options.force,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(errorText);
      process.exit(1);
    }

    const result = await response.json();
    
    console.log(`\nStatus: ${result.status.toUpperCase()}`);
    console.log('\nSummary:');
    console.log(`  Total dates processed: ${result.summary.totalDates}`);
    console.log(`  Downloaded: ${result.summary.downloaded}`);
    console.log(`  Skipped (already cached): ${result.summary.skipped}`);
    console.log(`  Empty (no logs): ${result.summary.empty}`);
    if (result.summary.errors > 0) {
      console.log(`  Errors: ${result.summary.errors}`);
    }

    if (result.results.length > 0) {
      console.log('\nPer-date results:');
      let totalSize = 0;
      result.results.forEach((r) => {
        const statusIcon = r.status === 'downloaded' ? '✓' : r.status === 'skipped' ? '⊘' : '✗';
        const sizeStr = r.fileSizeBytes !== undefined ? `, ${formatBytes(r.fileSizeBytes)}` : '';
        if (r.fileSizeBytes) {
          totalSize += r.fileSizeBytes;
        }
        console.log(`  ${statusIcon} ${r.date} - ${r.status} (${r.eventsCount} events${sizeStr})`);
        if (r.error) {
          console.log(`    Error: ${r.error}`);
        }
      });
      
      if (totalSize > 0) {
        console.log(`\n  Total size: ${formatBytes(totalSize)}`);
      }
    }

    if (result.summary.errors === 0) {
      console.log('\n✓ Download completed successfully!');
      console.log('You can now search these logs using the /search endpoint.');
    }
  } catch (error) {
    console.error('Error downloading logs:', error.message);
    process.exit(1);
  }
}

// Run the script
const options = parseArgs();
downloadLogs(options);


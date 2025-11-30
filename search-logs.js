#!/usr/bin/env node

/**
 * Helper script to search CloudWatch logs using the MCP server
 * 
 * Usage:
 *   node search-logs.js <logGroupName> [options]
 * 
 * Options:
 *   --start <ISO date or timestamp>  Start time (default: 24 hours ago)
 *   --end <ISO date or timestamp>    End time (default: now)
 *   --filter <pattern>               Regex pattern to filter logs
 *   --groups <group1,group2>         Multiple log groups (comma-separated)
 * 
 * Examples:
 *   node search-logs.js "/aws/lambda/my-function" --start "2025-01-20T00:00:00Z" --filter "payment"
 *   node search-logs.js "/aws/lambda/my-function" --start "2025-01-20" --end "2025-01-21"
 *   node search-logs.js --groups "/aws/lambda/my-function,/aws/lambda/another-function" --filter "ERROR"
 */

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:4010';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    logGroupNames: [],
    startTime: null,
    endTime: null,
    filterPattern: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--start' && i + 1 < args.length) {
      options.startTime = parseTime(args[++i]);
    } else if (arg === '--end' && i + 1 < args.length) {
      options.endTime = parseTime(args[++i]);
    } else if (arg === '--filter' && i + 1 < args.length) {
      options.filterPattern = args[++i];
    } else if (arg === '--groups' && i + 1 < args.length) {
      options.logGroupNames = args[++i].split(',').map(g => g.trim());
    } else if (!arg.startsWith('--') && options.logGroupNames.length === 0) {
      // First non-option argument is the log group name
      options.logGroupNames = [arg];
    }
  }

  // Set defaults
  if (!options.startTime) {
    options.startTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
  }
  if (!options.endTime) {
    options.endTime = Date.now();
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

async function searchLogs(options) {
  if (options.logGroupNames.length === 0) {
    console.error('Error: At least one log group name is required');
    console.error('\nUsage: node search-logs.js <logGroupName> [options]');
    console.error('   or: node search-logs.js --groups <group1,group2> [options]');
    process.exit(1);
  }

  console.log('Searching CloudWatch logs...');
  console.log(`  Log Groups: ${options.logGroupNames.join(', ')}`);
  console.log(`  Start Time: ${formatTimestamp(options.startTime)}`);
  console.log(`  End Time: ${formatTimestamp(options.endTime)}`);
  if (options.filterPattern) {
    console.log(`  Filter Pattern: ${options.filterPattern}`);
  }
  console.log('');

  try {
    const response = await fetch(`${MCP_SERVER_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        logGroupNames: options.logGroupNames,
        startTime: options.startTime,
        endTime: options.endTime,
        filterPattern: options.filterPattern,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error: ${response.status} ${response.statusText}`);
      console.error(errorText);
      process.exit(1);
    }

    const events = await response.json();
    
    console.log(`Found ${events.length} log events\n`);
    console.log('─'.repeat(80));
    
    events.forEach((event, index) => {
      console.log(`\n[${index + 1}] ${formatTimestamp(event.timestamp)}`);
      console.log(`Log Stream: ${event.logStream || 'N/A'}`);
      
      // Try to parse message as JSON for better formatting
      let message = event.message;
      try {
        const parsed = JSON.parse(message);
        console.log('Message:');
        console.log(JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log(`Message: ${message}`);
      }
      
      console.log('─'.repeat(80));
    });

    if (events.length === 0) {
      console.log('No matching log events found.');
    }
  } catch (error) {
    console.error('Error fetching logs:', error.message);
    process.exit(1);
  }
}

// Run the script
const options = parseArgs();
searchLogs(options);


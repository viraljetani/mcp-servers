import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';

const CACHE_DIR = path.resolve(process.cwd(), 'log_cache');
const MAX_CACHE_AGE_DAYS = 10;

// Helper to sanitize log group names into safe directory names
const sanitizeLogGroupName = (logGroupName) => {
  return logGroupName.replace(/[^a-zA-Z0-9_-]/g, '_');
};

// Ensures a directory exists for a given log group
export const ensureLogGroupDir = (logGroupName) => {
  const sanitizedName = sanitizeLogGroupName(logGroupName);
  const dirPath = path.join(CACHE_DIR, sanitizedName);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

// Gets the file path for a specific log group and date
export const getLogFilePath = (logGroupName, date) => {
  const dirPath = ensureLogGroupDir(logGroupName);
  const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(dirPath, `${dateString}.log`);
};

// Helper function to format bytes to human-readable size
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

// Downloads all logs for a given group and day, then saves to cache
// Returns an object with eventsCount and fileSizeBytes
export const downloadAndCacheLogs = async (logGroupName, date, client) => {
  const startTime = date.getTime();
  const endTime = startTime + 24 * 60 * 60 * 1000 - 1;

  let allEvents = [];
  let nextToken;

  console.log(`Downloading logs for ${logGroupName} on ${date.toISOString().split('T')[0]}...`);

  try {
    do {
      const command = new FilterLogEventsCommand({
        logGroupName,
        startTime,
        endTime,
        nextToken,
      });
      const response = await client.send(command);
      allEvents.push(...(response.events || []));
      nextToken = response.nextToken;
    } while (nextToken);

    const finalPath = getLogFilePath(logGroupName, date);
    const tempPath = `${finalPath}.tmp`;

    if (allEvents.length > 0) {
      const logData = allEvents.map(event => JSON.stringify(event)).join('\n');
      fs.writeFileSync(tempPath, logData);
      fs.renameSync(tempPath, finalPath); // Atomic operation
      const fileSizeBytes = fs.statSync(finalPath).size;
      console.log(`Successfully cached ${allEvents.length} log events (${formatBytes(fileSizeBytes)}) to ${finalPath}`);
      return { eventsCount: allEvents.length, fileSizeBytes };
    } else {
      fs.writeFileSync(finalPath, ''); // Create an empty file to signify we've checked
      console.log(`No new logs to cache for ${logGroupName} on ${date.toISOString().split('T')[0]}`);
      return { eventsCount: 0, fileSizeBytes: 0 };
    }
  } catch (error) {
    console.error(`Error downloading logs for ${logGroupName}:`, error);
    throw error; // Re-throw to be handled by the caller
  }
};

// Searches a set of local log files for a pattern
export const searchLocalLogs = async (logFilePaths, filterPattern, startTime, endTime) => {
  const matchingEvents = [];
  const filterRegex = filterPattern ? new RegExp(filterPattern) : null;

  for (const filePath of logFilePaths) {
    if (!fs.existsSync(filePath)) continue;

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      try {
        if (line.trim() === '') continue;
        const event = JSON.parse(line);
        const eventTime = event.timestamp;

        // Check if the event is within the time range
        if (eventTime >= startTime && eventTime <= endTime) {
          // If there's a filter, check if the message matches
          if (filterRegex && !filterRegex.test(event.message)) {
            continue;
          }
          matchingEvents.push(event);
        }
      } catch (e) {
        console.error(`Error parsing log line in ${filePath}:`, e);
      }
    }
  }
  return matchingEvents;
};

// Deletes cached log files older than MAX_CACHE_AGE_DAYS
export const pruneCache = () => {
  console.log('Pruning old log cache...');
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - MAX_CACHE_AGE_DAYS);
  cutoffDate.setUTCHours(0, 0, 0, 0); // Set to start of day for consistent comparison

  if (!fs.existsSync(CACHE_DIR)) {
    return;
  }

  let prunedCount = 0;
  const logGroupDirs = fs.readdirSync(CACHE_DIR);
  for (const logGroupDir of logGroupDirs) {
    const dirPath = path.join(CACHE_DIR, logGroupDir);
    try {
      const stat = fs.statSync(dirPath);
      if (stat.isDirectory()) {
        const logFiles = fs.readdirSync(dirPath);
        for (const logFile of logFiles) {
          const filePath = path.join(dirPath, logFile);
          const fileDateStr = path.basename(logFile, '.log'); // YYYY-MM-DD
          
          // Parse date string as UTC to avoid timezone issues
          const [year, month, day] = fileDateStr.split('-').map(Number);
          const fileDate = new Date(Date.UTC(year, month - 1, day));

          if (fileDate < cutoffDate) {
            console.log(`Pruning old log file: ${filePath} (date: ${fileDateStr}, older than ${MAX_CACHE_AGE_DAYS} days)`);
            fs.unlinkSync(filePath);
            prunedCount++;
          }
        }
      }
    } catch (e) {
      console.error(`Error pruning directory ${dirPath}:`, e);
    }
  }
  
  if (prunedCount === 0) {
    console.log('No old log files to prune.');
  } else {
    console.log(`Cache pruning complete. Removed ${prunedCount} old log file(s).`);
  }
};

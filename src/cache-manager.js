import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';

const CACHE_DIR = path.resolve(process.cwd(), 'log_cache');
const MAX_CACHE_AGE_DAYS = 60;

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

// Downloads all logs for a given group and day, then saves to cache
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
      console.log(`Successfully cached ${allEvents.length} log events to ${finalPath}`);
    } else {
      fs.writeFileSync(finalPath, ''); // Create an empty file to signify we've checked
      console.log(`No new logs to cache for ${logGroupName} on ${date.toISOString().split('T')[0]}`);
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
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_CACHE_AGE_DAYS);

  if (!fs.existsSync(CACHE_DIR)) {
    return;
  }

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
          const fileDate = new Date(fileDateStr);

          if (fileDate < cutoffDate) {
            console.log(`Pruning old log file: ${filePath}`);
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (e) {
      console.error(`Error pruning directory ${dirPath}:`, e);
    }
  }
  console.log('Cache pruning complete.');
};

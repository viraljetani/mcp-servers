import express from 'express';
import { CloudWatchLogsClient, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import 'dotenv/config';
import fs from 'fs';
import { getLogFilePath, downloadAndCacheLogs, searchLocalLogs } from '../cache-manager.js';

// Helper function to calculate date range from timestamps
const getDateRange = (startTime, endTime) => {
  const dates = [];
  let currentDate = new Date(startTime);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate.getTime() <= endTime) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
};

export const start = () => {
  const app = express();
  const port = process.env.PORT_CLOUDWATCH_LOGS || 4010;

  app.use(express.json());

  const client = new CloudWatchLogsClient({
    region: process.env.AWS_REGION,
  });

  app.post('/search', async (req, res) => {
    const { logGroupNames, startTime, endTime, filterPattern } = req.body;

    if (!logGroupNames || !Array.isArray(logGroupNames) || logGroupNames.length === 0) {
      return res.status(400).send('logGroupNames must be a non-empty array');
    }
    if (!startTime || !endTime) {
      return res.status(400).send('startTime and endTime are required');
    }

    try {
      // Determine the unique set of daily log files we need to check/download
      const requiredFiles = new Set();
      const dates = getDateRange(startTime, endTime);

      for (const logGroupName of logGroupNames) {
        for (const date of dates) {
          const filePath = getLogFilePath(logGroupName, date);
          const tempFilePath = `${filePath}.tmp`;

          // Clean up incomplete temp file from previous runs if it exists
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }

          // If the final log file doesn't exist, download it
          if (!fs.existsSync(filePath)) {
            await downloadAndCacheLogs(logGroupName, date, client);
          }
          requiredFiles.add(filePath);
        }
      }

      // Now search through the local files
      const allEvents = await searchLocalLogs(Array.from(requiredFiles), filterPattern, startTime, endTime);
      allEvents.sort((a, b) => a.timestamp - b.timestamp);

      res.json(allEvents);
    } catch (error) {
      console.error('Error searching logs:', error);
      res.status(500).send('Error searching logs');
    }
  });

  app.post('/download', async (req, res) => {
    const { logGroupNames, startTime, endTime, force } = req.body;

    if (!logGroupNames || !Array.isArray(logGroupNames) || logGroupNames.length === 0) {
      return res.status(400).send('logGroupNames must be a non-empty array');
    }
    if (!startTime || !endTime) {
      return res.status(400).send('startTime and endTime are required');
    }

    try {
      const dates = getDateRange(startTime, endTime);
      const results = [];

      for (const logGroupName of logGroupNames) {
        for (const date of dates) {
          const filePath = getLogFilePath(logGroupName, date);
          const tempFilePath = `${filePath}.tmp`;
          const dateString = date.toISOString().split('T')[0];

          // Clean up incomplete temp file from previous runs if it exists
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }

          // Check if file already exists
          const alreadyCached = fs.existsSync(filePath);

          if (force || !alreadyCached) {
            try {
              const downloadResult = await downloadAndCacheLogs(logGroupName, date, client);
              
              // Get file size if file exists
              let fileSizeBytes = 0;
              if (fs.existsSync(filePath)) {
                fileSizeBytes = fs.statSync(filePath).size;
              }

              results.push({
                logGroupName,
                date: dateString,
                status: 'downloaded',
                eventsCount: downloadResult.eventsCount,
                fileSizeBytes: downloadResult.fileSizeBytes || fileSizeBytes,
              });
            } catch (error) {
              console.error(`Error downloading logs for ${logGroupName} on ${dateString}:`, error);
              results.push({
                logGroupName,
                date: dateString,
                status: 'error',
                error: error.message,
              });
            }
          } else {
            // File already exists, get stats
            const stats = fs.statSync(filePath);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const eventsCount = fileContent.trim() === '' ? 0 : fileContent.trim().split('\n').length;

            results.push({
              logGroupName,
              date: dateString,
              status: 'skipped',
              eventsCount,
              fileSizeBytes: stats.size,
            });
          }
        }
      }

      // Calculate summary
      const summary = {
        totalDates: results.length,
        downloaded: results.filter(r => r.status === 'downloaded').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        empty: results.filter(r => r.eventsCount === 0).length,
        errors: results.filter(r => r.status === 'error').length,
      };

      res.json({
        status: summary.errors > 0 ? 'partial' : 'completed',
        results,
        summary,
      });
    } catch (error) {
      console.error('Error downloading logs:', error);
      res.status(500).send('Error downloading logs');
    }
  });

  app.get('/log-groups', async (req, res) => {
    let allLogGroups = [];
    let nextToken;

    try {
      do {
        const command = new DescribeLogGroupsCommand({ nextToken });
        const response = await client.send(command);
        allLogGroups.push(...(response.logGroups || []));
        nextToken = response.nextToken;
      } while (nextToken);

      res.json(allLogGroups);
    } catch (error) {
      console.error(error);
      res.status(500).send('Error fetching log groups from CloudWatch');
    }
  });

  app.listen(port, () => {
    console.log(`CloudWatch Logs MCP server listening at http://localhost:${port}`);
  });
};
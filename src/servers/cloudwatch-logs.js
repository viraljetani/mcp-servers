import express from 'express';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import 'dotenv/config';

export const start = () => {
  const app = express();
  const port = 4000;

  const client = new CloudWatchLogsClient({
    region: process.env.AWS_REGION,
  });

  app.get('/logs', async (req, res) => {
    const { logGroupName, startTime, endTime, filterPattern } = req.query;

    if (!logGroupName) {
      return res.status(400).send('logGroupName is required');
    }

    const command = new FilterLogEventsCommand({
      logGroupName,
      startTime: startTime ? parseInt(startTime) : undefined,
      endTime: endTime ? parseInt(endTime) : undefined,
      filterPattern: filterPattern || '',
    });

    try {
      const response = await client.send(command);
      res.json(response.events);
    } catch (error) {
      console.error(error);
      res.status(500).send('Error fetching logs from CloudWatch');
    }
  });

  app.listen(port, () => {
    console.log(`CloudWatch Logs MCP server listening at http://localhost:${port}`);
  });
};
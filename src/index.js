import 'dotenv/config';
import { pruneCache } from './cache-manager.js';

// Prune cache on startup
pruneCache();

const serverName = process.argv[2];

if (!serverName) {
  console.error('Please specify a server to start.');
  console.log('Example: node src/index.js cloudwatch-logs');
  process.exit(1);
}

try {
  const server = await import(`./servers/${serverName}.js`);
  if (server && typeof server.start === 'function') {
    server.start();
  } else {
    console.error(`Error: Could not find a start function in server: ${serverName}`);
    process.exit(1);
  }
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    console.error(`Error: Server "${serverName}" not found.`);
  } else {
    console.error(`Error starting server "${serverName}":`, error);
  }
  process.exit(1);
}
# CloudWatch Logs MCP Server - Usage Guide

The MCP server is running at `http://localhost:4010` and provides two endpoints:

## Endpoints

### 1. List Log Groups
```bash
curl http://localhost:4010/log-groups | jq '.[].logGroupName'
```

### 2. Download Logs
Download logs from CloudWatch and cache them locally. The search endpoint will automatically use cached logs if available.

```bash
curl -X POST http://localhost:4010/download \
  -H "Content-Type: application/json" \
  -d '{
    "logGroupNames": ["/aws/lambda/my-function"],
    "startTime": 1732665600000,
    "endTime": 1732838400000,
    "force": false
  }'
```

**Response:**
```json
{
  "status": "completed",
  "results": [
    {
      "logGroupName": "/aws/lambda/my-function",
      "date": "2024-11-28",
      "status": "downloaded",
      "eventsCount": 1234
    }
  ],
  "summary": {
    "totalDates": 3,
    "downloaded": 2,
    "skipped": 1,
    "empty": 0,
    "errors": 0
  }
}
```

**Parameters:**
- `logGroupNames` (required): Array of log group names
- `startTime` (required): Start timestamp in milliseconds
- `endTime` (required): End timestamp in milliseconds
- `force` (optional): If `true`, re-downloads even if logs are already cached

### 3. Search Logs
Search through cached logs. If logs aren't cached, they will be downloaded automatically.

```bash
curl -X POST http://localhost:4010/search \
  -H "Content-Type: application/json" \
  -d '{
    "logGroupNames": ["/aws/lambda/my-function"],
    "startTime": 1737417600000,
    "endTime": 1737504000000,
    "filterPattern": "ERROR"
  }'
```

## Using the Helper Scripts

### Download Logs First (Recommended)

The `download-logs.js` script makes it easy to download logs:

```bash
# Download logs for a date range
node download-logs.js "/aws/lambda/my-function" \
  --start "2024-11-28" \
  --end "2024-11-30"

# Download multiple log groups
node download-logs.js --groups "/aws/lambda/my-function,/aws/lambda/another-function" \
  --start "2024-11-28" \
  --end "2024-11-30"

# Force re-download even if already cached
node download-logs.js "/aws/lambda/my-function" \
  --start "2024-11-28" \
  --force
```

### Search Logs

The `search-logs.js` script makes it easier to search logs:

### Basic Usage
```bash
# Search logs from the last 24 hours
node search-logs.js "/aws/lambda/my-function"

# Search with a filter pattern
node search-logs.js "/aws/lambda/my-function" --filter "ERROR"

# Search multiple log groups
node search-logs.js --groups "/aws/lambda/my-function,/aws/lambda/another-function" --filter "payment"
```

### Date Ranges
```bash
# Using ISO date strings
node search-logs.js "/aws/lambda/my-function" \
  --start "2025-01-20T00:00:00Z" \
  --end "2025-01-21T00:00:00Z"

# Using date only (assumes UTC midnight)
node search-logs.js "/aws/lambda/my-function" \
  --start "2025-01-20" \
  --end "2025-01-21"

# Using timestamps (milliseconds since epoch)
node search-logs.js "/aws/lambda/my-function" \
  --start 1737417600000 \
  --end 1737504000000
```

## Examples

### Find Payment-Related Logs
```bash
node search-logs.js "/aws/lambda/my-function" \
  --start "2025-01-20" \
  --filter "payment|charge|transaction"
```

### Find Errors in Multiple Log Groups
```bash
node search-logs.js --groups "/aws/lambda/my-function,/aws/lambda/another-function" \
  --start "2025-01-20" \
  --filter "error|ERROR|Error"
```

### Find Specific Transaction ID
```bash
node search-logs.js "/aws/lambda/my-function" \
  --start "2025-01-20" \
  --filter "transaction-id-12345"
```

## Notes

- The server caches logs locally in the `log_cache` directory
- Logs are cached by day, so the first search for a date range will download logs
- Subsequent searches for the same date range will use cached logs (much faster)
- Timestamps are in milliseconds since Unix epoch
- Filter patterns are JavaScript regex patterns

## Environment Variables

- `MCP_SERVER_URL`: Override the default server URL (default: `http://localhost:4010`)


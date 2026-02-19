# PisoNet API Documentation

Complete API reference for the PisoNet Backend Server.

## Base URL
```
Development: http://localhost:5000/api
Production: https://api.pisonet.example.com/api
```

## Authentication
Currently, the API is open (no authentication required). In production, add JWT authentication.

## Response Format
All responses are JSON format with the following structure:

**Success (2xx):**
```json
{
  "data": {...},
  "message": "Success message",
  "timestamp": "2024-02-19T10:30:00Z"
}
```

**Error (4xx, 5xx):**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Units Endpoints

### Get All Units
```
GET /units
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "PC 1",
    "status": "Idle",
    "remaining_seconds": 0,
    "total_revenue": 150.50,
    "mac_address": "00:11:22:33:44:55",
    "last_status_update": "2024-02-19T10:30:00Z",
    "active_sessions": 0
  }
]
```

### Get Single Unit
```
GET /units/:id
```

**Parameters:**
- `id` (path) - Unit ID

**Response:**
```json
{
  "id": 1,
  "name": "PC 1",
  "status": "Active",
  "remaining_seconds": 480,
  "total_revenue": 150.50,
  "mac_address": "00:11:22:33:44:55",
  "last_status_update": "2024-02-19T10:30:00Z",
  "active_sessions": 1,
  "total_transactions": 25
}
```

### Get Current Session
```
GET /units/:id/session
```

**Response:**
```json
{
  "id": 5,
  "unit_id": 1,
  "start_time": "2024-02-19T10:30:00Z",
  "end_time": null,
  "duration_seconds": 120,
  "amount_paid": 10,
  "status": "active"
}
```

### Get Unit Transactions
```
GET /units/:id/transactions?limit=50
```

**Query Parameters:**
- `limit` (optional) - Number of transactions to return (default: 50)

**Response:**
```json
[
  {
    "id": 100,
    "unit_id": 1,
    "amount": 5,
    "denomination": 5,
    "timestamp": "2024-02-19T10:30:00Z",
    "transaction_type": "coin",
    "session_id": 5
  }
]
```

### Add Time (Insert Coin)
```
POST /units/:id/add-time
Content-Type: application/json

{
  "amount": 5,
  "denomination": 5
}
```

**Parameters:**
- `id` (path) - Unit ID
- `amount` (body, required) - Amount to add (in Pesos)
- `denomination` (body, optional) - Coin denomination

**Response:**
```json
{
  "message": "Time added successfully",
  "unit_id": 1,
  "amount": 5,
  "seconds_added": 300,
  "new_remaining_seconds": 480,
  "status": "Active"
}
```

### Start Session
```
POST /units/:id/session/start
```

**Response:**
```json
{
  "message": "Session started",
  "session_id": 5,
  "unit_id": 1,
  "start_time": "2024-02-19T10:30:00Z"
}
```

### End Session
```
POST /units/:id/session/end
```

**Response:**
```json
{
  "message": "Session ended",
  "session_id": 5,
  "unit_id": 1,
  "duration_seconds": 480,
  "end_time": "2024-02-19T10:38:00Z"
}
```

### Hardware Control
```
POST /units/:id/control
Content-Type: application/json

{
  "action": "restart"
}
```

**Parameters:**
- `id` (path) - Unit ID
- `action` (body, required) - One of: `on`, `off`, `shutdown`, `restart`, `lock`, `unlock`

**Response:**
```json
{
  "message": "RESTART command sent to unit 1",
  "unit_id": 1,
  "action": "restart",
  "timestamp": "2024-02-19T10:30:00Z"
}
```

### Get Hardware Log
```
GET /units/:id/hardware-log?limit=50
```

**Query Parameters:**
- `limit` (optional) - Number of log entries (default: 50)

**Response:**
```json
[
  {
    "id": 1,
    "unit_id": 1,
    "action": "restart",
    "timestamp": "2024-02-19T10:30:00Z",
    "status": "sent"
  }
]
```

### Update Unit
```
PUT /units/:id
Content-Type: application/json

{
  "name": "PC 1",
  "mac_address": "00:11:22:33:44:55"
}
```

**Response:**
```json
{
  "message": "Unit updated successfully",
  "unit": {
    "id": 1,
    "name": "PC 1",
    "mac_address": "00:11:22:33:44:55",
    ...
  }
}
```

## Transactions Endpoints

### Get All Transactions
```
GET /transactions?limit=100&offset=0&unit_id=1
```

**Query Parameters:**
- `limit` (optional) - Number of transactions (default: 100)
- `offset` (optional) - Pagination offset (default: 0)
- `unit_id` (optional) - Filter by unit ID

**Response:**
```json
[
  {
    "id": 100,
    "unit_id": 1,
    "amount": 5,
    "denomination": 5,
    "timestamp": "2024-02-19T10:30:00Z",
    "transaction_type": "coin",
    "session_id": 5
  }
]
```

### Get Total Revenue
```
GET /transactions/revenue/total
```

**Response:**
```json
{
  "total_revenue": 1250.75
}
```

### Get Revenue by Unit
```
GET /transactions/revenue/by-unit
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "PC 1",
    "revenue": 150.50,
    "transaction_count": 42
  }
]
```

### Get Daily Revenue
```
GET /transactions/revenue/daily?days=30
```

**Query Parameters:**
- `days` (optional) - Number of days to retrieve (default: 30)

**Response:**
```json
[
  {
    "date": "2024-02-19",
    "daily_revenue": 125.50,
    "transaction_count": 50
  }
]
```

### Get Hourly Revenue
```
GET /transactions/revenue/hourly
```

**Response:**
```json
[
  {
    "hour": "2024-02-19 10:00:00",
    "hourly_revenue": 25.50,
    "transaction_count": 10
  }
]
```

### Get Transactions by Type
```
GET /transactions/report/by-type
```

**Response:**
```json
[
  {
    "transaction_type": "coin",
    "count": 100,
    "total_amount": 500.00
  }
]
```

### Get Comprehensive Report
```
GET /transactions/report/comprehensive?start_date=2024-02-01&end_date=2024-02-28
```

**Query Parameters:**
- `start_date` (optional) - ISO format date
- `end_date` (optional) - ISO format date

**Response:**
```json
{
  "period": {
    "start": "2024-02-01T00:00:00Z",
    "end": "2024-02-28T23:59:59Z"
  },
  "total_transactions": 500,
  "total_revenue": 2500.00,
  "active_units": 8,
  "average_transaction": 5.00
}
```

### Create Transaction
```
POST /transactions
Content-Type: application/json

{
  "unit_id": 1,
  "amount": 10,
  "denomination": 10,
  "transaction_type": "manual",
  "session_id": 5
}
```

**Response:**
```json
{
  "message": "Transaction recorded",
  "transaction_id": 101,
  "unit_id": 1,
  "amount": 10
}
```

## Settings Endpoints

### Get All Settings
```
GET /settings
```

**Response:**
```json
{
  "peso_to_seconds": "60",
  "max_session_duration": "3600",
  "auto_logout": "true"
}
```

### Get Single Setting
```
GET /settings/:key
```

**Response:**
```json
{
  "key": "peso_to_seconds",
  "value": "60",
  "updated_at": "2024-02-19T10:30:00Z"
}
```

### Update Setting
```
PUT /settings/:key
Content-Type: application/json

{
  "value": "120"
}
```

**Response:**
```json
{
  "message": "Setting updated",
  "key": "peso_to_seconds",
  "value": "120"
}
```

### Bulk Update Settings
```
PUT /settings
Content-Type: application/json

{
  "peso_to_seconds": "60",
  "max_session_duration": "3600",
  "auto_logout": "true"
}
```

**Response:**
```json
{
  "message": "All settings updated",
  "count": 3
}
```

## System Endpoints

### Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "message": "PisoNet API is running",
  "timestamp": "2024-02-19T10:30:00Z",
  "environment": "development",
  "port": 5000
}
```

### System Statistics
```
GET /stats
```

**Response:**
```json
{
  "timestamp": "2024-02-19T10:30:00Z",
  "uptime": 3600,
  "total_units": 10,
  "active_units": 3,
  "total_transactions": 500,
  "total_revenue": 2500.00,
  "active_sessions": 2
}
```

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created |
| 400 | Bad Request | Invalid parameters |
| 404 | Not Found | Resource not found |
| 500 | Server Error | Internal server error |

## WebSocket Events

### Server → Client

**Connection:**
```json
{
  "type": "CONNECTION",
  "client_id": "1708356600000",
  "timestamp": "2024-02-19T10:30:00Z",
  "message": "Connected to PisoNet WebSocket server"
}
```

**Unit Update:**
```json
{
  "type": "UNIT_UPDATE",
  "unit": {
    "id": 1,
    "remaining_seconds": 300,
    "status": "Active"
  },
  "timestamp": "2024-02-19T10:30:00Z",
  "broadcast_to": 5
}
```

**Coin Inserted:**
```json
{
  "type": "COIN_INSERTED",
  "unit": {
    "id": 1,
    "remaining_seconds": 600,
    "total_revenue": 155.50,
    "status": "Active"
  },
  "timestamp": "2024-02-19T10:30:00Z"
}
```

**Hardware Control:**
```json
{
  "type": "HARDWARE_CONTROL",
  "unit_id": 1,
  "action": "restart",
  "timestamp": "2024-02-19T10:30:00Z"
}
```

**Keep-alive:**
```json
{
  "type": "PONG",
  "timestamp": "2024-02-19T10:30:00Z"
}
```

### Client → Server

**Keep-alive:**
```json
{
  "type": "PING"
}
```

## Rate Limiting

Currently not implemented. Recommended for production:
- 100 requests per minute per IP for general endpoints
- 10 requests per minute per IP for authentication endpoints

## Pagination

Use `limit` and `offset` parameters for pagination:
```
GET /transactions?limit=50&offset=100
```

## Sorting

Use `sort_by` parameter where supported:
```
GET /transactions?sort_by=timestamp&order=desc
```

## Time Conversion

Default: 1 Peso = 60 seconds
Configure with: `PESO_TO_SECONDS` environment variable

## Examples

### cURL Examples

Insert coin:
```bash
curl -X POST http://localhost:5000/api/units/1/add-time \
  -H "Content-Type: application/json" \
  -d '{"amount": 5}'
```

Hardware control:
```bash
curl -X POST http://localhost:5000/api/units/1/control \
  -H "Content-Type: application/json" \
  -d '{"action": "restart"}'
```

Get revenue:
```bash
curl http://localhost:5000/api/transactions/revenue/total
```

### JavaScript/Fetch Examples

```javascript
// Insert coin
fetch('http://localhost:5000/api/units/1/add-time', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 5 })
})
.then(r => r.json())
.then(data => console.log(data));

// WebSocket connection
const ws = new WebSocket('ws://localhost:5000');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

## Testing

Use Postman, Insomnia, or similar tools to test endpoints.

Import this file into Postman for quick API testing setup.

---

**API Version**: 1.0.0  
**Last Updated**: 2024-02-19

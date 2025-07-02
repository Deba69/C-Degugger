# C++ Visual Debugger Server - Phase 1

This server implements a secure C++ compilation and execution pipeline using Docker containers for safe code execution.

## Architecture Overview

The server now uses a secure Docker-based approach instead of direct GDB debugging:

1. **Secure Code Execution**: All C++ code runs in isolated Docker containers
2. **Resource Limits**: CPU, memory, and execution time are strictly limited
3. **Security**: No network access, read-only filesystem, dropped capabilities
4. **Timeout Protection**: 2-second maximum execution time prevents infinite loops

## Setup Instructions

### Prerequisites

1. **Docker**: Make sure Docker is installed and running on your system
2. **Node.js**: Version 14 or higher
3. **npm**: For package management

### Installation

1. Install dependencies:
```bash
npm install
```

2. Build the Docker image:
```bash
docker build -t cpp-executor:latest .
```

3. Start the server:
```bash
npm start
```

### Testing

Run the test script to verify everything works:
```bash
node test-docker.js
```

## API Endpoints

### POST /api/compile
Compile and run C++ code in a secure container.

**Request Body:**
```json
{
  "code": "#include <iostream>\nint main() { std::cout << \"Hello World\"; return 0; }",
  "input": "optional input for cin"
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "Hello World",
  "stderr": "",
  "exitCode": 0,
  "executionTime": 150
}
```

### POST /api/validate
Validate C++ code for security and syntax issues.

**Request Body:**
```json
{
  "code": "#include <iostream>\nint main() { return 0; }"
}
```

**Response:**
```json
{
  "isValid": true,
  "errors": [],
  "warnings": []
}
```

### GET /api/compilation-info
Get information about the compilation environment.

**Response:**
```json
{
  "compiler": "g++",
  "version": "C++17",
  "flags": ["-std=c++17", "-O0", "-g"],
  "maxExecutionTime": "2 seconds",
  "maxMemory": "50MB",
  "security": {
    "networkAccess": false,
    "fileSystemAccess": "read-only",
    "processLimits": "enabled"
  }
}
```

### POST /api/health
Check server health and Docker availability.

**Response:**
```json
{
  "status": "ok",
  "docker": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Security Features

- **Container Isolation**: Each code execution runs in a separate Docker container
- **Resource Limits**: 
  - Memory: 50MB maximum
  - CPU: 50% maximum
  - Execution time: 2 seconds maximum
- **Security Restrictions**:
  - No network access
  - Read-only filesystem
  - Dropped capabilities
  - Non-root user execution
- **Code Validation**: Checks for dangerous operations before execution

## File Structure

```
server/
├── src/
│   ├── index.js              # Main server file
│   ├── docker-manager.js     # Docker container management
│   └── compilation-pipeline.js # Compilation and execution logic
├── Dockerfile                # Docker image for C++ execution
├── docker-compose.yml        # Docker Compose configuration
├── test-docker.js           # Test script
└── package.json             # Dependencies
```

## Error Handling

The server handles various error scenarios:

- **Compilation Errors**: Syntax errors, missing includes, etc.
- **Runtime Errors**: Segmentation faults, exceptions, etc.
- **Timeout Errors**: Infinite loops or long-running programs
- **Security Violations**: Attempted dangerous operations
- **Resource Exhaustion**: Memory or CPU limits exceeded

## Next Steps (Phase 2)

The next phase will implement code instrumentation to track:
- Variable values and changes
- Control flow (if/else, loops)
- Function calls and stack
- I/O operations

This will enable step-by-step visualization without requiring a live debugger. 
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

class DockerManager {
    constructor() {
        this.docker = null;
        this.containerName = 'cpp-executor';
        this.maxExecutionTime = 2000; // 2 seconds
        this.maxMemory = '50m';
        this.maxCpuShares = 512; // Limit CPU usage
        this.useDocker = false; // Force local execution
        // this.initializeDocker(); // Disable Docker initialization
        console.log('Docker disabled - using local execution mode');
    }

    async initializeDocker() {
        try {
            // Try to import dockerode
            const Docker = require('dockerode');
            this.docker = new Docker();
            
            // Test if Docker is available
            await this.docker.ping();
            this.useDocker = true;
            console.log('Docker is available - using containerized execution');
        } catch (error) {
            console.log('Docker not available - using local execution mode');
            console.log('Docker error:', error.message);
            this.useDocker = false;
        }
    }

    async buildImage() {
        if (!this.useDocker) {
            console.log('Skipping Docker image build - using local execution');
            return;
        }

        try {
            console.log('Building C++ executor Docker image...');
            const stream = await this.docker.buildImage({
                context: path.join(__dirname, '..'),
                src: ['Dockerfile']
            }, { t: 'cpp-executor:latest' });

            return new Promise((resolve, reject) => {
                this.docker.modem.followProgress(stream, (err, res) => {
                    if (err) {
                        console.error('Error building Docker image:', err);
                        reject(err);
                    } else {
                        console.log('Docker image built successfully');
                        resolve(res);
                    }
                });
            });
        } catch (error) {
            console.error('Failed to build Docker image:', error);
            throw error;
        }
    }

    async createContainer(workspacePath) {
        if (!this.useDocker) {
            // Return a mock container object for local execution
            return {
                id: `local-${uuidv4().substring(0, 8)}`,
                workspacePath: workspacePath,
                isLocal: true
            };
        }

        try {
            const containerId = `cpp-exec-${uuidv4().substring(0, 8)}`;
            
            // Convert memory limit to bytes (50MB = 50 * 1024 * 1024 bytes)
            const memoryLimitBytes = 50 * 1024 * 1024; // 50MB in bytes
            
            const container = await this.docker.createContainer({
                Image: 'cpp-executor:latest',
                name: containerId,
                Hostname: containerId,
                WorkingDir: '/workspace',
                Cmd: ['/bin/bash'],
                Tty: true,
                OpenStdin: true,
                StdinOnce: false,
                Env: [
                    'PYTHONUNBUFFERED=1',
                    'TERM=xterm'
                ],
                HostConfig: {
                    Memory: memoryLimitBytes,
                    MemorySwap: memoryLimitBytes,
                    CpuShares: this.maxCpuShares,
                    CpuPeriod: 100000,
                    CpuQuota: 50000, // 50% CPU limit
                    PidsLimit: 50,
                    SecurityOpt: ['no-new-privileges'],
                    CapDrop: ['ALL'],
                    ReadonlyRootfs: true,
                    Binds: [
                        `${workspacePath}:/workspace:rw`
                    ],
                    Tmpfs: {
                        '/tmp': 'noexec,nosuid,size=100m',
                        '/var/tmp': 'noexec,nosuid,size=50m'
                    },
                    NetworkMode: 'none', // No network access
                    Ulimits: [
                        {
                            Name: 'nofile',
                            Soft: 1024,
                            Hard: 2048
                        }
                    ]
                }
            });

            return container;
        } catch (error) {
            console.error('Failed to create container:', error);
            throw error;
        }
    }

    async executeCode(container, code, input = '') {
        if (!this.useDocker) {
            return this.executeCodeLocally(container, code, input);
        }

        try {
            console.log('[DEBUG] Starting Docker container execution...');
            
            // Start the container
            await container.start();
            console.log('[DEBUG] Container started successfully');

            // Write the C++ code to a file in the container
            console.log('[DEBUG] Writing code to container...');
            const writeExec = await container.exec({
                Cmd: ['sh', '-c', `echo '${code.replace(/'/g, "'\"'\"'")}' > /workspace/main.cpp`],
                AttachStdout: true,
                AttachStderr: true
            });

            const writeStream = await writeExec.start();
            await this.waitForStream(writeStream);
            console.log('[DEBUG] Code written to container');

            // Compile the code
            console.log('[DEBUG] Compiling code in container...');
            const compileExec = await container.exec({
                Cmd: ['g++', '-std=c++17', '-O0', '-g', '-o', '/workspace/program', '/workspace/main.cpp'],
                AttachStdout: true,
                AttachStderr: true
            });

            const compileStream = await compileExec.start();
            const compileResult = await this.waitForStream(compileStream);
            console.log('[DEBUG] Compilation stdout:', compileResult.stdout);
            console.log('[DEBUG] Compilation stderr:', compileResult.stderr);
            console.log('[DEBUG] Compilation exit code:', compileResult.exitCode);

            if (compileResult.exitCode !== 0) {
                console.log('[DEBUG] Compilation failed, cleaning up container');
                await this.cleanupContainer(container);
                return {
                    success: false,
                    error: 'Compilation failed',
                    stderr: compileResult.stderr,
                    stdout: compileResult.stdout,
                    exitCode: compileResult.exitCode
                };
            }

            // Run the program with better stream handling
            console.log('[DEBUG] Running program in container...');
            const runExec = await container.exec({
                Cmd: ['/workspace/program'],
                AttachStdout: true,
                AttachStderr: true,
                AttachStdin: true,
                WorkingDir: '/workspace'
            });

            // Use a more robust stream handling approach
            const runResult = await this.executeWithTimeout(runExec, input);
            console.log('[DEBUG] Program execution completed');

            await this.cleanupContainer(container);

            return {
                success: true,
                stdout: runResult.stdout,
                stderr: runResult.stderr,
                exitCode: runResult.exitCode,
                executionTime: runResult.executionTime
            };

        } catch (error) {
            console.error('[DEBUG] Error executing code:', error);
            await this.cleanupContainer(container);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async executeWithTimeout(exec, input = '') {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let stdout = '';
            let stderr = '';
            let hasResolved = false;

            // Start the exec
            exec.start({
                input: input ? Buffer.from(input) : undefined
            }).then(stream => {
                // Handle stream data
                stream.on('data', (chunk) => {
                    const data = chunk.toString();
                    // Docker exec streams use specific format for stdout/stderr
                    if (data.startsWith('\x01')) {
                        stderr += data.slice(1);
                    } else {
                        stdout += data;
                    }
                });

                stream.on('end', () => {
                    if (!hasResolved) {
                        hasResolved = true;
                        const executionTime = Date.now() - startTime;
                        resolve({
                            stdout,
                            stderr,
                            executionTime,
                            exitCode: 0
                        });
                    }
                });

                stream.on('error', (error) => {
                    if (!hasResolved) {
                        hasResolved = true;
                        const executionTime = Date.now() - startTime;
                        resolve({
                            stdout,
                            stderr,
                            executionTime,
                            exitCode: -1,
                            error: error.message
                        });
                    }
                });
            }).catch(error => {
                if (!hasResolved) {
                    hasResolved = true;
                    const executionTime = Date.now() - startTime;
                    resolve({
                        stdout,
                        stderr,
                        executionTime,
                        exitCode: -1,
                        error: error.message
                    });
                }
            });

            // Add timeout as backup
            setTimeout(() => {
                if (!hasResolved) {
                    hasResolved = true;
                    const executionTime = Date.now() - startTime;
                    resolve({
                        stdout,
                        stderr,
                        executionTime,
                        exitCode: -1,
                        error: 'Execution timeout'
                    });
                }
            }, this.maxExecutionTime);
        });
    }

    async executeCodeLocally(container, code, input = '') {
        try {
            const workspacePath = container.workspacePath;
            const sourceFile = path.join(workspacePath, 'main.cpp');
            const executableFile = path.join(workspacePath, 'program.exe');

            // Write code to file
            fs.writeFileSync(sourceFile, code);

            // Compile the code
            const compileResult = await this.compileLocally(sourceFile, executableFile);
            if (!compileResult.success) {
                return {
                    success: false,
                    error: 'Compilation failed',
                    stderr: compileResult.stderr,
                    stdout: compileResult.stdout
                };
            }

            // Run the program
            const runResult = await this.runLocally(executableFile, input);
            return runResult;

        } catch (error) {
            console.error('Error in local execution:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async compileLocally(sourceFile, executableFile) {
        return new Promise((resolve) => {
            exec(`g++ -std=c++17 -O0 -g -o "${executableFile}" "${sourceFile}"`, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        stdout: stdout,
                        stderr: stderr
                    });
                } else {
                    resolve({
                        success: true,
                        stdout: stdout,
                        stderr: stderr
                    });
                }
            });
        });
    }

    async runLocally(executableFile, input = '') {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const child = spawn(executableFile, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: this.maxExecutionTime
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                const executionTime = Date.now() - startTime;
                resolve({
                    success: true,
                    stdout: stdout,
                    stderr: stderr,
                    exitCode: code,
                    executionTime: executionTime
                });
            });

            child.on('error', (error) => {
                const executionTime = Date.now() - startTime;
                resolve({
                    success: false,
                    error: error.message,
                    executionTime: executionTime
                });
            });

            // Send input if provided
            if (input) {
                child.stdin.write(input);
            }
            child.stdin.end();
        });
    }

    async waitForStream(stream) {
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            const startTime = Date.now();

            stream.on('data', (chunk) => {
                const data = chunk.toString();
                if (data.startsWith('\x01')) {
                    stderr += data.slice(1);
                } else {
                    stdout += data;
                }
            });

            stream.on('end', () => {
                const executionTime = Date.now() - startTime;
                resolve({
                    stdout,
                    stderr,
                    executionTime,
                    exitCode: 0
                });
            });
        });
    }

    async cleanupContainer(container) {
        if (!this.useDocker) {
            return; // No cleanup needed for local execution
        }

        try {
            console.log('[DEBUG] Cleaning up container...');
            
            // Check if container is running before trying to stop it
            const containerInfo = await container.inspect();
            if (containerInfo.State.Running) {
                console.log('[DEBUG] Stopping running container...');
                await container.stop({ t: 1 });
            } else {
                console.log('[DEBUG] Container already stopped');
            }
            
            console.log('[DEBUG] Removing container...');
            await container.remove();
            console.log('[DEBUG] Container cleanup completed');
        } catch (error) {
            // Don't throw error for cleanup failures, just log them
            if (error.statusCode === 304) {
                console.log('[DEBUG] Container already stopped (expected)');
            } else if (error.statusCode === 404) {
                console.log('[DEBUG] Container not found (already removed)');
            } else {
                console.error('[DEBUG] Error cleaning up container:', error.message);
            }
        }
    }

    async cleanupAllContainers() {
        if (!this.useDocker) {
            return; // No cleanup needed for local execution
        }

        try {
            const containers = await this.docker.listContainers({ all: true });
            const cppContainers = containers.filter(container => 
                container.Names.some(name => name.includes('cpp-exec-'))
            );

            for (const containerInfo of cppContainers) {
                try {
                    const container = this.docker.getContainer(containerInfo.Id);
                    await container.remove({ force: true });
                } catch (error) {
                    console.error(`Error removing container ${containerInfo.Id}:`, error);
                }
            }
        } catch (error) {
            console.error('Error cleaning up containers:', error);
        }
    }
}

module.exports = DockerManager; 
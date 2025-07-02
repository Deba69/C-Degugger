const DockerManager = require('./docker-manager');
const CodeInstrumenter = require('./code-instrumenter');
const LogParser = require('./log-parser');
const tmp = require('tmp');
const fs = require('fs');
const path = require('path');

class CompilationPipeline {
    constructor() {
        this.dockerManager = new DockerManager();
        this.codeInstrumenter = new CodeInstrumenter();
        this.logParser = new LogParser();
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log('Initializing compilation pipeline...');
            await this.dockerManager.buildImage();
            this.isInitialized = true;
            console.log('Compilation pipeline initialized successfully');
        } catch (error) {
            console.error('Failed to initialize compilation pipeline:', error);
            throw error;
        }
    }

    async compileAndRun(code, input = '') {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Create temporary workspace
        const workspace = await this.createWorkspace();
        
        try {
            // Instrument the code
            const instrumentedResult = this.codeInstrumenter.instrument(code);
            const completeInstrumentedCode = this.codeInstrumenter.getCompleteInstrumentedCode();
            
            // Create container for execution
            const container = await this.dockerManager.createContainer(workspace.path);
            
            // Execute the instrumented code
            const result = await this.dockerManager.executeCode(container, completeInstrumentedCode, input);
            
            if (result.success) {
                // Parse the execution logs
                const executionData = this.logParser.parseLogs(result.stderr);
                
                return {
                    success: true,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    executionTime: result.executionTime,
                    workspace: workspace.path,
                    // Phase 2: Execution visualization data
                    executionData: executionData,
                    instrumentedCode: completeInstrumentedCode,
                    originalCode: code
                };
            } else {
                return {
                    ...result,
                    workspace: workspace.path,
                    originalCode: code
                };
            }
        } catch (error) {
            console.error('Error in compilation pipeline:', error);
            return {
                success: false,
                error: error.message,
                workspace: workspace.path,
                originalCode: code
            };
        } finally {
            // Clean up workspace after a delay to allow for debugging
            setTimeout(() => {
                this.cleanupWorkspace(workspace);
            }, 5000);
        }
    }

    async compileAndVisualize(code, input = '') {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Create temporary workspace
        const workspace = await this.createWorkspace();
        
        try {
            // Instrument the code
            const instrumentedResult = this.codeInstrumenter.instrument(code);
            const completeInstrumentedCode = this.codeInstrumenter.getCompleteInstrumentedCode();
            
            // Create container for execution
            const container = await this.dockerManager.createContainer(workspace.path);
            
            // Execute the instrumented code
            const result = await this.dockerManager.executeCode(container, completeInstrumentedCode, input);
            
            if (result.success) {
                // Parse the execution logs
                const executionData = this.logParser.parseLogs(result.stderr);
                
                return {
                    success: true,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    executionTime: result.executionTime,
                    workspace: workspace.path,
                    // Phase 2: Execution visualization data
                    visualization: {
                        totalSteps: executionData.steps.length,
                        steps: executionData.steps,
                        variables: executionData.variables,
                        callStack: executionData.callStack,
                        output: executionData.output
                    },
                    instrumentedCode: completeInstrumentedCode,
                    originalCode: code
                };
            } else {
                return {
                    ...result,
                    workspace: workspace.path,
                    originalCode: code
                };
            }
        } catch (error) {
            console.error('Error in visualization pipeline:', error);
            return {
                success: false,
                error: error.message,
                workspace: workspace.path,
                originalCode: code
            };
        } finally {
            // Clean up workspace after a delay to allow for debugging
            setTimeout(() => {
                this.cleanupWorkspace(workspace);
            }, 5000);
        }
    }

    async createWorkspace() {
        return new Promise((resolve, reject) => {
            tmp.dir({
                prefix: 'cpp-workspace-',
                unsafeCleanup: true
            }, (err, path, cleanupCallback) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        path,
                        cleanup: cleanupCallback
                    });
                }
            });
        });
    }

    cleanupWorkspace(workspace) {
        try {
            if (workspace && workspace.cleanup) {
                workspace.cleanup();
            }
        } catch (error) {
            console.error('Error cleaning up workspace:', error);
        }
    }

    async validateCode(code) {
        return {
            isValid: true,
            errors: [],
            warnings: []
        };
    }

    async getCompilationInfo() {
        return {
            compiler: 'g++',
            version: 'C++17',
            flags: ['-std=c++17', '-O0', '-g'],
            maxExecutionTime: '2 seconds',
            maxMemory: '50MB',
            security: {
                networkAccess: false,
                fileSystemAccess: 'read-only',
                processLimits: 'enabled'
            },
            // Phase 2: Instrumentation features
            instrumentation: {
                variableTracking: true,
                controlFlowTracking: true,
                functionCallTracking: true,
                ioTracking: true,
                stepByStepVisualization: true
            }
        };
    }

    async cleanup() {
        try {
            await this.dockerManager.cleanupAllContainers();
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

module.exports = CompilationPipeline; 
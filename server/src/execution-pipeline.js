const CodeInstrumenter = require('./code-instrumenter');
const LogParser = require('./log-parser');
const tmp = require('tmp');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

class ExecutionPipeline {
    constructor() {
        this.codeInstrumenter = new CodeInstrumenter();
        this.logParser = new LogParser();
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        console.log('Execution pipeline initialized successfully (local mode)');
    }

    // Sanitize code to fix split string literals
    sanitizeCode(code) {
        // This will join lines that are part of a string literal
        // e.g., cout << "...\n"; should not be split across lines
        // We'll use a simple regex to join lines ending with an unclosed quote
        const lines = code.split(/\r?\n/);
        let sanitized = [];
        let inString = false;
        let buffer = '';
        for (let line of lines) {
            if (!inString) {
                buffer = line;
            } else {
                buffer += '\n' + line;
            }
            // Count quotes, ignore escaped quotes
            let quoteCount = (buffer.match(/(?<!\\)"/g) || []).length;
            if (quoteCount % 2 === 1) {
                // Odd number of quotes: string is still open
                inString = true;
            } else {
                inString = false;
                sanitized.push(buffer);
                buffer = '';
            }
        }
        if (buffer) sanitized.push(buffer);
        return sanitized.join('\n');
    }

    // Helper to detect if code is simple (for visualization)
    isSimpleCode(code) {
        // Heuristic: no custom macros, no templates, no struct/class/union, no #include except standard, no function pointers
        // Now also skip STL containers, algorithms, and 2D arrays
        const forbiddenPatterns = [
            /#define\s+\w+\s*\(.+\)/, // function-like macros
            /template\s*</,
            /struct\s+\w+/, /class\s+\w+/, /union\s+\w+/, // user-defined types
            /#include\s*<.*\.h>/, // non-standard includes
            /->\s*\w+/, // pointer dereference
            /::\s*\w+/, // scope resolution (for advanced features)
            /constexpr/, /decltype/, /typename/, /concept/, /requires/, // advanced C++
            /#include\s*"/, // user includes
            /\bvector\s*</, /\barray\s*</, /\bset\s*</, /\bmap\s*</, /\bunordered_map\s*</, // STL containers
            /\bsort\s*\(/, /\breverse\s*\(/, /\bfind\s*\(/, // STL algorithms
            /\w+\s*\[\s*\d+\s*\]\s*\[\s*\d+\s*\]/, // 2D arrays
        ];
        for (const pattern of forbiddenPatterns) {
            if (pattern.test(code)) return false;
        }
        return true;
    }

    async executeWithVisualization(code, input = '') {
        console.log('[DEBUG] executeWithVisualization: start');
        if (!this.isInitialized) {
            await this.initialize();
        }

        code = this.sanitizeCode(code);
        const workspace = await this.createWorkspace();
        try {
            // Only instrument if code is simple
            if (this.isSimpleCode(code)) {
                // Step 1: Instrument the code
                console.log('[DEBUG] Step 1: Instrumenting code...');
                const instrumentedResult = this.codeInstrumenter.instrument(code);
                const completeInstrumentedCode = this.codeInstrumenter.getCompleteInstrumentedCode();
                console.log('[DEBUG] Step 1: Instrumentation complete');
                console.log('[DEBUG] Instrumented code to be compiled:\n', completeInstrumentedCode);

                // Step 2: Compile and run locally
                console.log('[DEBUG] Step 2: Compiling and executing locally...');
                const sourceFile = tmp.tmpNameSync({ postfix: '.cpp' });
                const exeFile = sourceFile.replace(/\.cpp$/, '.exe');
                fs.writeFileSync(sourceFile, completeInstrumentedCode);

                let compileError = null;
                let executionResult = { success: false, stdout: '', stderr: '', exitCode: null, executionTime: 0 };

                await new Promise((resolve) => {
                    exec(`g++ -std=c++20 "${sourceFile}" -o "${exeFile}"`, (err, stdout, stderr) => {
                        if (err) {
                            compileError = stderr;
                            resolve();
                        } else {
                            const child = spawn(exeFile, [], { stdio: ['pipe', 'pipe', 'pipe'] });
                            let output = '';
                            let error = '';
                            child.stdout.on('data', (data) => { output += data.toString(); });
                            child.stderr.on('data', (data) => { error += data.toString(); });
                            child.on('close', (code) => {
                                executionResult = {
                                    success: true,
                                    stdout: output,
                                    stderr: error,
                                    exitCode: code,
                                    executionTime: 0 // You can add timing if needed
                                };
                                resolve();
                            });
                            if (input) {
                                child.stdin.write(input);
                            }
                            child.stdin.end();
                        }
                    });
                });

                if (compileError) {
                    // Handle compilation error
                    return {
                        success: false,
                        error: compileError,
                        executionTrace: null
                    };
                }

                // Step 3: Parse execution logs
                console.log('[DEBUG] Step 3: Parsing execution logs...');
                const executionData = this.logParser.parseLogs(executionResult.stderr);
                console.log('[DEBUG] Step 3: Log parsing complete');

                // Step 4: Create comprehensive execution trace
                console.log('[DEBUG] Step 4: Creating execution trace...');
                const executionTrace = this.createExecutionTrace(executionData, executionResult) || {};
                console.log('[DEBUG] Step 4: Execution trace created');

                return {
                    success: true,
                    stdout: executionResult.stdout,
                    stderr: executionResult.stderr,
                    exitCode: executionResult.exitCode,
                    executionTime: executionResult.executionTime,
                    workspace: workspace.path,
                    // Phase 3: Comprehensive execution data
                    executionTrace: executionTrace,
                    instrumentedCode: completeInstrumentedCode,
                    originalCode: code
                };
            } else {
                // For complex code, just compile and run, return only output
                console.log('[DEBUG] Complex code detected, skipping instrumentation. Compiling and running...');
                const sourceFile = tmp.tmpNameSync({ postfix: '.cpp' });
                const exeFile = sourceFile.replace(/\.cpp$/, '.exe');
                fs.writeFileSync(sourceFile, code);

                let compileError = null;
                let executionResult = { success: false, stdout: '', stderr: '', exitCode: null, executionTime: 0 };

                await new Promise((resolve) => {
                    exec(`g++ -std=c++20 "${sourceFile}" -o "${exeFile}"`, (err, stdout, stderr) => {
                        if (err) {
                            compileError = stderr;
                            resolve();
                        } else {
                            const child = spawn(exeFile, [], { stdio: ['pipe', 'pipe', 'pipe'] });
                            let output = '';
                            let error = '';
                            child.stdout.on('data', (data) => { output += data.toString(); });
                            child.stderr.on('data', (data) => { error += data.toString(); });
                            child.on('close', (code) => {
                                executionResult = {
                                    success: true,
                                    stdout: output,
                                    stderr: error,
                                    exitCode: code,
                                    executionTime: 0
                                };
                                resolve();
                            });
                            if (input) {
                                child.stdin.write(input);
                            }
                            child.stdin.end();
                        }
                    });
                });

                if (compileError) {
                    return {
                        success: false,
                        error: compileError,
                        executionTrace: null
                    };
                }

                // Return only output, no visualization
                return {
                    success: true,
                    stdout: executionResult.stdout,
                    stderr: executionResult.stderr,
                    exitCode: executionResult.exitCode,
                    executionTime: executionResult.executionTime,
                    workspace: workspace.path,
                    executionTrace: null,
                    instrumentedCode: code,
                    originalCode: code
                };
            }
        } catch (error) {
            console.error('[DEBUG] Error in execution pipeline:', error);
            return {
                success: false,
                error: error.message,
                workspace: workspace.path,
                originalCode: code
            };
        } finally {
            setTimeout(() => {
                this.cleanupWorkspace(workspace);
            }, 5000);
        }
    }

    createExecutionTrace(executionData, executionResult) {
        const trace = {
            // Basic execution info
            totalSteps: executionData.steps.length,
            executionTime: executionResult.executionTime,
            exitCode: executionResult.exitCode,
            
            // Step-by-step execution
            steps: executionData.steps.map((step, index) => ({
                ...step,
                stepNumber: index + 1,
                timestamp: this.calculateTimestamp(index, executionResult.executionTime)
            })),
            
            // Variable state tracking
            variableStates: this.trackVariableStates(executionData.steps),
            
            // Control flow analysis
            controlFlow: this.analyzeControlFlow(executionData.steps),
            
            // Function call stack
            callStack: executionData.callStack,
            
            // I/O operations
            ioOperations: this.extractIOOperations(executionData.steps),
            
            // Final state
            finalState: {
                variables: executionData.variables,
                callStack: executionData.callStack,
                output: executionData.output
            }
        };

        return trace;
    }

    trackVariableStates(steps) {
        const variableStates = [];
        const currentVariables = new Map();

        steps.forEach((step, index) => {
            if (step.type === 'variable_declaration') {
                const varName = step.variable.name;
                const varInfo = {
                    name: varName,
                    type: step.variable.type,
                    value: step.variable.value,
                    line: step.line,
                    stepNumber: index + 1
                };
                currentVariables.set(varName, varInfo);
                variableStates.push({
                    stepNumber: index + 1,
                    action: 'declared',
                    variable: varInfo,
                    allVariables: new Map(currentVariables)
                });
            } else if (step.type === 'variable_assignment') {
                const varName = step.variable.name;
                const varInfo = currentVariables.get(varName);
                if (varInfo) {
                    varInfo.value = step.variable.value;
                    varInfo.line = step.line;
                    variableStates.push({
                        stepNumber: index + 1,
                        action: 'assigned',
                        variable: varInfo,
                        allVariables: new Map(currentVariables)
                    });
                }
            }
        });

        return variableStates;
    }

    analyzeControlFlow(steps) {
        const controlFlow = {
            ifStatements: [],
            loops: [],
            functionCalls: [],
            branches: []
        };

        let currentBranch = null;
        let loopIterations = new Map();

        steps.forEach((step, index) => {
            if (step.type === 'if_condition') {
                currentBranch = {
                    type: 'if',
                    condition: step.condition,
                    line: step.line,
                    stepNumber: index + 1,
                    taken: true // We'll determine this based on execution
                };
                controlFlow.ifStatements.push(currentBranch);
            } else if (step.type === 'else_branch') {
                if (currentBranch) {
                    currentBranch.taken = false;
                }
                controlFlow.branches.push({
                    type: 'else',
                    line: step.line,
                    stepNumber: index + 1
                });
            } else if (step.type === 'for_loop' || step.type === 'while_loop') {
                const loopKey = `${step.type}_${step.line}`;
                if (!loopIterations.has(loopKey)) {
                    loopIterations.set(loopKey, 0);
                }
                loopIterations.set(loopKey, loopIterations.get(loopKey) + 1);
                
                controlFlow.loops.push({
                    type: step.type,
                    condition: step.condition,
                    line: step.line,
                    stepNumber: index + 1,
                    iteration: loopIterations.get(loopKey)
                });
            } else if (step.type === 'function_call') {
                controlFlow.functionCalls.push({
                    name: step.function.name,
                    arguments: step.function.arguments,
                    line: step.line,
                    stepNumber: index + 1
                });
            }
        });

        return controlFlow;
    }

    extractIOOperations(steps) {
        return steps.filter(step => 
            step.type === 'input_operation' || step.type === 'output_operation'
        ).map((step, index) => ({
            ...step,
            operationNumber: index + 1
        }));
    }

    calculateTimestamp(stepIndex, totalExecutionTime) {
        // Estimate timestamp based on step position and total execution time
        const stepDuration = totalExecutionTime / Math.max(1, stepIndex + 1);
        return stepIndex * stepDuration;
    }

    async createWorkspace() {
        return new Promise((resolve, reject) => {
            tmp.dir({
                prefix: 'cpp-execution-',
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

    async cleanup() {
        // No Docker cleanup needed in local mode
    }
}

module.exports = ExecutionPipeline; 
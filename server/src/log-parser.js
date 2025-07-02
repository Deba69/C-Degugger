class LogParser {
    constructor() {
        this.executionSteps = [];
        this.currentStep = null;
        this.variables = new Map();
        this.callStack = [];
        this.output = '';
        this.executionMetrics = {
            totalSteps: 0,
            variableOperations: 0,
            controlFlowOperations: 0,
            ioOperations: 0,
            functionCalls: 0
        };
    }

    parseLogs(stderr) {
        console.log('[DEBUG] Raw logs to parse:\n', stderr);
        this.reset();
        const lines = stderr.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('LOG:')) {
                this.parseLogLine(line);
            } else if (line.trim()) {
                // Regular stderr output
                this.output += line + '\n';
            }
        }

        // Calculate execution metrics
        this.calculateMetrics();

        const parsed = {
            steps: this.executionSteps,
            variables: Object.fromEntries(this.variables),
            callStack: this.callStack,
            output: this.output.trim(),
            metrics: this.executionMetrics,
            // Phase 3: Enhanced data structures
            executionSummary: this.createExecutionSummary(),
            variableHistory: this.createVariableHistory(),
            controlFlowPath: this.createControlFlowPath()
        };

        console.log('[DEBUG] Parsed steps:', parsed.steps);
        return parsed;
    }

    reset() {
        this.executionSteps = [];
        this.currentStep = null;
        this.variables.clear();
        this.callStack = [];
        this.output = '';
        this.executionMetrics = {
            totalSteps: 0,
            variableOperations: 0,
            controlFlowOperations: 0,
            ioOperations: 0,
            functionCalls: 0
        };
    }

    parseLogLine(line) {
        // Format: LOG:id:type:data
        const parts = line.split(':');
        if (parts.length < 4) return;

        const [, id, type, ...dataParts] = parts;
        const dataString = dataParts.join(':');
        
        try {
            const data = JSON.parse(dataString);
            this.processLogEntry(parseInt(id), type, data);
        } catch (error) {
            console.error('Error parsing log data:', error);
            console.error('Problematic line:', line);
        }
    }

    processLogEntry(id, type, data) {
        switch (type) {
            case 'VAR_DECL':
                this.handleVariableDeclaration(data);
                break;
            case 'VAR_ASSIGN':
                this.handleVariableAssignment(data);
                break;
            case 'IF_CONDITION':
                this.handleIfCondition(data);
                break;
            case 'ELSE_BRANCH':
                this.handleElseBranch(data);
                break;
            case 'FOR_LOOP':
                this.handleForLoop(data);
                break;
            case 'WHILE_LOOP':
                this.handleWhileLoop(data);
                break;
            case 'DO_WHILE_LOOP':
                this.handleDoWhileLoop(data);
                break;
            case 'FUNCTION_CALL':
                this.handleFunctionCall(data);
                break;
            case 'FUNCTION_ENTER':
                this.handleFunctionEnter(data);
                break;
            case 'INPUT_OPERATION':
                this.handleInputOperation(data);
                break;
            case 'OUTPUT_OPERATION':
                this.handleOutputOperation(data);
                break;
            case 'TRACE_VAR':
                this.handleTraceVar(data);
                break;
        }
    }

    handleVariableDeclaration(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'variable_declaration',
            variable: {
                name: data.name,
                type: data.type,
                value: data.value
            },
            description: `Declaring ${data.type} variable '${data.name}'${data.value !== 'undefined' ? ` with value ${data.value}` : ''}`,
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
        this.variables.set(data.name, {
            type: data.type,
            value: data.value,
            line: data.line,
            declaredAt: step.id
        });
        // Only include primitive values for each variable
        const simpleVariables = {};
        for (const [name, info] of this.variables.entries()) {
            simpleVariables[name] = info.value;
        }
        step.variables = simpleVariables;
    }

    handleVariableAssignment(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'variable_assignment',
            variable: {
                name: data.name,
                operator: data.operator,
                value: data.value
            },
            description: `Assigning ${data.value} to variable '${data.name}' using operator '${data.operator}'`,
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
        // Update variable value
        if (this.variables.has(data.name)) {
            const varInfo = this.variables.get(data.name);
            varInfo.value = data.value;
            varInfo.line = data.line;
            varInfo.lastModifiedAt = step.id;
        }
        // Only include primitive values for each variable
        const simpleVariables = {};
        for (const [name, info] of this.variables.entries()) {
            simpleVariables[name] = info.value;
        }
        step.variables = simpleVariables;
    }

    handleIfCondition(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'if_condition',
            condition: data.condition,
            description: `Checking condition: ${data.condition}`,
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
    }

    handleElseBranch(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'else_branch',
            description: 'Entering else branch',
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
    }

    handleForLoop(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'for_loop',
            condition: data.condition,
            description: `Starting for loop: ${data.condition}`,
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
    }

    handleWhileLoop(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'while_loop',
            condition: data.condition,
            description: `Checking while condition: ${data.condition}`,
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
    }

    handleDoWhileLoop(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'do_while_loop',
            description: 'Executing do-while loop body',
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
    }

    handleFunctionCall(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'function_call',
            function: {
                name: data.name,
                arguments: data.arguments
            },
            description: `Calling function '${data.name}' with arguments: ${data.arguments}`,
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
    }

    handleFunctionEnter(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'function_enter',
            function: {
                name: data.name,
                returnType: data.returnType,
                parameters: data.parameters
            },
            description: `Entering function '${data.name}'`,
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
        this.callStack.push(data.name);
    }

    handleInputOperation(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'input_operation',
            operation: data.operation,
            target: data.target,
            description: `Reading input using ${data.operation}`,
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
    }

    handleOutputOperation(data) {
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'output_operation',
            operation: data.operation,
            content: data.content,
            description: `Outputting: ${data.content}`,
            timestamp: Date.now()
        };

        this.executionSteps.push(step);
    }

    handleTraceVar(data) {
        // data is a JSON object with name, value, and line
        const step = {
            id: this.executionSteps.length + 1,
            line: data.line,
            type: 'trace_var',
            variable: {
                name: data.name,
                value: data.value
            },
            description: `Variable '${data.name}' is now ${data.value}`,
            timestamp: Date.now()
        };
        this.executionSteps.push(step);
        this.variables.set(data.name, {
            value: data.value,
            line: data.line,
            lastModifiedAt: step.id
        });
        // Add variable snapshot to step
        const simpleVariables = {};
        for (const [name, info] of this.variables.entries()) {
            simpleVariables[name] = info.value;
        }
        step.variables = simpleVariables;
    }

    calculateMetrics() {
        this.executionMetrics.totalSteps = this.executionSteps.length;
        
        this.executionSteps.forEach(step => {
            switch (step.type) {
                case 'variable_declaration':
                case 'variable_assignment':
                    this.executionMetrics.variableOperations++;
                    break;
                case 'if_condition':
                case 'else_branch':
                case 'for_loop':
                case 'while_loop':
                case 'do_while_loop':
                    this.executionMetrics.controlFlowOperations++;
                    break;
                case 'input_operation':
                case 'output_operation':
                    this.executionMetrics.ioOperations++;
                    break;
                case 'function_call':
                case 'function_enter':
                    this.executionMetrics.functionCalls++;
                    break;
            }
        });
    }

    createExecutionSummary() {
        return {
            totalSteps: this.executionMetrics.totalSteps,
            executionTime: this.calculateExecutionTime(),
            variableCount: this.variables.size,
            functionCallCount: this.executionMetrics.functionCalls,
            ioOperationCount: this.executionMetrics.ioOperations,
            controlFlowCount: this.executionMetrics.controlFlowOperations,
            finalCallStackDepth: this.callStack.length
        };
    }

    createVariableHistory() {
        const history = [];
        this.variables.forEach((varInfo, varName) => {
            history.push({
                name: varName,
                type: varInfo.type,
                initialValue: varInfo.value,
                declaredAt: varInfo.declaredAt,
                lastModifiedAt: varInfo.lastModifiedAt || varInfo.declaredAt,
                currentValue: varInfo.value
            });
        });
        return history;
    }

    createControlFlowPath() {
        const path = [];
        this.executionSteps.forEach(step => {
            if (step.type === 'if_condition' || step.type === 'else_branch' || 
                step.type === 'for_loop' || step.type === 'while_loop' || 
                step.type === 'do_while_loop') {
                path.push({
                    stepId: step.id,
                    type: step.type,
                    line: step.line,
                    description: step.description
                });
            }
        });
        return path;
    }

    calculateExecutionTime() {
        if (this.executionSteps.length === 0) return 0;
        
        const firstStep = this.executionSteps[0];
        const lastStep = this.executionSteps[this.executionSteps.length - 1];
        return lastStep.timestamp - firstStep.timestamp;
    }

    // Get current state at any point
    getCurrentState() {
        return {
            variables: Object.fromEntries(this.variables),
            callStack: [...this.callStack],
            currentStep: this.currentStep,
            metrics: this.executionMetrics
        };
    }

    // Get step-by-step execution data
    getExecutionData() {
        return {
            totalSteps: this.executionSteps.length,
            steps: this.executionSteps,
            finalVariables: Object.fromEntries(this.variables),
            finalCallStack: [...this.callStack],
            output: this.output,
            metrics: this.executionMetrics
        };
    }
}

module.exports = LogParser; 
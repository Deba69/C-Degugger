const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const tmp = require('tmp');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// Import new modules
const CompilationPipeline = require('./compilation-pipeline');
const ExecutionPipeline = require('./execution-pipeline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Allow only the deployed frontend domain
app.use(cors({
  origin: 'https://c-debugger.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// Explicitly handle preflight OPTIONS requests for all routes
app.options('*', cors({
  origin: 'https://c-debugger.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(bodyParser.json());

// Store active debugging sessions
const sessions = new Map();

// Initialize pipelines
const compilationPipeline = new CompilationPipeline();
const executionPipeline = new ExecutionPipeline();

// Cleanup old containers every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    try {
        await compilationPipeline.cleanup();
        await executionPipeline.cleanup();
    } catch (error) {
        console.error('Error during scheduled cleanup:', error);
    }
});

// Initialize the pipelines on startup
Promise.all([
    compilationPipeline.initialize(),
    executionPipeline.initialize()
]).catch(error => {
    console.error('Failed to initialize pipelines:', error);
});

// Replace the CppVisualizer class with a more robust version supporting for, while, do-while, and if/else
class CppVisualizer {
    constructor(code) {
        this.code = code;
        this.lines = code.split('\n');
        this.variables = {};
        this.output = '';
        this.ast = [];
        this.steps = [];
        this.stack = [];
        this.reset();
    }

    parse() {
        this.ast = this.buildAST(this.lines);
        this.reset();
    }

    reset() {
        this.variables = {};
        this.output = '';
        this.stack = [{ type: 'block', body: this.ast, index: 0 }];
    }

    buildAST(lines) {
        // Very simple parser for main, loops, and if/else
        let ast = [];
        let i = 0;
        while (i < lines.length) {
            let line = lines[i].trim();
            if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('using ')) { i++; continue; }
            if (line.startsWith('int main')) { i++; continue; }
            if (line.startsWith('for')) {
                // Parse for loop
                let header = line;
                let body = [];
                i++;
                let braceCount = 0;
                if (lines[i].includes('{')) braceCount++;
                while (i < lines.length) {
                    if (lines[i].includes('{')) braceCount++;
                    if (lines[i].includes('}')) braceCount--;
                    if (braceCount === 0) break;
                    body.push(lines[i]);
                    i++;
                }
                ast.push({ type: 'for', header, body });
                i++;
                continue;
            }
            if (line.startsWith('while')) {
                // Parse while loop
                let header = line;
                let body = [];
                i++;
                let braceCount = 0;
                if (lines[i].includes('{')) braceCount++;
                while (i < lines.length) {
                    if (lines[i].includes('{')) braceCount++;
                    if (lines[i].includes('}')) braceCount--;
                    if (braceCount === 0) break;
                    body.push(lines[i]);
                    i++;
                }
                ast.push({ type: 'while', header, body });
                i++;
                continue;
            }
            if (line.startsWith('do')) {
                // Parse do-while loop
                let body = [];
                i++;
                let braceCount = 0;
                if (lines[i].includes('{')) braceCount++;
                while (i < lines.length) {
                    if (lines[i].includes('{')) braceCount++;
                    if (lines[i].includes('}')) braceCount--;
                    if (braceCount === 0) break;
                    body.push(lines[i]);
                    i++;
                }
                // The while condition is on the next line
                let condLine = lines[i] || '';
                ast.push({ type: 'do-while', condLine, body });
                i++;
                continue;
            }
            if (line.startsWith('if')) {
                // Parse if/else
                let cond = line;
                let body = [];
                i++;
                let braceCount = 0;
                if (lines[i].includes('{')) braceCount++;
                while (i < lines.length) {
                    if (lines[i].includes('{')) braceCount++;
                    if (lines[i].includes('}')) braceCount--;
                    if (braceCount === 0) break;
                    body.push(lines[i]);
                    i++;
                }
                // Check for else
                let elseBody = null;
                if (lines[i+1] && lines[i+1].trim().startsWith('else')) {
                    i += 2;
                    let elseBraceCount = 0;
                    if (lines[i].includes('{')) elseBraceCount++;
                    let elseLines = [];
                    while (i < lines.length) {
                        if (lines[i].includes('{')) elseBraceCount++;
                        if (lines[i].includes('}')) elseBraceCount--;
                        if (elseBraceCount === 0) break;
                        elseLines.push(lines[i]);
                        i++;
                    }
                    elseBody = elseLines;
                    i++;
                }
                ast.push({ type: 'if', cond, body, elseBody });
                i++;
                continue;
            }
            // Otherwise, treat as a statement
            ast.push({ type: 'stmt', code: line });
            i++;
        }
        return ast;
    }

    executeStep() {
        if (!this.stack.length) return { done: true };
        let frame = this.stack[this.stack.length - 1];
        if (frame.index >= frame.body.length) {
            this.stack.pop();
            return this.executeStep();
        }
        let node = frame.body[frame.index];
        frame.index++;
        let stepOutput = '';
        let description = '';
        if (node.type === 'stmt') {
            let code = node.code;
            // Support both 'int x = ...;' and 'x = ...;' inside any block
            let declMatch = code.match(/^int\s+(\w+)\s*=\s*(-?\d+)/);
            if (declMatch) {
                this.variables[declMatch[1]] = parseInt(declMatch[2]);
                description = `Declaring variable ${declMatch[1]} = ${declMatch[2]}`;
            } else {
                let assignMatch = code.match(/^([a-zA-Z_]\w*)\s*([+\-*/]?=)\s*([a-zA-Z_]\w*|\d+)/);
                if (assignMatch) {
                    let v = assignMatch[1];
                    let op = assignMatch[2];
                    let val = assignMatch[3];
                    let right;
                    if (this.variables.hasOwnProperty(val)) {
                        right = this.variables[val];
                        if (typeof right !== 'number') {
                            throw new Error(`Variable '${val}' does not contain a numeric value.`);
                        }
                    } else if (!isNaN(Number(val))) {
                        right = parseInt(val);
                    } else {
                        throw new Error(`Unknown variable or invalid value: ${val}`);
                    }
                    if (typeof this.variables[v] !== 'number') {
                        throw new Error(`Variable '${v}' is not initialized as a number.`);
                    }
                    if (op === '=') this.variables[v] = right;
                    if (op === '+=') this.variables[v] += right;
                    if (op === '-=') this.variables[v] -= right;
                    if (op === '*=') this.variables[v] *= right;
                    if (op === '/=') this.variables[v] = Math.floor(this.variables[v] / right);
                    description = `${v} ${op} ${val}`;
                } else if (code.includes('cout') && code.includes('<<')) {
                    let coutExpr = code.replace(/^cout\s*<</, '').replace(/;$/, '');
                    let parts = coutExpr.split('<<').map(s => s.trim());
                    let out = '';
                    for (let part of parts) {
                        if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'")) && part.endsWith("'")) {
                            out += part.slice(1, -1);
                        } else if (part === '\\n') {
                            out += '\n';
                        } else if (this.variables.hasOwnProperty(part)) {
                            out += this.variables[part];
                        } else if (!isNaN(Number(part))) {
                            out += part;
                        } else {
                            out += part;
                        }
                    }
                    stepOutput = out + '\n';
                    this.output += stepOutput;
                    description = 'Printing output';
                }
            }
        } else if (node.type === 'for') {
            // Parse for header: for (int i = 0; i <= n; i++)
            let header = node.header;
            let m = header.match(/for\s*\(\s*(int\s+)?(\w+)\s*=\s*([^;]+);\s*([^;]+);\s*([^\)]+)\)/);
            if (m) {
                let isDecl = !!m[1];
                let varName = m[2];
                let startVal = this.evalExpr(m[3]);
                let cond = m[4];
                let inc = m[5];
                if (!node._initialized) {
                    if (isDecl || !(varName in this.variables)) {
                        this.variables[varName] = startVal;
                    } else {
                        this.variables[varName] = startVal;
                    }
                    node._initialized = true;
                }
                node._for = { cond, inc, varName };
            }
            node._first = true;
            node._bodyIndex = 0;
            node._loopStarted = false;
            // Push a for-loop frame
            this.stack.push({ type: 'for', node, body: node.body, index: 0 });
            description = 'Entering for loop';
        } else if (node.type === 'while') {
            let header = node.header;
            let m = header.match(/while\s*\((.*)\)/);
            if (m) {
                let cond = m[1];
                node._while = { cond };
                node._bodyIndex = 0;
            }
            this.stack.push({ type: 'while', node, body: node.body, index: 0 });
            description = 'Entering while loop';
        } else if (node.type === 'do-while') {
            let condLine = node.condLine;
            let m = condLine.match(/while\s*\((.*)\)/);
            if (m) {
                let cond = m[1];
                node._doWhile = { cond };
                node._bodyIndex = 0;
                node._first = true;
            }
            this.stack.push({ type: 'do-while', node, body: node.body, index: 0 });
            description = 'Entering do-while loop';
        } else if (node.type === 'if') {
            let cond = node.cond.match(/if\s*\((.*)\)/)[1];
            if (this.evalCond(cond)) {
                this.stack.push({ type: 'block', body: node.body, index: 0 });
                description = 'If branch taken';
            } else if (node.elseBody) {
                this.stack.push({ type: 'block', body: node.elseBody, index: 0 });
                description = 'Else branch taken';
            } else {
                description = 'If condition false, no else';
            }
        }

        // Handle loop continuation for for/while/do-while
        let top = this.stack[this.stack.length - 1];
        if (top && top.type === 'for') {
            let { cond, inc, varName } = top.node._for;
            if (top.index >= top.body.length) {
                this.evalExpr(inc);
                top.index = 0;
            }
            if (!this.evalCond(cond)) {
                this.stack.pop();
            }
        } else if (top && top.type === 'while') {
            let { cond } = top.node._while;
            if (top.index >= top.body.length) {
                top.index = 0;
            }
            if (!this.evalCond(cond)) {
                this.stack.pop();
            }
        } else if (top && top.type === 'do-while') {
            let { cond } = top.node._doWhile;
            if (top.index >= top.body.length) {
                top.index = 0;
                if (!this.evalCond(cond)) {
                    this.stack.pop();
                }
            }
        }

        return {
            done: this.stack.length === 0,
            currentLine: node.line || 0,
            variables: { ...this.variables },
            description,
            output: stepOutput
        };
    }

    evalExpr(expr) {
        // Evaluate simple expressions like n, 5, i++, i--, ++i, --i
        expr = expr.trim();
        if (expr.endsWith('++')) {
            let v = expr.replace('++', '').trim();
            let val = this.variables[v];
            this.variables[v] = val + 1;
            return val;
        } else if (expr.endsWith('--')) {
            let v = expr.replace('--', '').trim();
            let val = this.variables[v];
            this.variables[v] = val - 1;
            return val;
        } else if (expr.startsWith('++')) {
            let v = expr.replace('++', '').trim();
            this.variables[v] += 1;
            return this.variables[v];
        } else if (expr.startsWith('--')) {
            let v = expr.replace('--', '').trim();
            this.variables[v] -= 1;
            return this.variables[v];
        } else if (this.variables.hasOwnProperty(expr)) {
            return this.variables[expr];
        } else if (!isNaN(Number(expr))) {
            return parseInt(expr);
        }
        return 0;
    }

    evalCond(cond) {
        // Evaluate simple conditions like i <= n, i < 10, etc
        cond = cond.trim();
        let m = cond.match(/(\w+)\s*([<>=!]+)\s*(\w+|\d+)/);
        if (m) {
            let left = this.variables.hasOwnProperty(m[1]) ? this.variables[m[1]] : parseInt(m[1]);
            let op = m[2];
            let right = this.variables.hasOwnProperty(m[3]) ? this.variables[m[3]] : parseInt(m[3]);
            if (op === '<') return left < right;
            if (op === '<=') return left <= right;
            if (op === '>') return left > right;
            if (op === '>=') return left >= right;
            if (op === '==') return left == right;
            if (op === '!=') return left != right;
        }
        return false;
    }

    getAllSteps() {
        this.reset();
        const allSteps = [];
        let result;
        do {
            result = this.executeStep();
            if (!result.done) allSteps.push(result);
        } while (!result.done);
        this.reset();
        return allSteps;
    }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
    const sessionId = uuidv4();
    sessions.set(sessionId, { ws, visualizer: null, gdb: null });

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'compile':
                handleCompile(sessionId, data.code, data.input || "");
                break;
            case 'dryRun':
                handleDryRun(sessionId, data.code, data.input || "");
                break;
            case 'run':
                handleRun(sessionId, data.code, data.input || "");
                break;
            case 'start':
                handleStart(sessionId);
                break;
            case 'step':
                handleStep(sessionId);
                break;
            case 'continue':
                handleContinue(sessionId);
                break;
            case 'stop':
                handleStop(sessionId);
                break;
            case 'gdbDebug':
                handleGdbDebug(sessionId, data.code, data.input || "");
                break;
            case 'gdbStep':
                handleGdbStep(sessionId);
                break;
            case 'gdbContinue':
                handleGdbContinue(sessionId);
                break;
        }
    });

    ws.on('close', () => {
        handleStop(sessionId);
        sessions.delete(sessionId);
    });
});

async function handleCompile(sessionId, code, input = "") {
    const session = sessions.get(sessionId);
    if (!session) return;

    try {
        // Create visualizer
        const visualizer = new CppVisualizer(code);
        visualizer.parse();
        session.visualizer = visualizer;
        
        // Send compilation success
                session.ws.send(JSON.stringify({
                    type: 'compileSuccess'
                }));

        // Send preview of all steps
        const allSteps = visualizer.getAllSteps();
                        session.ws.send(JSON.stringify({
            type: 'visualizationReady',
            totalSteps: allSteps.length,
            preview: allSteps
        }));

    } catch (error) {
        session.ws.send(JSON.stringify({
            type: 'compileError',
            error: error.message
        }));
    }
}

function handleStart(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || !session.visualizer) return;

    session.visualizer.reset();
                session.ws.send(JSON.stringify({
        type: 'visualizationStarted'
    }));
}

function handleStep(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || !session.visualizer) return;

    const result = session.visualizer.executeStep();
    
    if (result.done) {
            session.ws.send(JSON.stringify({
            type: 'visualizationComplete',
            finalOutput: session.visualizer.output
        }));
    } else {
        session.ws.send(JSON.stringify({
            type: 'debugStep',
            currentLine: result.currentLine,
            variables: result.variables,
            description: result.description,
            output: result.output
        }));
    }
}

function handleContinue(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || !session.visualizer) return;

    // Execute all remaining steps
    while (true) {
        const result = session.visualizer.executeStep();
        if (result.done) break;

        session.ws.send(JSON.stringify({
            type: 'debugStep',
            currentLine: result.currentLine,
            variables: result.variables,
            description: result.description,
            output: result.output
        }));
    }

    session.ws.send(JSON.stringify({
        type: 'visualizationComplete',
        finalOutput: session.visualizer.output
    }));
}

function handleStop(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;

    if (session.visualizer) {
        session.visualizer.reset();
    }
    if (session.gdb) {
        session.gdb.kill();
        session.gdb = null;
    }
}

// Check if code is eligible for dry run (only main() with simple loops/conditionals)
function isEligibleForDryRun(code) {
    // Only allow if code contains 'int main()' and does NOT contain functions other than main, classes, or advanced constructs
    // Allow only for/while/if/else, variable declarations, assignments, cout, and return
    const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
    const allowedPatterns = [
        /^#/, // preprocessor directives
        /^using\s+namespace\s+std\s*;/, // using namespace std;
        /^int\s+main\s*\(\s*\)\s*\{?$/,
        /^for\s*\(/,
        /^while\s*\(/,
        /^if\s*\(/,
        /^else/,
        /^int\s+/, 
        /^\w+\s*[+\-*/]?=\s*\w+/, 
        /^cout\s*<</, 
        /^return\s+/, 
        /^\}/, 
        /^\{$/
    ];
    let inMain = false;
    for (const line of lines) {
        if (line.startsWith('int main')) inMain = true;
        if (!inMain && line && !/^#/.test(line) && !/^using\s+namespace\s+std\s*;/.test(line)) return false;
        if (line.startsWith('int ') && !line.startsWith('int main')) {
            // variable declaration is fine
            continue;
        }
        if (!allowedPatterns.some(pat => pat.test(line))) {
            return false;
        }
    }
    return true;
}

function handleDryRun(sessionId, code, input = "") {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (!isEligibleForDryRun(code)) {
        session.ws.send(JSON.stringify({
            type: 'dryRunNotSupported'
        }));
        return;
    }
    // Use the same logic as handleCompile for visualization
    try {
        const visualizer = new CppVisualizer(code);
        visualizer.parse();
        session.visualizer = visualizer;
        const allSteps = visualizer.getAllSteps();
        session.ws.send(JSON.stringify({
            type: 'visualizationReady',
            totalSteps: allSteps.length,
            preview: allSteps
        }));
    } catch (error) {
        session.ws.send(JSON.stringify({
            type: 'compileError',
            error: error.message
        }));
    }
}

function handleRun(sessionId, code, input = "") {
    const session = sessions.get(sessionId);
    if (!session) return;
    // Save code to temp file, compile and run, return output
    tmp.file({ postfix: '.cpp' }, (err, tempFilePath, fd, cleanupCallback) => {
        if (err) {
            session.ws.send(JSON.stringify({
                type: 'compileError',
                error: 'Temp file error'
            }));
            return;
        }
        fs.writeFileSync(tempFilePath, code);
        const exePath = tempFilePath.replace(/\.cpp$/, '.exe');
        exec(`g++ -std=c++20 "${tempFilePath}" -o "${exePath}"`, (compileErr, stdout, stderr) => {
            if (compileErr) {
                session.ws.send(JSON.stringify({
                    type: 'compileError',
                    error: stderr || 'Compilation failed'
                }));
                cleanupCallback();
                return;
            }
            // Run the executable
            const child = spawn(exePath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
            let output = '';
            child.stdout.on('data', (data) => { output += data.toString(); });
            child.stderr.on('data', (data) => { output += data.toString(); });
            child.on('close', (code) => {
                session.ws.send(JSON.stringify({
                    type: 'runOutput',
                    output
                }));
                cleanupCallback();
            });
            if (input) {
                child.stdin.write(input);
            }
            child.stdin.end();
        });
    });
}

// GDB Debug Handler
function handleGdbDebug(sessionId, code, input = "") {
    const session = sessions.get(sessionId);
    if (!session) return;
    tmp.file({ postfix: '.cpp' }, (err, tempFilePath, fd, cleanupCallback) => {
        if (err) {
            session.ws.send(JSON.stringify({
                type: 'compileError',
                error: 'Temp file error'
            }));
            return;
        }
        fs.writeFileSync(tempFilePath, code);
        const exePath = tempFilePath.replace(/\.cpp$/, '.exe');
        // Compile with debug symbols
        exec(`g++ -std=c++20 -g "${tempFilePath}" -o "${exePath}"`, (compileErr, stdout, stderr) => {
            if (compileErr) {
                session.ws.send(JSON.stringify({
                    type: 'compileError',
                    error: stderr || 'Compilation failed'
                }));
                cleanupCallback();
                return;
            }
            // Start GDB in MI mode
            const gdb = spawn('gdb', ['-q', '--interpreter=mi2', exePath]);
            session.gdb = gdb; // Store GDB process in session
            session.gdbWaitingForCommand = false;
            let gdbOutput = '';
            let stopped = false;
            function sendToGdb(cmd) {
                if (gdb.stdin.writable) {
                    gdb.stdin.write(cmd + '\n');
                }
            }
            gdb.stdout.on('data', (data) => {
                gdbOutput += data.toString();
                // Parse for breakpoint hit or step
                if (/\*stopped,reason="breakpoint-hit"/.test(gdbOutput) || /\*stopped,reason="end-stepping-range"/.test(gdbOutput)) {
                    // Query current frame, variables, and stack
                    sendToGdb('-stack-info-frame');
                    sendToGdb('-stack-list-variables --all-values');
                    sendToGdb('-stack-list-frames');
                    // Send step info to frontend
                    setTimeout(() => {
                        const state = parseGdbState(gdbOutput);
                        session.ws.send(JSON.stringify({
                            type: 'gdbStep',
                            ...state
                        }));
                        gdbOutput = '';
                        session.gdbWaitingForCommand = true; // Now wait for frontend command
                    }, 100);
                }
                // Detect program exit
                if (/\*stopped,reason="exited-normally"/.test(gdbOutput)) {
                    session.ws.send(JSON.stringify({
                        type: 'gdbComplete'
                    }));
                    stopped = true;
                    gdb.kill();
                    session.gdb = null;
                    session.gdbWaitingForCommand = false;
                    cleanupCallback();
                }
            });
            gdb.stderr.on('data', (data) => {
                session.ws.send(JSON.stringify({
                    type: 'gdbError',
                    error: data.toString()
                }));
            });
            gdb.on('close', () => {
                if (!stopped) cleanupCallback();
                session.gdb = null; // Clear from session
                session.gdbWaitingForCommand = false;
            });
            // Start debugging: set a breakpoint at main and run
            sendToGdb('-break-insert main');
            sendToGdb('-exec-run');
        });
    });
}

function handleGdbStep(sessionId) {
    const session = sessions.get(sessionId);
    if (session && session.gdb && session.gdbWaitingForCommand) {
        session.gdb.stdin.write('-exec-next\n');
        session.gdbWaitingForCommand = false;
    }
}

function handleGdbContinue(sessionId) {
    const session = sessions.get(sessionId);
    if (session && session.gdb && session.gdbWaitingForCommand) {
        session.gdb.stdin.write('-exec-continue\n');
        session.gdbWaitingForCommand = false;
    }
}

// Helper to parse GDB MI output for state (very basic, can be improved)
function parseGdbState(output) {
    // Extract current line, variables, and call stack from MI output
    let currentLine = null;
    let variables = {};
    let callStack = [];
    // Parse current frame
    const frameMatch = output.match(/frame=\{level="\d+",addr="[^"]+",func="([^"]+)",file="([^"]+)",fullname="([^"]+)",line="(\d+)"/);
    if (frameMatch) {
        currentLine = parseInt(frameMatch[4]);
    }
    // Parse variables
    const varRegex = /name="([^"]+)",value="([^"]+)"/g;
    let m;
    while ((m = varRegex.exec(output)) !== null) {
        variables[m[1]] = m[2];
    }
    // Parse call stack
    const stackRegex = /frame=\{level="(\d+)",addr="[^"]+",func="([^"]+)",file="([^"]+)",fullname="([^"]+)",line="(\d+)"/g;
    while ((m = stackRegex.exec(output)) !== null) {
        callStack.push({
            level: parseInt(m[1]),
            func: m[2],
            file: m[3],
            fullname: m[4],
            line: parseInt(m[5])
        });
    }
    return { currentLine, variables, callStack };
}

// New REST endpoints for compilation pipeline
app.post('/api/compile', async (req, res) => {
    try {
        const { code, input = '' } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        // Validate code first
        const validation = await compilationPipeline.validateCode(code);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Code validation failed',
                details: validation.errors,
                warnings: validation.warnings
            });
        }

        // Compile and run the code
        const result = await compilationPipeline.compileAndRun(code, input);
        
        res.json(result);
    } catch (error) {
        console.error('Error in compile endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Phase 2: New visualization endpoint
app.post('/api/visualize', async (req, res) => {
    try {
        const { code, input = '' } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        // Validate code first
        const validation = await compilationPipeline.validateCode(code);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Code validation failed',
                details: validation.errors,
                warnings: validation.warnings
            });
        }

        // Compile, run, and visualize the code
        const result = await compilationPipeline.compileAndVisualize(code, input);
        
        res.json(result);
    } catch (error) {
        console.error('Error in visualize endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Phase 3: Enhanced execution endpoint with comprehensive data
app.post('/api/execute', async (req, res) => {
    try {
        console.log('[DEBUG] /api/execute called');
        const { code, input = '' } = req.body;
        
        if (!code) {
            console.log('[DEBUG] No code provided');
            return res.status(400).json({ error: 'Code is required' });
        }

        // Validate code first
        console.log('[DEBUG] Validating code...');
        const validation = await compilationPipeline.validateCode(code);
        if (!validation.isValid) {
            console.log('[DEBUG] Code validation failed');
            return res.status(400).json({
                error: 'Code validation failed',
                details: validation.errors,
                warnings: validation.warnings
            });
        }

        // Execute with comprehensive visualization
        console.log('[DEBUG] Calling executionPipeline.executeWithVisualization...');
        const result = await executionPipeline.executeWithVisualization(code, input);
        console.log('[DEBUG] executionPipeline.executeWithVisualization returned');
        
        res.json(result);
        console.log('[DEBUG] Response sent');
    } catch (error) {
        console.error('[DEBUG] Error in /api/execute endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Phase 3: Get execution analysis
app.post('/api/analyze', async (req, res) => {
    try {
        const { code, input = '' } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        // Execute and get comprehensive analysis
        const result = await executionPipeline.executeWithVisualization(code, input);
        
        if (!result.success) {
            return res.status(400).json(result);
        }

        // Extract analysis data
        const analysis = {
            success: true,
            executionSummary: result.executionTrace.executionSummary,
            variableAnalysis: {
                totalVariables: result.executionTrace.finalState.variables.length,
                variableHistory: result.executionTrace.variableStates,
                finalVariables: result.executionTrace.finalState.variables
            },
            controlFlowAnalysis: {
                ifStatements: result.executionTrace.controlFlow.ifStatements,
                loops: result.executionTrace.controlFlow.loops,
                functionCalls: result.executionTrace.controlFlow.functionCalls,
                controlFlowPath: result.executionTrace.controlFlow
            },
            ioAnalysis: {
                inputOperations: result.executionTrace.ioOperations.filter(op => op.type === 'input_operation'),
                outputOperations: result.executionTrace.ioOperations.filter(op => op.type === 'output_operation'),
                totalIOOperations: result.executionTrace.ioOperations.length
            },
            performanceMetrics: {
                totalSteps: result.executionTrace.totalSteps,
                executionTime: result.executionTrace.executionTime,
                stepsPerSecond: result.executionTrace.totalSteps / (result.executionTrace.executionTime / 1000)
            }
        };
        
        res.json(analysis);
    } catch (error) {
        console.error('Error in analyze endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/validate', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const validation = await compilationPipeline.validateCode(code);
        res.json(validation);
    } catch (error) {
        console.error('Error in validate endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/compilation-info', async (req, res) => {
    try {
        const info = await compilationPipeline.getCompilationInfo();
        res.json(info);
    } catch (error) {
        console.error('Error getting compilation info:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/health', async (req, res) => {
    try {
        // Test if Docker is available and compilation pipeline is ready
        const isReady = compilationPipeline.isInitialized;
        res.json({
            status: 'ok',
            docker: isReady,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in health check:', error);
        res.status(500).json({ 
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 
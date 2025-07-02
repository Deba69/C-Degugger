const fs = require('fs');
const Parser = require('tree-sitter');
const Cpp = require('tree-sitter-cpp');

class CodeInstrumenter {
    constructor() {
        this.lineNumber = 0;
        this.variableCounter = 0;
        this.logStatements = [];
        this.instrumentedCode = '';
        this.variables = new Map();
        this.functionStack = [];
        this.loopStack = [];
        this.parser = new Parser();
        this.parser.setLanguage(Cpp);
    }

    instrument(code) {
        this.reset();
        // Use AST-based instrumentation only
        const instrumentedCode = this.instrumentWithAST(code);
        this.instrumentedCode = instrumentedCode;
        return {
            code: this.instrumentedCode,
            logStatements: this.logStatements
        };
    }

    reset() {
        this.lineNumber = 0;
        this.variableCounter = 0;
        this.logStatements = [];
        this.instrumentedCode = '';
        this.variables.clear();
        this.functionStack = [];
        this.loopStack = [];
    }

    isCommentOrPreprocessor(line) {
        return line.startsWith('//') || 
               line.startsWith('#') || 
               line.startsWith('/*') || 
               line.startsWith('*/') ||
               line === '';
    }

    isIfStatement(line) {
        return line.startsWith('if') || line.startsWith('else if') || line.startsWith('else');
    }

    isLoopStatement(line) {
        return line.startsWith('for') || line.startsWith('while') || line.startsWith('do');
    }

    isElseStatement(line) {
        return line.startsWith('else');
    }

    isVariableDeclaration(line) {
        const patterns = [
            /^int\s+\w+\s*[=;]/,
            /^string\s+\w+\s*[=;]/,
            /^char\s+\w+\s*[=;]/,
            /^double\s+\w+\s*[=;]/,
            /^float\s+\w+\s*[=;]/,
            /^bool\s+\w+\s*[=;]/
        ];
        return patterns.some(pattern => pattern.test(line));
    }

    isVariableAssignment(line) {
        return /^\w+\s*[+\-*/]?=\s*[^=]/.test(line);
    }

    isIOOperation(line) {
        return line.includes('cin') || line.includes('cout') || line.includes('printf') || line.includes('scanf');
    }

    isFunctionCall(line) {
        return /\w+\s*\([^)]*\)/.test(line) && !line.includes('=') && !line.includes('if') && !line.includes('for') && !line.includes('while');
    }

    isFunctionDefinition(line) {
        return /^\w+\s+\w+\s*\([^)]*\)\s*\{?$/.test(line);
    }

    createBlockLogStatement(type, line) {
        if (type === 'if') {
            const conditionMatch = line.match(/if\s*\((.+)\)/);
            return this.createLogStatement('IF_CONDITION', {
                line: this.lineNumber,
                condition: conditionMatch ? conditionMatch[1] : line
            });
        } else if (type === 'else') {
            return this.createLogStatement('ELSE_BRANCH', {
                line: this.lineNumber
            });
        } else if (type === 'loop') {
            if (line.startsWith('for')) {
                return this.createLogStatement('FOR_LOOP', {
                    line: this.lineNumber,
                    condition: line
                });
            } else if (line.startsWith('while')) {
                const conditionMatch = line.match(/while\s*\((.+)\)/);
                return this.createLogStatement('WHILE_LOOP', {
                    line: this.lineNumber,
                    condition: conditionMatch ? conditionMatch[1] : line
                });
            } else if (line.startsWith('do')) {
                return this.createLogStatement('DO_WHILE_LOOP', {
                    line: this.lineNumber
                });
            }
        }
        return '';
    }

    createLogStatement(type, data) {
        const logId = ++this.variableCounter;
        const jsonString = JSON.stringify(data);
        // Use C++ raw string literal: R"(...json...)"
        return `log_execution(${logId}, "${type}", R"(${jsonString})");`;
    }

    indent(line) {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    // Add logging function to the code
    addLoggingFunction() {
        const loggingFunction = `#include <iostream>
#include <string>

void log_execution(int id, const std::string& type, const std::string& data) {
    std::cerr << "LOG:" << id << ":" << type << ":" << data << std::endl;
}`;
        return loggingFunction;
    }

    // Add logging function, to_string_custom helper, and TRACE_VAR macro to the code
    addInstrumentationHelpers() {
        // Helper function for robust stringification
        const helperFunction = `#include <sstream>
#include <vector>
#include <array>
#include <type_traits>

// Fallback: for types that can be streamed to ostringstream
template<typename T>
auto to_string_custom(const T& value) -> decltype(std::declval<std::ostringstream&>() << value, std::string()) {
    std::ostringstream oss;
    oss << value;
    return oss.str();
}
// For std::vector
template<typename T>
std::string to_string_custom(const std::vector<T>& vec) {
    std::ostringstream oss;
    oss << "[";
    for (size_t i = 0; i < vec.size(); ++i) {
        oss << to_string_custom(vec[i]);
        if (i + 1 < vec.size()) oss << ",";
    }
    oss << "]";
    return oss.str();
}
// For std::array
template<typename T, size_t N>
std::string to_string_custom(const std::array<T, N>& arr) {
    std::ostringstream oss;
    oss << "[";
    for (size_t i = 0; i < N; ++i) {
        oss << to_string_custom(arr[i]);
        if (i + 1 < N) oss << ",";
    }
    oss << "]";
    return oss.str();
}
// For fundamental types, fallback to std::to_string
inline std::string to_string_custom(int value) { return std::to_string(value); }
inline std::string to_string_custom(long value) { return std::to_string(value); }
inline std::string to_string_custom(long long value) { return std::to_string(value); }
inline std::string to_string_custom(unsigned value) { return std::to_string(value); }
inline std::string to_string_custom(unsigned long value) { return std::to_string(value); }
inline std::string to_string_custom(unsigned long long value) { return std::to_string(value); }
inline std::string to_string_custom(float value) { return std::to_string(value); }
inline std::string to_string_custom(double value) { return std::to_string(value); }
inline std::string to_string_custom(long double value) { return std::to_string(value); }
inline std::string to_string_custom(const std::string& value) { return "\"" + value + "\""; }
inline std::string to_string_custom(const char* value) { return "\"" + std::string(value) + "\""; }
inline std::string to_string_custom(char value) { return "\"" + std::string(1, value) + "\""; }
`;
        // Block macro using ostringstream with properly escaped quotes
        const macro = `#define TRACE_VAR(x, line) do { \
    std::ostringstream oss; \
    oss << "{\\\"name\\\":\\\"" << #x << "\\\",\\\"value\\\":" << to_string_custom(x) << ",\\\"line\\\":" << line << "}"; \
    log_execution(line, "TRACE_VAR", oss.str()); \
} while(0)`;
        return helperFunction + '\n' + macro;
    }

    // Get the complete instrumented code with helpers and logging function
    getCompleteInstrumentedCode() {
        // Find the last include statement to insert helpers after it
        const lines = this.instrumentedCode.split('\n');
        let insertIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('#include')) {
                insertIndex = i + 1;
            }
        }
        // Insert helpers and logging function after includes
        const beforeIncludes = lines.slice(0, insertIndex);
        const afterIncludes = lines.slice(insertIndex);
        return beforeIncludes.join('\n') + '\n' + this.addInstrumentationHelpers() + '\n' + this.addLoggingFunction() + '\n' + afterIncludes.join('\n');
    }

    parseToAST(code) {
        // Parse the C++ code and return the AST root node
        return this.parser.parse(code).rootNode;
    }

    instrumentWithAST(code) {
        const ast = this.parseToAST(code);
        const lines = code.split('\n');
        const insertions = [];

        // Scope stack: each scope is a Map of variable names to metadata
        const scopeStack = [new Map()];

        function enterScope() {
            scopeStack.push(new Map());
        }
        function exitScope() {
            scopeStack.pop();
        }
        function declareVar(name, meta) {
            scopeStack[scopeStack.length - 1].set(name, meta);
        }
        function assignVar(name, meta) {
            for (let i = scopeStack.length - 1; i >= 0; i--) {
                if (scopeStack[i].has(name)) {
                    scopeStack[i].set(name, meta);
                    return;
                }
            }
            declareVar(name, meta);
        }
        function walk(node) {
            if (node.type === 'compound_statement' || node.type === 'function_definition') {
                enterScope();
            }
            if (node.type === 'init_declarator') {
                const varName = node.firstChild.text;
                declareVar(varName, { declaredAt: node.startPosition.row });
                insertions.push({
                    line: node.endPosition.row,
                    macro: `TRACE_VAR(${varName}, ${node.startPosition.row + 1});`
                });
            }
            if (node.type === 'assignment_expression') {
                const varName = node.firstChild.text;
                assignVar(varName, { assignedAt: node.startPosition.row });
                insertions.push({
                    line: node.endPosition.row,
                    macro: `TRACE_VAR(${varName}, ${node.startPosition.row + 1});`
                });
            }
            for (let i = 0; i < node.childCount; i++) {
                walk(node.child(i));
            }
            if (node.type === 'compound_statement' || node.type === 'function_definition') {
                exitScope();
            }
        }
        walk(ast);
        const instrumentedLines = [...lines];
        insertions.sort((a, b) => b.line - a.line);
        for (const { line, macro } of insertions) {
            instrumentedLines.splice(line + 1, 0, macro);
        }
        // Remove old macro injection (handled in getCompleteInstrumentedCode)
        return instrumentedLines.join('\n');
    }
}

module.exports = CodeInstrumenter; 
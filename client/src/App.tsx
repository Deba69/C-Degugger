import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import styled from 'styled-components';
import { 
  FaPlay, 
  FaStepForward, 
  FaStepBackward, 
  FaStop, 
  FaRedo, 
  FaFastForward,
  FaPause,
  FaExclamationTriangle,
  FaCheckCircle,
  FaInfoCircle
} from 'react-icons/fa';
import Split from 'react-split';

const TOOLBAR_HEIGHT = 56; // px

// Styled Components
const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background-color: #1e1e1e;
  color: #d4d4d4;
  box-sizing: border-box;
`;

const Toolbar = styled.div`
  display: flex;
  gap: 10px;
  padding: 10px;
  background-color: #252526;
  border-bottom: 1px solid #3c3c3c;
  height: ${TOOLBAR_HEIGHT}px;
  box-sizing: border-box;
  align-items: center;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  background-color: #0e639c;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
  
  &:hover {
    background-color: #1177bb;
  }
  
  &:disabled {
    background-color: #3c3c3c;
    cursor: not-allowed;
  }

  &.secondary {
    background-color: #4a4a4a;
    &:hover {
      background-color: #5a5a5a;
    }
  }

  &.danger {
    background-color: #c42d1c;
    &:hover {
      background-color: #d42d1c;
    }
  }
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  margin-left: auto;

  &.success {
    background-color: #1e4d2b;
    color: #4caf50;
  }

  &.error {
    background-color: #4d1e1e;
    color: #f44336;
  }

  &.info {
    background-color: #1e3a4d;
    color: #2196f3;
  }

  &.warning {
    background-color: #4d3e1e;
    color: #ff9800;
  }
`;

const MainContent = styled.div`
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  height: calc(100vh - ${TOOLBAR_HEIGHT}px);
  box-sizing: border-box;
  overflow: hidden;
`;

const EditorContainer = styled.div`
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
`;

const Sidebar = styled.div`
  width: 100%;
  height: 100%;
  background-color: #252526;
  border-left: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
`;

const VariablesPanel = styled.div`
  width: 100%;
  height: 100%;
  flex: 1;
  padding: 10px;
  overflow-y: auto;
`;

const ConsolePanel = styled.div`
  width: 100%;
  height: 100%;
  background-color: #1e1e1e;
  border-top: 1px solid #3c3c3c;
  padding: 10px;
  overflow-y: auto;
  font-family: monospace;
`;

const InputPanel = styled.div`
  width: 100%;
  height: 100%;
  padding: 10px;
  background: #232323;
  border-top: 1px solid #3c3c3c;
  box-sizing: border-box;
`;

const StepInfo = styled.div`
  background-color: #2d2d30;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  font-size: 0.9em;
`;

const VariableDisplay = styled.div`
  background-color: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 10px;
  
  .variable-name {
    color: #569cd6;
    font-weight: bold;
  }
  
  .variable-value {
    color: #b5cea8;
    font-weight: bold;
  }
  
  .variable-type {
    color: #9cdcfe;
    font-size: 0.8em;
    margin-left: 8px;
  }
  
  .variable-history {
    font-size: 0.8em;
    color: #888;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #3c3c3c;
  }

  .variable-line {
    color: #ce9178;
    font-size: 0.8em;
    margin-left: 8px;
  }
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  background-color: #3c3c3c;
  border-radius: 3px;
  margin-bottom: 12px;
  
  .progress-fill {
    height: 100%;
    background-color: #0e639c;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
`;

const ControlFlowPanel = styled.div`
  background-color: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 10px;

  .flow-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    padding: 4px 8px;
    border-radius: 3px;
    background-color: #2d2d30;
  }

  .flow-type {
    font-size: 0.8em;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: bold;
  }

  .flow-type.if {
    background-color: #4a4a4a;
    color: #9cdcfe;
  }

  .flow-type.loop {
    background-color: #4a4a4a;
    color: #c586c0;
  }

  .flow-type.function {
    background-color: #4a4a4a;
    color: #dcdcaa;
  }
`;

const ErrorDisplay = styled.div`
  background-color: #4d1e1e;
  border: 1px solid #c42d1c;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  color: #f44336;

  .error-title {
    font-weight: bold;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .error-details {
    font-family: monospace;
    font-size: 0.9em;
    background-color: #2d1e1e;
    padding: 8px;
    border-radius: 3px;
    margin-top: 8px;
  }
`;

const StepControls = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

// Types for execution data
interface ExecutionStep {
  stepNumber: number;
  type: string;
  line: number;
  description?: string;
  variables?: Record<string, any>;
  output?: string;
  timestamp?: number;
  condition?: string;
  variable?: {
    name: string;
    type: string;
    value: any;
  };
}

interface ExecutionTrace {
  totalSteps: number;
  executionTime: number;
  exitCode: number;
  steps: ExecutionStep[];
  variableStates: any[];
  controlFlow: {
    ifStatements: any[];
    loops: any[];
    functionCalls: any[];
    branches: any[];
  };
  callStack: any[];
  ioOperations: any[];
  finalState: {
    variables: any[];
    callStack: any[];
    output: string;
  };
}

interface ExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTime?: number;
  executionTrace?: ExecutionTrace;
  error?: string;
}

const App: React.FC = () => {
  const [code, setCode] = useState<string>(() => {
    return localStorage.getItem('cpp_code') || `#include <bits/stdc++.h>
using namespace std;

int main() {
    int a = 10, b = 20;
    cout << "Initial values: a=" << a << ", b=" << b << endl;
    
    for(int i = 1; i <= 5; i++) {
        a += i;
        b -= i;
        cout << "Iteration " << i << ": a=" << a << ", b=" << b << endl;
    }
    
    if(a > b) {
        cout << "a is greater than b" << endl;
    } else {
        cout << "b is greater than or equal to a" << endl;
    }
    
    return 0;
}`;
  });
  
  const [isRunning, setIsRunning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1000); // ms
  const [isAutoReplay, setIsAutoReplay] = useState(false);
  const [userInput, setUserInput] = useState<string>('');
  const [consoleOutput, setConsoleOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [currentLine, setCurrentLine] = useState<number | null>(null);
  const [variables, setVariables] = useState<Record<string, any>>({});
  const [variableHistory, setVariableHistory] = useState<Record<string, any[]>>({});
  const [callStack, setCallStack] = useState<any[]>([]);
  const [controlFlow, setControlFlow] = useState<any>({});
  const [ioOperations, setIoOperations] = useState<any[]>([]);
  const [highlightDecorationIds, setHighlightDecorationIds] = useState<string[]>([]);
  
  const editorRef = useRef<any>(null);
  const autoReplayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // API base URL
  const API_BASE = import.meta.env.VITE_API_URL;

  // Highlight current line in Monaco Editor
  useEffect(() => {
    if (editorRef.current && currentLine) {
      const editor = editorRef.current;
      const newDecorations = [
        {
          range: {
            startLineNumber: currentLine,
            endLineNumber: currentLine,
            startColumn: 1,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: 'current-line-highlight',
            inlineClassName: '',
          },
        },
      ];
      const newIds = editor.deltaDecorations(highlightDecorationIds, newDecorations);
      setHighlightDecorationIds(newIds);
    } else if (editorRef.current) {
      editorRef.current.deltaDecorations(highlightDecorationIds, []);
      setHighlightDecorationIds([]);
    }
  }, [currentLine]);

  // Add CSS for current line highlight
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .current-line-highlight { 
        background: #264f78 !important; 
        border-left: 3px solid #0e639c !important;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Auto replay functionality
  useEffect(() => {
    if (isAutoReplay && isReplayMode && executionResult?.executionTrace) {
      autoReplayIntervalRef.current = setInterval(() => {
        if (currentStepIndex < executionResult.executionTrace!.steps.length - 1) {
          handleNextStep();
        } else {
          setIsAutoReplay(false);
        }
      }, replaySpeed);
    } else if (autoReplayIntervalRef.current) {
      clearInterval(autoReplayIntervalRef.current);
      autoReplayIntervalRef.current = null;
    }

    return () => {
      if (autoReplayIntervalRef.current) {
        clearInterval(autoReplayIntervalRef.current);
      }
    };
  }, [isAutoReplay, isReplayMode, currentStepIndex, replaySpeed, executionResult]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);
    localStorage.setItem('cpp_code', newCode);
  };

  const executeCode = async () => {
    if (!code.trim()) {
      setError('Please enter some code to execute');
      return;
    }

    setIsExecuting(true);
    setError(null);
    setConsoleOutput('Executing code...\n');

    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
          input: userInput
        }),
      });

      const result: ExecutionResult = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to execute code');
      }

      if (!result.success) {
        throw new Error(result.error || 'Execution failed');
      }

      setExecutionResult(result);
      setConsoleOutput(result.stdout || '');
      
      // Initialize replay mode
      if (result.executionTrace) {
        setIsReplayMode(true);
        setCurrentStepIndex(-1);
        setVariables({});
        setVariableHistory({});
        setCallStack([]);
        setControlFlow({});
        setIoOperations([]);
        setCurrentLine(null);
      }

    } catch (error) {
      console.error('Execution error:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
      setConsoleOutput('');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleNextStep = () => {
    if (!executionResult?.executionTrace) return;

    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= executionResult.executionTrace.steps.length) return;

    const step = executionResult.executionTrace.steps[nextIndex];
    setCurrentStepIndex(nextIndex);
    setCurrentLine(step.line);

    // Update variables
    if (step.variables) {
      setVariables(step.variables);
      
      // Update variable history
      setVariableHistory(prev => {
        const newHistory = { ...prev };
        Object.entries(step.variables || {}).forEach(([name, value]) => {
          if (!newHistory[name]) {
            newHistory[name] = [value];
          } else if (newHistory[name][newHistory[name].length - 1] !== value) {
            newHistory[name] = [...newHistory[name], value];
          }
        });
        return newHistory;
      });
    }

    // Update call stack
    if ('callStack' in step && Array.isArray(step.callStack)) {
      setCallStack(step.callStack);
    }

    // Update control flow
    if (step.type === 'if_condition' || step.type === 'loop_condition' || step.type === 'function_call') {
      setControlFlow((prev: any) => ({
        ...prev,
        [step.type]: step
      }));
    }

    // Update I/O operations
    if (step.type === 'input_operation' || step.type === 'output_operation') {
      setIoOperations(prev => [...prev, step]);
    }

    // Update console output
    if (step.output) {
      setConsoleOutput(prev => prev + step.output);
    }
  };

  const handlePreviousStep = () => {
    if (currentStepIndex <= 0) return;

    const prevIndex = currentStepIndex - 1;
    setCurrentStepIndex(prevIndex);

    if (prevIndex >= 0 && executionResult?.executionTrace) {
      const step = executionResult.executionTrace.steps[prevIndex];
      setCurrentLine(step.line);

      // Reconstruct state from previous steps
      const reconstructedState = reconstructStateAtStep(prevIndex);
      setVariables(reconstructedState.variables || {});
      setVariableHistory(reconstructedState.variableHistory || {});
      setCallStack(reconstructedState.callStack || []);
      setControlFlow(reconstructedState.controlFlow || {});
      setIoOperations(reconstructedState.ioOperations || []);
    }
  };

  const reconstructStateAtStep = (stepIndex: number) => {
    if (!executionResult?.executionTrace) return {
      variables: {},
      variableHistory: {},
      callStack: [],
      controlFlow: {},
      ioOperations: []
    };

    const steps = executionResult.executionTrace.steps.slice(0, stepIndex + 1);
    const variables: Record<string, any> = {};
    const variableHistory: Record<string, any[]> = {};
    const callStack: any[] = [];
    const controlFlow: any = {};
    const ioOperations: any[] = [];

    steps.forEach(step => {
      if (step.variables) {
        Object.assign(variables, step.variables);
      }
      if ('callStack' in step && Array.isArray(step.callStack)) {
        callStack.length = 0;
        callStack.push(...step.callStack);
      }
      if (step.type === 'if_condition' || step.type === 'loop_condition' || step.type === 'function_call') {
        controlFlow[step.type] = step;
      }
      if (step.type === 'input_operation' || step.type === 'output_operation') {
        ioOperations.push(step);
      }
    });

    // Build variable history
    steps.forEach(step => {
      Object.entries(step.variables || {}).forEach(([name, value]) => {
        if (!variableHistory[name]) {
          variableHistory[name] = [value];
        } else if (variableHistory[name][variableHistory[name].length - 1] !== value) {
          variableHistory[name] = [...variableHistory[name], value];
        }
      });
    });

    return { variables, variableHistory, callStack, controlFlow, ioOperations };
  };

  const handleReset = () => {
    setIsReplayMode(false);
    setCurrentStepIndex(-1);
    setExecutionResult(null);
    setVariables({});
    setVariableHistory({});
    setCallStack([]);
    setControlFlow({});
    setIoOperations([]);
    setCurrentLine(null);
    setConsoleOutput('');
    setError(null);
    setIsAutoReplay(false);
  };

  const handleFastForward = () => {
    if (!executionResult?.executionTrace) return;
    setCurrentStepIndex(executionResult.executionTrace.steps.length - 1);
    const finalStep = executionResult.executionTrace.steps[executionResult.executionTrace.steps.length - 1];
    setCurrentLine(finalStep.line);
    setVariables(executionResult.executionTrace.finalState.variables);
    setCallStack(executionResult.executionTrace.finalState.callStack);
  };

  const handleRewind = () => {
    setCurrentStepIndex(-1);
    setVariables({});
    setVariableHistory({});
    setCallStack([]);
    setControlFlow({});
    setIoOperations([]);
    setCurrentLine(null);
    setConsoleOutput('');
  };

  const toggleAutoReplay = () => {
    setIsAutoReplay(!isAutoReplay);
  };

  const getStatusIndicator = () => {
    if (error) {
      return (
        <StatusIndicator className="error">
          <FaExclamationTriangle />
          Error
        </StatusIndicator>
      );
    }
    if (isExecuting) {
      return (
        <StatusIndicator className="info">
          <FaInfoCircle />
          Executing...
        </StatusIndicator>
      );
    }
    if (isReplayMode) {
      return (
        <StatusIndicator className="success">
          <FaCheckCircle />
          Ready for replay
        </StatusIndicator>
      );
    }
    return null;
  };

  const getCurrentStepInfo = () => {
    if (!executionResult?.executionTrace || currentStepIndex < 0) return null;
    
    const step = executionResult.executionTrace.steps[currentStepIndex];
    return {
      stepNumber: step.stepNumber,
      type: step.type,
      line: step.line,
      description: step.description,
      totalSteps: executionResult.executionTrace.steps.length
    };
  };

  const stepInfo = getCurrentStepInfo();
  const progressPercentage = stepInfo ? (stepInfo.stepNumber / stepInfo.totalSteps) * 100 : 0;

  return (
    <AppContainer>
      <Toolbar>
        <Button onClick={executeCode} disabled={isExecuting}>
          <FaPlay /> Execute
        </Button>
        
        {isReplayMode && (
          <>
            <Button onClick={handlePreviousStep} disabled={currentStepIndex <= 0}>
              <FaStepBackward /> Previous
            </Button>
            <Button onClick={handleNextStep} disabled={currentStepIndex >= (executionResult?.executionTrace?.steps.length || 0) - 1}>
              <FaStepForward /> Next
            </Button>
          </>
        )}
        
        <Button onClick={handleReset} className="secondary">
          <FaStop /> Reset
        </Button>

        {getStatusIndicator()}
      </Toolbar>
      
      <MainContent>
        <Split
          direction="horizontal"
          sizes={[70, 30]}
          minSize={[200, 200]}
          gutterSize={6}
          style={{ display: 'flex', width: '100%', height: '100%' }}
        >
          {/* Left: Editor/Input vertical split */}
          <Split
            direction="vertical"
            sizes={[80, 20]}
            minSize={[100, 60]}
            gutterSize={6}
            style={{ width: '100%', height: '100%' }}
          >
            <EditorContainer>
              <Editor
                height="100%"
                width="100%"
                defaultLanguage="cpp"
                theme="vs-dark"
                value={code}
                onChange={handleCodeChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  roundedSelection: false,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
                onMount={handleEditorMount}
              />
            </EditorContainer>
            <InputPanel>
              <label htmlFor="user-input"><b>Program Input:</b></label>
              <textarea
                id="user-input"
                rows={3}
                style={{
                  width: '100%',
                  background: '#1e1e1e',
                  color: '#d4d4d4',
                  border: '1px solid #3c3c3c',
                  borderRadius: 3,
                  marginTop: 4,
                  resize: 'vertical',
                  minHeight: 40,
                  maxHeight: 300
                }}
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                placeholder="Paste input for your program here..."
              />
            </InputPanel>
          </Split>
          
          {/* Right: Sidebar vertical split */}
          <Split
            direction="vertical"
            sizes={[60, 40]}
            minSize={[60, 60]}
            gutterSize={6}
            style={{ width: '100%', height: '100%' }}
          >
            <Sidebar>
              <VariablesPanel>
                {error && (
                  <ErrorDisplay>
                    <div className="error-title">
                      <FaExclamationTriangle />
                      Execution Error
                    </div>
                    <div>{error}</div>
                  </ErrorDisplay>
                )}

                {stepInfo && (
                  <StepInfo>
                    <div><strong>Step {stepInfo.stepNumber}</strong> of {stepInfo.totalSteps}</div>
                    <div>Type: {stepInfo.type}</div>
                    <div>Line: {stepInfo.line}</div>
                    {stepInfo.description && <div>Description: {stepInfo.description}</div>}
                    <ProgressBar>
                      <div className="progress-fill" style={{ width: `${progressPercentage}%` }}></div>
                    </ProgressBar>
                  </StepInfo>
                )}

                <h3>Variables</h3>
                {Object.entries(variables).map(([name, value]) => (
                  <VariableDisplay key={name}>
                    <div>
                      <span className="variable-name">{name}:</span>{' '}
                      <span className="variable-value">{String(value)}</span>
                      <span className="variable-type">({typeof value})</span>
                    </div>
                    {variableHistory[name] && variableHistory[name].length > 1 && (
                      <div className="variable-history">
                        History: {variableHistory[name].join(' → ')}
                      </div>
                    )}
                  </VariableDisplay>
                ))}

                {Object.keys(controlFlow).length > 0 && (
                  <>
                    <h3>Control Flow</h3>
                    <ControlFlowPanel>
                      {Object.entries(controlFlow).map(([type, flow]) => (
                        <div key={type} className="flow-item">
                          <span className={`flow-type ${type.split('_')[0]}`}>
                            {type.split('_')[0].toUpperCase()}
                          </span>
                          <span>{(flow as any).condition || (flow as any).description || type}</span>
                        </div>
                      ))}
                    </ControlFlowPanel>
                  </>
                )}

                {callStack.length > 0 && (
                  <>
                    <h3>Call Stack</h3>
                    <div style={{ background: '#1e1e1e', padding: '8px', borderRadius: '4px' }}>
                      {callStack.map((frame, index) => (
                        <div key={index} style={{ 
                          fontWeight: index === 0 ? 'bold' : 'normal',
                          color: index === 0 ? '#0e639c' : '#d4d4d4',
                          marginBottom: '2px'
                        }}>
                          {index === 0 ? '>' : ''} {frame.func}() [{frame.file}:{frame.line}]
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {ioOperations.length > 0 && (
                  <>
                    <h3>I/O Operations</h3>
                    <div style={{ background: '#1e1e1e', padding: '8px', borderRadius: '4px' }}>
                      {ioOperations.slice(-5).map((op, index) => (
                        <div key={index} style={{ marginBottom: '4px' }}>
                          <span style={{ color: op.type === 'input_operation' ? '#4caf50' : '#2196f3' }}>
                            {op.type === 'input_operation' ? 'INPUT' : 'OUTPUT'}:
                          </span>{' '}
                          {op.data || op.output}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </VariablesPanel>
            </Sidebar>
            
            <Sidebar>
              <ConsolePanel>
                <h3>Console Output</h3>
                <pre style={{ 
                  margin: 0, 
                  whiteSpace: 'pre-wrap', 
                  wordBreak: 'break-word',
                  fontSize: '13px'
                }}>
                  {consoleOutput || 'No output yet...'}
                </pre>
              </ConsolePanel>
            </Sidebar>
          </Split>
        </Split>
      </MainContent>
    </AppContainer>
  );
};

export default App;

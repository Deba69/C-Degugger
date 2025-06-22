import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import styled from 'styled-components';
import { FaPlay, FaStepForward, FaStop, FaRedo, FaFastForward } from 'react-icons/fa';
import Split from 'react-split';

const TOOLBAR_HEIGHT = 56; // px

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
  
  &:hover {
    background-color: #1177bb;
  }
  
  &:disabled {
    background-color: #3c3c3c;
    cursor: not-allowed;
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
  padding: 8px;
  margin-bottom: 8px;
  font-size: 0.9em;
`;

const VariableDisplay = styled.div`
  background-color: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
  
  .variable-name {
    color: #569cd6;
    font-weight: bold;
  }
  
  .variable-value {
    color: #b5cea8;
    font-weight: bold;
  }
  
  .variable-history {
    font-size: 0.8em;
    color: #888;
    margin-top: 4px;
  }
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 4px;
  background-color: #3c3c3c;
  border-radius: 2px;
  margin-bottom: 8px;
  
  .progress-fill {
    height: 100%;
    background-color: #0e639c;
    border-radius: 2px;
    transition: width 0.3s ease;
  }
`;

const App: React.FC = () => {
  const [code, setCode] = useState<string>(() => {
    return localStorage.getItem('cpp_code') || `#include <bits/stdc++.h>
using namespace std;

int main() {
	// your code goes here
	int a = 10, b = 20;
	for(int i =1; i<=10; i++){
	   a += i;
	   b -= i;
	   cout << "a: " << a <<" b: " << b <<"\\n" ;
	}
	return 0;
}`;
  });
  const [isRunning, setIsRunning] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [consoleOutput, setConsoleOutput] = useState<string>('');
  const [userInput, setUserInput] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);
  const [currentLine, setCurrentLine] = useState<number | null>(null);
  const [variableHistory, setVariableHistory] = useState<Record<string, string[]>>({});
  const editorRef = useRef<any>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [totalSteps, setTotalSteps] = useState<number>(0);
  const [stepDescription, setStepDescription] = useState<string>('');
  const [isVisualizationReady, setIsVisualizationReady] = useState(false);
  const [isDryRun, setIsDryRun] = useState(false);
  const [callStack, setCallStack] = useState<any[]>([]);
  const [stepHistory, setStepHistory] = useState<any[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);

  useEffect(() => {
    // Connect to WebSocket server
    wsRef.current = new WebSocket('ws://localhost:3001');

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'compileSuccess':
          setConsoleOutput(prev => prev + 'Compilation successful\n');
          break;
        case 'compileError':
          setConsoleOutput(prev => prev + `Compilation error: ${data.error}\n`);
          break;
        case 'dryRunNotSupported':
          setConsoleOutput(prev => prev + "Dry run not supported for this code. Sticking to normal run.\n");
          handleRun(); // Fallback to normal run
          break;
        case 'runOutput':
          setConsoleOutput(data.output);
          setIsRunning(false);
          setIsVisualizationReady(false);
          setCurrentLine(null); // Deselect code highlight
          break;
        case 'visualizationReady':
          setTotalSteps(data.totalSteps);
          setIsVisualizationReady(true);
          setConsoleOutput(prev => prev + `Visualization ready! Total steps: ${data.totalSteps}\n`);
          // Automatically start visualization session so Step/Continue are enabled
          setIsRunning(true);
          if (wsRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'start' }));
          }
          break;
        case 'visualizationStarted':
          setIsRunning(true);
          setCurrentStep(0);
          setConsoleOutput(prev => prev + 'Visualization started\n');
          break;
        case 'debugStep':
            setCurrentLine(data.currentLine);
            setVariables(data.variables);
          setStepDescription(data.description);
          setCurrentStep(prev => prev + 1);
          
          if (data.output) {
            setConsoleOutput(prev => prev + data.output);
          }
          
            setVariableHistory(prev => {
              const updated = { ...prev };
              for (const [name, value] of Object.entries(data.variables)) {
                if (!updated[name]) updated[name] = [];
                // Only push if value changed
              if (updated[name].length === 0 || updated[name][updated[name].length - 1] !== String(value)) {
                updated[name] = [...updated[name], String(value)];
                }
              }
              return updated;
            });
          break;
        case 'visualizationComplete':
          setIsRunning(false);
          setConsoleOutput(prev => prev + `\nVisualization complete!\nFinal output:\n${data.finalOutput}`);
          setCurrentLine(null); // Deselect code highlight
          break;
        case 'debugError':
          setConsoleOutput(prev => prev + `Error: ${data.error}\n`);
          break;
        case 'gdbStep': {
          // Store the new step in history
          console.log('Received gdbStep:', data);
          setStepHistory(prev => {
            const newHistory = prev.slice(0, currentStepIndex + 1);
            newHistory.push(data);
            console.log('Updated step history:', newHistory);
            return newHistory;
          });
          setCurrentStepIndex(idx => {
            const newIndex = idx + 1;
            console.log('Updated currentStepIndex:', newIndex);
            return newIndex;
          });
          setCurrentLine(data.currentLine);
          setVariables(data.variables);
          setCallStack(data.callStack);
          setStepDescription(`Line ${data.currentLine}`);
          if (data.output) {
            setConsoleOutput(prev => prev + data.output);
          }
          // Update variable history
          setVariableHistory(prevHistory => {
            const newHistory = { ...prevHistory };
            Object.entries(data.variables).forEach(([name, value]) => {
              if (!newHistory[name]) {
                newHistory[name] = [String(value)];
              } else {
                if (newHistory[name][newHistory[name].length - 1] !== String(value)) {
                  newHistory[name] = [...newHistory[name], String(value)];
                }
              }
            });
            Object.keys(newHistory).forEach(name => {
              if (!(name in data.variables)) {
                delete newHistory[name];
              }
            });
            return newHistory;
          });
          break;
        }
        case 'gdbComplete':
          setConsoleOutput(prev => prev + "\nDebugging complete.\n");
          setIsRunning(false);
          setIsDryRun(false);
          setCurrentLine(null); // Deselect code highlight
          // Reset step history
          setStepHistory([]);
          setCurrentStepIndex(-1);
          break;
        case 'gdbError':
          setConsoleOutput(prev => prev + `GDB Error: ${data.error}\n`);
          setIsRunning(false);
          setIsDryRun(false);
          setCurrentLine(null); // Deselect code highlight
          // Reset step history
          setStepHistory([]);
          setCurrentStepIndex(-1);
          break;
      }
    };

    wsRef.current.onclose = () => {
      // This event fires when the connection is closed.
      // You can add logic here to attempt to reconnect, for example.
      console.log('WebSocket connection closed');
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Highlight current line in Monaco Editor
  useEffect(() => {
    if (editorRef.current) {
      const editor = editorRef.current;
      
      if (currentLine) {
        editor.revealLineInCenter(currentLine);
        editor.deltaDecorations(
          [],
          [
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
          ]
        );
      } else {
        // Clear all decorations when currentLine is null
        editor.deltaDecorations([], []);
      }
    }
  }, [currentLine]);

  // Add CSS for current line highlight
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `.current-line-highlight { background: #264f78 !important; }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Add debugging for state changes
  useEffect(() => {
    console.log('State changed:', { 
      isDryRun, 
      currentStepIndex, 
      stepHistoryLength: stepHistory.length,
      isRunning 
    });
  }, [isDryRun, currentStepIndex, stepHistory.length, isRunning]);

  // Monaco Editor onMount handler
  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);
    localStorage.setItem('cpp_code', newCode);
  };

  const handleRun = () => {
    if (!wsRef.current) return;
    setIsRunning(true);
    setConsoleOutput('');
    setVariables({});
    setVariableHistory({});
    setCurrentStep(0);
    setCurrentLine(null);
    setStepDescription('');
    setIsVisualizationReady(false);
    setIsDryRun(false);
    // Reset step history
    setStepHistory([]);
    setCurrentStepIndex(-1);
    wsRef.current.send(JSON.stringify({
      type: 'run',
      code,
      input: userInput
    }));
  };

  const handleDryRun = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setConsoleOutput('Starting GDB debug session...\n');
      setIsRunning(true);
      setIsDryRun(true);
      setVariables({});
      setVariableHistory({}); // Reset history on new debug session
      setCurrentLine(null);
      setCurrentStep(0);
      setTotalSteps(0);
      setCallStack([]);
      setStepHistory([]);
      setCurrentStepIndex(-1);
      wsRef.current.send(JSON.stringify({
        type: 'gdbDebug',
        code: code,
        input: userInput
      }));
    }
  };

  const handleStep = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (isDryRun) {
        wsRef.current.send(JSON.stringify({ type: 'gdbStep' }));
      } else {
        wsRef.current.send(JSON.stringify({ type: 'step' }));
      }
    }
  };

  const handleContinue = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (isDryRun) {
        wsRef.current.send(JSON.stringify({ type: 'gdbContinue' }));
      } else {
        wsRef.current.send(JSON.stringify({ type: 'continue' }));
      }
    }
  };

  const handleStop = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      setIsRunning(false);
      setCurrentLine(null); // Deselect code highlight
      // Reset step history when stopping
      setStepHistory([]);
      setCurrentStepIndex(-1);
      setIsDryRun(false);
    }
  };

  const handleReset = () => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'stop' }));
    setIsRunning(false);
    setConsoleOutput('');
    setVariables({});
    setVariableHistory({});
    setCurrentStep(0);
    setCurrentLine(null);
    setStepDescription('');
    setIsVisualizationReady(false);
    setIsDryRun(false);
    // Reset step history
    setStepHistory([]);
    setCurrentStepIndex(-1);
  };

  const progressPercentage = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  const getFilename = (filepath: string) => filepath ? filepath.split(/[/\\]/).pop() : '';

  const handleNext = () => {
    console.log('handleNext called', { currentStepIndex, stepHistoryLength: stepHistory.length });
    if (currentStepIndex < stepHistory.length - 1) {
      // Move forward in history
      const nextStep = stepHistory[currentStepIndex + 1];
      console.log('Moving to next step in history:', nextStep);
      
      // Validate that nextStep exists and has required properties
      if (!nextStep || typeof nextStep !== 'object') {
        console.error('Invalid nextStep:', nextStep);
        return;
      }
      
      if (nextStep.currentLine === undefined || nextStep.variables === undefined || nextStep.callStack === undefined) {
        console.error('nextStep missing required properties:', nextStep);
        return;
      }
      
      setCurrentStepIndex(currentStepIndex + 1);
      setCurrentLine(nextStep.currentLine);
      setVariables(nextStep.variables);
      setCallStack(nextStep.callStack);
      setStepDescription(`Line ${nextStep.currentLine}`);
      // Update variable history for this step
      setVariableHistory(prevHistory => {
        const newHistory = { ...prevHistory };
        Object.entries(nextStep.variables).forEach(([name, value]) => {
          if (!newHistory[name]) {
            newHistory[name] = [String(value)];
          } else {
            if (newHistory[name][newHistory[name].length - 1] !== String(value)) {
              newHistory[name] = [...newHistory[name], String(value)];
            }
          }
        });
        Object.keys(newHistory).forEach(name => {
          if (!(name in nextStep.variables)) {
            delete newHistory[name];
          }
        });
        return newHistory;
      });
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isDryRun) {
      // Request next step from backend
      console.log('Requesting new step from backend');
      wsRef.current.send(JSON.stringify({ type: 'gdbStep' }));
    } else {
      console.log('Cannot go to next step:', { 
        currentStepIndex, 
        stepHistoryLength: stepHistory.length,
        wsReady: wsRef.current?.readyState === WebSocket.OPEN,
        isDryRun 
      });
    }
  };

  return (
    <AppContainer>
      <Toolbar>
        <Button onClick={handleRun} disabled={isRunning}>
          <FaPlay /> Run
        </Button>
        <Button onClick={handleDryRun} disabled={isRunning}>
          <FaPlay /> Debug with GDB
        </Button>
        <Button onClick={handleNext} disabled={!isDryRun || !isRunning}>
          Next
        </Button>
        <Button onClick={handleStop} disabled={!isRunning}>
          <FaStop /> Stop
        </Button>
        <Button onClick={handleReset} disabled={isRunning}>
          <FaRedo /> Reset
        </Button>
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
                <h3>Variables</h3>
                {isDryRun ? (
                  Object.entries(variables).map(([name, value]) => (
                    <VariableDisplay key={name}>
                      <span className="variable-name">{name}:</span>{' '}
                      <span className="variable-value">{String(value)}</span>
                    </VariableDisplay>
                  ))
                ) : (
                  <>
                    {stepDescription && <StepInfo>{stepDescription}</StepInfo>}
                    {totalSteps > 0 && (
                      <ProgressBar>
                        <div className="progress-fill" style={{ width: `${(currentStep / totalSteps) * 100}%` }}></div>
                      </ProgressBar>
                    )}
                    {Object.entries(variables).map(([name, value]) => (
                      <VariableDisplay key={name}>
                        <div>
                          <span className="variable-name">{name}:</span>{' '}
                          <span className="variable-value">{String(value)}</span>
                        </div>
                        <div className="variable-history">
                          History: {(variableHistory[name] || [String(value)]).join(' → ')}
                        </div>
                      </VariableDisplay>
                    ))}
                  </>
                )}
                <h3>Call Stack</h3>
                <div className='call-stack-panel'>
                  {(() => {
                    // Remove duplicate consecutive frames
                    const filteredStack = callStack.filter((frame, idx, arr) => {
                      if (idx === 0) return true;
                      return !(
                        frame.func === arr[idx - 1].func &&
                        frame.file === arr[idx - 1].file &&
                        frame.line === arr[idx - 1].line
                      );
                    });
                    // Show only top 10 frames
                    return filteredStack.slice(0, 10).map((frame, index) => {
                      const filename = getFilename(frame.file);
                      return (
                        <div
                          key={index}
                          className='call-stack-frame'
                          style={{
                            fontWeight: index === 0 ? 'bold' : 'normal',
                            color: index === 0 ? '#0e639c' : '#d4d4d4',
                            marginBottom: 2,
                          }}
                        >
                          {index === 0 ? '>' : ''} {frame.func}() [{filename}:{frame.line}]
                        </div>
                      );
                    });
                  })()}
                </div>
              </VariablesPanel>
            </Sidebar>
            <Sidebar>
              <ConsolePanel>
                <h3>Console Output</h3>
                <pre>{consoleOutput}</pre>
              </ConsolePanel>
            </Sidebar>
          </Split>
        </Split>
      </MainContent>
    </AppContainer>
  );
};

export default App;

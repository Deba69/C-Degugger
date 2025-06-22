# C++ Visual Debugger

A modern, web-based C++ code editor with real-time debugging capabilities and visual step-by-step execution.

## Features

- **Real-time C++ Code Editor**: Monaco Editor integration with syntax highlighting
- **Visual Debugging**: Step-by-step execution with variable tracking
- **Multiple Loop Support**: Visualize for, while, do-while loops
- **Conditional Statements**: Debug if/else statements with visual flow
- **Variable Tracking**: Real-time monitoring of variable values
- **Output Display**: Live console output during execution
- **WebSocket Communication**: Real-time updates between client and server

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Monaco Editor** for code editing
- **Styled Components** for styling
- **React Split** for resizable panels
- **Vite** for build tooling

### Backend
- **Node.js** with Express
- **WebSocket** for real-time communication
- **C++ Compilation** support
- **GDB Integration** for advanced debugging

## Project Structure

```
c++ code editor/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.tsx        # Main application component
│   │   └── ...
│   ├── package.json
│   └── ...
├── server/                 # Node.js backend
│   ├── src/
│   │   └── index.js       # Main server file
│   └── package.json
└── README.md
```

## Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- C++ compiler (gcc/g++)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Deba69/C-Degugger.git
   cd C-Degugger
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install client dependencies**
   ```bash
   cd ../client
   npm install
   ```

## Running the Application

### Development Mode

1. **Start the server**
   ```bash
   cd server
   npm run dev
   ```
   The server will start on `http://localhost:3000`

2. **Start the client**
   ```bash
   cd client
   npm run dev
   ```
   The client will start on `http://localhost:5173`

### Production Build

1. **Build the client**
   ```bash
   cd client
   npm run build
   ```

2. **Start the server**
   ```bash
   cd server
   npm start
   ```

## Usage

1. Open the application in your browser
2. Write or paste your C++ code in the editor
3. Click "Compile" to check for syntax errors
4. Use the debugging controls:
   - **Step**: Execute one line at a time
   - **Continue**: Run until completion or breakpoint
   - **Reset**: Start over from the beginning
5. Watch variables change in real-time
6. View output in the console panel

## Supported C++ Features

- Variable declarations and assignments
- Arithmetic operations
- Control structures (if/else, for, while, do-while)
- Console output (cout)
- Basic expressions and calculations

## API Endpoints

- `POST /compile` - Compile C++ code
- `POST /run` - Execute C++ code
- `POST /debug` - Start debugging session
- `POST /step` - Execute next step
- `POST /continue` - Continue execution
- `POST /stop` - Stop debugging session

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Deba69** - [GitHub Profile](https://github.com/Deba69)

## Acknowledgments

- Monaco Editor for the excellent code editing experience
- React team for the amazing framework
- Node.js community for the robust backend ecosystem 
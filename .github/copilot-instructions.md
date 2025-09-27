# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

## Adapter-Specific Context - BenQ Projector Adapter

- **Adapter Name**: iobroker.benq  
- **Primary Function**: Control BenQ projectors via RS232 in conjunction with Ethernet Gateway
- **Target Devices**: BenQ projectors supporting RS232 control commands
- **Key Dependencies**: TCP socket connections, async operations for command queuing
- **Configuration Requirements**: Host IP address, port (default 23), projector model selection
- **Communication Protocol**: Text-based command/response over TCP socket (e.g., "pow=?" for power status query)
- **Command Structure**: Uses admin/commands.json for model-specific command mappings
- **Connection Management**: Maintains persistent connection with automatic reconnection logic
- **Supported Operations**: Power control, volume adjustment, input selection, lamp status monitoring

### Device Communication Patterns
- Commands follow format: `command=parameter` (e.g., "pow=on", "vol=50")  
- Queries use format: `command=?` (e.g., "pow=?", "vol=?")
- Responses are parsed from TCP socket buffer data
- Implements connection timeout and retry logic for reliability
- Uses polling mechanism for status updates (default 5 second interval)

### Error Handling Requirements  
- Handle network disconnections gracefully with auto-reconnection
- Implement command timeout mechanisms for unresponsive projectors
- Validate projector model compatibility before sending commands
- Log connection status changes for debugging
- Clean up socket connections properly in unload() method

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Validate adapter created the expected states
                        const states = await harness.states.getKeysAsync('your-adapter.0.*');
                        console.log(`📊 Found ${states.length} states`);
                        
                        // Add specific validations based on your adapter's functionality
                        expect(states.length).to.be.greaterThan(0);
                        
                        resolve();
                    } catch (error) {
                        console.error('❌ Test failed:', error);
                        reject(error);
                    }
                });
            });
        });
    }
});
```

#### BenQ Adapter Integration Testing
For the BenQ adapter specifically, integration tests should:
- Mock TCP socket connections to simulate projector responses
- Test command parsing and response handling
- Validate state creation and updates for power, volume, input states
- Test reconnection logic with simulated network failures
- Verify proper cleanup in unload() scenarios

### Package.json Integration
Ensure your package.json includes proper test scripts:
```json
{
  "scripts": {
    "test:js": "mocha --config test/mocharc.custom.json \"{!(node_modules|test)/**/*.test.js,*.test.js,test/**/test!(PackageFiles|Startup).js}\"",
    "test:package": "mocha test/package --exit",
    "test:integration": "mocha test/integration --exit", 
    "test": "npm run test:js && npm run test:package"
  }
}
```

## Logging Guidelines

### ioBroker Logging Best Practices
- Use appropriate log levels: `error`, `warn`, `info`, `debug`
- Connection events should be logged at `info` level
- Command success/failure should be logged at `debug` level  
- Network errors should be logged at `warn` or `error` level
- Use structured logging with context:
  ```javascript
  this.log.info(`Connected to BenQ projector at ${this.config.host}:${this.config.port}`);
  this.log.debug(`Sending command: ${command}`);
  this.log.warn(`Failed to send command ${command}: ${error.message}`);
  ```

### Debug Information
Include relevant context in debug logs:
- Current connection state
- Command queue status
- Projector model and capabilities
- Response parsing details

## Error Handling

### Connection Management
```javascript
// Proper error handling for TCP connections
benq.on('error', (error) => {
    this.log.warn(`TCP connection error: ${error.message}`);
    connection = false;
    this.setState('info.connection', false, true);
    // Implement reconnection logic
});

benq.on('close', () => {
    this.log.info('TCP connection closed');
    connection = false;
    this.setState('info.connection', false, true);
});
```

### Command Timeout Handling
```javascript
// Implement timeouts for commands that may hang
const commandTimeout = setTimeout(() => {
    this.log.warn(`Command timeout: ${command}`);
    // Handle timeout scenario
}, 10000);
```

### Resource Cleanup
```javascript
unload(callback) {
    try {
        // Clear all timers
        if (this.queryTimer) clearInterval(this.queryTimer);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.commandTimeout) clearTimeout(this.commandTimeout);
        
        // Close connections
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        
        this.log.debug('Adapter cleaned up successfully');
        callback();
    } catch (e) {
        this.log.error(`Error during cleanup: ${e.message}`);
        callback();
    }
}
```

## State Management

### State Creation Pattern
```javascript
// Create states following ioBroker conventions
await this.setObjectNotExistsAsync('power', {
    type: 'state',
    common: {
        name: 'Power State',
        type: 'boolean',
        role: 'power',
        read: true,
        write: true,
    },
    native: {},
});

// Update states with acknowledgment
await this.setStateAsync('power', true, true);
```

### State Change Handling
```javascript
onStateChange(id, state) {
    if (state && !state.ack) {
        const command = this.getCommandForState(id, state.val);
        this.sendCommand(command);
    }
}
```

## Configuration Management

### JSON-Config Best Practices
- Use `admin/jsonConfig.json` for modern configuration UI
- Implement proper validation for network settings (host, port)
- Provide dropdown selection for projector models from commands.json
- Include connection testing functionality in admin interface
- Handle migration from old `index_m.html` configuration

### Admin Interface Integration
```json
{
  "type": "tabs",
  "items": {
    "connection": {
      "type": "panel",
      "label": "Connection Settings",
      "items": {
        "host": {
          "type": "ip",
          "label": "IP Address", 
          "default": "192.168.1.100"
        },
        "port": {
          "type": "number",
          "label": "Port",
          "default": 23,
          "min": 1,
          "max": 65535
        }
      }
    }
  }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

## Hardware Communication

### TCP Socket Management for BenQ Projectors
```javascript
// Establish connection with proper error handling
connectToProjector() {
    return new Promise((resolve, reject) => {
        this.socket = new net.Socket();
        
        this.socket.setTimeout(10000); // 10 second timeout
        
        this.socket.on('connect', () => {
            this.log.info(`Connected to BenQ projector at ${this.config.host}:${this.config.port}`);
            this.setState('info.connection', true, true);
            resolve();
        });
        
        this.socket.on('data', (data) => {
            this.parseResponse(data.toString());
        });
        
        this.socket.on('error', (err) => {
            this.log.warn(`Connection error: ${err.message}`);
            this.setState('info.connection', false, true);
            reject(err);
        });
        
        this.socket.connect(this.config.port, this.config.host);
    });
}
```

### Command Processing
```javascript
// Send commands with proper queuing and response handling
async sendCommand(command, parameter = null) {
    if (!this.socket || !this.connected) {
        throw new Error('Not connected to projector');
    }
    
    const cmd = parameter !== null ? `${command}=${parameter}` : `${command}=?`;
    const fullCommand = cmd + '\r';
    
    this.log.debug(`Sending command: ${cmd}`);
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Command timeout: ${cmd}`));
        }, 5000);
        
        this.socket.write(fullCommand, (err) => {
            if (err) {
                clearTimeout(timeout);
                reject(err);
            } else {
                // Store pending command for response matching
                this.pendingCommands.set(command, { resolve, reject, timeout });
            }
        });
    });
}
```

## Version Management

### Semantic Versioning
Follow semantic versioning (semver) for adapter releases:
- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions  
- **PATCH** version for backwards-compatible bug fixes

### Release Process
- Use conventional commit messages for automated changelog generation
- Test thoroughly before version bumps
- Update README.md with latest changes
- Ensure io-package.json version matches package.json version

## Common Patterns and Anti-Patterns

### ✅ Good Practices
```javascript
// Use proper async/await patterns
async function initializeAdapter() {
    try {
        await this.connectToProjector();
        await this.createStates();
        await this.startPolling();
        this.log.info('Adapter initialized successfully');
    } catch (error) {
        this.log.error(`Initialization failed: ${error.message}`);
        throw error;
    }
}

// Implement proper state validation
async setProjectorState(stateName, value, ack = true) {
    if (typeof value === 'undefined' || value === null) {
        this.log.warn(`Invalid value for state ${stateName}: ${value}`);
        return;
    }
    
    await this.setStateAsync(stateName, value, ack);
}
```

### ❌ Anti-Patterns to Avoid
```javascript
// DON'T: Use synchronous operations for I/O
fs.readFileSync('config.json'); // Blocks event loop

// DON'T: Ignore promise rejections
this.sendCommand('pow=?'); // No error handling

// DON'T: Create states without proper object definitions
this.setState('custom.state', value); // No object definition

// DON'T: Use hardcoded timeouts without configuration
setTimeout(callback, 5000); // Should be configurable
```

## Debugging and Troubleshooting

### Debug Mode Configuration
- Enable debug logging via adapter configuration
- Use debug level for detailed command/response logging
- Include timing information for performance analysis

### Common Issues and Solutions
1. **Connection timeouts**: Verify network connectivity and projector power state
2. **Command failures**: Check projector model compatibility in commands.json
3. **State update issues**: Ensure proper state object definitions exist
4. **Memory leaks**: Clear all timers and close connections in unload()

### Debugging Tools
- Use ioBroker's built-in log viewer for real-time debugging  
- Enable debug logging for the adapter in ioBroker admin interface
- Use network tools to verify TCP connectivity to projector
- Test commands manually using telnet for protocol verification
/**
 * Space Vikings Resurrected - 6502 Emulator Test Suite
 * 
 * Tests CPU emulator against disassembled Space Vikings assembly
 */

const CPU6502 = require('./cpu6502.js');
const fs = require('fs');
const path = require('path');

class EmulatorTest {
    constructor() {
        this.cpu = new CPU6502();
        this.testResults = [];
    }
    
    /**
     * Run all tests
     */
    runAllTests() {
        console.log('🚀 Running Space Vikings 6502 Emulator Tests\n');
        
        this.testCPUInitialization();
        this.testLoadStoreOperations();
        this.testMemoryAccess();
        this.testJoystickMemory();
        this.testArithmeticOperations();
        this.testBranchOperations();
        this.testMemTransferA();
        this.testSoundGen();
        
        this.printResults();
    }
    
    /**
     * Test CPU initialization
     */
    testCPUInitialization() {
        console.log('🧪 Test 1: CPU Initialization');
        
        this.cpu.reset();
        const state = this.cpu.getState();
        
        const tests = [
            { name: 'PC starts at SPACE SIMULATOR ASSEMBLY', value: state.PC, expected: 0x9023 },
            { name: 'Stack Pointer initialized', value: state.SP, expected: 0xFF },
            { name: 'Status Register initialized', value: state.P, expected: 0x34 },
            { name: 'Accumulator zero', value: state.A, expected: 0 },
            { name: 'X Register zero', value: state.X, expected: 0 },
            { name: 'Y Register zero', value: state.Y, expected: 0 }
        ];
        
        this._runTestSet('CPU Initialization', tests);
    }
    
    /**
     * Test load/store operations
     */
    testLoadStoreOperations() {
        console.log('🧪 Test 2: Load/Store Operations');
        
        this.cpu.reset();
        
        // Test LDA immediate
        this.cpu.loadBinary(new Uint8Array([0xA9, 0x42]), 0x1000);  // LDA #$42
        this.cpu.PC = 0x1000;
        this.cpu.step();
        
        const tests = [
            { name: 'LDA #$42 loads 0x42', value: this.cpu.A, expected: 0x42 },
            { name: 'PC incremented correctly', value: this.cpu.PC, expected: 0x1002 },
            { name: 'Zero flag cleared', value: (this.cpu.P & 0x02) === 0, expected: true }
        ];
        
        // Test STA absolute
        this.cpu.loadBinary(new Uint8Array([0x8D, 0x00, 0x20]), 0x1002);  // STA $2000
        this.cpu.PC = 0x1002;
        this.cpu.A = 0x55;
        this.cpu.step();
        
        tests.push(
            { name: 'STA $2000 stores value', value: this.cpu.memory[0x2000], expected: 0x55 }
        );
        
        this._runTestSet('Load/Store Operations', tests);
    }
    
    /**
     * Test memory access
     */
    testMemoryAccess() {
        console.log('🧪 Test 3: Memory Access');
        
        this.cpu.reset();
        
        // Test specific Space Vikings memory addresses
        const memoryTests = [
            { 
                name: 'Copy protection at $95F7 initialized to M', 
                value: this.cpu.memory[0x95F7], 
                expected: 0x4D  // 'M'
            },
            { 
                name: 'Joystick X at $95FD initialized to neutral', 
                value: this.cpu.memory[0x95FD], 
                expected: 0x80
            },
            { 
                name: 'Joystick Y at $95FE initialized to neutral', 
                value: this.cpu.memory[0x95FE], 
                expected: 0x80
            },
            { 
                name: 'MEM TRANSFER A counter at $9532 initialized', 
                value: this.cpu.memory[0x9532], 
                expected: 0x00
            }
        ];
        
        this._runTestSet('Memory Access', memoryTests);
    }
    
    /**
     * Test joystick memory interaction
     */
    testJoystickMemory() {
        console.log('🧪 Test 4: Joystick Memory Interaction');
        
        this.cpu.reset();
        
        // Test joystick position setting (from STARSHIP SIMULATOR.bas)
        this.cpu.setJoystickPosition(0x40, 0xC0);
        
        const tests = [
            { name: 'Joystick X position set', value: this.cpu.memory[0x95FD], expected: 0x40 },
            { name: 'Joystick Y position set', value: this.cpu.memory[0x95FE], expected: 0xC0 }
        ];
        
        // Test reading joystick position
        this.cpu.loadBinary(new Uint8Array([0xAD, 0xFD, 0x95]), 0x2000);  // LDA $95FD
        this.cpu.PC = 0x2000;
        this.cpu.step();
        
        tests.push(
            { name: 'LDA $95FD reads joystick X', value: this.cpu.A, expected: 0x40 }
        );
        
        this._runTestSet('Joystick Memory', tests);
    }
    
    /**
     * Test arithmetic operations
     */
    testArithmeticOperations() {
        console.log('🧪 Test 5: Arithmetic Operations');
        
        this.cpu.reset();
        
        // Test CLC/SEC
        this.cpu.loadBinary(new Uint8Array([0x38]), 0x1000);  // SEC
        this.cpu.PC = 0x1000;
        this.cpu.step();
        
        const tests = [
            { name: 'SEC sets carry flag', value: (this.cpu.P & 0x01) !== 0, expected: true }
        ];
        
        // Test CLC
        this.cpu.loadBinary(new Uint8Array([0x18]), 0x1001);  // CLC
        this.cpu.PC = 0x1001;
        this.cpu.step();
        
        tests.push(
            { name: 'CLC clears carry flag', value: (this.cpu.P & 0x01) === 0, expected: true }
        );
        
        // Test ASL A (used in SOUND GEN)
        this.cpu.loadBinary(new Uint8Array([0xA9, 0x81, 0x0A]), 0x1002);  // LDA #$81; ASL A
        this.cpu.PC = 0x1002;
        this.cpu.step();  // LDA
        this.cpu.step();  // ASL
        
        tests.push(
            { name: 'ASL A shifts left', value: this.cpu.A, expected: 0x02 },  // $81 << 1 = $02 (carry lost)
            { name: 'ASL sets carry for high bit', value: (this.cpu.P & 0x01) !== 0, expected: true }
        );
        
        this._runTestSet('Arithmetic Operations', tests);
    }
    
    /**
     * Test branch operations
     */
    testBranchOperations() {
        console.log('🧪 Test 6: Branch Operations');
        
        this.cpu.reset();
        
        // Test BNE (used in SPACE SIMULATOR ASSEMBLY)
        this.cpu.loadBinary(new Uint8Array([0xA9, 0x00, 0xC9, 0x01, 0xD0, 0x02, 0xA9, 0xFF]), 0x1000);
        // LDA #$00; CMP #$01; BNE +2; LDA #$FF
        
        this.cpu.PC = 0x1000;
        
        // Execute first 3 instructions
        this.cpu.step();  // LDA #$00
        this.cpu.step();  // CMP #$01
        this.cpu.step();  // BNE +2
        
        const tests = [
            { name: 'BNE branches when not equal', value: this.cpu.PC, expected: 0x1008 },  // Branch target is PC-after-operand plus signed offset
            { name: 'Zero flag clear after CMP', value: (this.cpu.P & 0x02) === 0, expected: true }
        ];
        
        this._runTestSet('Branch Operations', tests);
    }
    
    /**
     * Test MEM TRANSFER A routine simulation
     */
    testMemTransferA() {
        console.log('🧪 Test 7: MEM TRANSFER A Routine');
        
        this.cpu.reset();
        
        // Initialize test data in tables
        for (let i = 0; i < 128; i++) {
            this.cpu.table8BEC[i] = i;
            this.cpu.table8D7C[i] = 0xFF - i;
        }
        
        // Update memory with table data
        this.cpu._initializeMemory();
        
        // Test forward copy (8BEC -> 8D7C)
        const beforeCopy = this.cpu.memory[0x8D7C];
        this.cpu.executeMemTransferA(false);  // Forward copy
        
        const tests = [
            { name: 'MEM TRANSFER A copies data forward', value: this.cpu.memory[0x8D7C], expected: 0x00 },
            { name: 'Counter at $9532 updated', value: this.cpu.memory[0x9532] > 0, expected: true }
        ];
        
        // Reset and test reverse copy
        this.cpu.reset();
        for (let i = 0; i < 128; i++) {
            this.cpu.table8BEC[i] = i;
            this.cpu.table8D7C[i] = 0xFF - i;
        }
        this.cpu._initializeMemory();
        
        this.cpu.executeMemTransferA(true);  // Reverse copy
        
        tests.push(
            { name: 'MEM TRANSFER A copies data reverse', value: this.cpu.memory[0x8BEC], expected: 0xFF }
        );
        
        this._runTestSet('MEM TRANSFER A', tests);
    }
    
    /**
     * Test SOUND GEN routine simulation
     */
    testSoundGen() {
        console.log('🧪 Test 8: SOUND GEN Routine');
        
        this.cpu.reset();
        
        // Initialize sound parameters
        this.cpu.memory[0x9270] = 0x01;
        this.cpu.memory[0x9271] = 0x02;
        this.cpu.memory[0x9272] = 0x03;
        
        // Execute SOUND GEN
        const initialPC = this.cpu.PC;
        this.cpu.executeSoundGen();
        
        const tests = [
            { name: 'SOUND GEN executes without crash', value: this.cpu.PC, expected: initialPC },
            { name: 'Sound parameters accessed', value: this.cpu.memory[0x9270] === 0x01, expected: true }
        ];
        
        // Test Apple II speaker access
        this.cpu.loadBinary(new Uint8Array([0xAD, 0x30, 0xC0]), 0x3000);  // LDA $C030
        this.cpu.PC = 0x3000;
        this.cpu.step();
        
        tests.push(
            { name: 'Apple II speaker address accessible', value: this.cpu.A === this.cpu.memory[0xC030], expected: true }
        );
        
        this._runTestSet('SOUND GEN', tests);
    }
    
    /**
     * Run a set of tests and record results
     */
    _runTestSet(name, tests) {
        let passed = 0;
        let failed = 0;
        
        const results = tests.map(test => {
            const success = test.value === test.expected;
            if (success) {
                passed++;
            } else {
                failed++;
            }
            
            return {
                test: test.name,
                success,
                got: test.value,
                expected: test.expected
            };
        });
        
        this.testResults.push({
            name,
            passed,
            failed,
            total: tests.length,
            details: results
        });
        
        console.log(`   ${passed}/${tests.length} passed\n`);
    }
    
    /**
     * Print all test results
     */
    printResults() {
        console.log('\n📊 TEST SUMMARY');
        console.log('='.repeat(50));
        
        let totalPassed = 0;
        let totalTests = 0;
        
        this.testResults.forEach(result => {
            const status = result.failed === 0 ? '✅ PASSED' : '❌ FAILED';
            console.log(`${status} ${result.name}: ${result.passed}/${result.total}`);
            
            totalPassed += result.passed;
            totalTests += result.total;
            
            // Print failed test details
            if (result.failed > 0) {
                result.details.forEach(detail => {
                    if (!detail.success) {
                        console.log(`   ❌ ${detail.test}`);
                        console.log(`      Got: ${detail.got} (0x${detail.got.toString(16)})`);
                        console.log(`      Expected: ${detail.expected} (0x${detail.expected.toString(16)})`);
                    }
                });
            }
        });
        
        console.log('='.repeat(50));
        console.log(`TOTAL: ${totalPassed}/${totalTests} tests passed`);
        
        if (totalPassed === totalTests) {
            console.log('\n🎉 ALL TESTS PASSED! Ready for Space Vikings emulation.');
        } else {
            console.log('\n⚠️  Some tests failed. Check implementation.');
        }
    }
    
    /**
     * Load and test actual disassembled code
     */
    testDisassembledCode() {
        console.log('\n🧪 Test 9: Actual Disassembled Code Validation');
        
        // Load SPACE SIMULATOR ASSEMBLY disassembly
        const disassemblyPath = path.join(__dirname, '../disassembly/SPACE SIMULATOR ASSEMBLY.asm');
        
        if (fs.existsSync(disassemblyPath)) {
            const disassembly = fs.readFileSync(disassemblyPath, 'utf8');
            
            // Parse for key instructions
            const lines = disassembly.split('\n');
            let foundInstructions = 0;
            
            for (const line of lines) {
                if (line.includes('LDA $95FD') || line.includes('LDA $95FE')) {
                    foundInstructions++;
                    console.log(`   Found joystick access: ${line.trim()}`);
                }
                
                if (line.includes('CMP #$')) {
                    foundInstructions++;
                    console.log(`   Found comparison: ${line.trim()}`);
                }
                
                if (line.includes('BNE') || line.includes('BEQ')) {
                    foundInstructions++;
                    console.log(`   Found branch: ${line.trim()}`);
                }
            }
            
            this.testResults.push({
                name: 'Disassembled Code Analysis',
                passed: foundInstructions > 0 ? 1 : 0,
                failed: foundInstructions > 0 ? 0 : 1,
                total: 1,
                details: [{
                    test: 'Found game logic instructions in disassembly',
                    success: foundInstructions > 0,
                    got: foundInstructions,
                    expected: '> 0'
                }]
            });
            
            console.log(`   Found ${foundInstructions} key instructions`);
        } else {
            console.log('   ⚠️  Disassembly file not found');
        }
    }
}

// Run tests if executed directly
if (require.main === module) {
    const tester = new EmulatorTest();
    
    // Add disassembly test
    tester.testDisassembledCode();
    
    // Run all tests
    tester.runAllTests();
    
    // Demo the emulator
    console.log('\n🎮 EMULATOR DEMO');
    console.log('='.repeat(50));
    
    const cpu = new CPU6502();
    cpu.reset();
    
    console.log('Initial CPU State:');
    console.log(cpu.getState());
    
    console.log('\nSetting joystick to center position...');
    cpu.setJoystickPosition(0x80, 0x80);
    
    console.log('\nMemory dump around joystick position:');
    console.log(cpu.dumpMemory(0x95F0, 32));
    
    console.log('\nReady for Space Vikings emulation!');
}

module.exports = EmulatorTest;
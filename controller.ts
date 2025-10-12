/**
 * PCA9685 PWM Controller Abstraction Layer
 * Controls servos through I2C communication with the PCA9685 chip
 * 
 * This module provides both low-level PCA9685 control and high-level servo control
 * for the DFR0548 micro:bit expansion board with 270-degree servos.
 */

/**
 * Low-level PCA9685 PWM Controller
 */
namespace PCA9685 {
    const PCA9685_ADDRESS = 0x40
    const MODE1 = 0x00
    const PRESCALE = 0xFE
    const LED0_ON_L = 0x06

    let initialized = false

    function i2cWrite(reg: number, value: number) {
        let buf = pins.createBuffer(2)
        buf[0] = reg
        buf[1] = value
        pins.i2cWriteBuffer(PCA9685_ADDRESS, buf)
    }

    function i2cRead(reg: number): number {
        pins.i2cWriteNumber(PCA9685_ADDRESS, reg, NumberFormat.UInt8BE)
        return pins.i2cReadNumber(PCA9685_ADDRESS, NumberFormat.UInt8BE)
    }

    function setPWM(channel: number, on: number, off: number) {
        if (channel < 0 || channel > 15) return

        let buf = pins.createBuffer(5)
        buf[0] = LED0_ON_L + 4 * channel
        buf[1] = on & 0xff
        buf[2] = (on >> 8) & 0x0f
        buf[3] = off & 0xff
        buf[4] = (off >> 8) & 0x0f
        pins.i2cWriteBuffer(PCA9685_ADDRESS, buf)
    }

    export function init() {
        if (initialized) return

        // Reset PCA9685
        i2cWrite(MODE1, 0x00)
        basic.pause(10)

        // Set PWM frequency to 50Hz (for servos)
        setFrequency(50)

        initialized = true
    }

    function setFrequency(freq: number) {
        let prescaleval = 25000000    // 25MHz
        prescaleval /= 4096           // 12-bit
        prescaleval /= freq
        prescaleval -= 1
        let prescale = Math.floor(prescaleval + 0.5)

        let oldmode = i2cRead(MODE1)
        let newmode = (oldmode & 0x7F) | 0x10  // sleep
        i2cWrite(MODE1, newmode)               // go to sleep
        i2cWrite(PRESCALE, prescale)           // set prescaler
        i2cWrite(MODE1, oldmode)
        basic.pause(5)
        i2cWrite(MODE1, oldmode | 0xa1)        // restart + auto increment
    }

    /**
     * Set servo angle on specific PCA9685 channel
     * @param channel PWM channel (0-15)
     * @param angle Servo angle in degrees (-90 to +90, where 0 is center)
     */
    export function setServoChannel(channel: number, angle: number) {
        if (!initialized) init()

        // Clamp angle to valid range
        angle = Math.min(90, Math.max(-90, angle))

        // Use measured calibration values:
        // -90° = 199 PWM, 0° = 332 PWM, +90° = 472 PWM
        // Linear interpolation: PWM = center + (angle/90) * range
        let centerPWM = 332
        let rangePWM = 472 - 199  // Total range = 273 PWM ticks
        let halfRange = rangePWM / 2  // 136.5 PWM ticks for ±90°

        let pwmTicks = Math.round(centerPWM + (angle / 90) * halfRange)

        // Safety clamp to measured range
        pwmTicks = Math.min(472, Math.max(199, pwmTicks))

        setPWM(channel, 0, pwmTicks)
    }

    /**
     * Set servo with raw PWM ticks for calibration
     * @param channel PWM channel (0-15)  
     * @param pwmTicks Raw PWM value (0-4095)
     */
    export function setServoRawPWM(channel: number, pwmTicks: number) {
        if (!initialized) init()
        pwmTicks = Math.min(4095, Math.max(0, pwmTicks))
        setPWM(channel, 0, pwmTicks)
    }

    /**
     * Set motor PWM for speed control
     * @param channel PWM channel (0-15)
     * @param speed speed value (-100 to 100, where 0 is stopped)
     */
    export function setMotorChannel(channel: number, speed: number) {
        if (!initialized) init()

        // Clamp speed to valid range
        speed = Math.min(100, Math.max(-100, speed))

        let centerPWM = 320
        let rangePWM = 540 - 100
        let halfRange = rangePWM / 2

        let pwmTicks = Math.round(centerPWM + (speed / 100) * halfRange)

        // Safety clamp to measured range
        pwmTicks = Math.min(540, Math.max(100, pwmTicks))

        setPWM(channel, 0, pwmTicks)
    }

    /**
     * Stop servo on specific PCA9685 channel
     * @param channel PWM channel (0-15)
     */
    export function stopServoChannel(channel: number) {
        setPWM(channel, 0, 0)
    }
}

const SERVO_CHANNELS = [15, 14, 13, 12, 11, 10, 9, 8]

/**
 * High-Level Servo Controller for DFR0548 Expansion Board
 * Maps servo ports S1-S8 to PCA9685 channels
 */
namespace ServoController {
    /**
     * Initialize the servo controller
     */
    export function init() {
        PCA9685.init()
    }

    /**
     * Set servo position by servo port number
     * @param servoPort Servo port number (1-8 on the expansion board)
     * @param angle Angle in degrees (-90 to +90, where 0 is center)
     */
    export function setServo(servoPort: number, angle: number) {
        if (servoPort < 1 || servoPort > 8) return

        let channel = SERVO_CHANNELS[servoPort - 1]
        PCA9685.setServoChannel(channel, angle)
    }

    /**
     * Stop servo by servo port number
     * @param servoPort Servo port number (1-8 on the expansion board)
     */
    export function stopServo(servoPort: number) {
        if (servoPort < 1 || servoPort > 8) return

        let channel = SERVO_CHANNELS[servoPort - 1]
        PCA9685.stopServoChannel(channel)
    }

    /**
     * Set all servos to center position (0 degrees)
     */
    export function centerAllServos() {
        for (let i = 1; i <= 8; i++) {
            setServo(i, 0)
        }
    }

    /**
     * Stop all servos
     */
    export function stopAllServos() {
        for (let i = 1; i <= 8; i++) {
            stopServo(i)
        }
    }

    /**
     * Test all servos with a movement sequence
     */
    export function testAllServos(servos: number[]) {
        for (let i = 0; i < servos.length; i++) {
            let servoNum = servos[i]
            setServo(servoNum, -90)
            basic.pause(500)
            setServo(servoNum, 90)
            basic.pause(500)
            setServo(servoNum, 0)
        }
    }

    /**
     * Set servo with custom PWM value for fine-tuning
     */
    export function setServoRawPWM(servoPort: number, pwmValue: number) {
        if (servoPort < 1 || servoPort > 8) return

        let channel = SERVO_CHANNELS[servoPort - 1]
        PCA9685.setServoRawPWM(channel, pwmValue)
    }
}

/**
 * Motor Controller for DFR0548 Expansion Board
 * Controls DC motors through PWM speed control
 * Maps motor ports M1-M4 to PCA9685 channels 0-3
 */
namespace MotorController {

    /**
     * Initialize the motor controller
     */
    export function init() {
        PCA9685.init()
    }

    /**
     * Set servo position by servo port number
     * @param servoPort Servo port number (1-8 on the expansion board)
     * @param speed Angle in degrees (-100 to +100, where 0 is neutral)
     */
    export function setMotor(servoPort: number, speed: number) {
        if (servoPort < 1 || servoPort > 8) return

        let channel = SERVO_CHANNELS[servoPort - 1]
        PCA9685.setMotorChannel(channel, -speed)
    }

    /**
     * Test all motors with a speed sequence
     */
    export function testAllMotors(motors: number[]) {
        // Test each motor with different speeds
        for (let i = 0; i < motors.length; i++) {
            let motorNum = motors[i]

            // Test 50% speed
            setMotor(motorNum, 50)
            basic.pause(200)

            // Test 100% speed
            setMotor(motorNum, 100)
            basic.pause(200)

            // Stop motor
            setMotor(motorNum, 0)
            basic.pause(500)

            // Test -50% speed
            setMotor(motorNum, -50)
            basic.pause(200)

            // Test -100% speed
            setMotor(motorNum, -100)
            basic.pause(200)

            setMotor(motorNum, 0)
        }
        basic.pause(500)
    }

    /**
     * Set motor with custom PWM value for fine-tuning
     * @param motorPort Motor port number (1-4)
     * @param pwmValue Raw PWM value (0-4095)
     */
    export function setMotorRawPWM(motorPort: number, pwmValue: number) {
        if (motorPort < 1 || motorPort > 8) return

        let channel = SERVO_CHANNELS[motorPort - 1]
        PCA9685.setServoRawPWM(channel, pwmValue)
    }
}// Add your code here

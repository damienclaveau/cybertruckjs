namespace motion {

    enum MotionDirection {
        Idle,
        Forward,
        Backward,
        Spinning
    }

    enum MotionMode {
        Free, // choregraphed moves (is it blocking the thread of the main loop ?)
        Auto  // PID controlled moves
    }
    let motionMode = MotionMode.Auto

    const fullSpeed = 100
    const cruiseSpeed = 50
    const cruiseLinearSpeed = 30 // cm/s
    const spinSpeed = 50
    const spinAngularSpeed = 20 // degree/s
    const MIN_THROTTLE_FOR_MOTION = 10; // Minimum throttle to expect motion

    /////////////////////////////////////////////////////////////////////////////////////////////
    // Motor Control
    export function setThrottle(speed: number) {
        if (EXEC_MODE == ExecMode.MakeCode) {// for simulation mode only
            servos.P1.run(speed)
        } else {
            MotorController.setMotor(SPEED_MOTOR, speed)
        }
        // Each time we ask for motion, start the motion detector
        if      (Math.abs(speed) < MIN_THROTTLE_FOR_MOTION)  motionDetector.stop();
        else if (Math.abs(speed) > MIN_THROTTLE_FOR_MOTION)  motionDetector.start(speed);
    }

    export function setWheelSteering(steering: number) {
        if (EXEC_MODE == ExecMode.MakeCode) {// for simulation mode only
            servos.P0.setAngle(steering)
        } else {
            ServoController.setServo(DIRECTION_SERVO, steering)
        }
    }

    //////////////////////////////////////////////////////////////////
    // Naive straight movement
    export function moveStraight(distance: number) {
        try {
            motionMode = MotionMode.Free
            setWheelSteering(0)
            if (distance > 0)
                setThrottle(cruiseSpeed)
            else
                setThrottle(cruiseSpeed * -1)
            // distance in cm, cruiseLinearSpeed in cm/s, result in milliseconds
            pause((distance / cruiseLinearSpeed) * 1000)
        } catch (error) {
            console.debug('An error occurred:' + error);
        } finally {
            motionMode = MotionMode.Auto
            setThrottle(0)
        }
    }

    //////////////////////////////////////////////////////////////////
    // Naive Spinning around
    export function spinAround(angle: number) {
        let currentHeading = input.compassHeading()
        let targetHeading = normalizeHeading(currentHeading + angle)
        try {
            motionMode = MotionMode.Free
            if (angle > 0) {
                setWheelSteering(-45)  // Turn right for positive angle
            } else if (angle < 0) {
                setWheelSteering(45) // Turn left for negative angle
            } else { }// No rotation needed
            setThrottle(spinSpeed)
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            // Wait until we reach the target heading (with tolerance)
            // never do this in MakeCode mode : it ends up in an infinite loop
            if (EXEC_MODE != ExecMode.MakeCode)
                pauseUntil(() => {
                    let currentCompass = input.compassHeading()
                    return isHeadingReached(currentCompass, targetHeading, 15) // 15 degree tolerance
                })
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            setThrottle(0)
            setWheelSteering(0)
        } catch (error) {
            console.debug('An error occurred:' + error);
        } finally {
            motionMode = MotionMode.Auto
            setThrottle(0)
        }
    }

    function normalizeHeading(heading: number): number {
        while (heading < 0) heading += 360
        while (heading >= 360) heading -= 360
        return heading
    }

    function isHeadingReached(current: number, target: number, tolerance: number): boolean {
        let diff = Math.abs(current - target)
        // Handle wrap-around (e.g., 359° to 1°)
        if (diff > 180) {
            diff = 360 - diff
        }
        logger.log(`Angle Diff${diff}`)
        return diff <= tolerance
    }

    /////////////////////////////////////////////////////////////////////////////////////////////
    // Auto Navigation to a Waypoint


    export class Waypoint {
        distance: number  //  mm
        angle: number // radians
        constructor(distance: number, angle: number) {
            this.distance = distance
            this.angle = angle
        }
    }
    export const waypoint = new Waypoint(0, 0)
    export function getWaypoint() { return waypoint }
    // Mutate the Waypoint object to save memory
    export function setWaypoint(distance: number, angle: number, reset: boolean = false) {
        waypoint.distance = distance
        waypoint.angle = angle
        // Reset PIDs if the waypoint is radically different from the previous one
        if (reset) {
            anglePID.reset();
            speedPID.reset();
        }
    }

    // PID controller for angle correction : setPoint = 0 (i.e. angle to the waypoint should be reduced to 0)
    const anglePID = new pid_ns.PID(1.5, 0.2, 0.1, 0, {
        outputLimits: [-45, 45],  // Servo steering limits
        proportionalOnMeasurement: true,
        errorMap: (error: number) => {
            // Handle angle wrap-around (±180°)
            while (error > 180) error -= 360;
            while (error < -180) error += 360;
            return error;
        }
    });
    // PID controller for speed correction : setPoint = 0 (i.e. distance to the waypoint should be reduced to 0)
    const speedPID = new pid_ns.PID(1.5, 0.2, 0.1, 0, {
        outputLimits: [-100, 100],  // Motor speed limits
        proportionalOnMeasurement: true
    });


    export function goToWaypoint() {
        if (MotionMode.Free)
            return
        //logger.log(`Going to Waypoint d=${waypoint.distance} , a=${waypoint.angle}`)
        if (motionMode == MotionMode.Auto) {
            //  Drive servo and motor with PWM according to updated linear and angular velocities
            //  Set the steering servo position to aim to the waypoint
            let steering = anglePID.update(waypoint.angle)
            setWheelSteering(steering)

            //  Set the servo throttle power depending on the remaining distance to the waypoint
            let speed = speedPID.update(waypoint.distance)
            setThrottle(speed)
        }
    }


    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Motion detection for blocked robot detection
    interface AccelerationSample {
        timestamp: number;
        acceleration: number;
    }

    /**
     * Motion detector class to monitor robot movement and detect blocked states
     */
    export class MotionDetector {
        private accelerationBuffer: AccelerationSample[] = [];
        public isActive: boolean = false;
        private currentThrottle: number = 0;
        private onBlockedCallback: (() => void) | null = null;
        private lastBlockedCheck: number = 0;
        // Configuration constants
        private readonly MOTION_DETECTION_WINDOW = 2000; // 2 seconds in milliseconds
        private readonly MOTION_THRESHOLD = 100; // mg (milligravity) threshold for motion detection
        private readonly BLOCKED_THRESHOLD = 50; // mg - below this, robot is considered blocked
        private readonly BLOCKED_CHECK_INTERVAL = 500; // Check for blocked state every 500ms
        private readonly MAX_SAMPLES = 50; // Maximum buffer size
        constructor() {
            this.reset();
        }

        /**
         * Start motion detection when throttle is set
         * @param throttle - Current throttle value (0-100)
         */
        public start(throttle: number): void {
            this.currentThrottle = Math.abs(throttle);
            if (this.currentThrottle > MIN_THROTTLE_FOR_MOTION && !this.isActive) {
                this.isActive = true;
                this.reset(); // Clear previous samples when starting new motion
                logger.log(`MotionDetector started with throttle: ${throttle}`);
            }
        }

        public stop(): void {
            this.isActive = false;
            this.currentThrottle = 0;
            //logger.log("MotionDetector stopped");
        }

        public reset(): void {
            this.accelerationBuffer = [];
            this.lastBlockedCheck = input.runningTime();
        }

        // Set callback function to be called when blocked state is detected
        public setOnBlockedCallback(callback: () => void): void {
            this.onBlockedCallback = callback;
        }

        // Update motion detection with current sensor readings
        public update(): void {
            if (!this.isActive) return;

            const currentTime = input.runningTime();

            // Get current acceleration magnitude
            const acc_x = input.acceleration(Dimension.X);
            const acc_y = input.acceleration(Dimension.Y);
            const acc_z = input.acceleration(Dimension.Z);
            const accelerationMagnitude = Math.sqrt(acc_x * acc_x + acc_y * acc_y + acc_z * acc_z);

            // Add new sample to buffer
            this.accelerationBuffer.push({
                timestamp: currentTime,
                acceleration: accelerationMagnitude
            });

            // Clean old samples (older than detection window)
            this.accelerationBuffer = this.accelerationBuffer.filter(sample =>
                currentTime - sample.timestamp <= this.MOTION_DETECTION_WINDOW
            );

            // Limit buffer size to prevent memory issues
            if (this.accelerationBuffer.length > this.MAX_SAMPLES) {
                this.accelerationBuffer = this.accelerationBuffer.slice(-this.MAX_SAMPLES);
            }

            // Check for blocked state periodically
            if (currentTime - this.lastBlockedCheck >= this.BLOCKED_CHECK_INTERVAL) {
                this.checkForBlockedState();
                this.lastBlockedCheck = currentTime;
            }
        }

        // Check if robot is blocked and trigger callback if necessary
        private checkForBlockedState(): void {
            const status = this.analyzeMotionStatus();
            if (status.isBlocked && status.motionConfidence > 70 && status.sampleCount > 10) {
                logger.warning(`Robot blocked! Throttle: ${this.currentThrottle}, Accel: ${status.averageAcceleration}mg`);
                logger.log(this.getDebugInfo());
                if (this.onBlockedCallback) {
                    this.onBlockedCallback();
                }
            }
        }

        /**
         * Analyze current motion status
         * @returns Object containing motion analysis
         */
        public analyzeMotionStatus(): {
            averageAcceleration: number;
            isInMotion: boolean;
            isBlocked: boolean;
            sampleCount: number;
            motionConfidence: number;
        } {
            // Calculate average acceleration if we have samples
            let averageAcceleration = 0;
            let isInMotion = false;
            let isBlocked = false;
            let motionConfidence = 0;

            if (this.accelerationBuffer.length > 0) {
                // Compute average acceleration magnitude
                const totalAcceleration = this.accelerationBuffer.reduce((sum, sample) => sum + sample.acceleration, 0);
                averageAcceleration = totalAcceleration / this.accelerationBuffer.length;

                // Determine motion status
                isInMotion = averageAcceleration > this.MOTION_THRESHOLD;

                // Detect if robot is blocked (low acceleration despite commanded speed)
                const hasSignificantThrottle = this.currentThrottle > MIN_THROTTLE_FOR_MOTION;
                const hasLowAcceleration = averageAcceleration < this.BLOCKED_THRESHOLD;
                isBlocked = this.isActive && hasSignificantThrottle && hasLowAcceleration;

                // Calculate motion confidence based on consistency of readings
                const variance = this.accelerationBuffer.reduce((sum, sample) => {
                    const diff = sample.acceleration - averageAcceleration;
                    return sum + (diff * diff);
                }, 0) / this.accelerationBuffer.length;

                // Lower variance = higher confidence (readings are consistent)
                motionConfidence = Math.max(0, Math.min(100, 100 - Math.sqrt(variance) / 10));
            }

            return {
                averageAcceleration,
                isInMotion,
                isBlocked,
                sampleCount: this.accelerationBuffer.length,
                motionConfidence
            };
        }

        public getDebugInfo(): string {
            const status = this.analyzeMotionStatus();
            const currentTime = input.runningTime();
            let debugInfo = `MotionDetector Status:\n`;
            debugInfo += `  Active: ${this.isActive}\n`;
            debugInfo += `  Throttle: ${this.currentThrottle}\n`;
            debugInfo += `  Avg Acceleration: ${status.averageAcceleration} mg\n`;
            debugInfo += `  In Motion: ${status.isInMotion}\n`;
            debugInfo += `  Blocked: ${status.isBlocked}\n`;
            debugInfo += `  Samples: ${status.sampleCount}\n`;
            debugInfo += `  Confidence: ${status.motionConfidence}%\n`;
            return debugInfo;
        }

    }
}
